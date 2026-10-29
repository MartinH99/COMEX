-- Tabla de Clientes CRM
CREATE TABLE IF NOT EXISTS clients (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company         TEXT NOT NULL,
  country         TEXT NOT NULL,
  contact         TEXT NOT NULL,
  rating          INTEGER DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  default_payment TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Embarques
CREATE TABLE IF NOT EXISTS shipments (
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
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Detalle por Calibre
CREATE TABLE IF NOT EXISTS shipment_calibers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id  INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,
  boxes        INTEGER NOT NULL DEFAULT 0 CHECK (boxes >= 0),
  price_kg     REAL NOT NULL DEFAULT 0 CHECK (price_kg >= 0),
  UNIQUE(shipment_id, code)
);

CREATE INDEX IF NOT EXISTS idx_shipments_client ON shipments(client_id);
CREATE INDEX IF NOT EXISTS idx_calibers_shipment ON shipment_calibers(shipment_id);