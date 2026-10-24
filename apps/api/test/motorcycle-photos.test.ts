import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  optimizePhoto,
  LocalPhotoStorage,
} from '../src/modules/motorcycles/photos.js';
import { parseEnv } from '../src/config/env.js';

describe('limites e sanitização de fotografias', () => {
  it('rejeita imagem comprimida com mais de 40 megapixels', async () => {
    const bytes = await sharp({
      create: { width: 6400, height: 6400, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    await expect(optimizePhoto(bytes)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
  it('reencodifica pixels e descarta conteúdo anexado ao arquivo original', async () => {
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    const output = await optimizePhoto(
      Buffer.concat([bytes, Buffer.from('<script>private-payload</script>')]),
    );
    expect(output.data.includes(Buffer.from('private-payload'))).toBe(false);
    expect((await sharp(output.data).metadata()).format).toBe('webp');
  });
  it('não amplia fotos pequenas e preserva transparência de PNG', async () => {
    const bytes = await sharp({
      create: { width: 20, height: 10, channels: 4, background: '#00000000' },
    })
      .png()
      .toBuffer();
    const output = await optimizePhoto(bytes);
    expect(output.info).toMatchObject({ width: 20, height: 10 });
    expect((await sharp(output.data).metadata()).hasAlpha).toBe(true);
  });
  it.each([null, {}, Buffer.alloc(0)])(
    'recusa corpo vazio ou não binário: %j',
    async (bytes) => {
      await expect(optimizePhoto(bytes)).rejects.toMatchObject({
        statusCode: 400,
      });
    },
  );
  it('impede escape do diretório controlado em leitura, escrita e exclusão', async () => {
    const storage = new LocalPhotoStorage('unreachable-test-path');
    expect(() => storage.get('../outside.webp')).toThrow('Referência inválida');
    await expect(
      storage.put('../outside.webp', Buffer.from('invalid')),
    ).rejects.toThrow('Referência inválida');
    await expect(storage.remove('../outside.webp')).rejects.toThrow(
      'Referência inválida',
    );
  });
  it('valida configuração de armazenamento fora das pastas de código público', () => {
    const env = {
      DATABASE_URL: 'postgresql://local:example@127.0.0.1:55432/apex_ride',
      DATABASE_SSL: 'disable',
    };
    expect(() =>
      parseEnv({ ...env, MOTORCYCLE_STORAGE_DIR: 'relative/path' }),
    ).toThrow('MOTORCYCLE_STORAGE_DIR');
    const root = parseEnv(env).motorcycleStorageDir.replace(
      /[\\/]\.local[\\/]motorcycle-photos$/,
      '',
    );
    for (const suffix of [
      '',
      '/apps/web/public/uploads',
      '/apps/api/src/uploads',
      '/.local',
      '/node_modules/photos',
    ]) {
      expect(() =>
        parseEnv({ ...env, MOTORCYCLE_STORAGE_DIR: root + suffix }),
      ).toThrow('MOTORCYCLE_STORAGE_DIR');
    }
  });
});
