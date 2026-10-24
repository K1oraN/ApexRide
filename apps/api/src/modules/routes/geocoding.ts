import { validCoordinate } from '@apex-ride/ride-core/routes';
import type { Config } from '../../config/env.js';
import { AuthError } from '../auth/validation.js';

export async function geocode(
  config: Config['geocoding'],
  query: unknown,
  fetcher = fetch,
) {
  if (
    typeof query !== 'string' ||
    query.trim().length < 3 ||
    query.length > 160 ||
    [...query].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new AuthError(400, 'Digite de 3 a 160 caracteres para pesquisar.');
  if (!config?.authorized || !config.key)
    throw new AuthError(
      503,
      'Busca de endereços não configurada. Selecione no mapa ou use coordenadas.',
    );
  const text = query.trim().normalize('NFC').replace(/\s+/g, ' ');
  // Fixed provider allowlist. No URL or host is accepted from the caller.
  const url = new URL(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(text)}.json`,
  );
  url.searchParams.set('key', config.key);
  url.searchParams.set('language', 'pt');
  url.searchParams.set('country', 'br');
  url.searchParams.set('limit', '5');
  url.searchParams.set('autocomplete', 'false');
  try {
    const response = await fetcher(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 250000) throw new Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!Array.isArray(data.features)) throw new Error();
    const places = data.features
      .slice(0, 5)
      .flatMap(
        (feature: {
          id?: unknown;
          center?: unknown;
          place_name?: unknown;
          context?: unknown;
        }) => {
          if (
            !validCoordinate(feature.center) ||
            typeof feature.place_name !== 'string'
          )
            return [];
          return [
            {
              id: String(feature.id ?? '').slice(0, 120),
              label: feature.place_name.slice(0, 300),
              coordinate: feature.center,
            },
          ];
        },
      );
    return {
      places,
      attribution: '© MapTiler © OpenStreetMap contributors',
      provider: 'maptiler',
    };
  } catch {
    throw new AuthError(
      503,
      'Busca de endereços indisponível. Seus pontos foram preservados.',
    );
  }
}
