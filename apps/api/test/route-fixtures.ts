import type { RouteData } from '@apex-ride/ride-core/routes';
export const routeFixture = (): RouteData => ({
  name: 'Passeio controlado',
  description: '',
  city: 'Maceió',
  state: 'AL',
  category: 'Turismo',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-35.73, -9.66],
      [-35.72, -9.66],
    ],
  },
  waypoints: [
    [-35.73, -9.66],
    [-35.72, -9.66],
  ],
  source: 'manual',
  durationSeconds: null,
  startLine: null,
  direction: null,
});

export function circuitFixture() {
  const geometry = {
    type: 'LineString' as const,
    coordinates: [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ] as [number, number][],
  };
  return {
    ...routeFixture(),
    geometry,
    waypoints: [
      [0, 0],
      [0, 0],
    ] as [number, number][],
    startLine: {
      type: 'LineString' as const,
      coordinates: [
        [0.0005, 0.0001],
        [0.0005, -0.0001],
      ] as [number, number][],
    },
    direction: 1 as const,
  };
}
export function lapPoints(start: number) {
  const ps: [number, number][] = [];
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 0; i < 10; i++) ps.push([i * 0.0001, 0]);
    for (let i = 0; i < 10; i++) ps.push([0.001, i * 0.0001]);
    for (let i = 0; i < 10; i++) ps.push([0.001 - i * 0.0001, 0.001]);
    for (let i = 0; i < 10; i++) ps.push([0, 0.001 - i * 0.0001]);
  }
  return ps.map(([longitude, latitude], i) => ({
    longitude,
    latitude,
    timestamp: start + i * 1000,
    accuracy: 5,
    speed: 11,
    heading: null,
    altitude: null,
    segment: 0,
  }));
}
