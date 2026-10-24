import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import sharp from 'sharp';
import { optimizePhoto, type PhotoStorage } from '../motorcycles/photos.js';
import { AuthError } from '../auth/validation.js';
let processing = 0;
export async function processSocialPhoto(body: unknown) {
  if (processing >= 2)
    throw new AuthError(
      429,
      'Processamento de fotos ocupado. Tente novamente em instantes.',
    );
  processing++;
  try {
    const full = await optimizePhoto(body);
    const thumb = await sharp(full.data)
      .resize({
        width: 480,
        height: 480,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer();
    return { full, thumb };
  } finally {
    processing--;
  }
}
export async function queueMedia(
  client: PoolClient,
  postId: string,
  except: string[] = [],
) {
  await client.query('SELECT pg_advisory_xact_lock(180017)');
  const removed = await client.query(
    'DELETE FROM social_post_media WHERE post_id=$1 AND NOT(id=ANY($2::uuid[])) RETURNING file_ref,thumbnail_ref',
    [postId, except],
  );
  for (const row of removed.rows)
    for (const key of [row.file_ref, row.thumbnail_ref])
      await client.query(
        'INSERT INTO social_media_cleanup(file_ref) VALUES($1) ON CONFLICT(file_ref) DO UPDATE SET available_at=now()',
        [key],
      );
}
export async function uploadMedia(
  pool: Pool,
  storage: PhotoStorage,
  owner: string,
  body: unknown,
) {
  const { full, thumb } = await processSocialPhoto(body);
  const id = randomUUID(),
    file = `${randomUUID()}.webp`,
    thumbnail = `${randomUUID()}.webp`;
  // Journal both files before any I/O; a crash leaves retryable cleanup entries.
  await pool.query(
    "INSERT INTO social_media_cleanup(file_ref,available_at) VALUES($1,now()+interval '1 hour'),($2,now()+interval '1 hour')",
    [file, thumbnail],
  );
  try {
    await storage.put(file, full.data);
    await storage.put(thumbnail, thumb);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(180017)');
      const pending = await client.query(
        'SELECT file_ref FROM social_media_cleanup WHERE file_ref=ANY($1::text[]) ORDER BY file_ref FOR UPDATE',
        [[file, thumbnail]],
      );
      if (pending.rowCount !== 2) throw new Error('Upload expirado');
      await client.query(
        'INSERT INTO social_post_media(id,owner_id,file_ref,thumbnail_ref,width,height,bytes) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          id,
          owner,
          file,
          thumbnail,
          full.info.width,
          full.info.height,
          full.info.size,
        ],
      );
      // Journal stays until publication; cleaner never removes referenced files.
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return {
      id,
      width: full.info.width,
      height: full.info.height,
      url: `/social/media/${id}`,
      thumbnailUrl: `/social/media/${id}?size=thumb`,
    };
  } catch (error) {
    await pool.query(
      'UPDATE social_media_cleanup SET available_at=now() WHERE file_ref=ANY($1::text[])',
      [[file, thumbnail]],
    );
    throw error;
  }
}
export async function cleanupSocialMedia(pool: Pool, storage: PhotoStorage) {
  const client = await pool.connect();
  try {
    for (let n = 0; n < 50; n++) {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(180017)');
      const row = (
        await client.query(
          'SELECT file_ref FROM social_media_cleanup WHERE available_at<=now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1',
        )
      ).rows[0];
      if (!row) {
        await client.query('COMMIT');
        break;
      }
      // An attachment transaction locks media rows too; expiration cannot race attaching.
      const media = (
        await client.query(
          'SELECT id,post_id,group_id,event_id,created_at FROM social_post_media WHERE file_ref=$1 OR thumbnail_ref=$1 FOR UPDATE',
          [row.file_ref],
        )
      ).rows[0];
      if (
        media &&
        (media.post_id ||
          media.group_id ||
          media.event_id ||
          Date.now() - new Date(media.created_at).getTime() < 3600000)
      ) {
        if (media.post_id || media.group_id || media.event_id)
          await client.query(
            'DELETE FROM social_media_cleanup WHERE file_ref=$1',
            [row.file_ref],
          );
        else
          await client.query(
            "UPDATE social_media_cleanup SET available_at=now()+interval '5 minutes' WHERE file_ref=$1",
            [row.file_ref],
          );
      } else {
        if (media)
          await client.query('DELETE FROM social_post_media WHERE id=$1', [
            media.id,
          ]);
        try {
          await storage.remove(row.file_ref);
          await client.query(
            'DELETE FROM social_media_cleanup WHERE file_ref=$1',
            [row.file_ref],
          );
        } catch {
          await client.query(
            "UPDATE social_media_cleanup SET attempts=attempts+1,available_at=now()+interval '5 minutes' WHERE file_ref=$1",
            [row.file_ref],
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
