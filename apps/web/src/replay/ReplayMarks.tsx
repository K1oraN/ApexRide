import { memo, useState } from 'react';
import { Button } from '../components/design-system';
import type { ReplayEngine } from './engine';
import type { ReplayMark, ReplayTimeline } from './timeline';
export const ReplayMarks = memo(function ReplayMarks({
  marks,
  current,
  engine,
}: {
  marks: ReplayMark[];
  current: string | undefined;
  engine: ReplayEngine;
}) {
  const [page, setPage] = useState(0);
  return (
    <>
      <div className="replay-marks">
        {marks.slice(page * 50, (page + 1) * 50).map((m) => (
          <Button
            variant="secondary"
            aria-pressed={current === m.id}
            key={m.id}
            onClick={() => engine.seek(m.start)}
          >
            {m.label} · {m.status}
            <small>
              {(m.start / 1000).toFixed(1)}–{(m.end / 1000).toFixed(1)} s ativos
            </small>
          </Button>
        ))}
      </div>
      {marks.length > 50 && (
        <div className="history-actions">
          <Button
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((n) => n - 1)}
          >
            Marcações anteriores
          </Button>
          <span>Página {page + 1}</span>
          <Button
            variant="secondary"
            disabled={(page + 1) * 50 >= marks.length}
            onClick={() => setPage((n) => n + 1)}
          >
            Próximas marcações
          </Button>
        </div>
      )}
    </>
  );
});
export const ReplayTicks = memo(function ReplayTicks({
  timeline,
}: {
  timeline: ReplayTimeline;
}) {
  const x = (t: number) => (t / timeline.clock.duration) * 600;
  return (
    <>
      <svg
        className="replay-ticks"
        viewBox="0 0 600 24"
        role="img"
        aria-label="Limites de eventos, voltas, pausas e lacunas"
      >
        {timeline.gaps.map((g, i) => (
          <g key={i}>
            <rect
              x={x(g.start)}
              y="0"
              width={Math.max(1, x(g.end) - x(g.start))}
              height="24"
              fill="#f2a65a"
              opacity=".3"
            >
              <title>{g.reason}</title>
            </rect>
          </g>
        ))}
        {[...timeline.events, ...timeline.laps].map((m, i) => (
          <g key={i}>
            <line x1={x(m.start)} x2={x(m.start)} y1="0" y2="16" stroke="#fff">
              <title>Início · {m.label}</title>
            </line>
            <line x1={x(m.end)} x2={x(m.end)} y1="8" y2="24" stroke="#ff777c">
              <title>Fim · {m.label}</title>
            </line>
          </g>
        ))}
      </svg>
      <small>
        Âmbar: pausas/lacunas · branco: início de evento/volta · vermelho: fim.
      </small>
    </>
  );
});
