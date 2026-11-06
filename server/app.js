import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import express from 'express';
import db, { initDb, INSERT_SHIPMENT } from './db.js';
import {
  LOCK_MINUTES, MAX_FAILED_LOGINS, MAX_FAILED_LOGINS_PER_IP, MAX_REGISTRATIONS_PER_IP, REGISTRATION_WINDOW_MINUTES,
  SESSION_DAYS, clearedSessionCookie, generateToken, hashPassword, hashToken, readSessionToken, sessionCookie,
  verifyDummyPassword, verifyPassword
} from './auth.js';
import { clearHits, clientIp, isLimited, recordHit } from './rateLimit.js';
import { deleteFile, isStorageAvailable, readFile, saveFile } from './storage.js';

const app = express();
app.disable('x-powered-by');

// El detalle técnico queda en los registros del servidor; al navegador solo le llega un mensaje claro
function serverError(res, message, error) {
  console.error(message, error);
  res.status(500).json({ error: message });
}

// Quién hace cada pedido, para registrarlo en el historial sin pasarlo de función en función
const requestContext = new AsyncLocalStorage();
const currentAuthor = () => requestContext.getStore()?.author ?? null;
const currentAuthorId = () => requestContext.getStore()?.authorId ?? null;

app.use(express.json());

// Asegurar esquema/semilla antes de atender cualquier request
app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (error) {
    serverError(res, 'Error al inicializar la base de datos.', error);
  }
});

const SELECT_USER = `
  SELECT
    u.id, u.username, u.role, u.status, u.full_name AS fullName, u.company, u.country, u.email,
    u.client_id AS clientId, c.company AS clientCompany, u.created_at AS createdAt,
    u.last_login_at AS lastLoginAt,
    CASE WHEN u.avatar_key IS NULL THEN 0 ELSE 1 END AS hasAvatar, u.avatar_updated_at AS avatarVersion
  FROM users u
  LEFT JOIN clients c ON c.id = u.client_id
`;

const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{3,60}$/;
const MIN_PASSWORD_LENGTH = 8;
const isValidPassword = (password) => typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH && password.length <= 200;

// Crea una sesión nueva y deja la cookie en la respuesta
async function startSession(res, userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.batch([
    { sql: 'DELETE FROM sessions WHERE expires_at < ?', args: [new Date().toISOString()] },
    { sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', args: [hashToken(token), userId, expiresAt] }
  ], 'write');
  res.setHeader('Set-Cookie', sessionCookie(token));
}

// Identifica al usuario de la cookie; una cuenta deshabilitada no tiene sesión válida
app.use('/api', async (req, res, next) => {
  try {
    const token = readSessionToken(req);
    if (token) {
      const { rows } = await db.execute({
        sql: `
          ${SELECT_USER}
          JOIN sessions s ON s.user_id = u.id
          WHERE s.token_hash = ? AND s.expires_at > ? AND u.status <> 'disabled'
        `,
        args: [hashToken(token), new Date().toISOString()]
      });
      req.user = rows[0] ? { ...rows[0] } : null;
    }
    next();
  } catch (error) {
    serverError(res, 'Error al validar la sesión.', error);
  }
});

// POST /api/auth/register: las cuentas nuevas quedan pendientes hasta que un admin las vincule a un cliente
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const fullName = (req.body.fullName || '').trim();
    const company = (req.body.company || '').trim();
    const country = (req.body.country || '').trim();
    const email = (req.body.email || '').trim();

    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener entre 3 y 60 caracteres, sin espacios.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
    }
    if (!fullName || !company || !country || !email) {
      return res.status(400).json({ error: 'Completá todos los campos.' });
    }

    const registrationKey = `register:${clientIp(req)}`;
    if (await isLimited(registrationKey, MAX_REGISTRATIONS_PER_IP)) {
      return res.status(429).json({ error: 'Se crearon demasiadas cuentas desde esta conexión. Probá de nuevo en una hora.' });
    }

    let userId;
    try {
      const result = await db.execute({
        sql: `
          INSERT INTO users (username, password_hash, role, status, full_name, company, country, email)
          VALUES (?, ?, 'client', 'pending', ?, ?, ?, ?)
        `,
        args: [username, await hashPassword(password), fullName, company, country, email]
      });
      userId = Number(result.lastInsertRowid);
      await recordHit(registrationKey, REGISTRATION_WINDOW_MINUTES);
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Ese usuario ya existe.' });
      }
      throw error;
    }

    await startSession(res, userId);
    const { rows } = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [userId] });
    res.status(201).json({ ...rows[0] });
  } catch (error) {
    serverError(res, 'Error al registrar el usuario.', error);
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const invalid = () => res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') return invalid();

    // El bloqueo es por cuenta y por IP: desde otra conexión no se puede dejar afuera al dueño de la cuenta
    const ip = clientIp(req);
    const accountKey = `login:${username}:${ip}`;
    const ipKey = `login-ip:${ip}`;
    if (await isLimited(accountKey, MAX_FAILED_LOGINS) || await isLimited(ipKey, MAX_FAILED_LOGINS_PER_IP)) {
      return res.status(429).json({ error: `Demasiados intentos. Probá de nuevo en ${LOCK_MINUTES} minutos.` });
    }
    const fail = async () => {
      await recordHit(accountKey, LOCK_MINUTES);
      await recordHit(ipKey, LOCK_MINUTES);
      return invalid();
    };

    const { rows } = await db.execute({
      sql: 'SELECT id, password_hash, status FROM users WHERE username = ?',
      args: [username]
    });
    const user = rows[0];

    if (!user) {
      await verifyDummyPassword(password);
      return fail();
    }
    if (!(await verifyPassword(password, user.password_hash))) return fail();
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Tu cuenta está deshabilitada.' });
    }

    await clearHits(accountKey);
    await db.execute({ sql: 'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', args: [user.id] });
    await startSession(res, user.id);
    const selected = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [user.id] });
    res.json({ ...selected.rows[0] });
  } catch (error) {
    serverError(res, 'Error al iniciar sesión.', error);
  }
});

// A partir de acá todo requiere sesión
app.use('/api', (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  requestContext.run({ author: req.user.fullName || req.user.username, authorId: req.user.id }, next);
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hashToken(readSessionToken(req))] });
    res.setHeader('Set-Cookie', clearedSessionCookie());
    res.json({ ok: true });
  } catch (error) {
    serverError(res, 'Error al cerrar sesión.', error);
  }
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => res.json(req.user));

// POST /api/auth/password: cierra las demás sesiones del usuario
app.post('/api/auth/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
    }

    const { rows } = await db.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [req.user.id] });
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
    }

    await db.batch([
      { sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [await hashPassword(newPassword), req.user.id] },
      { sql: 'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', args: [req.user.id, hashToken(readSessionToken(req))] }
    ], 'write');
    res.json({ ok: true });
  } catch (error) {
    serverError(res, 'Error al cambiar la contraseña.', error);
  }
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOVEMENTS_LIMIT = 30;
const CLIENT_VISIBLE_TYPES = "('created', 'status', 'delivery', 'logistics')";

// Movimientos de quien pregunta: los que hizo un admin, o los de los embarques de un cliente.
// Los registros anteriores a author_id se reconocen por el nombre.
const ownMovementsFilter = (user) => ({
  where: '(author_id = ? OR (author_id IS NULL AND author = ?))',
  args: [user.id, user.fullName || user.username]
});

const MOVEMENT_COLUMNS = 'id, shipment_id AS shipmentId, shipment_code AS shipmentCode, type, message, created_at AS createdAt';

async function loadAdminSummary(user) {
  const { where, args } = ownMovementsFilter(user);
  const [movements, stats] = await db.batch([
    { sql: `SELECT ${MOVEMENT_COLUMNS} FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ${MOVEMENTS_LIMIT}`, args },
    {
      sql: `
        SELECT
          COUNT(*) AS movements,
          COALESCE(SUM(created_at >= datetime('now', '-30 days')), 0) AS recent,
          COALESCE(SUM(type = 'created'), 0) AS shipmentsCreated,
          COALESCE(SUM(type = 'payment' AND message NOT LIKE 'Se anuló%'), 0) AS paymentsRegistered
        FROM notifications WHERE ${where}
      `,
      args
    }
  ], 'read');
  const row = stats.rows[0];
  return {
    movements: movements.rows.map(plain),
    stats: {
      movements: Number(row.movements),
      recent: Number(row.recent),
      shipmentsCreated: Number(row.shipmentsCreated),
      paymentsRegistered: Number(row.paymentsRegistered)
    }
  };
}

async function loadClientSummary(user) {
  const [movements, shipments, prospects] = await db.batch([
    {
      sql: `
        SELECT ${MOVEMENT_COLUMNS} FROM notifications
        WHERE type IN ${CLIENT_VISIBLE_TYPES} AND shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)
        ORDER BY id DESC LIMIT ${MOVEMENTS_LIMIT}
      `,
      args: [user.clientId]
    },
    {
      sql: `
        SELECT
          COUNT(*) AS shipments,
          COALESCE(SUM(status = 'En Tránsito'), 0) AS inTransit,
          COALESCE(SUM(status = 'Entregado'), 0) AS delivered,
          COALESCE(SUM(total_usd), 0) AS totalUsd
        FROM shipments WHERE client_id = ?
      `,
      args: [user.clientId]
    },
    { sql: "SELECT COUNT(*) AS count FROM prospectos WHERE client_id = ? AND status NOT IN ('Nuevo', 'Perdido')", args: [user.clientId] }
  ], 'read');
  const row = shipments.rows[0];
  return {
    movements: movements.rows.map(plain),
    stats: {
      shipments: Number(row.shipments),
      inTransit: Number(row.inTransit),
      delivered: Number(row.delivered),
      totalUsd: Number(row.totalUsd),
      prospects: Number(prospects.rows[0].count)
    }
  };
}

const MAX_AVATAR_BYTES = 1024 * 1024;

// El tipo se deduce del contenido real: lo que no sea JPG, PNG o WebP no entra
function detectImageType(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return { type: 'image/jpeg', extension: 'jpg' };
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { type: 'image/png', extension: 'png' };
  if (buffer.length > 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return { type: 'image/webp', extension: 'webp' };
  return null;
}

async function sendAvatar(res, userId) {
  const { rows } = await db.execute({ sql: 'SELECT avatar_key FROM users WHERE id = ?', args: [userId] });
  const key = rows[0]?.avatar_key;
  const stream = key ? await readFile(key) : null;
  if (!stream) return res.status(404).json({ error: 'Sin foto de perfil.' });

  const extension = key.split('.').pop();
  res.setHeader('Content-Type', { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension]);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // La URL cambia con cada foto nueva, así que el navegador puede guardarla
  res.setHeader('Cache-Control', 'private, max-age=86400');
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

// GET /api/auth/avatar
app.get('/api/auth/avatar', async (req, res) => {
  try {
    await sendAvatar(res, req.user.id);
  } catch (error) {
    serverError(res, 'Error al obtener la foto.', error);
  }
});

// PUT /api/auth/avatar
app.put('/api/auth/avatar', express.raw({ type: () => true, limit: MAX_AVATAR_BYTES }), async (req, res) => {
  try {
    if (!isStorageAvailable()) {
      return res.status(503).json({ error: 'El almacenamiento de archivos no está configurado.' });
    }
    const image = Buffer.isBuffer(req.body) ? detectImageType(req.body) : null;
    if (!image) return res.status(400).json({ error: 'Elegí una imagen JPG, PNG o WebP.' });

    const { rows } = await db.execute({ sql: 'SELECT avatar_key FROM users WHERE id = ?', args: [req.user.id] });
    const previousKey = rows[0]?.avatar_key;
    const key = `avatares/${req.user.id}/${randomUUID()}.${image.extension}`;

    await saveFile(key, req.body, image.type);
    await db.execute({
      sql: 'UPDATE users SET avatar_key = ?, avatar_updated_at = ? WHERE id = ?',
      args: [key, new Date().toISOString(), req.user.id]
    });
    if (previousKey) await deleteFile(previousKey).catch(error => console.error('No se pudo borrar la foto anterior:', error.message));

    const updated = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [req.user.id] });
    res.json({ ...updated.rows[0] });
  } catch (error) {
    serverError(res, 'Error al guardar la foto.', error);
  }
});

// DELETE /api/auth/avatar
app.delete('/api/auth/avatar', async (req, res) => {
  try {
    const { rows } = await db.execute({ sql: 'SELECT avatar_key FROM users WHERE id = ?', args: [req.user.id] });
    await db.execute({ sql: 'UPDATE users SET avatar_key = NULL, avatar_updated_at = NULL WHERE id = ?', args: [req.user.id] });
    if (rows[0]?.avatar_key) await deleteFile(rows[0].avatar_key).catch(error => console.error('No se pudo borrar la foto:', error.message));

    const updated = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [req.user.id] });
    res.json({ ...updated.rows[0] });
  } catch (error) {
    serverError(res, 'Error al quitar la foto.', error);
  }
});

// GET /api/auth/profile: resumen de actividad del usuario
app.get('/api/auth/profile', async (req, res) => {
  try {
    res.json(await (req.user.role === 'client' ? loadClientSummary(req.user) : loadAdminSummary(req.user)));
  } catch (error) {
    serverError(res, 'Error al obtener tu actividad.', error);
  }
});

// PATCH /api/auth/profile: cada usuario edita solo sus datos; rol, estado y empresa no se tocan acá
app.patch('/api/auth/profile', async (req, res) => {
  try {
    const clean = (value) => (typeof value === 'string' ? value.trim() : '');
    const fullName = clean(req.body.fullName);
    const username = clean(req.body.username);
    const email = clean(req.body.email);
    const isClientUser = req.user.role === 'client';
    const country = isClientUser ? clean(req.body.country) : req.user.country;

    if (!fullName || fullName.length > 120) return res.status(400).json({ error: 'Indicá tu nombre.' });
    if (!USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener entre 3 y 60 caracteres, sin espacios.' });
    }
    if (email.length > 160 || (email && !EMAIL_PATTERN.test(email)) || (isClientUser && !email)) {
      return res.status(400).json({ error: 'Revisá el email.' });
    }
    if (isClientUser && (!country || country.length > 80)) return res.status(400).json({ error: 'Indicá tu país.' });

    try {
      await db.batch([
        // Antes de cambiar el nombre, asocia al usuario sus movimientos anteriores
        {
          sql: 'UPDATE notifications SET author_id = ? WHERE author_id IS NULL AND author = ?',
          args: [req.user.id, req.user.fullName || req.user.username]
        },
        {
          sql: 'UPDATE users SET full_name = ?, username = ?, email = ?, country = ? WHERE id = ?',
          args: [fullName, username, email, country, req.user.id]
        }
      ], 'write');
    } catch (error) {
      if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ese usuario ya existe.' });
      throw error;
    }

    const { rows } = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [req.user.id] });
    res.json({ ...rows[0] });
  } catch (error) {
    serverError(res, 'Error al guardar tus datos.', error);
  }
});

// Lo único que puede hacer un cliente: leer sus propios datos. Todo lo demás es solo para admin
const CLIENT_ALLOWED_READS = [
  /^\/api\/clients$/,
  /^\/api\/shipments$/,
  /^\/api\/shipments\/\d+\/notifications$/,
  /^\/api\/shipments\/\d+\/documents$/,
  /^\/api\/documents\/\d+\/download$/,
  /^\/api\/prospectos$/
];

app.use('/api', (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const path = req.originalUrl.split('?')[0];
  if (req.method === 'GET' && CLIENT_ALLOWED_READS.some(pattern => pattern.test(path))) return next();
  res.status(403).json({ error: 'No tenés permiso para esta acción.' });
});

const isClient = (req) => req.user.role === 'client';

// POST /api/users: alta de otro administrador del equipo
app.post('/api/users', async (req, res) => {
  try {
    const { username, password } = req.body;
    const fullName = (req.body.fullName || '').trim();

    if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener entre 3 y 60 caracteres, sin espacios.' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
    }
    if (!fullName) return res.status(400).json({ error: 'Indicá el nombre.' });

    const result = await db.execute({
      sql: "INSERT INTO users (username, password_hash, role, status, full_name) VALUES (?, ?, 'admin', 'active', ?)",
      args: [username, await hashPassword(password), fullName]
    });
    const { rows } = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [Number(result.lastInsertRowid)] });
    res.status(201).json({ ...rows[0] });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ese usuario ya existe.' });
    serverError(res, 'Error al crear el usuario.', error);
  }
});

// GET /api/users/:id/avatar: solo admin, por la regla general de rutas
app.get('/api/users/:id/avatar', async (req, res) => {
  try {
    await sendAvatar(res, Number(req.params.id));
  } catch (error) {
    serverError(res, 'Error al obtener la foto.', error);
  }
});

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await db.execute(`${SELECT_USER} ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.id DESC`);
    res.json(rows.map(row => ({ ...row })));
  } catch (error) {
    serverError(res, 'Error al obtener usuarios.', error);
  }
});

// PATCH /api/users/:id: vincular a un cliente, habilitar/deshabilitar o restablecer la contraseña
app.patch('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { clientId, createClient, status, password } = req.body;

    const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const statements = [];

    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) return res.status(400).json({ error: 'Estado inválido.' });
      if (id === req.user.id) return res.status(400).json({ error: 'No podés cambiar el estado de tu propia cuenta.' });
      if (status === 'active' && user.role === 'client' && user.client_id === null && !clientId && !createClient) {
        return res.status(400).json({ error: 'Vinculá la cuenta a un cliente para activarla.' });
      }
      statements.push({ sql: 'UPDATE users SET status = ? WHERE id = ?', args: [status, id] });
      if (status === 'disabled') {
        statements.push({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
      }
    }

    if (clientId !== undefined || createClient) {
      if (user.role !== 'client') return res.status(400).json({ error: 'Solo se vinculan cuentas de cliente.' });

      let linkedClientId = clientId;
      if (createClient) {
        const created = await db.execute({
          sql: 'INSERT INTO clients (company, country, contact, default_payment) VALUES (?, ?, ?, ?)',
          args: [user.company, user.country, user.full_name, '']
        });
        linkedClientId = Number(created.lastInsertRowid);
      } else {
        const exists = await db.execute({ sql: 'SELECT id FROM clients WHERE id = ?', args: [Number(linkedClientId)] });
        if (exists.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado.' });
      }
      statements.push({
        sql: "UPDATE users SET client_id = ?, status = CASE WHEN status = 'pending' THEN 'active' ELSE status END WHERE id = ?",
        args: [Number(linkedClientId), id]
      });
    }

    if (password !== undefined) {
      if (!isValidPassword(password)) {
        return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      }
      statements.push({
        sql: 'UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?',
        args: [await hashPassword(password), id]
      });
      statements.push({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] });
      const prefix = `login:${user.username}:`;
      statements.push({ sql: 'DELETE FROM rate_limits WHERE substr(key, 1, ?) = ?', args: [prefix.length, prefix] });
    }

    if (statements.length === 0) return res.status(400).json({ error: 'No hay cambios para aplicar.' });
    await db.batch(statements, 'write');

    const updated = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [id] });
    res.json({ ...updated.rows[0] });
  } catch (error) {
    serverError(res, 'Error al actualizar el usuario.', error);
  }
});

const SELECT_SHIPMENT = `
  SELECT
    s.id, s.code, s.client_id AS clientId, s.condition, s.deal, s.product,
    s.fruit_type AS fruitType, s.category, s.currency, s.load_week AS loadWeek,
    s.eta_week AS etaWeek, s.transport, s.port, s.payment_terms AS paymentTerms,
    s.variance, s.boxes, s.total_usd AS totalUsd, s.status, s.created_at AS createdAt,
    s.delivery_date AS deliveryDate, s.delivered_boxes AS deliveredBoxes,
    s.payment_due_date AS paymentDueDate, s.carrier, s.vessel,
    s.container_number AS containerNumber, s.booking_number AS bookingNumber,
    s.actual_departure AS actualDeparture, s.actual_arrival AS actualArrival
  FROM shipments s
`;

// Las filas de libsql son objetos especiales; los convertimos a objetos planos para JSON
const plain = row => ({ ...row });

const SHIPMENT_STATUSES = ['Programado', 'En Tránsito', 'Entregado'];
const REMINDER_DAYS = 3;

const SELECT_HISTORY = `
  SELECT
    id, shipment_id AS shipmentId, shipment_code AS shipmentCode, type, message,
    author, created_at AS createdAt
  FROM notifications
`;

// Cada usuario tiene sus propias leídas; is_read conserva lo marcado antes de que existieran
const READ_EXPRESSION = `
  (n.is_read = 1 OR EXISTS (
    SELECT 1 FROM notification_reads r WHERE r.notification_id = n.id AND r.user_id = ?
  ))
`;

// Registra un evento de un embarque existente; el mensaje es SQL para poder usar sus columnas
const notifyFromShipment = (id, type, messageSql, messageArgs = [], extraWhere = '', extraArgs = []) => ({
  sql: `
    INSERT INTO notifications (shipment_id, shipment_code, type, author, author_id, message)
    SELECT id, code, ?, ?, ?, ${messageSql} FROM shipments WHERE id = ? ${extraWhere}
  `,
  args: [type, currentAuthor(), currentAuthorId(), ...messageArgs, id, ...extraArgs]
});

// Fecha de hoy (AAAA-MM-DD) en Argentina, sumando días si hace falta
function localDate(daysFromNow = 0) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date);
}

// Crea los avisos de entregas próximas o vencidas; dedupe_key evita repetirlos
const reminderStatements = () => {
  const dateLabel = "substr(delivery_date, 9, 2) || '/' || substr(delivery_date, 6, 2) || '/' || substr(delivery_date, 1, 4)";
  return [
    {
      sql: `
        INSERT OR IGNORE INTO notifications (shipment_id, shipment_code, type, message, dedupe_key)
        SELECT id, code, 'overdue', 'La entrega estimada del ' || ${dateLabel} || ' venció y no está registrada',
          'overdue:' || id || ':' || delivery_date
        FROM shipments
        WHERE status <> 'Entregado' AND delivery_date IS NOT NULL AND delivery_date < ?
      `,
      args: [localDate()]
    },
    {
      sql: `
        INSERT OR IGNORE INTO notifications (shipment_id, shipment_code, type, message, dedupe_key)
        SELECT id, code, 'due-soon', 'Entrega estimada para el ' || ${dateLabel},
          'due-soon:' || id || ':' || delivery_date
        FROM shipments
        WHERE status <> 'Entregado' AND delivery_date BETWEEN ? AND ?
      `,
      args: [localDate(), localDate(REMINDER_DAYS)]
    },
    {
      sql: `
        INSERT OR IGNORE INTO notifications (shipment_id, shipment_code, type, message, dedupe_key)
        SELECT id, code, 'payment-overdue',
          'El pago venció el ' || substr(payment_due_date, 9, 2) || '/' || substr(payment_due_date, 6, 2) || '/' || substr(payment_due_date, 1, 4),
          'payment-overdue:' || id || ':' || payment_due_date
        FROM shipments s
        WHERE payment_due_date IS NOT NULL AND payment_due_date < ?
          AND s.total_usd - COALESCE((SELECT SUM(amount_usd) FROM shipment_payments p WHERE p.shipment_id = s.id), 0) > 0.005
      `,
      args: [localDate()]
    }
  ];
};

// Dos letras del producto, sin acentos: Kiwi -> KW, Pera -> PE
function productPrefix(product) {
  const letters = product.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.startsWith('KIWI')) return 'KW';
  return letters.slice(0, 2).padEnd(2, 'X');
}

// El contador sube en una sola operación, así dos embarques simultáneos nunca reciben el mismo número
async function nextShipmentCode(product, loadWeek) {
  const year = Number(localDate().slice(0, 4));
  const { rows } = await db.execute({
    sql: `
      INSERT INTO shipment_counters (year, last_number) VALUES (?, 1)
      ON CONFLICT(year) DO UPDATE SET last_number = last_number + 1
      RETURNING last_number
    `,
    args: [year]
  });
  const number = String(rows[0].last_number).padStart(4, '0');
  return `${productPrefix(product)}-${year}-W${loadWeek}-${number}`;
}

const selectClientById = (id) => ({
  sql: 'SELECT id, company, country, contact, rating, default_payment AS defaultPayment FROM clients WHERE id = ?',
  args: [id]
});

// PUT /api/clients/:id
app.put('/api/clients/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const company = (req.body.company || '').trim();
    const country = (req.body.country || '').trim();
    const contact = (req.body.contact || '').trim();
    const defaultPayment = (req.body.defaultPayment || '').trim();
    const rating = Number(req.body.rating ?? 5);

    if (!company || !country || !contact) {
      return res.status(400).json({ error: 'Empresa, país y contacto son obligatorios.' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'La calificación debe estar entre 1 y 5.' });
    }

    const [, , selected] = await db.batch([
      {
        sql: 'UPDATE clients SET company = ?, country = ?, contact = ?, rating = ?, default_payment = ? WHERE id = ?',
        args: [company, country, contact, rating, defaultPayment, id]
      },
      // Los prospectos abiertos guardan una copia de estos datos
      {
        sql: 'UPDATE prospectos SET company = ?, country = ?, contact = ? WHERE client_id = ? AND shipment_id IS NULL',
        args: [company, country, contact, id]
      },
      selectClientById(id)
    ], 'write');

    if (selected.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }
    res.json(plain(selected.rows[0]));
  } catch (error) {
    serverError(res, 'Error al actualizar el cliente.', error);
  }
});

// DELETE /api/clients/:id: solo si nada depende del cliente
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const count = async (sql) => Number((await db.execute({ sql, args: [id] })).rows[0].count);

    const blockers = [
      [await count('SELECT COUNT(*) AS count FROM shipments WHERE client_id = ?'), 'embarque'],
      [await count('SELECT COUNT(*) AS count FROM prospectos WHERE client_id = ?'), 'prospecto'],
      [await count('SELECT COUNT(*) AS count FROM users WHERE client_id = ?'), 'usuario']
    ].filter(([total]) => total > 0);

    if (blockers.length > 0) {
      const detail = blockers.map(([total, label]) => `${total} ${label}${total === 1 ? '' : 's'}`).join(', ');
      return res.status(409).json({ error: `No se puede eliminar: está vinculado a ${detail}.` });
    }

    const result = await db.execute({ sql: 'DELETE FROM clients WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado.' });
    }
    res.json({ ok: true, id });
  } catch (error) {
    serverError(res, 'Error al eliminar el cliente.', error);
  }
});

// GET /api/clients
app.get('/api/clients', async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql: `
        SELECT id, company, country, contact, rating, default_payment AS defaultPayment FROM clients
        ${isClient(req) ? 'WHERE id = ?' : ''} ORDER BY company ASC
      `,
      args: isClient(req) ? [req.user.clientId] : []
    });
    res.json(rows.map(plain));
  } catch (error) {
    serverError(res, 'Error al obtener clientes.', error);
  }
});

// POST /api/clients
app.post('/api/clients', async (req, res) => {
  try {
    const { company, country, contact, rating = 5, defaultPayment = '' } = req.body;
    if (!company || !country || !contact) {
      return res.status(400).json({ error: 'Campos requeridos vacíos.' });
    }

    const result = await db.execute({
      sql: `
        INSERT INTO clients (company, country, contact, rating, default_payment)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [company, country, contact, rating, defaultPayment]
    });

    const { rows } = await db.execute({
      sql: 'SELECT id, company, country, contact, rating, default_payment AS defaultPayment FROM clients WHERE id = ?',
      args: [Number(result.lastInsertRowid)]
    });
    res.status(201).json(plain(rows[0]));
  } catch (error) {
    serverError(res, 'Error al crear cliente.', error);
  }
});

// GET /api/shipments
app.get('/api/shipments', async (req, res) => {
  try {
    const scopeArgs = isClient(req) ? [req.user.clientId] : [];
    const [shipmentsRes, calibersRes] = await db.batch([
      { sql: `${SELECT_SHIPMENT} ${isClient(req) ? 'WHERE s.client_id = ?' : ''} ORDER BY s.id DESC`, args: scopeArgs },
      {
        sql: `
          SELECT shipment_id AS shipmentId, code, boxes, price_kg AS priceKg FROM shipment_calibers
          ${isClient(req) ? 'WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)' : ''}
        `,
        args: scopeArgs
      }
    ], 'read');

    const calibresByShipment = {};
    calibersRes.rows.forEach(c => {
      calibresByShipment[c.shipmentId] ??= {};
      calibresByShipment[c.shipmentId][c.code] = { boxes: c.boxes, priceKg: c.priceKg };
    });

    // Costos y cobros son información interna: un cliente nunca los recibe
    const finance = isClient(req) ? {} : await loadFinanceTotals();

    const result = shipmentsRes.rows.map(shipment => ({
      ...plain(shipment),
      calibres: calibresByShipment[shipment.id] || {},
      ...(isClient(req) ? {} : (finance[shipment.id] || { costsUsd: 0, paidUsd: 0 }))
    }));

    res.json(result);
  } catch (error) {
    serverError(res, 'Error al obtener embarques.', error);
  }
});

// POST /api/shipments
app.post('/api/shipments', async (req, res) => {
  const {
    clientId, condition, deal, product, fruitType, category, loadWeek,
    etaWeek, transport, port, paymentTerms, variance, boxes, calibres, totalUsd, deliveryDate, paymentDueDate, prospectId
  } = req.body;

  if (!clientId || !port || !boxes || boxes <= 0) {
    return res.status(400).json({ error: 'Datos de embarque incompletos o inválidos.' });
  }

  try {
    if (prospectId) {
      const { rows } = await db.execute({ sql: 'SELECT shipment_id FROM prospectos WHERE id = ?', args: [prospectId] });
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Prospecto no encontrado.' });
      }
      if (rows[0].shipment_id !== null) {
        return res.status(409).json({ error: 'Este prospecto ya tiene un embarque creado.' });
      }
    }

    const generatedCode = await nextShipmentCode(product || 'Kiwi', loadWeek);

    // Embarque + calibres en una sola transacción; los calibres referencian el embarque por su código único
    const statements = [{
      sql: INSERT_SHIPMENT,
      args: [
        generatedCode, clientId, condition, deal, product || 'Kiwi',
        fruitType || 'Convencional', category || 'Cat 1', 'USD', loadWeek,
        etaWeek || `Semana ${parseInt(loadWeek) + 2}`, transport || 'Marítimo', port,
        paymentTerms, variance ?? 2.0, boxes, totalUsd, 'Programado', deliveryDate || null, paymentDueDate || null
      ]
    }];

    Object.entries(calibres || {}).forEach(([code, item]) => {
      if (item.boxes > 0) {
        statements.push({
          sql: `
            INSERT INTO shipment_calibers (shipment_id, code, boxes, price_kg)
            VALUES ((SELECT id FROM shipments WHERE code = ?), ?, ?, ?)
          `,
          args: [generatedCode, code, item.boxes, item.priceKg]
        });
      }
    });

    if (prospectId) {
      statements.push({
        sql: "UPDATE prospectos SET status = 'Convertido', shipment_id = (SELECT id FROM shipments WHERE code = ?) WHERE id = ?",
        args: [generatedCode, prospectId]
      });
    }

    statements.push({
      sql: `
        INSERT INTO notifications (shipment_id, shipment_code, type, author, author_id, message)
        SELECT id, code, 'created', ?, ?, 'Embarque registrado para ' || (SELECT company FROM clients WHERE id = client_id)
        FROM shipments WHERE code = ?
      `,
      args: [currentAuthor(), currentAuthorId(), generatedCode]
    });
    statements.push({ sql: `${SELECT_SHIPMENT} WHERE s.code = ?`, args: [generatedCode] });

    const results = await db.batch(statements, 'write');
    const newShipment = results[results.length - 1].rows[0];

    res.status(201).json({ ...plain(newShipment), calibres });
  } catch (error) {
    serverError(res, 'Error al registrar embarque.', error);
  }
});

const LOGISTICS_TEXT_FIELDS = ['carrier', 'vessel', 'containerNumber', 'bookingNumber'];
const isOptionalDate = (value) => !value || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value));

// PATCH /api/shipments/:id/logistics
app.patch('/api/shipments/:id/logistics', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { actualDeparture, actualArrival } = req.body;
    const values = LOGISTICS_TEXT_FIELDS.map(field => (typeof req.body[field] === 'string' ? req.body[field].trim() : ''));

    if (values.some(value => value.length > 120)) {
      return res.status(400).json({ error: 'Los datos logísticos son demasiado largos.' });
    }
    if (!isOptionalDate(actualDeparture) || !isOptionalDate(actualArrival)) {
      return res.status(400).json({ error: 'Fecha inválida.' });
    }
    if (actualDeparture && actualArrival && actualArrival < actualDeparture) {
      return res.status(400).json({ error: 'La llegada no puede ser anterior a la salida.' });
    }

    const [, , selected] = await db.batch([
      notifyFromShipment(id, 'logistics', "'Se actualizaron los datos logísticos'"),
      {
        sql: `
          UPDATE shipments SET carrier = ?, vessel = ?, container_number = ?, booking_number = ?,
            actual_departure = ?, actual_arrival = ?
          WHERE id = ?
        `,
        args: [...values.map(value => value || null), actualDeparture || null, actualArrival || null, id]
      },
      { sql: `${SELECT_SHIPMENT} WHERE s.id = ?`, args: [id] }
    ], 'write');

    if (selected.rows.length === 0) return res.status(404).json({ error: 'Embarque no encontrado.' });
    res.json(plain(selected.rows[0]));
  } catch (error) {
    serverError(res, 'Error al guardar los datos logísticos.', error);
  }
});

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const DOCUMENT_CATEGORIES = ['Factura', 'Packing list', 'Certificado fitosanitario', 'Bill of lading', 'Otro'];
// El tipo sale de esta lista, nunca de lo que declara quien sube el archivo
const DOCUMENT_TYPES = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword',
  csv: 'text/csv', txt: 'text/plain'
};

const SELECT_DOCUMENT = `
  SELECT id, shipment_id AS shipmentId, category, file_name AS fileName, content_type AS contentType,
    size_bytes AS sizeBytes, visible_to_client AS visibleToClient, uploaded_by AS uploadedBy, created_at AS createdAt
  FROM shipment_documents
`;

// Condición y argumentos para que un cliente solo alcance documentos visibles de sus embarques
const clientDocumentScope = (req) => (isClient(req)
  ? {
      where: 'AND visible_to_client = 1 AND shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)',
      args: [req.user.clientId]
    }
  : { where: '', args: [] });

// GET /api/shipments/:id/documents
app.get('/api/shipments/:id/documents', async (req, res) => {
  try {
    const scope = clientDocumentScope(req);
    const { rows } = await db.execute({
      sql: `${SELECT_DOCUMENT} WHERE shipment_id = ? ${scope.where} ORDER BY id DESC`,
      args: [Number(req.params.id), ...scope.args]
    });
    res.json(rows.map(row => (isClient(req) ? { ...row, uploadedBy: null } : plain(row))));
  } catch (error) {
    serverError(res, 'Error al obtener los documentos.', error);
  }
});

// POST /api/shipments/:id/documents?name=&category=&visibleToClient=
app.post('/api/shipments/:id/documents', express.raw({ type: () => true, limit: MAX_DOCUMENT_BYTES }), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const category = String(req.query.category || '');
    // Solo el nombre final: nunca una ruta enviada por el navegador
    const fileName = String(req.query.name || '').split(/[\\/]/).pop().trim().slice(0, 150);
    const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
    const contentType = DOCUMENT_TYPES[extension];

    if (!isStorageAvailable()) {
      return res.status(503).json({ error: 'El almacenamiento de documentos todavía no está configurado.' });
    }
    if (!DOCUMENT_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Tipo de documento inválido.' });
    if (!contentType) return res.status(400).json({ error: 'Formato no permitido. Usá PDF, imagen, Excel, Word, CSV o TXT.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'El archivo está vacío.' });
    if (!(await findShipment(id))) return res.status(404).json({ error: 'Embarque no encontrado.' });

    const storageKey = `documentos/${id}/${randomUUID()}.${extension}`;
    await saveFile(storageKey, req.body, contentType);

    try {
      const [inserted] = await db.batch([
        {
          sql: `
            INSERT INTO shipment_documents (shipment_id, category, file_name, content_type, size_bytes, storage_key, visible_to_client, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          args: [id, category, fileName, contentType, req.body.length, storageKey, req.query.visibleToClient === '0' ? 0 : 1, currentAuthor()]
        },
        notifyFromShipment(id, 'document', "'Se agregó el documento ' || ?", [fileName])
      ], 'write');
      const { rows } = await db.execute({ sql: `${SELECT_DOCUMENT} WHERE id = ?`, args: [Number(inserted.lastInsertRowid)] });
      res.status(201).json(plain(rows[0]));
    } catch (error) {
      // Sin su registro, el archivo quedaría inaccesible para siempre
      await deleteFile(storageKey).catch(() => {});
      throw error;
    }
  } catch (error) {
    serverError(res, 'Error al subir el documento.', error);
  }
});

// GET /api/documents/:id/download
app.get('/api/documents/:id/download', async (req, res) => {
  try {
    const scope = clientDocumentScope(req);
    const { rows } = await db.execute({
      sql: `SELECT file_name, content_type, storage_key FROM shipment_documents WHERE id = ? ${scope.where}`,
      args: [Number(req.params.id), ...scope.args]
    });
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });

    const stream = await readFile(rows[0].storage_key);
    if (!stream) return res.status(404).json({ error: 'El archivo no está disponible en este entorno.' });

    // Siempre como descarga: un archivo subido nunca se ejecuta dentro de la app
    res.setHeader('Content-Type', rows[0].content_type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(rows[0].file_name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (error) {
    serverError(res, 'Error al descargar el documento.', error);
  }
});

// DELETE /api/documents/:id
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.execute({ sql: 'SELECT shipment_id, file_name, storage_key FROM shipment_documents WHERE id = ?', args: [id] });
    if (rows.length === 0) return res.status(404).json({ error: 'Documento no encontrado.' });

    await db.batch([
      notifyFromShipment(rows[0].shipment_id, 'document', "'Se eliminó el documento ' || ?", [rows[0].file_name]),
      { sql: 'DELETE FROM shipment_documents WHERE id = ?', args: [id] }
    ], 'write');
    await deleteFile(rows[0].storage_key).catch(error => console.error('No se pudo borrar el archivo:', error.message));
    res.json({ ok: true, id });
  } catch (error) {
    serverError(res, 'Error al eliminar el documento.', error);
  }
});

const toCents = (value) => Math.round(Number(value) * 100) / 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function loadFinanceTotals() {
  const [costs, payments] = await db.batch([
    'SELECT shipment_id AS id, SUM(amount_usd) AS total FROM shipment_costs GROUP BY shipment_id',
    'SELECT shipment_id AS id, SUM(amount_usd) AS total FROM shipment_payments GROUP BY shipment_id'
  ], 'read');
  const totals = {};
  const add = (rows, field) => rows.forEach(row => {
    totals[row.id] ??= { costsUsd: 0, paidUsd: 0 };
    totals[row.id][field] = toCents(row.total);
  });
  add(costs.rows, 'costsUsd');
  add(payments.rows, 'paidUsd');
  return totals;
}

// Detalle de costos y cobros de un embarque, con sus totales
async function loadShipmentFinance(id) {
  const [costs, payments] = await db.batch([
    { sql: 'SELECT id, category, description, amount_usd AS amountUsd, created_at AS createdAt FROM shipment_costs WHERE shipment_id = ? ORDER BY id DESC', args: [id] },
    { sql: 'SELECT id, amount_usd AS amountUsd, paid_at AS paidAt, note, created_at AS createdAt FROM shipment_payments WHERE shipment_id = ? ORDER BY paid_at DESC, id DESC', args: [id] }
  ], 'read');
  const sum = (rows) => toCents(rows.reduce((total, row) => total + row.amountUsd, 0));
  return {
    costs: costs.rows.map(plain),
    payments: payments.rows.map(plain),
    costsUsd: sum(costs.rows),
    paidUsd: sum(payments.rows)
  };
}

const findShipment = async (id) => (await db.execute({ sql: 'SELECT total_usd FROM shipments WHERE id = ?', args: [id] })).rows[0];

// GET /api/shipments/:id/finance
app.get('/api/shipments/:id/finance', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await findShipment(id))) return res.status(404).json({ error: 'Embarque no encontrado.' });
    res.json(await loadShipmentFinance(id));
  } catch (error) {
    serverError(res, 'Error al obtener costos y cobros.', error);
  }
});

// POST /api/shipments/:id/costs
app.post('/api/shipments/:id/costs', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const category = (req.body.category || '').trim();
    const description = (req.body.description || '').trim();
    const amountUsd = toCents(req.body.amountUsd);

    if (!category || category.length > 80 || description.length > 300) {
      return res.status(400).json({ error: 'Indicá un concepto válido.' });
    }
    if (!(amountUsd > 0 && amountUsd <= 1e10)) {
      return res.status(400).json({ error: 'El importe debe ser mayor a 0.' });
    }
    if (!(await findShipment(id))) return res.status(404).json({ error: 'Embarque no encontrado.' });

    await db.execute({
      sql: 'INSERT INTO shipment_costs (shipment_id, category, description, amount_usd) VALUES (?, ?, ?, ?)',
      args: [id, category, description || null, amountUsd]
    });
    res.status(201).json(await loadShipmentFinance(id));
  } catch (error) {
    serverError(res, 'Error al guardar el costo.', error);
  }
});

// DELETE /api/shipments/:id/costs/:costId
app.delete('/api/shipments/:id/costs/:costId', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute({
      sql: 'DELETE FROM shipment_costs WHERE id = ? AND shipment_id = ?',
      args: [Number(req.params.costId), id]
    });
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Costo no encontrado.' });
    res.json(await loadShipmentFinance(id));
  } catch (error) {
    serverError(res, 'Error al eliminar el costo.', error);
  }
});

// POST /api/shipments/:id/payments
app.post('/api/shipments/:id/payments', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amountUsd = toCents(req.body.amountUsd);
    const paidAt = req.body.paidAt;
    const note = (req.body.note || '').trim();

    if (!(amountUsd > 0 && amountUsd <= 1e10)) {
      return res.status(400).json({ error: 'El importe debe ser mayor a 0.' });
    }
    if (typeof paidAt !== 'string' || !DATE_PATTERN.test(paidAt)) {
      return res.status(400).json({ error: 'Indicá la fecha del cobro.' });
    }
    if (note.length > 300) return res.status(400).json({ error: 'La nota es demasiado larga.' });

    const shipment = await findShipment(id);
    if (!shipment) return res.status(404).json({ error: 'Embarque no encontrado.' });

    const { paidUsd } = await loadShipmentFinance(id);
    const balance = toCents(shipment.total_usd - paidUsd);
    if (amountUsd > balance) {
      return res.status(400).json({ error: `El cobro supera el saldo pendiente de USD ${balance.toFixed(2)}.` });
    }

    await db.batch([
      { sql: 'INSERT INTO shipment_payments (shipment_id, amount_usd, paid_at, note) VALUES (?, ?, ?, ?)', args: [id, amountUsd, paidAt, note || null] },
      notifyFromShipment(
        id,
        'payment',
        `${amountUsd === balance ? "'Pago completo: USD '" : "'Cobro registrado: USD '"} || printf('%.2f', ?)`,
        [amountUsd]
      )
    ], 'write');
    res.status(201).json(await loadShipmentFinance(id));
  } catch (error) {
    serverError(res, 'Error al registrar el cobro.', error);
  }
});

// DELETE /api/shipments/:id/payments/:paymentId
app.delete('/api/shipments/:id/payments/:paymentId', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const paymentId = Number(req.params.paymentId);
    const [, result] = await db.batch([
      {
        sql: `
          INSERT INTO notifications (shipment_id, shipment_code, type, author, author_id, message)
          SELECT s.id, s.code, 'payment', ?, ?, 'Se anuló un cobro de USD ' || printf('%.2f', p.amount_usd)
          FROM shipment_payments p JOIN shipments s ON s.id = p.shipment_id
          WHERE p.id = ? AND p.shipment_id = ?
        `,
        args: [currentAuthor(), currentAuthorId(), paymentId, id]
      },
      { sql: 'DELETE FROM shipment_payments WHERE id = ? AND shipment_id = ?', args: [paymentId, id] }
    ], 'write');
    if (result.rowsAffected === 0) return res.status(404).json({ error: 'Cobro no encontrado.' });
    res.json(await loadShipmentFinance(id));
  } catch (error) {
    serverError(res, 'Error al eliminar el cobro.', error);
  }
});

// PUT /api/shipments/:id: corrige los datos sin tocar código, estado ni entrega registrada
app.put('/api/shipments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { clientId, condition, deal, product, deliveryDate, paymentDueDate, transport, paymentTerms, variance, calibres } = req.body;
    const port = (req.body.port || '').trim();
    const loadWeek = Number(req.body.loadWeek);

    if (!clientId || !port || !paymentTerms?.trim()) {
      return res.status(400).json({ error: 'Datos de embarque incompletos o inválidos.' });
    }
    if (!Number.isInteger(loadWeek) || loadWeek < 1 || loadWeek > 52) {
      return res.status(400).json({ error: 'La semana de salida debe estar entre 1 y 52.' });
    }

    // Cajas y total se recalculan acá, no se confía en lo que manda el navegador
    const caliberStatements = [];
    let boxes = 0;
    let totalUsd = 0;
    for (const [code, item] of Object.entries(calibres || {})) {
      const itemBoxes = Number(item.boxes);
      const priceKg = Number(item.priceKg);
      if (!Number.isInteger(itemBoxes) || itemBoxes < 0 || !(priceKg >= 0)) {
        return res.status(400).json({ error: `Valores inválidos en el calibre ${code}.` });
      }
      if (itemBoxes === 0) continue;
      boxes += itemBoxes;
      totalUsd += itemBoxes * 10 * priceKg;
      caliberStatements.push({
        sql: 'INSERT INTO shipment_calibers (shipment_id, code, boxes, price_kg) VALUES (?, ?, ?, ?)',
        args: [id, code, itemBoxes, priceKg]
      });
    }
    if (boxes === 0) {
      return res.status(400).json({ error: 'Ingresá la cantidad de cajas en al menos un calibre.' });
    }

    const existing = await db.execute({ sql: 'SELECT id FROM shipments WHERE id = ?', args: [id] });
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado.' });
    }
    const client = await db.execute({ sql: 'SELECT id FROM clients WHERE id = ?', args: [clientId] });
    if (client.rows.length === 0) {
      return res.status(400).json({ error: 'Cliente no encontrado.' });
    }

    const results = await db.batch([
      {
        sql: `
          UPDATE shipments SET
            client_id = ?, condition = ?, deal = ?, product = ?, delivery_date = ?, payment_due_date = ?, transport = ?, port = ?,
            payment_terms = ?, variance = ?, load_week = ?, boxes = ?, total_usd = ?
          WHERE id = ?
        `,
        args: [
          clientId, condition, deal, product?.trim() || 'Kiwi', deliveryDate || null, paymentDueDate || null, transport || 'Marítimo', port,
          paymentTerms.trim(), variance ?? 2.0, loadWeek, boxes, totalUsd, id
        ]
      },
      { sql: 'DELETE FROM shipment_calibers WHERE shipment_id = ?', args: [id] },
      ...caliberStatements,
      notifyFromShipment(id, 'updated', "'Se actualizaron los datos del embarque'"),
      { sql: `${SELECT_SHIPMENT} WHERE s.id = ?`, args: [id] },
      { sql: 'SELECT code, boxes, price_kg AS priceKg FROM shipment_calibers WHERE shipment_id = ?', args: [id] }
    ], 'write');

    const updated = results[results.length - 2].rows[0];
    const savedCalibres = {};
    results[results.length - 1].rows.forEach(c => {
      savedCalibres[c.code] = { boxes: c.boxes, priceKg: c.priceKg };
    });
    res.json({ ...plain(updated), calibres: savedCalibres });
  } catch (error) {
    serverError(res, 'Error al actualizar el embarque.', error);
  }
});

// PATCH /api/shipments/:id/delivery
app.patch('/api/shipments/:id/delivery', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { deliveredBoxes } = req.body;
    if (!Number.isInteger(deliveredBoxes) || deliveredBoxes < 0) {
      return res.status(400).json({ error: 'Las cajas entregadas deben ser un número entero mayor o igual a 0.' });
    }

    const [, , selected] = await db.batch([
      notifyFromShipment(
        id,
        'delivery',
        `CASE WHEN delivered_boxes IS NULL THEN 'Entrega registrada: ' ELSE 'Entrega actualizada: ' END
          || printf('%d', ?) || ' de ' || boxes || ' cajas (dif. ' || printf('%+d', ? - boxes) || ')'`,
        [deliveredBoxes, deliveredBoxes]
      ),
      { sql: "UPDATE shipments SET delivered_boxes = ?, status = 'Entregado' WHERE id = ?", args: [deliveredBoxes, id] },
      { sql: `${SELECT_SHIPMENT} WHERE s.id = ?`, args: [id] }
    ], 'write');

    if (selected.rows.length === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado.' });
    }

    res.json(plain(selected.rows[0]));
  } catch (error) {
    serverError(res, 'Error al registrar la entrega.', error);
  }
});

// PATCH /api/shipments/:id/status
app.patch('/api/shipments/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!SHIPMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    const [, , selected] = await db.batch([
      notifyFromShipment(id, 'status', "'Estado: ' || status || ' → ' || ?", [status], 'AND status <> ?', [status]),
      // Si deja de estar entregado, la entrega registrada ya no aplica (queda en el historial)
      {
        sql: "UPDATE shipments SET status = ?, delivered_boxes = CASE WHEN ? = 'Entregado' THEN delivered_boxes ELSE NULL END WHERE id = ?",
        args: [status, status, id]
      },
      { sql: `${SELECT_SHIPMENT} WHERE s.id = ?`, args: [id] }
    ], 'write');

    if (selected.rows.length === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado.' });
    }

    res.json(plain(selected.rows[0]));
  } catch (error) {
    serverError(res, 'Error al cambiar el estado.', error);
  }
});

// POST /api/shipments/:id/followups
app.post('/api/shipments/:id/followups', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const note = (req.body.note || '').trim();
    if (!note || note.length > 500) {
      return res.status(400).json({ error: 'El seguimiento debe tener entre 1 y 500 caracteres.' });
    }

    const result = await db.execute(notifyFromShipment(id, 'followup', '?', [note]));
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado.' });
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    serverError(res, 'Error al guardar el seguimiento.', error);
  }
});

// GET /api/shipments/:id/notifications
app.get('/api/shipments/:id/notifications', async (req, res) => {
  try {
    // Un cliente ve el historial de sus embarques, sin los seguimientos internos
    const { rows } = await db.execute(isClient(req)
      ? {
          sql: `
            ${SELECT_HISTORY}
            WHERE shipment_id = ? AND type IN ('created', 'status', 'delivery', 'logistics')
              AND shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)
            ORDER BY id DESC
          `,
          args: [Number(req.params.id), req.user.clientId]
        }
      : { sql: `${SELECT_HISTORY} WHERE shipment_id = ? ORDER BY id DESC`, args: [Number(req.params.id)] });
    // El cliente no necesita saber quién del equipo hizo cada cambio
    res.json(rows.map(row => (isClient(req) ? { ...row, author: null } : plain(row))));
  } catch (error) {
    serverError(res, 'Error al obtener el historial.', error);
  }
});

// GET /api/notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const results = await db.batch([
      ...reminderStatements(),
      {
        sql: `
          SELECT
            n.id, n.shipment_id AS shipmentId, n.shipment_code AS shipmentCode, n.type, n.message, n.author,
            n.created_at AS createdAt, ${READ_EXPRESSION} AS isRead
          FROM notifications n ORDER BY n.id DESC LIMIT 100
        `,
        args: [req.user.id]
      },
      { sql: `SELECT COUNT(*) AS count FROM notifications n WHERE NOT ${READ_EXPRESSION}`, args: [req.user.id] }
    ], 'write');

    res.json({
      items: results[results.length - 2].rows.map(plain),
      unread: Number(results[results.length - 1].rows[0].count)
    });
  } catch (error) {
    serverError(res, 'Error al obtener notificaciones.', error);
  }
});

// POST /api/notifications/read-all
app.post('/api/notifications/read-all', async (req, res) => {
  try {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO notification_reads (user_id, notification_id) SELECT ?, id FROM notifications',
      args: [req.user.id]
    });
    res.json({ ok: true });
  } catch (error) {
    serverError(res, 'Error al actualizar notificaciones.', error);
  }
});

// PATCH /api/notifications/:id/read
app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.execute({ sql: 'SELECT id FROM notifications WHERE id = ?', args: [id] });
    if (rows.length > 0) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO notification_reads (user_id, notification_id) VALUES (?, ?)',
        args: [req.user.id, id]
      });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada.' });
    }
    res.json({ ok: true, id });
  } catch (error) {
    serverError(res, 'Error al actualizar la notificación.', error);
  }
});

const PROSPECT_STATUSES = ['Nuevo', 'Cotizado', 'En negociación', 'Perdido'];
const KG_PER_BOX = 10;

const SELECT_PROSPECT = `
  SELECT
    p.id, p.client_id AS clientId, p.company, p.country, p.contact, p.email, p.product,
    p.condition, p.deal, p.transport, p.port, p.load_week AS loadWeek,
    p.delivery_date AS deliveryDate, p.valid_until AS validUntil, p.payment_terms AS paymentTerms,
    p.variance, p.calibres, p.boxes, p.total_usd AS totalUsd, p.status, p.notes,
    p.shipment_id AS shipmentId, s.code AS shipmentCode, p.created_at AS createdAt
  FROM prospectos p
  LEFT JOIN shipments s ON s.id = p.shipment_id
`;

const toProspect = row => ({ ...row, calibres: JSON.parse(row.calibres) });

// Valida los datos y calcula en el servidor las cajas y el total a partir de los calibres
async function parseProspect(body) {
  const { clientId, email, product, condition, deal, transport, port, loadWeek, deliveryDate, validUntil, paymentTerms, variance, notes } = body;
  let { company, country, contact } = body;

  if (clientId) {
    const { rows } = await db.execute({ sql: 'SELECT company, country, contact FROM clients WHERE id = ?', args: [clientId] });
    if (rows.length === 0) return { error: 'Cliente no encontrado.' };
    ({ company, country, contact } = rows[0]);
  } else if (!company?.trim() || !country?.trim() || !contact?.trim()) {
    return { error: 'Empresa, país y contacto son obligatorios para una empresa nueva.' };
  }

  const week = loadWeek === null || loadWeek === undefined || loadWeek === '' ? null : Number(loadWeek);
  if (week !== null && !(Number.isInteger(week) && week >= 1 && week <= 52)) {
    return { error: 'La semana de salida debe estar entre 1 y 52.' };
  }

  const status = body.status ?? 'Nuevo';
  if (!PROSPECT_STATUSES.includes(status)) return { error: 'Estado inválido.' };

  const calibres = {};
  let boxes = 0;
  let totalUsd = 0;
  for (const [code, item] of Object.entries(body.calibres || {})) {
    const itemBoxes = Number(item.boxes);
    const priceKg = Number(item.priceKg);
    if (!Number.isInteger(itemBoxes) || itemBoxes < 0 || !(priceKg >= 0)) {
      return { error: `Valores inválidos en el calibre ${code}.` };
    }
    calibres[code] = { boxes: itemBoxes, priceKg };
    boxes += itemBoxes;
    totalUsd += itemBoxes * KG_PER_BOX * priceKg;
  }

  return {
    args: [
      clientId || null, company.trim(), country.trim(), contact.trim(), email?.trim() || null,
      product?.trim() || 'Kiwi', condition || 'Venta', deal || 'Precio Cerrado', transport || 'Marítimo',
      port?.trim() || null, week, deliveryDate || null, validUntil || null, paymentTerms?.trim() || null,
      variance ?? 2.0, JSON.stringify(calibres), boxes, totalUsd, status, notes?.trim() || null
    ]
  };
}

// GET /api/prospectos
app.get('/api/prospectos', async (req, res) => {
  try {
    if (isClient(req)) {
      // Un cliente ve las propuestas que recibió, sin borradores, perdidos ni notas internas
      const { rows } = await db.execute({
        sql: `${SELECT_PROSPECT} WHERE p.client_id = ? AND p.status NOT IN ('Nuevo', 'Perdido') ORDER BY p.id DESC`,
        args: [req.user.clientId]
      });
      return res.json(rows.map(row => ({ ...toProspect(row), notes: null })));
    }

    const { rows } = await db.execute(`${SELECT_PROSPECT} ORDER BY p.id DESC`);
    res.json(rows.map(toProspect));
  } catch (error) {
    serverError(res, 'Error al obtener prospectos.', error);
  }
});

// POST /api/prospectos
app.post('/api/prospectos', async (req, res) => {
  try {
    const parsed = await parseProspect(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const result = await db.execute({
      sql: `
        INSERT INTO prospectos (client_id, company, country, contact, email, product, condition, deal, transport, port, load_week, delivery_date, valid_until, payment_terms, variance, calibres, boxes, total_usd, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: parsed.args
    });

    const { rows } = await db.execute({ sql: `${SELECT_PROSPECT} WHERE p.id = ?`, args: [Number(result.lastInsertRowid)] });
    res.status(201).json(toProspect(rows[0]));
  } catch (error) {
    serverError(res, 'Error al crear el prospecto.', error);
  }
});

// PUT /api/prospectos/:id
app.put('/api/prospectos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = await parseProspect(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const [result, selected] = await db.batch([
      {
        sql: `
          UPDATE prospectos SET client_id = ?, company = ?, country = ?, contact = ?, email = ?, product = ?, condition = ?, deal = ?, transport = ?, port = ?, load_week = ?, delivery_date = ?, valid_until = ?, payment_terms = ?, variance = ?, calibres = ?, boxes = ?, total_usd = ?, status = ?, notes = ?
          WHERE id = ? AND shipment_id IS NULL
        `,
        args: [...parsed.args, id]
      },
      { sql: `${SELECT_PROSPECT} WHERE p.id = ?`, args: [id] }
    ], 'write');

    if (selected.rows.length === 0) {
      return res.status(404).json({ error: 'Prospecto no encontrado.' });
    }
    if (result.rowsAffected === 0) {
      return res.status(409).json({ error: 'Un prospecto convertido en embarque no se puede editar.' });
    }

    res.json(toProspect(selected.rows[0]));
  } catch (error) {
    serverError(res, 'Error al actualizar el prospecto.', error);
  }
});

// POST /api/prospectos/:id/client: da de alta la empresa como cliente para poder crear el embarque
app.post('/api/prospectos/:id/client', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.execute({ sql: 'SELECT client_id, company, country, contact, payment_terms FROM prospectos WHERE id = ?', args: [id] });
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Prospecto no encontrado.' });
    }

    const prospect = rows[0];
    let clientId = prospect.client_id;
    let created = false;

    if (clientId === null) {
      // Si la empresa ya es cliente se reutiliza en lugar de duplicarla
      const existing = await db.execute({ sql: 'SELECT id FROM clients WHERE company = ? COLLATE NOCASE', args: [prospect.company] });
      if (existing.rows.length > 0) {
        clientId = existing.rows[0].id;
      } else {
        const result = await db.execute({
          sql: 'INSERT INTO clients (company, country, contact, default_payment) VALUES (?, ?, ?, ?)',
          args: [prospect.company, prospect.country, prospect.contact, prospect.payment_terms || '']
        });
        clientId = Number(result.lastInsertRowid);
        created = true;
      }
      await db.execute({ sql: 'UPDATE prospectos SET client_id = ? WHERE id = ?', args: [clientId, id] });
    }

    const client = await db.execute({
      sql: 'SELECT id, company, country, contact, rating, default_payment AS defaultPayment FROM clients WHERE id = ?',
      args: [clientId]
    });
    res.json({ client: plain(client.rows[0]), created });
  } catch (error) {
    serverError(res, 'Error al crear el cliente.', error);
  }
});

// DELETE /api/prospectos/:id
app.delete('/api/prospectos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute({ sql: 'DELETE FROM prospectos WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Prospecto no encontrado.' });
    }
    res.json({ ok: true, id });
  } catch (error) {
    serverError(res, 'Error al eliminar el prospecto.', error);
  }
});

// GET /api/products
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT id, name FROM products ORDER BY id ASC');
    res.json(rows.map(plain));
  } catch (error) {
    serverError(res, 'Error al obtener productos.', error);
  }
});

// POST /api/products
app.post('/api/products', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'El nombre del producto es obligatorio.' });
    }

    const result = await db.execute({ sql: 'INSERT INTO products (name) VALUES (?)', args: [name] });
    res.status(201).json({ id: Number(result.lastInsertRowid), name });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ese producto ya existe.' });
    }
    serverError(res, 'Error al crear producto.', error);
  }
});

// DELETE /api/shipments/:id
app.delete('/api/shipments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Borrado explícito de calibres: no dependemos de PRAGMA foreign_keys en la conexión remota
    const documents = await db.execute({ sql: 'SELECT storage_key FROM shipment_documents WHERE shipment_id = ?', args: [id] });

    const results = await db.batch([
      notifyFromShipment(id, 'deleted', "'Embarque eliminado'"),
      { sql: 'DELETE FROM shipment_documents WHERE shipment_id = ?', args: [id] },
      { sql: 'DELETE FROM shipment_costs WHERE shipment_id = ?', args: [id] },
      { sql: 'DELETE FROM shipment_payments WHERE shipment_id = ?', args: [id] },
      // Las notificaciones sobreviven al embarque, pero ya no apuntan a él
      { sql: 'UPDATE notifications SET shipment_id = NULL WHERE shipment_id = ?', args: [id] },
      // El prospecto que lo originó vuelve a estar abierto
      { sql: "UPDATE prospectos SET shipment_id = NULL, status = 'Cotizado' WHERE shipment_id = ?", args: [id] },
      { sql: 'DELETE FROM shipment_calibers WHERE shipment_id = ?', args: [id] },
      { sql: 'DELETE FROM shipments WHERE id = ?', args: [id] }
    ], 'write');

    if (results[results.length - 1].rowsAffected === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado.' });
    }

    // Con el embarque ya borrado, un archivo que no se pueda eliminar no debe frenar la respuesta
    await Promise.allSettled(documents.rows.map(row => deleteFile(row.storage_key)));

    res.json({ ok: true, id });
  } catch (error) {
    serverError(res, 'Error al eliminar embarque.', error);
  }
});

// Archivos que superan el máximo o JSON inválido: siempre una respuesta legible
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: `El archivo supera el máximo de ${Math.round(error.limit / (1024 * 1024))} MB.` });
  }
  res.status(error.status || 500).json({ error: error.status ? 'Pedido inválido.' : 'Error interno.' });
});

export default app;
