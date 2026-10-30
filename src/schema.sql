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
  delivery_date TEXT,
  delivered_boxes INTEGER CHECK (delivered_boxes >= 0),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Usuarios: administradores y clientes
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  status        TEXT NOT NULL CHECK (status IN ('active', 'pending', 'disabled')),
  full_name     TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Sesiones: solo guarda el hash del token
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Notificaciones y seguimientos de embarques
CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id   INTEGER REFERENCES shipments(id) ON DELETE SET NULL,
  shipment_code TEXT NOT NULL,
  type          TEXT NOT NULL,
  message       TEXT NOT NULL,
  is_read       INTEGER NOT NULL DEFAULT 0,
  dedupe_key    TEXT UNIQUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Prospectos: presupuestos iniciales de posibles ventas
CREATE TABLE IF NOT EXISTS prospectos (
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
);

-- Tabla de Productos
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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