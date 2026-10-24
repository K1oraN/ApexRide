import type { Page } from '@playwright/test';

// Base mínima EXCLUSIVA DE TESTE. WebGL/MapLibre reais, sem rede externa.
// A carga real do OpenFreeMap é verificada separadamente, sem confundir com GPS físico.
export async function mockMapProvider(page: Page) {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          test: {
            type: 'geojson',
            attribution: 'Mapa de teste automatizado',
            data: { type: 'FeatureCollection', features: [] },
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#111923' },
          },
        ],
      },
    }),
  );
}

export async function mockGps(page: Page) {
  await page.addInitScript(() => {
    let nextId = 0;
    const watches = new Map<
      number,
      { ok: PositionCallback; error: PositionErrorCallback }
    >();
    const state = {
      starts: 0,
      stops: 0,
      emit(
        coords: Partial<GeolocationCoordinates> = {},
        timestamp = Date.now(),
      ) {
        for (const { ok } of watches.values())
          ok({
            timestamp,
            coords: {
              latitude: -9.665,
              longitude: -35.735,
              accuracy: 8,
              speed: 10,
              heading: 90,
              altitude: null,
              altitudeAccuracy: null,
              ...coords,
            },
          } as GeolocationPosition);
      },
      fail(code: number) {
        for (const { error } of watches.values())
          error({ code } as GeolocationPositionError);
      },
      active() {
        return watches.size;
      },
    };
    Object.defineProperty(window, '__gpsTest', { value: state });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition(ok: PositionCallback, error: PositionErrorCallback) {
          state.starts++;
          watches.set(++nextId, { ok, error });
          return nextId;
        },
        clearWatch(id: number) {
          state.stops++;
          watches.delete(id);
        },
        getCurrentPosition() {
          throw new Error('Usar somente watchPosition');
        },
      },
    });
    // O mock controla a negação no callback; evita depender de configuração do Chrome.
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: undefined,
    });
  });
}

declare global {
  interface Window {
    __gpsTest: {
      starts: number;
      stops: number;
      active(): number;
      emit(coords?: Partial<GeolocationCoordinates>, timestamp?: number): void;
      fail(code: number): void;
    };
  }
}
