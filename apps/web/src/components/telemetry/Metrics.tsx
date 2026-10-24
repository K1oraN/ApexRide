import type { ReactNode } from 'react';
import { Clock3, Gauge, Route, Signal } from 'lucide-react';
import { Progress } from '../ui';

export function MetricCard({
  icon,
  label,
  value,
  unit,
  progress,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  progress?: number | null;
  className?: string;
}) {
  return (
    <div className={`metric-card ${className}`}>
      <span className="metric-icon">{icon}</span>
      <div>
        <span className="metric-label">{label}</span>
        <strong>
          {value}
          {unit && <small> {unit}</small>}
        </strong>
        {progress === null && (
          <div className="metric-progress-unavailable" aria-hidden />
        )}
        {progress !== undefined && progress !== null && (
          <Progress value={progress} label={`${label} — valor ilustrativo`} />
        )}
      </div>
    </div>
  );
}

export function RideSummary({ difficulty }: { difficulty?: string }) {
  return (
    <div className="ride-summary">
      <div>
        <Route />
        <span>
          <strong>
            — <small>km</small>
          </strong>
          <small>Distância</small>
        </span>
      </div>
      <div>
        <Clock3 />
        <span>
          <strong>—</strong>
          <small>Tempo</small>
        </span>
      </div>
      <div>
        {difficulty ? <Signal /> : <Gauge />}
        <span>
          <strong>{difficulty ?? '— km/h'}</strong>
          <small>{difficulty ? 'Dificuldade' : 'Vel. média'}</small>
        </span>
      </div>
    </div>
  );
}
