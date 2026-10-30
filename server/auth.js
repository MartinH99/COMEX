import { createHash, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'comex_session';
export const SESSION_DAYS = 7;
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [, salt, keyHex] = stored.split('$');
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, salt, KEY_LENGTH);
  return timingSafeEqual(expected, actual);
}

// Para que un usuario inexistente tarde lo mismo que una contraseña incorrecta
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEY_LENGTH * 2)}`;
export const verifyDummyPassword = (password) => verifyPassword(password, DUMMY_HASH);

// En la base solo se guarda el hash: un volcado de sessions no permite entrar
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const generateToken = () => randomBytes(32).toString('hex');

export function readSessionToken(req) {
  const cookies = req.headers.cookie || '';
  for (const part of cookies.split(';')) {
    const [name, value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value;
  }
  return null;
}

function cookieAttributes(maxAgeSeconds) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

export const sessionCookie = (token) => `${SESSION_COOKIE}=${token}; ${cookieAttributes(SESSION_DAYS * 24 * 60 * 60)}`;
export const clearedSessionCookie = () => `${SESSION_COOKIE}=; ${cookieAttributes(0)}`;
