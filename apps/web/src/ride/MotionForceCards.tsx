import { ArrowUpRight, CircleGauge } from 'lucide-react';
import { MetricCard } from '../components/telemetry/Metrics';
import { useRide } from './context';
import { useMotion } from './useMotion';

// A inscrição de 5 Hz fica nos indicadores, sem renderizar mapa/velocímetro.
export function MotionForceCards() {
  const { snapshot } = useRide();
  const motion = useMotion();
  const current = snapshot.state === 'running' ? motion.current : null;
  return (
    <div className="force-grid">
      <MetricCard
        icon={<ArrowUpRight />}
        label="Força de aceleração"
        value={current?.accelerationG?.toFixed(2) ?? '—'}
        unit="G"
        progress={null}
      />
      <MetricCard
        icon={<CircleGauge />}
        label="Força de frenagem"
        value={current?.brakingG?.toFixed(2) ?? '—'}
        unit="G"
        progress={null}
      />
    </div>
  );
}
