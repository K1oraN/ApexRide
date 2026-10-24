import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normalizePosition } from '../../services/gps/readings';
import { testPosition } from '../../services/gps/testFixtures';
import type { GpsSnapshot } from '../../services/gps/preview';

const mock = vi.hoisted(() => ({
  events: new Map<string, (...args: unknown[]) => void>(),
  setData: vi.fn().mockResolvedValue(undefined),
  jumpTo: vi.fn(),
  remove: vi.fn(),
  markerRemove: vi.fn(),
  setLngLat: vi.fn(),
  setRotation: vi.fn(),
  zoomTo: vi.fn(),
  onState: vi.fn(),
  onFollowing: vi.fn(),
  constructions: vi.fn(),
  setFeatureState: vi.fn(),
  fitBounds: vi.fn(),
}));
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  AttributionControl: class {},
  Map: class {
    constructor() {
      mock.constructions();
    }
    on(type: string, callback: (...args: unknown[]) => void) {
      mock.events.set(type, callback);
    }
    off(type: string) {
      mock.events.delete(type);
    }
    addControl() {}
    addSource() {}
    addLayer() {}
    setPaintProperty() {}
    setFeatureState = mock.setFeatureState;
    fitBounds = mock.fitBounds;
    getSource() {
      return { setData: mock.setData };
    }
    jumpTo = mock.jumpTo;
    remove = mock.remove;
    zoomTo = mock.zoomTo;
    getZoom() {
      return 12;
    }
    areTilesLoaded() {
      return true;
    }
  },
  Marker: class {
    element: HTMLElement;
    constructor({ element }: { element: HTMLElement }) {
      this.element = element;
    }
    setLngLat(p: unknown) {
      mock.setLngLat(p);
      return this;
    }
    setRotation(angle: number) {
      mock.setRotation(angle);
      return this;
    }
    addTo() {
      return this;
    }
    getElement() {
      return this.element;
    }
    remove = mock.markerRemove;
  },
}));
import { RideMapController } from './rideMapController';
import { routeGeometry, accuracyGeometry } from './previewGeometry';
import { prepareReplay } from '../../replay/timeline';
import { fixture } from '../../replay/fixtures';

let controller: RideMapController;
const reading = normalizePosition(testPosition());
const data: GpsSnapshot = {
  status: 'available',
  active: true,
  reading,
  speedKmh: 36,
  segments: [[reading]],
  message: '',
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.events.clear();
  controller = new RideMapController(
    document.createElement('div'),
    mock.onState,
    mock.onFollowing,
  );
});
afterEach(() => {
  controller.destroy();
  vi.useRealTimers();
});

it('13C replay keeps one map and static path while moving the visual marker', () => {
  controller.configureReplay(prepareReplay({ payload: fixture(), laps: [] }));
  mock.events.get('load')!();
  const calls = mock.setData.mock.calls.filter(
    ([data]) => data.features?.[0]?.geometry?.type === 'MultiLineString',
  ).length;
  controller.updateReplay(1500, true);
  controller.updateReplay(2500, true);
  expect(mock.setLngLat.mock.calls.at(-1)![0][0]).toBeCloseTo(-35.72975, 6);
  expect(
    mock.setData.mock.calls.filter(
      ([data]) => data.features?.[0]?.geometry?.type === 'MultiLineString',
    ),
  ).toHaveLength(calls);
  expect(mock.constructions).toHaveBeenCalledTimes(1);
  expect(mock.setFeatureState).toHaveBeenCalledWith(
    { source: 'replay-edges', id: 0 },
    { passed: true },
  );
});
it('13C replay hides marker in gaps and recovers at recorded points', () => {
  controller.configureReplay(prepareReplay({ payload: fixture(), laps: [] }));
  mock.events.get('load')!();
  controller.updateReplay(9500);
  expect(mock.markerRemove).toHaveBeenCalled();
  controller.updateReplay(10000);
  expect(mock.setLngLat.mock.calls.at(-1)![0][0]).toBeCloseTo(-35.728, 6);
});
it('13C replay preserves free exploration, resumes following and fits the full path', () => {
  controller.configureReplay(prepareReplay({ payload: fixture(), laps: [] }));
  mock.events.get('load')!();
  controller.updateReplay(1000, true);
  mock.jumpTo.mockClear();
  mock.events.get('movestart')!({ originalEvent: new Event('touchstart') });
  controller.updateReplay(2500, true);
  expect(mock.jumpTo).not.toHaveBeenCalled();
  controller.replayFollow();
  expect(mock.onFollowing).toHaveBeenLastCalledWith(true);
  controller.replayOverview();
  expect(mock.fitBounds).toHaveBeenCalled();
});

it('inicializa e usa a leitura mais recente mesmo quando ela chega antes do mapa', () => {
  controller.update(data);
  expect(mock.setLngLat).not.toHaveBeenCalled();
  mock.events.get('load')!();
  expect(mock.setLngLat).toHaveBeenCalledWith([
    reading.longitude,
    reading.latitude,
  ]);
  expect(mock.jumpTo).toHaveBeenCalledWith({
    center: [reading.longitude, reading.latitude],
    zoom: 16,
  });
  expect(mock.constructions).toHaveBeenCalledTimes(1);
});
it('atualiza marcador e fontes sem recriar o mapa', () => {
  mock.events.get('load')!();
  controller.update(data);
  const next = {
    ...reading,
    longitude: -35.7349,
    timestamp: reading.timestamp + 1_000,
  };
  controller.update({ ...data, reading: next, segments: [[reading, next]] });
  expect(mock.setLngLat).toHaveBeenLastCalledWith([
    next.longitude,
    next.latitude,
  ]);
  expect(mock.setData).toHaveBeenCalledWith(routeGeometry([[reading, next]]));
  expect(mock.constructions).toHaveBeenCalledTimes(1);
});
it('movimento manual suspende acompanhamento e centralizar o restaura', () => {
  mock.events.get('load')!();
  controller.update(data);
  mock.jumpTo.mockClear();
  mock.events.get('movestart')!({ originalEvent: new Event('mousedown') });
  controller.update({
    ...data,
    reading: { ...reading, timestamp: reading.timestamp + 1_000 },
  });
  expect(mock.jumpTo).not.toHaveBeenCalled();
  expect(mock.onFollowing).toHaveBeenLastCalledWith(false);
  controller.recenter();
  expect(mock.jumpTo).toHaveBeenCalled();
  expect(mock.onFollowing).toHaveBeenLastCalledWith(true);
});
it('eventos programáticos de câmera não suspendem acompanhamento', () => {
  mock.events.get('movestart')!({});
  expect(mock.onFollowing).not.toHaveBeenCalled();
});
it('orienta por heading apenas quando há velocidade e qualidade suficientes', () => {
  mock.events.get('load')!();
  controller.update(data);
  expect(mock.setRotation).toHaveBeenLastCalledWith(90);
  controller.update({
    ...data,
    reading: { ...reading, heading: null, speed: null },
  });
  expect(mock.setRotation).toHaveBeenLastCalledWith(0);
});
it('erro de tiles é tratado e o marcador continua atualizando', () => {
  mock.events.get('load')!();
  mock.events.get('error')!();
  expect(mock.onState).toHaveBeenLastCalledWith('error');
  controller.update(data);
  expect(mock.setLngLat).toHaveBeenCalled();
  mock.events.get('idle')!();
  expect(mock.onState).toHaveBeenLastCalledWith('ready');
});
it('detecta demora no carregamento e remove listeners, marcador e timer', () => {
  vi.advanceTimersByTime(20_000);
  expect(mock.onState).toHaveBeenLastCalledWith('error');
  mock.events.get('load')!();
  controller.update(data);
  controller.destroy();
  expect(mock.events.size).toBe(0);
  expect(mock.markerRemove).toHaveBeenCalledTimes(1);
  expect(mock.remove).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('traçado usa longitude/latitude, separa lacunas e não desenha pontos isolados', () => {
  const second = { ...reading, longitude: -35.7349 };
  const geo = routeGeometry([[reading, second], [second]]);
  expect(geo.features[0]!.geometry.coordinates).toEqual([
    [
      [reading.longitude, reading.latitude],
      [second.longitude, second.latitude],
    ],
  ]);
  expect(
    accuracyGeometry(reading).features[0]!.geometry.coordinates[0],
  ).toHaveLength(49);
});
