import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import { formatEventTime } from '@apex-ride/ride-core/telemetry';
import {
  Activity,
  Gauge,
  MapPin,
  Radio,
  Route,
  Timer,
  Video,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { LeanLeftIcon, LeanRightIcon } from '../components/Brand';
import { MetricCard } from '../components/telemetry/Metrics';
import { useRideVideo } from '../video/context';
import { videoLabels } from '../video/types';
import { useRide } from './context';
import { rideMetrics } from './controller';
import { formatDuration } from './format';
import { MotionForceCards } from './MotionForceCards';
import { SpeedDisplay } from './SpeedDisplay';
import { useMotion } from './useMotion';
import '../styles/apex-stage-05.css';

/**
 * Etapa 05: organiza as leituras já fornecidas pelos controladores reais.
 * Não simula velocidade, aceleração, inclinação, GPS nem gravação.
 */
export function RideDashboard({
  mode,
  controls,
}: {
  mode: 'passeio' | 'pista' | 'misto';
  controls?: ReactNode;
}) {
  const { controller, snapshot } = useRide();
  const { snapshot: video } = useRideVideo();
  const motion = useMotion();
  const metrics = rideMetrics(snapshot);
  const events = controller.telemetry.events;
  const acceleration = events
    .filter(
      (event) => event.type === 'acceleration' && event.status === 'estimated',
    )
    .at(-1);
  const braking = events
    .filter((event) => event.type === 'braking' && event.status === 'estimated')
    .at(-1);
  const recording = snapshot.state === 'running';
  const paused = snapshot.state === 'paused';
  const waiting = snapshot.state === 'waiting-gps';
  const gpsAvailable = snapshot.gps.status === 'available';
  const accuracy = snapshot.gps.reading?.accuracy;
  const goodAccuracy =
    gpsAvailable &&
    typeof accuracy === 'number' &&
    Number.isFinite(accuracy) &&
    accuracy >= 0;
  const videoRecording = video.state === 'recording';
  const advanced = RIDE_MODES[mode].advanced;

  return (
    <section
      className={`ride-instruments apex-ride-instruments${recording ? ' is-recording' : ''}${paused ? ' is-paused' : ''}`}
      aria-label="Painel de pilotagem e telemetria"
    >
      <div className="apex-ride-telemetry-header">
        <div className="apex-ride-telemetry-title">
          <span className="apex-ride-live-dot" aria-hidden="true" />
          <div>
            <span className="apex-ride-eyebrow">CENTRAL DE PILOTAGEM</span>
            <strong>
              {recording
                ? 'Ride em andamento'
                : paused
                  ? 'Ride pausado'
                  : waiting
                    ? 'Aguardando GPS'
                    : 'Instrumentos prontos'}
            </strong>
            <small>
              Telemetria real · valores conforme sensores disponíveis
            </small>
          </div>
        </div>
        <div className="apex-ride-telemetry-time">
          <Timer size={18} aria-hidden="true" />
          <span>
            {snapshot.activity ? formatDuration(metrics.activeMs) : '—'}
          </span>
          <small>tempo ativo</small>
        </div>
      </div>

      <div className="apex-ride-signal-strip" aria-label="Estados dos serviços">
        <div className={`apex-ride-signal${gpsAvailable ? ' is-ready' : ''}`}>
          <MapPin size={18} aria-hidden="true" />
          <span>
            <strong>GPS</strong>
            <small>
              {goodAccuracy
                ? `Precisão ±${Math.round(accuracy)} m`
                : gpsAvailable
                  ? 'Sinal disponível'
                  : 'Aguardando sinal'}
            </small>
          </span>
        </div>
        <div
          className={`apex-ride-signal${motion.calibration?.valid ? ' is-ready' : ''}`}
        >
          <Radio size={18} aria-hidden="true" />
          <span>
            <strong>Sensores</strong>
            <small>
              {motion.calibration?.valid ? 'Calibrados' : 'Não calibrados'}
            </small>
          </span>
        </div>
        <div
          className={`apex-ride-signal${videoRecording ? ' is-recording' : ''}`}
        >
          <Video size={18} aria-hidden="true" />
          <span>
            <strong>Vídeo</strong>
            <small>{videoLabels[video.state]}</small>
          </span>
        </div>
      </div>

      <div className="ride-dashboard apex-ride-speed-layout">
        <div className="dashboard-side apex-ride-speed-side">
          <MetricCard
            icon={<Gauge />}
            label="Velocidade média"
            value={metrics.averageKmh?.toFixed(1) ?? '—'}
            unit="km/h"
          />
          <MetricCard
            icon={<Activity />}
            label="Velocidade máxima"
            value={metrics.maximumKmh?.toFixed(1) ?? '—'}
            unit="km/h"
          />
        </div>
        <SpeedDisplay />
        <div className="dashboard-side ride-event-metrics apex-ride-speed-side">
          <MetricCard
            icon={<Timer />}
            label="0–100 km/h · estimado"
            value={
              advanced && acceleration ? formatEventTime(acceleration) : '—'
            }
          />
          <MetricCard
            icon={<Gauge />}
            label="100–0 km/h · estimado"
            value={advanced && braking ? formatEventTime(braking) : '—'}
          />
        </div>
      </div>

      <div className="ride-distance-time apex-ride-journey-stats">
        <MetricCard
          icon={<Route />}
          label="Distância percorrida"
          value={
            snapshot.activity ? (metrics.distanceMeters / 1000).toFixed(2) : '—'
          }
          unit="km"
        />
        <MetricCard
          icon={<Timer />}
          label="Tempo em movimento"
          value={snapshot.activity ? formatDuration(metrics.activeMs) : '—'}
        />
      </div>

      {advanced && (
        <div className="ride-secondary-instruments apex-ride-secondary-instruments">
          <MotionForceCards />
          <div className="lean-grid">
            <MetricCard
              icon={<LeanLeftIcon size={38} />}
              label="Inclinação esquerda"
              value="—"
              unit="°"
            />
            <MetricCard
              icon={<LeanRightIcon size={38} />}
              label="Inclinação direita"
              value="—"
              unit="°"
            />
          </div>
          <p className="apex-ride-measurement-note">
            Ângulos sem cálculo validado. Campos indisponíveis permanecem “—”,
            sem estimativas artificiais.
          </p>
        </div>
      )}

      {controls && (
        <div className="apex-ride-control-container">{controls}</div>
      )}
      {snapshot.activity && (
        <p className="ride-instrument-note">
          Tempo total {formatDuration(metrics.elapsedMs)} · pausas{' '}
          {formatDuration(metrics.pausedMs)}. GPS e sensores variam conforme
          dispositivo e condições de uso.
        </p>
      )}
    </section>
  );
}
