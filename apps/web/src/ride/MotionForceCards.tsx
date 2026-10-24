import { ForceGIcon } from '../components/Brand';
import { MetricCard } from '../components/telemetry/Metrics';
import { useRide } from './context';
import { useMotion } from './useMotion';

// A inscrição de 5 Hz fica nos indicadores, sem renderizar mapa/velocímetro.
export function MotionForceCards() {
  const { snapshot } = useRide();
  const motion = useMotion();
  const current =
    snapshot.state === 'running' &&
    motion.calibration?.valid &&
    motion.current?.quality === 'limited'
      ? motion.current
      : null;
  return (
    <div className="ride-force-group">
      <div className="force-grid">
        <MetricCard
          icon={<ForceGIcon />}
          label="Força de aceleração"
          value={current?.accelerationG?.toFixed(2) ?? '—'}
          unit="G"
          progress={null}
        />
        <MetricCard
          icon={<ForceGIcon />}
          label="Força de frenagem"
          value={current?.brakingG?.toFixed(2) ?? '—'}
          unit="G"
          progress={null}
        />
      </div>
      <small>
        {current
          ? 'G longitudinal · estimativa limitada, referência calibrada'
          : motion.calibration?.valid
            ? 'G indisponível · sem leitura válida recente'
            : 'G indisponível · sem calibração válida'}
      </small>
    </div>
  );
}
