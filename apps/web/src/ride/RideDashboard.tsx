import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import { formatEventTime } from '@apex-ride/ride-core/telemetry';
import { Gauge, Route, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { LeanLeftIcon, LeanRightIcon } from '../components/Brand';
import { MetricCard } from '../components/telemetry/Metrics';
import { useRide } from './context';
import { rideMetrics } from './controller';
import { formatDuration } from './format';
import { MotionForceCards } from './MotionForceCards';
import { SpeedDisplay } from './SpeedDisplay';

export function RideDashboard({
  mode,
  controls,
}: {
  mode: 'passeio' | 'pista' | 'misto';
  controls?: ReactNode;
}) {
  const { controller, snapshot } = useRide();
  const metrics = rideMetrics(snapshot);
  const events = controller.telemetry.events;
  const acceleration = events
    .filter((e) => e.type === 'acceleration' && e.status === 'estimated')
    .at(-1);
  const braking = events
    .filter((e) => e.type === 'braking' && e.status === 'estimated')
    .at(-1);
  return (
    <section className="ride-instruments" aria-label="Painel de pilotagem">
      <div className="ride-dashboard">
        <div className="dashboard-side">
          <MetricCard
            icon={<Gauge />}
            label="Vel. média"
            value={metrics.averageKmh?.toFixed(1) ?? '—'}
            unit="km/h"
          />
          <MetricCard
            icon={<Gauge />}
            label="Vel. máxima"
            value={metrics.maximumKmh?.toFixed(1) ?? '—'}
            unit="km/h"
          />
        </div>
        <SpeedDisplay />
        <div className="dashboard-side ride-event-metrics">
          <MetricCard
            icon={<Timer />}
            label="0–100 km/h"
            value={
              RIDE_MODES[mode].advanced && acceleration
                ? formatEventTime(acceleration)
                : '—'
            }
          />
          <MetricCard
            icon={<Gauge />}
            label="100–0 km/h"
            value={
              RIDE_MODES[mode].advanced && braking
                ? formatEventTime(braking)
                : '—'
            }
          />
        </div>
      </div>
      <div className="ride-distance-time">
        <MetricCard
          icon={<Timer />}
          label="Tempo de ride"
          value={snapshot.activity ? formatDuration(metrics.activeMs) : '—'}
        />
        <MetricCard
          icon={<Route />}
          label="Distância"
          value={
            snapshot.activity ? (metrics.distanceMeters / 1000).toFixed(2) : '—'
          }
          unit="km"
        />
      </div>
      {controls}
      {RIDE_MODES[mode].advanced && (
        <>
          <div className="ride-secondary-instruments">
            <MotionForceCards />
            <div className="lean-grid">
              <MetricCard
                icon={<LeanLeftIcon size={38} />}
                label="Ângulo esquerdo"
                value="—"
                unit="°"
              />
              <MetricCard
                icon={<LeanRightIcon size={38} />}
                label="Ângulo direito"
                value="—"
                unit="°"
              />
            </div>
          </div>
        </>
      )}
      {snapshot.activity && (
        <p className="ride-instrument-note">
          Total {formatDuration(metrics.elapsedMs)} · pausado{' '}
          {formatDuration(metrics.pausedMs)}
        </p>
      )}
    </section>
  );
}
