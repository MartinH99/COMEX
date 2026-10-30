// Copia los datos de server/comex.db a la base remota indicada en .env (TURSO_DATABASE_URL).
// Uso: npm run db:push            (aborta si la base remota ya tiene datos)
//      npm run db:push -- --force (borra los datos remotos y los reemplaza)
import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

if (!process.env.TURSO_DATABASE_URL) {
  console.error('Falta TURSO_DATABASE_URL. Copiá .env.example a .env y completalo.');
  process.exit(1);
}

const { default: remote, applySchema } = await import('../server/db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const local = createClient({ url: pathToFileURL(path.join(__dirname, '..', 'server', 'comex.db')).href });

// Orden respetando claves foráneas
const TABLES = ['clients', 'products', 'shipments', 'shipment_calibers', 'notifications', 'prospectos'];
const force = process.argv.includes('--force');

await applySchema(remote);
await applySchema(local);

const { rows } = await remote.execute('SELECT COUNT(*) AS count FROM clients');
if (Number(rows[0].count) > 0 && !force) {
  console.error('La base remota ya tiene datos. Usá "npm run db:push -- --force" para reemplazarlos.');
  process.exit(1);
}

const statements = [...TABLES].reverse().map(t => `DELETE FROM ${t}`);

for (const table of TABLES) {
  const { rows, columns } = await local.execute(`SELECT * FROM ${table}`);
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  rows.forEach(row => statements.push({ sql, args: columns.map(c => row[c]) }));
  console.log(`${table}: ${rows.length} filas`);
}

await remote.batch(statements, 'write');
console.log('✅ Datos copiados a', process.env.TURSO_DATABASE_URL);
