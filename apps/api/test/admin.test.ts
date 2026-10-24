import { randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  authenticator,
  counter,
  encryptSecret,
  decryptSecret,
} from '../src/modules/admin/mfa.js';
import { page, text } from '../src/modules/admin/validation.js';
describe('Parte 22 — primitivas de segurança', () => {
  it('TOTP RFC6238 SHA1, seis dígitos, janela limitada e rejeição de replay', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(authenticator(secret).generate({ timestamp: 59000 })).toBe('287082');
    expect(counter(secret, '287082', -1, 59000)).toBe(1);
    expect(counter(secret, '287082', 1, 59000)).toBeNull();
    expect(counter(secret, '287082', -1, 150000)).toBeNull();
    expect(counter(secret, '2870820', -1, 59000)).toBeNull();
  });
  it('AES-GCM vincula segredo à conta e detecta adulteração', () => {
    const key = randomBytes(32).toString('hex'),
      user = randomUUID(),
      secret = authenticator().secret.base32;
    const encrypted = encryptSecret(secret, key, user);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted, key, user)).toBe(secret);
    expect(() => decryptSecret(encrypted, key, randomUUID())).toThrow();
    expect(() =>
      decryptSecret(encrypted, randomBytes(32).toString('hex'), user),
    ).toThrow();
    expect(() => encryptSecret(secret, '', user)).toThrow(/configuração/);
  });
  it('limita páginas, texto, controles e rejeita campos não permitidos', () => {
    expect(() => page({ page: '1001' })).toThrow();
    expect(() => page({ isAdmin: true })).toThrow();
    expect(() => text('a\u0000bcd')).toThrow();
    expect(page({ page: '2' }).offset).toBe(30);
    expect(text('<script>alert(1)</script>')).toContain('<script>');
  });
});
