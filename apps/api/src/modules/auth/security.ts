import {
  argon2,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export const secret = () => randomBytes(32).toString('base64url');
export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const csrfFor = (session: string) =>
  createHmac('sha256', session).update('apex-ride-csrf-v1').digest('hex');
export const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        memory: 65536,
        passes: 3,
        parallelism: 1,
        tagLength: 32,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString('base64').replace(/=+$/, '')}$${key.toString('base64').replace(/=+$/, '')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (
    parts.length !== 6 ||
    parts[1] !== 'argon2id' ||
    parts[2] !== 'v=19' ||
    parts[3] !== 'm=65536,t=3,p=1'
  )
    return false;
  const actual = await derive(password, Buffer.from(parts[4]!, 'base64'));
  const expected = Buffer.from(parts[5]!, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
