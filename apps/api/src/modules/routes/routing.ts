import type { Config } from '../../config/env.js';
import {
  validCoordinate,
  validLine,
  lineLength,
  type Coordinate,
  type Line,
} from '@apex-ride/ride-core/routes';
import { AuthError } from '../auth/validation.js';
import { invalid } from './validation.js';
import { normalizeManeuvers } from './directions.js';
export async function calculateRoute(
  config: Config['routing'],
  waypoints: unknown,
  fetcher = fetch,
  withSteps = false,
) {
  if (
    !Array.isArray(waypoints) ||
    waypoints.length < 2 ||
    waypoints.length > 25 ||
    !waypoints.every(validCoordinate)
  )
    throw invalid('Defina entre 2 e 25 pontos válidos.');
  if (!config.url)
    throw new AuthError(
      503,
      'Roteamento rodoviário não configurado. Os pontos foram preservados.',
    );
  try {
    const url = `${config.url}/route/v1/${config.profile}/${(waypoints as Coordinate[]).map((p) => p.join(',')).join(';')}?overview=full&geometries=geojson&steps=${withSteps}&alternatives=false`;
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
    });
    if (!r.ok) throw new Error();
    // Bound the body even when Content-Length is absent.
    const reader = r.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2_000_000) throw new Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data.code === 'NoRoute' || data.code === 'NoSegment')
      throw new AuthError(
        422,
        'Não foram encontradas vias entre os pontos. Ajuste os pontos ou tente novamente.',
      );
    const route = data.routes?.[0];
    if (
      data.code !== 'Ok' ||
      !validLine(route?.geometry) ||
      lineLength(route.geometry) < 1
    )
      throw new Error();
    return {
      geometry: route.geometry as Line,
      distanceMeters: lineLength(route.geometry),
      durationSeconds:
        Number.isFinite(route.duration) &&
        route.duration >= 0 &&
        route.duration <= 604800
          ? (route.duration as number)
          : null,
      source: 'osrm' as const,
      ...(withSteps
        ? {
            waypoints: waypoints as Coordinate[],
            maneuvers: normalizeManeuvers(
              route.legs,
              route.geometry,
              waypoints.length - 1,
            ),
          }
        : {}),
    };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError(
      503,
      'Provedor de rotas indisponível. Os pontos foram preservados.',
    );
  }
}
