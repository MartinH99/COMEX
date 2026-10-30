import express from 'express';
import db, { initDb, INSERT_SHIPMENT } from './db.js';
import {
  LOCK_MINUTES, MAX_FAILED_LOGINS, SESSION_DAYS, clearedSessionCookie, generateToken, hashPassword,
  hashToken, readSessionToken, sessionCookie, verifyDummyPassword, verifyPassword
} from './auth.js';

const app = express();

app.use(express.json());

// Asegurar esquema/semilla antes de atender cualquier request
app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error al inicializar la base de datos: ' + error.message });
  }
});

const SELECT_USER = `
  SELECT
    u.id, u.username, u.role, u.status, u.full_name AS fullName, u.company, u.country, u.email,
    u.client_id AS clientId, c.company AS clientCompany, u.created_at AS createdAt
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
    res.status(500).json({ error: 'Error al validar la sesión: ' + error.message });
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
    res.status(500).json({ error: 'Error al registrar el usuario: ' + error.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const invalid = () => res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') return invalid();

    const { rows } = await db.execute({
      sql: 'SELECT id, password_hash, status, locked_until FROM users WHERE username = ?',
      args: [username]
    });
    const user = rows[0];

    if (!user) {
      await verifyDummyPassword(password);
      return invalid();
    }
    if (user.locked_until && user.locked_until > new Date().toISOString()) {
      return res.status(429).json({ error: `Demasiados intentos. Probá de nuevo en ${LOCK_MINUTES} minutos.` });
    }

    if (!(await verifyPassword(password, user.password_hash))) {
      await db.execute({
        sql: `
          UPDATE users SET
            locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE NULL END,
            failed_logins = CASE WHEN failed_logins + 1 >= ? THEN 0 ELSE failed_logins + 1 END
          WHERE id = ?
        `,
        args: [MAX_FAILED_LOGINS, new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString(), MAX_FAILED_LOGINS, user.id]
      });
      return invalid();
    }
    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Tu cuenta está deshabilitada.' });
    }

    await db.execute({ sql: 'UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', args: [user.id] });
    await startSession(res, user.id);
    const selected = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [user.id] });
    res.json({ ...selected.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión: ' + error.message });
  }
});

// A partir de acá todo requiere sesión
app.use('/api', (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Iniciá sesión para continuar.' });
  next();
});

// POST /api/auth/logout
app.post('/api/auth/logout', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hashToken(readSessionToken(req))] });
    res.setHeader('Set-Cookie', clearedSessionCookie());
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar sesión: ' + error.message });
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
    res.status(500).json({ error: 'Error al cambiar la contraseña: ' + error.message });
  }
});

// Lo único que puede hacer un cliente: leer sus propios datos. Todo lo demás es solo para admin
const CLIENT_ALLOWED_READS = [
  /^\/api\/clients$/,
  /^\/api\/shipments$/,
  /^\/api\/shipments\/\d+\/notifications$/,
  /^\/api\/prospectos$/
];

app.use('/api', (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const path = req.originalUrl.split('?')[0];
  if (req.method === 'GET' && CLIENT_ALLOWED_READS.some(pattern => pattern.test(path))) return next();
  res.status(403).json({ error: 'No tenés permiso para esta acción.' });
});

const isClient = (req) => req.user.role === 'client';

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await db.execute(`${SELECT_USER} ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.id DESC`);
    res.json(rows.map(row => ({ ...row })));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios: ' + error.message });
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
    }

    if (statements.length === 0) return res.status(400).json({ error: 'No hay cambios para aplicar.' });
    await db.batch(statements, 'write');

    const updated = await db.execute({ sql: `${SELECT_USER} WHERE u.id = ?`, args: [id] });
    res.json({ ...updated.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el usuario: ' + error.message });
  }
});

const SELECT_SHIPMENT = `
  SELECT
    s.id, s.code, s.client_id AS clientId, s.condition, s.deal, s.product,
    s.fruit_type AS fruitType, s.category, s.currency, s.load_week AS loadWeek,
    s.eta_week AS etaWeek, s.transport, s.port, s.payment_terms AS paymentTerms,
    s.variance, s.boxes, s.total_usd AS totalUsd, s.status, s.created_at AS createdAt,
    s.delivery_date AS deliveryDate, s.delivered_boxes AS deliveredBoxes
  FROM shipments s
`;

// Las filas de libsql son objetos especiales; los convertimos a objetos planos para JSON
const plain = row => ({ ...row });

const SHIPMENT_STATUSES = ['Programado', 'En Tránsito', 'Entregado'];
const REMINDER_DAYS = 3;

const SELECT_NOTIFICATION = `
  SELECT
    id, shipment_id AS shipmentId, shipment_code AS shipmentCode, type, message,
    is_read AS isRead, created_at AS createdAt
  FROM notifications
`;

// Registra un evento de un embarque existente; el mensaje es SQL para poder usar sus columnas
const notifyFromShipment = (id, type, messageSql, messageArgs = [], extraWhere = '', extraArgs = []) => ({
  sql: `
    INSERT INTO notifications (shipment_id, shipment_code, type, message)
    SELECT id, code, ?, ${messageSql} FROM shipments WHERE id = ? ${extraWhere}
  `,
  args: [type, ...messageArgs, id, ...extraArgs]
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
    }
  ];
};

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
    res.status(500).json({ error: 'Error al obtener clientes: ' + error.message });
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
    res.status(500).json({ error: 'Error al crear cliente: ' + error.message });
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

    const result = shipmentsRes.rows.map(shipment => ({
      ...plain(shipment),
      calibres: calibresByShipment[shipment.id] || {}
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener embarques: ' + error.message });
  }
});

// POST /api/shipments
app.post('/api/shipments', async (req, res) => {
  const {
    clientId, condition, deal, product, fruitType, category, loadWeek,
    etaWeek, transport, port, paymentTerms, variance, boxes, calibres, totalUsd, deliveryDate, prospectId
  } = req.body;

  if (!clientId || !port || !boxes || boxes <= 0) {
    return res.status(400).json({ error: 'Datos de embarque incompletos o inválidos.' });
  }

  const generatedCode = `KW-2025-W${loadWeek}-${Math.floor(100 + Math.random() * 900)}`;

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

    // Embarque + calibres en una sola transacción; los calibres referencian el embarque por su código único
    const statements = [{
      sql: INSERT_SHIPMENT,
      args: [
        generatedCode, clientId, condition, deal, product || 'Kiwi',
        fruitType || 'Convencional', category || 'Cat 1', 'USD', loadWeek,
        etaWeek || `Semana ${parseInt(loadWeek) + 2}`, transport || 'Marítimo', port,
        paymentTerms, variance ?? 2.0, boxes, totalUsd, 'Programado', deliveryDate || null
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
        INSERT INTO notifications (shipment_id, shipment_code, type, message)
        SELECT id, code, 'created', 'Embarque registrado para ' || (SELECT company FROM clients WHERE id = client_id)
        FROM shipments WHERE code = ?
      `,
      args: [generatedCode]
    });
    statements.push({ sql: `${SELECT_SHIPMENT} WHERE s.code = ?`, args: [generatedCode] });

    const results = await db.batch(statements, 'write');
    const newShipment = results[results.length - 1].rows[0];

    res.status(201).json({ ...plain(newShipment), calibres });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar embarque: ' + error.message });
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
    res.status(500).json({ error: 'Error al registrar la entrega: ' + error.message });
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
    res.status(500).json({ error: 'Error al cambiar el estado: ' + error.message });
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
    res.status(500).json({ error: 'Error al guardar el seguimiento: ' + error.message });
  }
});

// GET /api/shipments/:id/notifications
app.get('/api/shipments/:id/notifications', async (req, res) => {
  try {
    // Un cliente ve el historial de sus embarques, sin los seguimientos internos
    const { rows } = await db.execute(isClient(req)
      ? {
          sql: `
            ${SELECT_NOTIFICATION}
            WHERE shipment_id = ? AND type IN ('created', 'status', 'delivery')
              AND shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)
            ORDER BY id DESC
          `,
          args: [Number(req.params.id), req.user.clientId]
        }
      : { sql: `${SELECT_NOTIFICATION} WHERE shipment_id = ? ORDER BY id DESC`, args: [Number(req.params.id)] });
    res.json(rows.map(plain));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el historial: ' + error.message });
  }
});

// GET /api/notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const results = await db.batch([
      ...reminderStatements(),
      `${SELECT_NOTIFICATION} ORDER BY id DESC LIMIT 100`,
      'SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0'
    ], 'write');

    res.json({
      items: results[2].rows.map(plain),
      unread: Number(results[3].rows[0].count)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener notificaciones: ' + error.message });
  }
});

// POST /api/notifications/read-all
app.post('/api/notifications/read-all', async (req, res) => {
  try {
    await db.execute('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar notificaciones: ' + error.message });
  }
});

// PATCH /api/notifications/:id/read
app.patch('/api/notifications/:id/read', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.execute({ sql: 'UPDATE notifications SET is_read = 1 WHERE id = ?', args: [id] });
    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada.' });
    }
    res.json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la notificación: ' + error.message });
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
    res.status(500).json({ error: 'Error al obtener prospectos: ' + error.message });
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
    res.status(500).json({ error: 'Error al crear el prospecto: ' + error.message });
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
    res.status(500).json({ error: 'Error al actualizar el prospecto: ' + error.message });
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
    res.status(500).json({ error: 'Error al crear el cliente: ' + error.message });
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
    res.status(500).json({ error: 'Error al eliminar el prospecto: ' + error.message });
  }
});

// GET /api/products
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT id, name FROM products ORDER BY id ASC');
    res.json(rows.map(plain));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos: ' + error.message });
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
    res.status(500).json({ error: 'Error al crear producto: ' + error.message });
  }
});

// DELETE /api/shipments/:id
app.delete('/api/shipments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Borrado explícito de calibres: no dependemos de PRAGMA foreign_keys en la conexión remota
    const [, , , , result] = await db.batch([
      notifyFromShipment(id, 'deleted', "'Embarque eliminado'"),
      // Las notificaciones sobreviven al embarque, pero ya no apuntan a él
      { sql: 'UPDATE notifications SET shipment_id = NULL WHERE shipment_id = ?', args: [id] },
      // El prospecto que lo originó vuelve a estar abierto
      { sql: "UPDATE prospectos SET shipment_id = NULL, status = 'Cotizado' WHERE shipment_id = ?", args: [id] },
      { sql: 'DELETE FROM shipment_calibers WHERE shipment_id = ?', args: [id] },
      { sql: 'DELETE FROM shipments WHERE id = ?', args: [id] }
    ], 'write');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado.' });
    }

    res.json({ ok: true, id });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar embarque: ' + error.message });
  }
});

export default app;
