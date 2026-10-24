import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthPage } from './HealthPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe('página técnica', () => {
  it('mostra nome e estado enquanto aguarda a API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    await act(async () => {
      root.render(<HealthPage />);
    });
    expect(container.querySelector('h1')?.textContent).toBe('Apex Ride');
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Verificando',
    );
  });

  it('mostra API conectada após resposta válida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', service: 'apex-ride-api' }),
      }),
    );
    await act(async () => {
      root.render(<HealthPage />);
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'API conectada.',
    );
  });

  it('mostra indisponibilidade quando a comunicação falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await act(async () => {
      root.render(<HealthPage />);
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'API indisponível',
    );
  });
});
