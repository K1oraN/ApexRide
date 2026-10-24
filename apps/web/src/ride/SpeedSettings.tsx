import type { SpeedMode } from '@apex-ride/ride-core/speed';
import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Radio } from '../components/design-system';
import { Compass, LocateFixed } from 'lucide-react';
import { authRequest } from '../services/auth';
import { useRide } from './context';

export function SpeedSettings() {
  const { user, updateUser } = useAuth();
  const { controller, snapshot } = useRide();
  const locked =
    snapshot.state === 'running' || snapshot.state === 'waiting-gps';
  const [guestMode, setGuestMode] = useState<SpeedMode>(
    () => controller.speed.getSnapshot().preference,
  );
  const [busy, setBusy] = useState(false);
  const [pendingMode, setPendingMode] = useState<SpeedMode | null>(null);
  const [error, setError] = useState('');
  const mode = pendingMode ?? user?.telemetry?.speedMode ?? guestMode;
  async function change(speedMode: SpeedMode) {
    if (locked) return;
    setBusy(true);
    setPendingMode(speedMode);
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
      setPendingMode(null);
    }
  }
  return (
    <div className="speed-settings-panel">
      <fieldset className="speed-source-choices" disabled={busy || locked}>
        <legend>Velocidade da telemetria</legend>
        <label className={mode === 'assisted' ? 'selected' : ''}>
          <Radio
            name="speed-source"
            aria-label="GPS Assistido Automático"
            checked={mode === 'assisted'}
            onChange={() => void change('assisted')}
          />
          <Compass aria-hidden />
          <span>
            <strong>Assistido automático</strong>
            <small>GPS + sensores, quando válidos</small>
          </span>
        </label>
        <label className={mode === 'pure' ? 'selected' : ''}>
          <Radio
            name="speed-source"
            aria-label="GPS Puro"
            checked={mode === 'pure'}
            onChange={() => void change('pure')}
          />
          <LocateFixed aria-hidden />
          <span>
            <strong>GPS Puro</strong>
            <small>Leitura direta do dispositivo</small>
          </span>
        </label>
      </fieldset>
      <div className="settings-caption">
        {busy ? (
          <span role="status">Salvando preferência…</span>
        ) : locked ? (
          <span>Disponível durante pausa</span>
        ) : (
          <span>Preferência {user ? 'da sua conta' : 'deste aparelho'}</span>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
