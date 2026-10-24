import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useRide } from './context';
import { authRequest } from '../services/auth';
import type { SpeedMode } from '@apex-ride/ride-core/speed';

export function SpeedSettings() {
  const { user, updateUser } = useAuth();
  const { controller } = useRide();
  const [guestMode, setGuestMode] = useState<SpeedMode>(
    () => controller.speed.getSnapshot().preference,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mode = user?.telemetry?.speedMode ?? guestMode;
  async function change(speedMode: SpeedMode) {
    setBusy(true);
    setError('');
    try {
      if (user) {
        const data = await authRequest<{ telemetry: { speedMode: SpeedMode } }>(
          '/users/me/telemetry',
          'PATCH',
          { speedMode },
        );
        updateUser({ ...user, telemetry: data.telemetry });
      } else setGuestMode(speedMode);
      controller.speed.setMode(speedMode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-section">
      <label className="account-field">
        <span>Velocidade da telemetria</span>
        <select
          aria-label="Velocidade da telemetria"
          value={mode}
          disabled={busy}
          onChange={(e) => void change(e.target.value as SpeedMode)}
        >
          <option value="assisted">GPS Assistido Automático</option>
          <option value="pure">GPS Puro</option>
        </select>
      </label>
      <small>
        Assistência estimada quando GPS, sensores e calibração forem
        suficientes. Configure antes de pilotar.
        {!user && ' Entre na conta para preservar a preferência.'}
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
