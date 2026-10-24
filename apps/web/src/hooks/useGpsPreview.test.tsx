import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useGpsPreview } from './useGpsPreview';

it('StrictMode não inicia GPS; desmontagem encerra watch e ignora callback atrasado', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('isSecureContext', true);
  const clearWatch = vi.fn();
  const watchPosition = vi.fn(() => 7);
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
  const container = document.createElement('div');
  const root = createRoot(container);
  function Harness() {
    const gps = useGpsPreview();
    return <button onClick={gps.start}>{gps.status}</button>;
  }
  try {
    await act(async () =>
      root.render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      ),
    );
    expect(watchPosition).not.toHaveBeenCalled();
    await act(async () => container.querySelector('button')!.click());
    expect(watchPosition).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(clearWatch).toHaveBeenCalledWith(7);
  } finally {
    vi.unstubAllGlobals();
  }
});
