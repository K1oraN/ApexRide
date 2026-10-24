import { useMemo, useState } from 'react';
import { Select } from '../components/design-system';
import { ACTIVITY_COLORS } from './colors';
import type { ComparisonActivity, ComparisonResult } from './types';
const metrics = {
  gps: ['Velocidade GPS validada', 'km/h'],
  assisted: ['GPS Assistido estimado', 'km/h'],
  elapsedMs: ['Tempo decorrido na posição', 's'],
  segmentMs: ['Tempo no segmento contínuo', 's'],
  force: ['Força G estimada (+ aceleração / − frenagem)', 'G'],
  lean: ['Inclinação estimada', '°'],
  coverage: ['Cobertura observada', '%'],
} as const;
type Metric = keyof typeof metrics;
const value = (s: ComparisonActivity['samples'][number], metric: Metric) =>
  metric === 'coverage'
    ? 100
    : metric === 'elapsedMs' || metric === 'segmentMs'
      ? s[metric] / 1000
      : s[metric];
export function ComparisonCharts({ result }: { result: ComparisonResult }) {
  const [metric, setMetric] = useState<Metric>('gps');
  const series = useMemo(
    () =>
      result.activities.map((a) => {
        let segment = 0,
          previous: ComparisonActivity['samples'][number] | null = null;
        return a.samples.map((s) => {
          const v = value(s, metric);
          if (
            v === null ||
            !previous ||
            s.chain !== previous.chain ||
            s.lap !== previous.lap ||
            s.meters - previous.meters >
              Math.max(30, result.route.plan.distanceMeters / 800) * 1.5
          )
            segment++;
          previous = v === null ? null : s;
          return { meters: s.meters, value: v, segment };
        });
      }),
    [result, metric],
  );
  const numbers = series
      .flat()
      .flatMap((p) => (p.value === null ? [] : [p.value])),
    low = Math.min(0, ...numbers),
    high = Math.max(1, ...numbers),
    distance = result.activities[0]?.summary.routeMeters ?? 1;
  const x = (v: number) => 48 + (v / distance) * 530,
    y = (v: number) => 148 - ((v - low) / (high - low)) * 124;
  return (
    <section className="panel history-panel">
      <h2>Gráficos por posição na rota</h2>
      <label className="account-field">
        Métrica
        <Select
          aria-label="Métrica comparativa"
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
        >
          {Object.entries(metrics).map(([key, [label]]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      {numbers.length ? (
        <figure className="telemetry-plot">
          <figcaption>
            {metrics[metric][0]} · {metrics[metric][1]}
          </figcaption>
          <svg
            viewBox="0 0 600 182"
            role="img"
            aria-label={`${metrics[metric][0]} por distância da rota`}
          >
            <title>
              Lacunas interrompem as linhas; somente trechos observados.
            </title>
            <path d="M48 20V148H578" className="telemetry-axis" />
            <text x="2" y="28">
              {high.toFixed(1)}
            </text>
            <text x="2" y="148">
              {low.toFixed(1)}
            </text>
            <text x="48" y="174">
              0 km
            </text>
            <text x="510" y="174">
              {(distance / 1000).toFixed(2)} km
            </text>
            {series.map((points, i) => {
              let last = -1;
              const path = points
                .map((p) => {
                  if (p.value === null) {
                    last = -1;
                    return '';
                  }
                  const command = last === p.segment ? 'L' : 'M';
                  last = p.segment;
                  return `${command}${x(p.meters).toFixed(1)},${y(p.value).toFixed(1)}`;
                })
                .join(' ');
              return (
                <path
                  key={result.activities[i]!.id}
                  d={path}
                  fill="none"
                  stroke={ACTIVITY_COLORS[i]}
                  strokeWidth="2"
                />
              );
            })}
          </svg>
        </figure>
      ) : (
        <p role="status">
          Métrica indisponível: dados compatíveis insuficientes.
        </p>
      )}
      <p>
        Eixo horizontal: distância na geometria da rota.{' '}
        {metric === 'elapsedMs'
          ? 'Tempo decorrido desde o início; pausas não geram trechos observados.'
          : 'Valores ausentes permanecem sem medição.'}{' '}
        Sensores são estimativas.
      </p>
    </section>
  );
}
