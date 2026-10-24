import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Pool } from 'pg';
import { AuthError } from '../auth/validation.js';
import { MAX_PHOTO_BYTES } from './validation.js';

export interface PhotoStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export class LocalPhotoStorage implements PhotoStorage {
  constructor(private directory: string) {}
  private path(key: string) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(key))
      throw new Error('Referência inválida');
    return join(this.directory, key);
  }
  async put(key: string, bytes: Buffer) {
    const path = this.path(key);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
  }
  get(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
  }
}
export async function optimizePhoto(input: unknown) {
  if (!Buffer.isBuffer(input) || input.length === 0)
    throw new AuthError(
      400,
      'Selecione uma fotografia JPEG, PNG ou WebP. HEIC não tem conversão disponível.',
    );
  if (input.length > MAX_PHOTO_BYTES)
    throw new AuthError(413, 'A fotografia deve ter no máximo 5 MB.');
  const jpeg = input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    input.toString('ascii', 0, 4) === 'RIFF' &&
    input.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp)
    throw new AuthError(
      400,
      'Conteúdo inválido. Use JPEG, PNG ou WebP; SVG e HEIC não são aceitos.',
    );
  try {
    const pipeline = sharp(input, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
    });
    const meta = await pipeline.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) > 1
    )
      throw new Error('Formato não permitido');
    // A reencodificação descarta EXIF, GPS, XMP e ICC; orientação aplicada antes da remoção.
    return await pipeline
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AuthError(
      400,
      'Imagem inválida, animada ou acima de 40 megapixels. Use JPEG, PNG ou WebP.',
    );
  }
}
// Uma transação por arquivo permite múltiplos workers sem apagar uploads em uso.
export async function cleanupPhotos(pool: Pool, storage: PhotoStorage) {
  const client = await pool.connect();
  try {
    for (let n = 0; n < 25; n++) {
      await client.query('BEGIN');
      const result =
        await client.query(`SELECT photo_ref FROM motorcycle_photo_cleanup
        WHERE available_at<=now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1`);
      const key = result.rows[0]?.photo_ref as string | undefined;
      if (!key) {
        await client.query('COMMIT');
        break;
      }
      const used = await client.query(
        'SELECT id FROM motorcycles WHERE photo_ref=$1',
        [key],
      );
      if (used.rowCount)
        await client.query(
          'DELETE FROM motorcycle_photo_cleanup WHERE photo_ref=$1',
          [key],
        );
      else {
        try {
          await storage.remove(key);
          await client.query(
            'DELETE FROM motorcycle_photo_cleanup WHERE photo_ref=$1',
            [key],
          );
        } catch {
          await client.query(
            "UPDATE motorcycle_photo_cleanup SET attempts=attempts+1,available_at=now()+interval '5 minutes' WHERE photo_ref=$1",
            [key],
          );
        }
      }
      await client.query('COMMIT');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
