import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReplayEngine } from '../replay/engine';
type ReplayChart = { engine: ReplayEngine; duration: number };
function ReplayCursor({ replay }: { replay: ReplayChart }) {
  const { time } = useSyncExternalStore(
    replay.engine.subscribe,
    replay.engine.getSnapshot,
  );
  const x = 48 + (time / replay.duration) * 530;
  return (
    <line
      x1={x}
      x2={x}
      y1="20"
      y2="148"
      stroke="#fff"
      strokeWidth="2"
      aria-label="Instante atual do replay"
    />
  );
}
import type { RidePoint } from '@apex-ride/ride-core';
import type { MotionSample } from '@apex-ride/ride-core/motion';
import type { SpeedSample } from '@apex-ride/ride-core/speed';
import type { PerformanceEvent } from '@apex-ride/ride-core/telemetry';
import type { ChartData } from '@apex-ride/ride-core/charts';
import {
  assistedChart,
  gpsChart,
  motionChart,
  type ChartPoint,
} from '../services/telemetry/charts';

function Plot({
  label,
  unit,
  points,
  start,
  events,
  interactive = false,
  replay,
}: {
  label: string;
  unit: string;
  points: ChartPoint[];
  start: number;
  events: PerformanceEvent[];
  interactive?: boolean;
  replay?: ReplayChart | undefined;
}) {
  const [sample, setSample] = useState(0);
  if (!points.length)
    return (
      <div className="telemetry-plot">
        <h3>{label}</h3>
        <p>Medição indisponível: dados insuficientes.</p>
      </div>
    );
  const first = replay ? 0 : points[0]!.timestamp,
    last = replay ? replay.duration : points.at(-1)!.timestamp;
  const low = Math.min(0, ...points.map((p) => p.value));
  const high = Math.max(1, ...points.map((p) => p.value));
  const x = (t: number) => 48 + ((t - first) / Math.max(1, last - first)) * 530;
  const y = (v: number) => 148 - ((v - low) / (high - low)) * 124;
  const path = points
    .map((p, i) => {
      const command = points[i - 1]?.segment === p.segment ? 'L' : 'M';
      return `${command}${x(p.timestamp).toFixed(1)},${y(p.value).toFixed(1)}`;
    })
    .join(' ');
  const selected = points[Math.min(sample, points.length - 1)]!;
  return (
    <figure className="telemetry-plot">
      <figcaption>
        {label} · {unit}
      </figcaption>
      <svg
        viewBox="0 0 600 182"
        role="img"
        aria-label={`${label} por tempo da atividade`}
        onPointerDown={
          replay
            ? (e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const t =
                  ((((e.clientX - box.left) / box.width) * 600 - 48) / 530) *
                  replay.duration;
                replay.engine.seek(t);
              }
            : undefined
        }
      >
        <title>{label}. Lacunas interrompem a linha. Valores estimados.</title>
        <path d="M48 20V148H578" className="telemetry-axis" />
        <text x="4" y="28">
          {high.toFixed(unit === 'G' ? 1 : 0)}
        </text>
        <text x="4" y="148">
          {low.toFixed(unit === 'G' ? 1 : 0)}
        </text>
        <text x="48" y="174">
          {Math.round((first - start) / 1000)} s
        </text>
        <text x="520" y="174">
          {Math.round((last - start) / 1000)} s
        </text>
        {events
          .filter((e) => e.startMs >= first && e.startMs <= last)
          .map((e) => (
            <line
              key={e.id}
              x1={x(e.startMs)}
              x2={x(e.startMs)}
              y1="20"
              y2="148"
              className="telemetry-event"
            >
              <title>
                {e.type === 'acceleration' ? '0–100' : '100–0'} · {e.status}
              </title>
            </line>
          ))}
        <path d={path} className="telemetry-line" />
        {replay && <ReplayCursor replay={replay} />}
        {points.length === 1 && (
          <circle
            cx={x(points[0]!.timestamp)}
            cy={y(points[0]!.value)}
            r="3"
            className="telemetry-dot"
          />
        )}
      </svg>
      {interactive && !replay && (
        <label className="account-field">
          Consultar amostra · {label}
          <input
            aria-label={`Consultar amostra de ${label}`}
            type="range"
            min="0"
            max={points.length - 1}
            value={Math.min(sample, points.length - 1)}
            onChange={(e) => setSample(Number(e.target.value))}
          />
          <span>
            {Math.round((selected.timestamp - start) / 1000)} s ·{' '}
            {selected.value.toFixed(unit === 'G' ? 2 : 1)} {unit}
          </span>
        </label>
      )}
      <p>
        {replay
          ? 'Tempo ativo (s), sem pausas; toque para buscar um instante.'
          : 'Tempo decorrido (s), incluindo pausas; lacunas sem conexão.'}{' '}
        {points.length} pontos de exibição.
      </p>
    </figure>
  );
}
export const TelemetryCharts = memo(function TelemetryCharts({
  points,
  motion,
  speed,
  start,
  events,
  prepared,
  replay,
}: {
  points: RidePoint[];
  motion: MotionSample[];
  speed: SpeedSample[];
  start: number;
  events: PerformanceEvent[];
  prepared?: ChartData;
  replay?: ReplayChart;
}) {
  const [source, setSource] = useState('gps');
  const series = useMemo(
    () =>
      prepared ?? {
        gps: gpsChart(points),
        assisted: assistedChart(speed, start, points),
        force: motionChart(motion, start, 'force'),
        lean: motionChart(motion, start, 'lean'),
      },
    [points, motion, speed, start, prepared],
  );
  return (
    <div className="telemetry-charts">
      <label className="account-field">
        Série de velocidade
        <select
          aria-label="Série de velocidade"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="gps">GPS original</option>
          <option value="assisted">GPS Assistido · estimativa</option>
        </select>
      </label>
      <Plot
        label={
          source === 'gps' ? 'Velocidade GPS' : 'Velocidade assistida estimada'
        }
        unit="km/h"
        points={source === 'gps' ? series.gps : series.assisted}
        start={start}
        events={events}
        interactive={Boolean(prepared)}
        replay={replay}
      />
      <Plot
        label="Força G longitudinal estimada (+ aceleração / − frenagem)"
        unit="G"
        points={series.force}
        start={start}
        events={events}
        interactive={Boolean(prepared)}
        replay={replay}
      />
      <Plot
        label="Inclinação estimada (− esquerda / + direita)"
        unit="°"
        points={series.lean}
        start={start}
        events={events}
        interactive={Boolean(prepared)}
        replay={replay}
      />
      <p>
        Inclinação dinâmica indisponível até homologação física. Linhas de
        eventos usam medições GPS independentes do velocímetro.
      </p>
    </div>
  );
});
