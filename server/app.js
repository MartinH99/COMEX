import express from 'express';
import cors from 'cors';
import db, { initDb, INSERT_SHIPMENT } from './db.js';

const app = express();

app.use(cors());
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
    const { rows } = await db.execute('SELECT id, company, country, contact, rating, default_payment AS defaultPayment FROM clients ORDER BY company ASC');
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
    const [shipmentsRes, calibersRes] = await db.batch([
      `${SELECT_SHIPMENT} ORDER BY s.id DESC`,
      'SELECT shipment_id AS shipmentId, code, boxes, price_kg AS priceKg FROM shipment_calibers'
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
    const { rows } = await db.execute({
      sql: `${SELECT_NOTIFICATION} WHERE shipment_id = ? ORDER BY id DESC`,
      args: [Number(req.params.id)]
    });
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
