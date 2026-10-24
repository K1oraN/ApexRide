import { COMPARISON_STATES } from '@apex-ride/ride-core/comparison';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Button, Select } from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import { ComparisonCharts } from './ComparisonCharts';
import { ACTIVITY_COLORS } from './colors';
import type { ComparisonActivity, ComparisonResult } from './types';
const number = (v: number | null, unit: string) =>
  v === null
    ? 'Indisponível'
    : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unit}`;
const rows: [string, (a: ComparisonActivity) => string][] = [
  ['Distância validada', (a) => number(a.summary.distanceMeters / 1000, 'km')],
  ['Rota de referência', (a) => number(a.summary.routeMeters / 1000, 'km')],
  ['Diferença para o plano', (a) => number(a.summary.extraMeters / 1000, 'km')],
  ['Cobertura estimada', (a) => number(a.coverage * 100, '%')],
  ['Tempo ativo total', (a) => number(a.summary.activeMs / 1000, 's')],
  ['Tempo decorrido total', (a) => number(a.summary.elapsedMs / 1000, 's')],
  ['Tempo pausado', (a) => number(a.summary.pausedMs / 1000, 's')],
  [
    'Tempo nos trechos comuns',
    (a) =>
      number(
        a.summary.commonActiveMs === null
          ? null
          : a.summary.commonActiveMs / 1000,
        's',
      ),
  ],
  ['Média GPS validada', (a) => number(a.summary.averageKmh, 'km/h')],
  ['Máxima GPS validada', (a) => number(a.summary.maximumKmh, 'km/h')],
  [
    'Média nos trechos comuns',
    (a) => number(a.summary.commonAverageKmh ?? null, 'km/h'),
  ],
  [
    'Máxima GPS observada nos trechos comuns',
    (a) => number(a.summary.commonMaximumKmh ?? null, 'km/h'),
  ],
  [
    'G aceleração máx. estimada',
    (a) => number(a.summary.motion?.maxAccelerationG ?? null, 'G'),
  ],
  [
    'G frenagem máx. estimada',
    (a) => number(a.summary.motion?.maxBrakingG ?? null, 'G'),
  ],
  [
    'Inclinação esquerda máx.',
    (a) => number(a.summary.motion?.maxLeft ?? null, '°'),
  ],
  [
    'Inclinação direita máx.',
    (a) => number(a.summary.motion?.maxRight ?? null, '°'),
  ],
  [
    'Inclinação esquerda média',
    (a) => number(a.summary.motion?.meanLeft ?? null, '°'),
  ],
  [
    'Inclinação direita média',
    (a) => number(a.summary.motion?.meanRight ?? null, '°'),
  ],
];
export function ComparisonResults({
  result,
  onLaps,
  busy,
}: {
  result: ComparisonResult;
  onLaps: (laps: number[]) => void;
  busy: boolean;
}) {
  const [lapNumbers, setLapNumbers] = useState<Record<string, number>>({});
  const shapes = useMemo(
    () => [
      ...(result.referenceSource === 'gps-common'
        ? []
        : [
            {
              id: 'reference',
              geometry: result.route.plan.geometry,
              color: '#888888',
              width: 5,
            },
          ]),
      ...result.commonGeometry.map((geometry, i) => ({
        id: `common:${i}`,
        geometry,
        color: '#a5b4a5',
        width: 9,
      })),
      ...result.activities.flatMap((a, i) =>
        a.track
          .filter((ps) => ps.length >= 2)
          .map((coordinates, n) => ({
            id: `${a.id}:${n}`,
            geometry: { type: 'LineString' as const, coordinates },
            color: ACTIVITY_COLORS[i]!,
            width: 3,
          })),
      ),
    ],
    [result],
  );
  return (
    <>
      <section className="panel history-panel">
        <h2>{COMPARISON_STATES[result.state]}</h2>
        <p>
          {number(result.commonMeters / 1000, 'km')} de trechos em comum. Totais
          de sessões parciais não representam o mesmo percurso.
        </p>
        <div className="comparison-legend">
          {result.activities.map((a, i) => (
            <span key={a.id} style={{ borderColor: ACTIVITY_COLORS[i] }}>
              Atividade {i + 1} · {a.label} ·{' '}
              {a.own ? 'própria' : 'compartilhada em pista'}
            </span>
          ))}
        </div>
        <div
          className="comparison-table"
          tabIndex={0}
          role="region"
          aria-label="Resumo comparativo"
        >
          <table>
            <thead>
              <tr>
                <th>Métrica</th>
                {result.activities.map((a, i) => (
                  <th key={a.id}>Atividade {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, format]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {result.activities.map((a) => (
                    <td key={a.id}>{format(a)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">Δ tempo observado comum · base A1</th>
                {result.differences.map((d) => (
                  <td key={d.id}>
                    {number(
                      d.commonTimeMs === null ? null : d.commonTimeMs / 1000,
                      's',
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Δ distância total · base A1</th>
                {result.differences.map((d) => (
                  <td key={d.id}>
                    {number(
                      d.distanceMeters === null
                        ? null
                        : d.distanceMeters / 1000,
                      'km',
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Δ tempo ativo total · base A1</th>
                {result.differences.map((d) => (
                  <td key={d.id}>
                    {number(
                      d.activeMs === null ? null : d.activeMs / 1000,
                      's',
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel history-panel">
        <h2>Trajetos sobrepostos</h2>
        <RouteMap
          routes={shapes}
          selected={
            result.referenceSource === 'gps-common' ? 'common:0' : 'reference'
          }
          description={
            result.referenceSource === 'gps-common'
              ? 'Trajetos próprios e trechos comuns observados.'
              : undefined
          }
          caption={`${result.route.city} / ${result.route.state}`}
        />
        <p>
          {result.referenceSource === 'gps-common'
            ? 'Referência GPS derivada; '
            : 'Cinza: referência planejada; '}
          cinza claro: trechos em comum. Cores: GPS próprio registrado, com
          interrupções. Trajetos de terceiros permanecem protegidos. Use
          centralizar e zoom no mapa.
        </p>
        {result.activities.some((a) => a.trackReduced) && (
          <p>Trajetos reduzidos para exibição; originais preservados.</p>
        )}
      </section>
      {result.state !== 'none' && <ComparisonCharts result={result} />}
      {result.state !== 'none' && (
        <section className="panel history-panel">
          <h2>Trechos equivalentes observados</h2>
          <p>
            Posições na rota e duração observada de cada passagem. Pausas,
            desvios e lacunas são excluídos. Até 100 trechos apresentados.
          </p>
          {result.sections.map((s, i) => (
            <p key={i}>
              {number(s.from / 1000, 'km')} – {number(s.to / 1000, 'km')}:{' '}
              {s.activeMs
                .map((ms, n) => `A${n + 1}: ${number(ms / 1000, 's')}`)
                .join(' · ')}
            </p>
          ))}
        </section>
      )}
      {result.activities.map((a, i) => (
        <section className="panel history-panel" key={a.id}>
          <h2>Atividade {i + 1} · qualidade e disponibilidade</h2>
          <p>
            {a.bike?.brand} {a.bike?.model} · {a.mode} · versão {a.routeVersion}{' '}
            · {COMPARISON_STATES[a.state]}
          </p>
          <p>
            GPS: {a.methods.gps}. Assistido:{' '}
            {a.methods.assisted ?? 'indisponível'}. Sensores:{' '}
            {a.methods.motion ?? 'indisponíveis'} ·{' '}
            {a.methods.calibrated ? 'calibrados' : 'sem calibração válida'}.
          </p>
          {a.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
          <details>
            <summary>Eventos registrados e voltas estimadas</summary>
            <p>
              {a.events.length
                ? 'Eventos históricos, sem gerar novos resultados:'
                : 'Nenhum evento disponível.'}
            </p>
            {a.events.map((e, n) => (
              <p key={n}>
                {e.type === 'acceleration' ? '0–100' : '100–0'} · {e.status} ·{' '}
                {e.status === 'estimated'
                  ? number(
                      e.durationMs === null ? null : e.durationMs / 1000,
                      's',
                    )
                  : 'Inconclusivo, sem resultado comparável'}{' '}
                · {e.method} · {JSON.stringify(e.quality)}
              </p>
            ))}
            {a.laps.length ? (
              <>
                <p>
                  {a.laps.length} volta(s) GPS estimada(s) · melhor registrada:{' '}
                  {number(
                    Math.min(...a.laps.map((l) => l.durationMs)) / 1000,
                    's',
                  )}
                </p>
                <label className="account-field">
                  Volta da atividade {i + 1}
                  <Select
                    value={lapNumbers[a.id] ?? a.laps[0]!.number}
                    onChange={(e) =>
                      setLapNumbers({
                        ...lapNumbers,
                        [a.id]: Number(e.target.value),
                      })
                    }
                  >
                    {a.laps.map((l) => (
                      <option value={l.number} key={l.number}>
                        Volta {l.number} · ~{(l.durationMs / 1000).toFixed(2)} s
                        · {l.quality.accuracy} m
                      </option>
                    ))}
                  </Select>
                </label>
              </>
            ) : (
              <p>Nenhuma volta válida registrada.</p>
            )}
          </details>
          {a.own && (
            <Link
              className="text-link action-link"
              to={
                result.referenceSource === 'gps-common'
                  ? `/historico/${a.id}/replay?semelhantes=${result.route.id}&atividade=${result.activities.find((other) => other.id !== result.route.id)?.id ?? ''}`
                  : `/historico/${a.id}/replay?comparar=${result.route.id}&atividades=${result.activities.map((a) => a.id).join(',')}`
              }
            >
              Abrir replay individual da atividade {i + 1}
            </Link>
          )}
        </section>
      ))}
      {result.route.plan.kind === 'circuit' &&
        result.route.plan.verification === 'verified' &&
        result.activities.every(
          (a) => a.mode === 'pista' && a.laps.length > 0,
        ) && (
          <section className="panel history-panel">
            <h2>Circuito fechado verificado</h2>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                onLaps(
                  result.activities.map(
                    (a) => lapNumbers[a.id] ?? a.laps[0]!.number,
                  ),
                )
              }
            >
              Comparar voltas selecionadas
            </Button>
            {result.differences.map((d, i) => (
              <p key={d.id}>
                Atividade {i + 1} · Δ volta:{' '}
                {number(d.lapMs === null ? null : d.lapMs / 1000, 's')}
              </p>
            ))}
          </section>
        )}
      <section className="panel history-panel">
        <h2>Limitações da análise</h2>
        {result.limitations.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p>
          Análise pessoal e técnica autorizada. Não há classificação pública de
          desempenho em vias comuns.
        </p>
      </section>
    </>
  );
}
