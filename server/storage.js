import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// En Vercel los archivos van a Vercel Blob (privado); en local, a una carpeta ignorada por git
const usesBlob = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const localDir = () => process.env.DOCUMENTS_DIR || path.join(__dirname, 'uploads');

// En Vercel el disco es de solo lectura: sin almacén conectado no se pueden guardar archivos
export const isStorageAvailable = () => usesBlob() || !process.env.VERCEL;

const localPath = (key) => path.join(localDir(), ...key.split('/'));

export async function saveFile(key, buffer, contentType) {
  if (usesBlob()) {
    const { put } = await import('@vercel/blob');
    await put(key, buffer, { access: 'private', contentType, addRandomSuffix: false });
    return;
  }
  const target = localPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
}

// Devuelve un stream de Node, o null si el archivo no existe en este almacenamiento
export async function readFile(key) {
  if (usesBlob()) {
    const { get } = await import('@vercel/blob');
    const result = await get(key, { access: 'private' });
    return result?.stream ? Readable.fromWeb(result.stream) : null;
  }
  try {
    return Readable.from(await fs.readFile(localPath(key)));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function deleteFile(key) {
  if (usesBlob()) {
    const { del } = await import('@vercel/blob');
    await del(key);
    return;
  }
  await fs.rm(localPath(key), { force: true });
}
