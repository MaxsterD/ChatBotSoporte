import crypto from 'node:crypto';
import { env } from '../env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado para GCM

function deriveKey(): Buffer {
  return crypto.createHash('sha256').update(env.JWT_SECRET).digest();
}

/**
 * Cifra un texto plano usando AES-256-GCM con la clave del servidor.
 * Devuelve una cadena con formato: iv:authTag:ciphertext (en hexadecimal).
 */
export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra una credencial previamente cifrada con encryptCredential.
 */
export function decryptCredential(cipherPayload: string): string {
  if (!cipherPayload) return '';
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de credencial cifrada inválido.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
