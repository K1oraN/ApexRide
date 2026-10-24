import { Activity, Compass, Crosshair, LocateFixed } from 'lucide-react';
import { useRide } from './context';
import { useMotion } from './useMotion';

const labels = {
  'not-tested': 'Não testado',
  insufficient: 'Dados insuficientes',
  working: 'Funcionando',
  stale: 'Sem atualização',
};
export function SensorDiagnostics() {
  const { snapshot } = useRide();
  const motion = useMotion();
  const sensor = motion.sensor;
  const channel = (key: keyof typeof sensor.diagnostics, detected: boolean) =>
    sensor.status === 'denied' ||
    (key === 'orientation' && sensor.orientationPermission === 'denied')
      ? 'Permissão negada'
      : key === 'gyroscope' && sensor.policyWarning
        ? 'Bloqueado pela política'
        : sensor.status === 'requesting'
          ? 'Solicitando permissão'
          : sensor.status === 'unavailable' || !detected
            ? 'Indisponível'
            : sensor.active && sensor.diagnostics[key] === 'not-tested'
              ? 'Aguardando leituras'
              : labels[sensor.diagnostics[key]];
  return (
    <div
      className="ride-sensor-diagnostics"
      aria-label="Diagnóstico dos sensores"
    >
      <div>
        <LocateFixed aria-hidden />
        <strong>GPS</strong>
        <span>
          {snapshot.gps.status === 'available'
            ? 'Posição recente'
            : snapshot.gps.status === 'idle'
              ? 'Não testado'
              : snapshot.gps.message}
        </span>
      </div>
      <div>
        <Activity aria-hidden />
        <strong>Acelerômetro</strong>
        <span>{channel('accelerometer', sensor.capabilities.motion)}</span>
      </div>
      <div>
        <Crosshair aria-hidden />
        <strong>Giroscópio</strong>
        <span>{channel('gyroscope', sensor.capabilities.motion)}</span>
      </div>
      <div>
        <Compass aria-hidden />
        <strong>Orientação</strong>
        <span>{channel('orientation', sensor.capabilities.orientation)}</span>
      </div>
      <div>
        <Crosshair aria-hidden />
        <strong>Calibração</strong>
        <span>
          {motion.calibrating
            ? 'Avaliando estabilidade'
            : motion.calibration?.valid
              ? 'Referência válida'
              : 'Sem referência válida'}
        </span>
      </div>
    </div>
  );
}
