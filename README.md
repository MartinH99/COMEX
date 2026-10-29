# COMEX

Frontend React + Vite y API Express sobre SQLite/libSQL.

## Desarrollo local

```bash
npm install
npm run server   # API en http://localhost:3001 (usa server/comex.db)
npm run dev      # Frontend en http://localhost:5173 (proxy /api -> 3001)
```

Si existe un archivo `.env` (ver `.env.example`) con `TURSO_DATABASE_URL`, la API local usa esa base remota en lugar de `server/comex.db`.

## Deploy en Vercel

En Vercel el sistema de archivos es efímero y de solo lectura, por eso **la base de datos no puede ser el archivo `server/comex.db`**: se usa [Turso](https://turso.tech) (SQLite en la nube, mismo SQL).

1. Crear la base en [app.turso.tech](https://app.turso.tech) (Create Database). En la base: copiar la URL (`libsql://...`) y generar un token (Create Token).
2. Copiar `.env.example` a `.env` y completar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
3. Subir los datos locales actuales a Turso (no requiere el CLI de Turso):
   ```bash
   npm run db:push
   ```
   (Opcional: si se saltea, la API crea las tablas y datos de ejemplo en el primer request.)
4. En Vercel → Project → Settings → Environment Variables, cargar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` (Production y Preview).
5. Hacer deploy. `vercel.json` ya configura el build de Vite (`dist`), la función `api/index.js` para todas las rutas `/api/*` y el fallback de la SPA.

Si falta `TURSO_DATABASE_URL` en Vercel, la función falla con un error explícito en los logs en lugar de escribir en un archivo que se pierde.

## Estructura

- `server/app.js` – rutas Express (sin `listen`, reutilizable en serverless)
- `server/index.js` – servidor local
- `server/db.js` – cliente libSQL, esquema y datos semilla
- `api/index.js` – entrada de la función serverless de Vercel
