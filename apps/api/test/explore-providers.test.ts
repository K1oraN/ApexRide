import { expect, it, vi } from 'vitest';
import { geocode } from '../src/modules/routes/geocoding.js';
import { calculateRoute } from '../src/modules/routes/routing.js';
import { routeData, listQuery } from '../src/modules/routes/validation.js';
import { routeFixture } from './route-fixtures.js';
const config = {
  url: 'https://routing.example',
  profile: 'driving',
  token: '',
};
function response() {
  const geometry = routeFixture().geometry;
  const start = geometry.coordinates[0]!,
    end = geometry.coordinates.at(-1)!;
  return {
    code: 'Ok',
    routes: [
      {
        geometry,
        duration: 120,
        legs: [
          {
            steps: [
              {
                name: 'Via sintética',
                distance: 1000,
                duration: 120,
                geometry,
                maneuver: { type: 'depart', location: start },
              },
              {
                name: '',
                distance: 0,
                duration: 0,
                geometry: { type: 'LineString', coordinates: [end] },
                maneuver: { type: 'arrive', location: end },
              },
            ],
          },
        ],
      },
    ],
  };
}
it('directions pede steps=true e mantém o contrato anterior steps=false', async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    urls.push(String(url));
    return Response.json(response());
  };
  const directions = await calculateRoute(
    config,
    routeFixture().waypoints,
    fetcher,
    true,
  );
  expect(urls[0]).toContain('steps=true');
  expect(directions.maneuvers).toHaveLength(2);
  expect(directions.maneuvers![0]).toMatchObject({
    type: 'depart',
    instruction: 'Siga pela via indicada · Via sintética',
    legIndex: 0,
    along: 0,
  });
  expect(directions.maneuvers![1]!.along).toBeCloseTo(
    directions.distanceMeters,
  );
  const legacy = await calculateRoute(
    config,
    routeFixture().waypoints,
    fetcher,
  );
  expect(urls[1]).toContain('steps=false');
  expect(legacy).not.toHaveProperty('maneuvers');
});
it.each(['missing', 'far', 'invalid', 'unbounded', 'no-arrival'])(
  'resposta inválida de manobras é rejeitada: %s',
  async (kind) => {
    const data = response();
    const step = data.routes[0]!.legs[0]!.steps[0]!;
    if (kind === 'missing') data.routes[0]!.legs = [];
    if (kind === 'far') step.maneuver.location = [0, 0];
    if (kind === 'invalid') step.duration = -1;
    if (kind === 'unbounded')
      step.geometry.coordinates = Array.from({ length: 30001 }, () => [
        -35.73, -9.66,
      ]);
    if (kind === 'no-arrival') data.routes[0]!.legs[0]!.steps.pop();
    await expect(
      calculateRoute(
        config,
        routeFixture().waypoints,
        async () => Response.json(data),
        true,
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  },
);
it('geocodificação exige configuração autorizada e não usa fallback público', async () => {
  const fetcher = vi.fn();
  await expect(
    geocode({ key: 'secret', authorized: false }, 'Maceió', fetcher),
  ).rejects.toMatchObject({ statusCode: 503 });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(['a', 'x'.repeat(161), 'abc\u0000', null, ['Maceió']])(
  'limita/normaliza entrada de geocodificação %j',
  async (query) => {
    await expect(
      geocode({ key: 'secret', authorized: true }, query),
    ).rejects.toMatchObject({ statusCode: 400 });
  },
);
it('geocodificação tem host fixo, timeout, bloqueio de redirect, resposta limitada e chave só no servidor', async () => {
  const fetcher: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url));
    expect(parsed.hostname).toBe('api.maptiler.com');
    expect(parsed.searchParams.get('country')).toBe('br');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeTruthy();
    return Response.json({
      features: [
        { id: '1', place_name: 'Maceió, AL', center: [-35.73, -9.66] },
        { id: 'invalid', place_name: 'Fora', center: [999, 999] },
      ],
    });
  };
  const result = await geocode(
    { key: 'secret', authorized: true },
    ' https://evil.example/path ',
    fetcher,
  );
  expect(result.places).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(result.attribution).toContain('MapTiler');
});
it('falha ou excesso de resposta não expõe chave e não inventa endereço', async () => {
  await expect(
    geocode(
      { key: 'secret', authorized: true },
      'Maceió',
      async () => new Response('x'.repeat(250001)),
    ),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(
    geocode({ key: 'secret', authorized: true }, 'Maceió', async () => {
      throw new Error('secret');
    }),
  ).rejects.not.toThrow('secret');
});
it('metadados GPX são limitados e compatíveis com percursos antigos', () => {
  const fixture = routeFixture();
  expect(routeData(fixture).source).toBe('manual');
  const value = {
    ...fixture,
    importMetadata: {
      source: 'gpx' as const,
      version: 1 as const,
      altitudes: fixture.geometry.coordinates.map(() => 100),
    },
  };
  expect(routeData(value).importMetadata).toEqual(value.importMetadata);
  expect(() =>
    routeData({
      ...value,
      importMetadata: { ...value.importMetadata, altitudes: [NaN] },
    }),
  ).toThrow();
  expect(() => routeData({ ...value, source: 'osrm' })).toThrow();
});
it('UF/cidade/categoria/distância são filtros reais e validados, sem região fixa', () => {
  expect(listQuery({})).toMatchObject({
    state: '',
    city: '',
    minDistance: 0,
    maxDistance: 5000000,
  });
  expect(
    listQuery({
      state: 'SP',
      city: 'Santos',
      category: 'Turismo',
      minDistance: '1000',
    }),
  ).toMatchObject({
    state: 'SP',
    city: 'Santos',
    category: 'Turismo',
    minDistance: 1000,
  });
  expect(() => listQuery({ minDistance: '-1' })).toThrow();
});
