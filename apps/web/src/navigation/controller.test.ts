import { beforeEach, expect, it, vi } from 'vitest';
import { lineLength, type Coordinate } from '@apex-ride/ride-core/routes';
import { NavigationController } from './controller';
import { GpsPreview } from '../services/gps/preview';
import type { Directions } from './types';
let now: number,
  online: boolean,
  shared: boolean,
  controller: NavigationController,
  gps: GpsPreview;
const coordinates: Coordinate[] = [
  [-35.73, -9.66],
  [-35.725, -9.66],
  [-35.72, -9.66],
];
const geometry = { type: 'LineString' as const, coordinates };
const total = lineLength(geometry);
const plan: Directions = {
  geometry,
  source: 'osrm',
  distanceMeters: total,
  durationSeconds: 100,
  waypoints: coordinates,
  maneuvers: coordinates.map((location, index) => ({
    type: index === 0 ? 'depart' : index === 2 ? 'arrive' : 'turn',
    modifier: index === 1 ? 'right' : null,
    location,
    roadName: '',
    instruction: index === 1 ? 'Vire à direita' : 'Continue',
    geometry: [location],
    distanceMeters: 0,
    durationSeconds: 0,
    legIndex: index === 2 ? 1 : 0,
    along: (index * total) / 2,
  })),
};
let calculate: ReturnType<
  typeof vi.fn<(points: Coordinate[]) => Promise<Directions>>
>;
const reading = (longitude: number, patch = {}) => ({
  longitude,
  latitude: -9.66,
  accuracy: 5,
  timestamp: now,
  speed: 10,
  heading: 90,
  altitude: null,
  altitudeAccuracy: null,
  ...patch,
});
function emit(longitude: number, seconds = 2, patch = {}) {
  now += seconds * 1000;
  controller.update(reading(longitude, patch));
}
async function begin() {
  await controller.plan(coordinates, 'Rota sintética');
  controller.start();
}
beforeEach(() => {
  now = 100000;
  online = true;
  shared = false;
  gps = new GpsPreview();
  vi.spyOn(gps, 'start').mockImplementation(() => {});
  vi.spyOn(gps, 'stop').mockImplementation(() => {});
  calculate = vi.fn(async () => structuredClone(plan));
  controller = new NavigationController(
    gps,
    calculate,
    () => shared,
    () => now,
    () => online,
  );
  controller.owner('owner');
});
it('planeja sem coletar GPS e só inicia por ação explícita', async () => {
  await controller.plan(coordinates, 'Plano');
  expect(gps.start).not.toHaveBeenCalled();
  expect(controller.getSnapshot().state).toBe('ready');
  controller.start();
  controller.start();
  expect(gps.start).toHaveBeenCalledTimes(1);
});
it('exige duas leituras confiáveis e calcula distâncias e tempo restante', async () => {
  await begin();
  emit(-35.73);
  expect(controller.getSnapshot().state).toBe('inaccurate');
  emit(-35.7299);
  expect(controller.getSnapshot()).toMatchObject({
    state: 'navigating',
    nextIndex: 1,
  });
  expect(controller.getSnapshot().remaining).toBeLessThan(total);
  expect(controller.getSnapshot().remainingSeconds).toBeLessThan(100);
});
it.each([
  { accuracy: 80 },
  { accuracy: -1 },
  { timestamp: 0 },
  { timestamp: 99999999 },
  { longitude: NaN },
])('suspende orientações com GPS inválido %j', async (patch) => {
  await begin();
  emit(-35.73);
  emit(-35.7299);
  emit(-35.7298, 2, patch);
  expect(controller.getSnapshot().nextDistance).toBeNull();
  expect(controller.getSnapshot().state).toBe('inaccurate');
  expect(calculate).toHaveBeenCalledTimes(1);
});
it('descarta salto e não pula manobras', async () => {
  await begin();
  emit(-35.73);
  emit(-35.7299);
  emit(-35.72, 1);
  expect(controller.getSnapshot()).toMatchObject({
    state: 'inaccurate',
    nextIndex: 1,
    active: true,
  });
});
it('avança uma manobra após cruzamento contínuo confirmado', async () => {
  await begin();
  for (let i = 0; i <= 55; i++) emit(-35.73 + i * 0.0001, 2);
  expect(controller.getSnapshot().nextIndex).toBe(2);
  expect(controller.getSnapshot().active).toBe(true);
});
it('não confirma chegada com uma leitura isolada', async () => {
  await begin();
  emit(-35.72);
  expect(controller.getSnapshot().state).not.toBe('arrived');
  emit(-35.72);
  expect(controller.getSnapshot().state).not.toBe('arrived');
  emit(-35.72);
  emit(-35.72);
  expect(controller.getSnapshot().state).toBe('arrived');
  expect(gps.stop).toHaveBeenCalledTimes(1);
});
it('ruído isolado fora da rota não recalcula', async () => {
  await begin();
  emit(-35.73);
  emit(-35.7299);
  emit(-35.7298, 2, { latitude: -9.67 });
  emit(-35.7297);
  expect(calculate).toHaveBeenCalledTimes(1);
});
it('desvio persistente recalcula com paradas pendentes e cooldown', async () => {
  await begin();
  emit(-35.7298, 2, { latitude: -9.67 });
  emit(-35.7297, 3, { latitude: -9.67 });
  emit(-35.7296, 3, { latitude: -9.67 });
  await Promise.resolve();
  expect(calculate).toHaveBeenCalledTimes(2);
  expect(calculate.mock.calls[1]![0].slice(1)).toEqual(coordinates.slice(1));
  await controller.recalculate();
  expect(calculate).toHaveBeenCalledTimes(2);
});
it('falha de recálculo mantém rota e suspende instrução antiga', async () => {
  await begin();
  emit(-35.73);
  emit(-35.7299);
  calculate.mockRejectedValueOnce(new Error('Indisponível'));
  await controller.recalculate();
  expect(controller.getSnapshot()).toMatchObject({
    state: 'off-route',
    nextDistance: null,
    plan,
  });
});
it('não recalcula de posição antiga', async () => {
  await begin();
  emit(-35.73);
  emit(-35.7299);
  now += 15000;
  await controller.recalculate();
  expect(calculate).toHaveBeenCalledTimes(1);
});
it('sem rede preserva geometria e não solicita recálculo; recuperação confirma GPS', async () => {
  await begin();
  online = false;
  controller.connectivity();
  expect(controller.getSnapshot()).toMatchObject({
    state: 'offline',
    plan,
    nextDistance: null,
  });
  await controller.recalculate();
  expect(calculate).toHaveBeenCalledTimes(1);
  online = true;
  controller.connectivity();
  emit(-35.73);
  emit(-35.7299);
  expect(controller.getSnapshot().state).toBe('navigating');
});
it('pausa/encerra sem interromper GPS compartilhado com Ride ou Live', async () => {
  shared = true;
  await begin();
  controller.pause();
  expect(gps.stop).not.toHaveBeenCalled();
  controller.start();
  controller.end();
  expect(gps.stop).not.toHaveBeenCalled();
  expect(controller.getSnapshot().active).toBe(false);
});
it('troca de conta limpa planejamento e invalida resposta tardia', async () => {
  let resolve!: (p: Directions) => void;
  calculate.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = controller.plan(coordinates, 'privado');
  controller.owner('other');
  resolve(plan);
  await pending;
  expect(controller.getSnapshot().plan).toBeNull();
});
it('falha de cálculo não apaga planejamento anterior e não inicia resultado antigo', async () => {
  await controller.plan(coordinates, 'Plano');
  calculate.mockRejectedValueOnce(new Error('NoRoute'));
  await controller.plan(coordinates, 'Outro');
  expect(controller.getSnapshot().plan).toEqual(plan);
  controller.start();
  expect(controller.getSnapshot().active).toBe(false);
});
