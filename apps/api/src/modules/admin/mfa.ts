import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { AuthError } from '../auth/validation.js';
export const authenticator = (secret?: string, label = 'Apex Ride') =>
  new TOTP({
    issuer: 'Apex Ride Admin',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret ?? new Secret({ size: 20 }),
  });
function key(value: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value))
    throw new AuthError(
      503,
      'MFA administrativo requer configuração operacional.',
    );
  return Buffer.from(value, 'hex');
}
export function encryptSecret(secret: string, value: string, user: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(value), iv);
  cipher.setAAD(Buffer.from(user));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString('base64url'))
    .join('.');
}
export function decryptSecret(encrypted: string, value: string, user: string) {
  const [iv, tag, data] = encrypted
    .split('.')
    .map((v) => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(value), iv!);
  cipher.setAAD(Buffer.from(user));
  cipher.setAuthTag(tag!);
  return Buffer.concat([cipher.update(data!), cipher.final()]).toString('utf8');
}
export function counter(
  secret: string,
  token: unknown,
  last: number,
  now = Date.now(),
) {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return null;
  const t = authenticator(secret),
    delta = t.validate({ token, window: 1, timestamp: now });
  const n = Math.floor(now / 30000) + (delta ?? 0);
  return delta !== null && n > last ? n : null;
}
