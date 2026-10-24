import {
  validCoordinate,
  validLine,
  lineLength,
  project,
  gateCrossing,
  type RouteData,
} from '@apex-ride/ride-core/routes';
import { AuthError } from '../auth/validation.js';
export const invalid = (message = 'Dados do percurso inválidos.') =>
  new AuthError(400, message);
export function routeData(value: unknown, circuit = false): RouteData {
  if (!value || typeof value !== 'object') throw invalid();
  const b = value as RouteData;
  for (const [key, max] of [
    ['name', 120],
    ['description', 4000],
    ['city', 120],
    ['state', 2],
    ['category', 60],
  ] as const)
    if (typeof b[key] !== 'string' || b[key].length > max) throw invalid();
  if (
    !b.name.trim() ||
    (b.state &&
      !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(
        b.state,
      ))
  )
    throw invalid();
  if (
    !validLine(b.geometry) ||
    lineLength(b.geometry) < 1 ||
    lineLength(b.geometry) > 5_000_000
  )
    throw invalid('Geometria vazia, inválida ou fora dos limites.');
  if (
    !Array.isArray(b.waypoints) ||
    b.waypoints.length < 2 ||
    b.waypoints.length > 25 ||
    !b.waypoints.every(validCoordinate)
  )
    throw invalid('Defina entre 2 e 25 pontos.');
  if (b.waypoints.some((p) => project(b.geometry, p).distance > 150))
    throw invalid('Paradas devem estar próximas do percurso.');
  if (
    !['manual', 'osrm'].includes(b.source) ||
    (b.durationSeconds !== null &&
      (!Number.isFinite(b.durationSeconds) ||
        b.durationSeconds < 0 ||
        b.durationSeconds > 604800))
  )
    throw invalid();
  if (
    circuit &&
    project(
      {
        type: 'LineString',
        coordinates: [b.geometry.coordinates[0]!, b.geometry.coordinates[0]!],
      },
      b.geometry.coordinates.at(-1)!,
    ).distance > 50
  )
    throw invalid('O circuito deve fechar com tolerância de até 50 m.');
  if (
    b.startLine !== null &&
    (!circuit ||
      !validLine(b.startLine) ||
      b.startLine.coordinates.length !== 2 ||
      lineLength(b.startLine) < 2 ||
      lineLength(b.startLine) > 100 ||
      b.startLine.coordinates.some((p) => project(b.geometry, p).distance > 60))
  )
    throw invalid('Linha de largada inválida.');
  if (b.direction !== null && (!circuit || ![1, -1].includes(b.direction)))
    throw invalid();
  if (
    b.startLine &&
    b.direction &&
    !b.geometry.coordinates
      .slice(1)
      .some(
        (p, i) =>
          gateCrossing(
            b.startLine!,
            b.geometry.coordinates[i]!,
            p,
            b.direction!,
          ) !== null,
      )
  )
    throw invalid('A linha deve atravessar o percurso no sentido definido.');
  return {
    name: b.name.trim(),
    description: b.description.trim(),
    city: b.city.trim(),
    state: b.state,
    category: b.category.trim(),
    geometry: b.geometry,
    waypoints: b.waypoints,
    source: b.source,
    durationSeconds: b.source === 'manual' ? null : b.durationSeconds,
    startLine: b.startLine,
    direction: b.direction,
  };
}
export function listQuery(query: Record<string, unknown>, nearby = false) {
  const text = (key: string, max = 120) => {
    const v = query[key] ?? '';
    if (typeof v !== 'string' || v.length > max) throw invalid();
    return v;
  };
  const num = (key: string, fallback: number, min: number, max: number) => {
    const raw = query[key];
    const n = raw === undefined ? fallback : Number(raw);
    if (typeof raw === 'object' || !Number.isFinite(n) || n < min || n > max)
      throw invalid();
    return n;
  };
  const page = num('page', 1, 1, 1000),
    limit = num('limit', 20, 1, 50);
  if (!Number.isInteger(page) || !Number.isInteger(limit)) throw invalid();
  const sort = text('sort') || 'recent';
  if (!['recent', 'nearest', 'favorites', 'shortest', 'longest'].includes(sort))
    throw invalid();
  const kind = text('kind');
  if (kind && !['route', 'circuit'].includes(kind)) throw invalid();
  let center: [number, number] | null = null;
  if (nearby || query.lon !== undefined || query.lat !== undefined)
    center = [num('lon', NaN, -180, 180), num('lat', NaN, -85, 85)];
  if (sort === 'nearest' && !center)
    throw invalid('Informe uma região para ordenar por proximidade.');
  let bbox: number[] | null = null;
  if (query.bbox !== undefined) {
    bbox = text('bbox', 200).split(',').map(Number);
    if (
      bbox.length !== 4 ||
      !validCoordinate(bbox.slice(0, 2)) ||
      !validCoordinate(bbox.slice(2)) ||
      bbox[0]! >= bbox[2]! ||
      bbox[1]! >= bbox[3]! ||
      bbox[2]! - bbox[0]! > 15 ||
      bbox[3]! - bbox[1]! > 15
    )
      throw invalid('Aproxime o mapa para buscar nesta região.');
  }
  return {
    q: text('q'),
    city: text('city'),
    state: text('state', 2),
    kind,
    sort,
    page,
    limit,
    center,
    bbox,
    radius: num('radius', 25000, 100, 100000),
  };
}
