import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PageErrorBoundary } from './PageErrorBoundary';

it('a page failure leaves its parent mounted and a new page can render', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const unmount = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  function Broken(): never {
    throw new Error('Module failed');
  }
  function Provider({ broken }: { broken: boolean }) {
    useEffect(() => unmount, []);
    return (
      <PageErrorBoundary key={String(broken)}>
        {broken ? <Broken /> : <h1>Garagem</h1>}
      </PageErrorBoundary>
    );
  }
  try {
    await act(async () => root.render(<Provider broken />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível abrir',
    );
    expect(unmount).not.toHaveBeenCalled();
    await act(async () => root.render(<Provider broken={false} />));
    expect(container.textContent).toBe('Garagem');
    expect(unmount).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  }
});
