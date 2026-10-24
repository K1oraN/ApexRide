import type { Page } from '@playwright/test';
declare global {
  interface Window {
    __motionTest: {
      requests: string[];
      streaming(): boolean;
      start(): void;
      stop(): void;
      acceleration(value: number): void;
    };
  }
}
export async function mockMotion(page: Page, denied = false) {
  await page.addInitScript((denied) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let acceleration = 0;
    const requests: string[] = [];
    Object.defineProperty(window, 'DeviceMotionEvent', {
      configurable: true,
      value: {
        requestPermission: () => {
          requests.push('motion');
          return Promise.resolve(denied ? 'denied' : 'granted');
        },
      },
    });
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: {
        requestPermission: () => {
          requests.push('orientation');
          return Promise.resolve(denied ? 'denied' : 'granted');
        },
      },
    });
    const emit = () => {
      window.dispatchEvent(
        Object.assign(new Event('deviceorientation'), {
          alpha: 0,
          beta: 0,
          gamma: 0,
          absolute: false,
        }),
      );
      window.dispatchEvent(
        Object.assign(new Event('devicemotion'), {
          acceleration: { x: 0, y: acceleration, z: 0 },
          accelerationIncludingGravity: { x: 0, y: acceleration, z: 9.80665 },
          rotationRate: { alpha: 0, beta: 0, gamma: 0 },
          interval: 50,
        }),
      );
    };
    window.__motionTest = {
      requests,
      streaming: () => timer !== null,
      start() {
        if (!timer) timer = setInterval(emit, 50);
      },
      stop() {
        if (timer) clearInterval(timer);
        timer = null;
      },
      acceleration(value) {
        acceleration = value;
      },
    };
  }, denied);
}
