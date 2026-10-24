import { it, expect } from 'vitest';
import { calculateRoute } from '../src/modules/routes/routing.js';
import { routeFixture } from './route-fixtures.js';
const config = {
  url: 'https://routing.example',
  profile: 'driving',
  token: 'server-only',
};
it('OSRM preserva paradas e recebe GeoJSON/duração sem expor token', async () => {
  const data = routeFixture();
  let requestUrl = '';
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    expect(init?.headers).toEqual({ Authorization: 'Bearer server-only' });
    return Response.json({
      code: 'Ok',
      routes: [{ geometry: data.geometry, duration: 120 }],
    });
  };
  const r = await calculateRoute(config, data.waypoints, fetcher);
  expect(requestUrl).toContain('-35.73,-9.66;-35.72,-9.66');
  expect(r).toMatchObject({
    geometry: data.geometry,
    durationSeconds: 120,
    source: 'osrm',
  });
  expect(r.distanceMeters).toBeGreaterThan(1000);
});
it('OSRM trata NoRoute, falha e respostas grandes sem fallback', async () => {
  const data = routeFixture();
  await expect(
    calculateRoute(config, data.waypoints, async () =>
      Response.json({ code: 'NoRoute' }),
    ),
  ).rejects.toMatchObject({ statusCode: 422 });
  await expect(
    calculateRoute(config, data.waypoints, async () => {
      throw new Error();
    }),
  ).rejects.toMatchObject({ statusCode: 503 });
  await expect(
    calculateRoute(
      config,
      data.waypoints,
      async () => new Response('x'.repeat(2000001)),
    ),
  ).rejects.toMatchObject({ statusCode: 503 });
});
