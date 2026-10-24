// Loopback-only provider for controlled browser tests. Never used by application configuration.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
export async function routeProviderFixture() {
  let fail = false;
  let delay = 0,
    noRoute = false;
  const server = createServer((req, res) => {
    if (req.url === '/fixture/fail') {
      fail = true;
      res.end('ok');
      return;
    }
    if (req.url === '/fixture/restore') {
      fail = false;
      delay = 0;
      noRoute = false;
      res.end('ok');
      return;
    }
    if (req.url === '/fixture/slow') {
      delay = 4000;
      res.end('ok');
      return;
    }
    if (req.url === '/fixture/no-route') {
      noRoute = true;
      res.end('ok');
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (noRoute) {
      res.end(JSON.stringify({ code: 'NoRoute' }));
      return;
    }
    if (fail) {
      res.statusCode = 503;
      res.end('{}');
      return;
    }
    const input = new URL(req.url!, 'http://localhost');
    const points = decodeURIComponent(input.pathname.split('/').at(-1)!)
      .split(';')
      .map((p) => p.split(',').map(Number));
    if (
      points.length < 2 ||
      points.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))
    ) {
      res.statusCode = 400;
      res.end('{}');
      return;
    }
    const geometry: number[][] = [];
    const legs = points.slice(1).map((end, index) => {
      const start = points[index]!,
        corner = [end[0]!, start[1]!];
      geometry.push(start, corner, end);
      return {
        steps: [
          {
            name: 'Via sintética leste',
            distance: 100,
            duration: 30,
            geometry: { type: 'LineString', coordinates: [start, corner] },
            maneuver: { type: 'depart', location: start },
          },
          {
            name: 'Via sintética norte',
            distance: 100,
            duration: 30,
            geometry: { type: 'LineString', coordinates: [corner, end] },
            maneuver: { type: 'turn', modifier: 'left', location: corner },
          },
          {
            name: '',
            distance: 0,
            duration: 0,
            geometry: { type: 'LineString', coordinates: [end] },
            maneuver: { type: 'arrive', location: end },
          },
        ],
      };
    });
    const send = () =>
      res.end(
        JSON.stringify({
          code: 'Ok',
          routes: [
            {
              geometry: { type: 'LineString', coordinates: geometry },
              duration: 120,
              legs,
            },
          ],
        }),
      );
    if (delay) setTimeout(send, delay);
    else send();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
