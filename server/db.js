import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// En Vercel el sistema de archivos es efímero y de solo lectura: un archivo
// SQLite local se perdería en cada deploy. Allí se usa una base remota (Turso),
// y en desarrollo local se sigue usando server/comex.db.
const url = process.env.TURSO_DATABASE_URL || pathToFileURL(path.join(__dirname, 'comex.db')).href;

if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL) {
  throw new Error('Falta la variable de entorno TURSO_DATABASE_URL en Vercel.');
}

const db = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    company         TEXT NOT NULL,
    country         TEXT NOT NULL,
    contact         TEXT NOT NULL,
    rating          INTEGER DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    default_payment TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS shipments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    condition     TEXT NOT NULL,
    deal          TEXT NOT NULL,
    product       TEXT NOT NULL,
    fruit_type    TEXT NOT NULL,
    category      TEXT DEFAULT 'Cat 1',
    currency      TEXT DEFAULT 'USD',
    load_week     INTEGER NOT NULL CHECK (load_week BETWEEN 1 AND 52),
    eta_week      TEXT,
    transport     TEXT DEFAULT 'Marítimo',
    port          TEXT NOT NULL,
    payment_terms TEXT NOT NULL,
    variance      REAL DEFAULT 2.0,
    boxes         INTEGER NOT NULL CHECK (boxes >= 0),
    total_usd     REAL NOT NULL CHECK (total_usd >= 0),
    status        TEXT DEFAULT 'Programado',
    delivery_date TEXT,
    delivered_boxes INTEGER CHECK (delivered_boxes >= 0),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS shipment_calibers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id  INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    code         TEXT NOT NULL,
    boxes        INTEGER NOT NULL DEFAULT 0 CHECK (boxes >= 0),
    price_kg     REAL NOT NULL DEFAULT 0 CHECK (price_kg >= 0),
    UNIQUE(shipment_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id   INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
    shipment_code TEXT NOT NULL,
    type          TEXT NOT NULL,
    message       TEXT NOT NULL,
    is_read       INTEGER NOT NULL DEFAULT 0,
    dedupe_key    TEXT UNIQUE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS prospectos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    company       TEXT NOT NULL,
    country       TEXT NOT NULL DEFAULT '',
    contact       TEXT NOT NULL DEFAULT '',
    email         TEXT,
    product       TEXT NOT NULL,
    condition     TEXT NOT NULL DEFAULT 'Venta',
    deal          TEXT NOT NULL DEFAULT 'Precio Cerrado',
    transport     TEXT NOT NULL DEFAULT 'Marítimo',
    port          TEXT,
    load_week     INTEGER CHECK (load_week BETWEEN 1 AND 52),
    delivery_date TEXT,
    valid_until   TEXT,
    payment_terms TEXT,
    variance      REAL NOT NULL DEFAULT 2.0,
    calibres      TEXT NOT NULL DEFAULT '{}',
    boxes         INTEGER NOT NULL DEFAULT 0 CHECK (boxes >= 0),
    total_usd     REAL NOT NULL DEFAULT 0 CHECK (total_usd >= 0),
    status        TEXT NOT NULL DEFAULT 'Nuevo',
    notes         TEXT,
    shipment_id   INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS idx_notifications_shipment ON notifications(shipment_id)',
  'CREATE INDEX IF NOT EXISTS idx_shipments_client ON shipments(client_id)',
  'CREATE INDEX IF NOT EXISTS idx_calibers_shipment ON shipment_calibers(shipment_id)',
  "INSERT INTO products (name) SELECT 'Kiwi' WHERE NOT EXISTS (SELECT 1 FROM products)"
];

// Columnas agregadas después de crear la tabla: CREATE TABLE IF NOT EXISTS no las suma a una base existente
const SHIPMENT_COLUMNS = [
  ['delivery_date', 'delivery_date TEXT'],
  ['delivered_boxes', 'delivered_boxes INTEGER CHECK (delivered_boxes >= 0)']
];

// Crea lo que falte sin tocar los datos existentes
export async function applySchema(client = db) {
  await client.batch(SCHEMA, 'write');

  const { rows } = await client.execute('PRAGMA table_info(shipments)');
  const existing = rows.map(row => row.name);

  for (const [name, definition] of SHIPMENT_COLUMNS) {
    if (existing.includes(name)) continue;
    try {
      await client.execute(`ALTER TABLE shipments ADD COLUMN ${definition}`);
    } catch (error) {
      // Otra instancia serverless pudo haberla agregado al mismo tiempo
      if (!error.message.includes('duplicate column')) throw error;
    }
  }
}

const INSERT_SHIPMENT = `
  INSERT INTO shipments (code, client_id, condition, deal, product, fruit_type, category, currency, load_week, eta_week, transport, port, payment_terms, variance, boxes, total_usd, status, delivery_date)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

async function seed() {
  // Sembrar datos de prueba iniciales si la tabla de clientes está vacía
  const { rows } = await db.execute('SELECT COUNT(*) AS count FROM clients');
  if (Number(rows[0].count) > 0) return;

  const insertClient = 'INSERT INTO clients (company, country, contact, rating, default_payment) VALUES (?, ?, ?, ?, ?)';
  const insertCaliber = `
    INSERT INTO shipment_calibers (shipment_id, code, boxes, price_kg)
    VALUES ((SELECT id FROM shipments WHERE code = ?), ?, ?, ?)
  `;
  const code = 'KW-2025-W18-01';

  await db.batch([
    { sql: insertClient, args: ['Rotterdam Fruit Imports B.V.', 'Holanda', 'Jan van der Meer', 5, '50/50; 15 días llegada fruta'] },
    { sql: insertClient, args: ['Shanghai Fresh Trading Co.', 'China', 'Wei Zhang', 5, '100% CAD (Cash Against Documents)'] },
    { sql: insertClient, args: ['Philadelphia Produce Corp', 'EE.UU.', 'Michael Scott', 4, '30 días desde arribo a puerto'] },
    { sql: insertClient, args: ['Mercado Central Santos S.A.', 'Brasil', 'Carlos Silva', 3, '50% anticipado, 50% entrega'] },
    {
      sql: INSERT_SHIPMENT,
      args: [
        code, 1, 'Venta', 'Precio Cerrado', 'Kiwi Hayward Green',
        'Convencional', 'Cat 1', 'USD', 18, 'Semana 20 (ETA Mayo 15)',
        'Marítimo', 'Puerto de Rotterdam', '50/50; 15 días llegada fruta',
        2.0, 2288, 49446.00, 'En Tránsito', null
      ]
    },
    { sql: insertCaliber, args: [code, 'C27', 500, 2.40] },
    { sql: insertCaliber, args: [code, 'C30', 800, 2.25] },
    { sql: insertCaliber, args: [code, 'C33', 600, 2.10] },
    { sql: insertCaliber, args: [code, 'C36', 388, 1.95] }
  ], 'write');
}

let initPromise;

// Idempotente: en serverless se llama en cada request pero sólo corre una vez por instancia
export function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      await db.execute('PRAGMA foreign_keys = ON');
      await applySchema();
      await seed();
    })().catch(err => {
      initPromise = undefined;
      throw err;
    });
  }
  return initPromise;
}

export { INSERT_SHIPMENT };
export default db;
