import { parseGpx } from './gpx';
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ result: parseGpx(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Arquivo GPX inválido.',
    });
  }
};
