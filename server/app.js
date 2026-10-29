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
    s.variance, s.boxes, s.total_usd AS totalUsd, s.status, s.created_at AS createdAt
  FROM shipments s
`;

// Las filas de libsql son objetos especiales; los convertimos a objetos planos para JSON
const plain = row => ({ ...row });

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
    etaWeek, transport, port, paymentTerms, variance, boxes, calibres, totalUsd
  } = req.body;

  if (!clientId || !port || !boxes || boxes <= 0) {
    return res.status(400).json({ error: 'Datos de embarque incompletos o inválidos.' });
  }

  const generatedCode = `KW-2025-W${loadWeek}-${Math.floor(100 + Math.random() * 900)}`;

  try {
    // Embarque + calibres en una sola transacción; los calibres referencian el embarque por su código único
    const statements = [{
      sql: INSERT_SHIPMENT,
      args: [
        generatedCode, clientId, condition, deal, product || 'Kiwi Hayward Green',
        fruitType || 'Convencional', category || 'Cat 1', 'USD', loadWeek,
        etaWeek || `Semana ${parseInt(loadWeek) + 2}`, transport || 'Marítimo', port,
        paymentTerms, variance || 2.0, boxes, totalUsd, 'Programado'
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

    statements.push({ sql: `${SELECT_SHIPMENT} WHERE s.code = ?`, args: [generatedCode] });

    const results = await db.batch(statements, 'write');
    const newShipment = results[results.length - 1].rows[0];

    res.status(201).json({ ...plain(newShipment), calibres });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar embarque: ' + error.message });
  }
});

// DELETE /api/shipments/:id
app.delete('/api/shipments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Borrado explícito de calibres: no dependemos de PRAGMA foreign_keys en la conexión remota
    const [, result] = await db.batch([
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
