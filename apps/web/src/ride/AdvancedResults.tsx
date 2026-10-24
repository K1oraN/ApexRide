import { useState } from 'react';
import type {
  PerformanceEvent,
  AdvancedTelemetry,
} from '@apex-ride/ride-core/telemetry';
import { formatEventTime } from '@apex-ride/ride-core/telemetry';
import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import { useRide } from './context';
import { TelemetryCharts } from './TelemetryCharts';

const reasons: Record<string, string> = {
  'timestamp-order': 'Timestamps inconsistentes',
  'invalid-reading': 'Leitura inválida ou indisponível',
  'impossible-acceleration': 'Variação de velocidade incompatível',
  interruption: 'Coleta interrompida',
  'sample-gap': 'Intervalo excessivo entre medições',
  'source-change': 'Origem da velocidade alterada',
  'event-timeout': 'Janela de observação excedida',
  'stopped-before-threshold': 'Parada antes do limite',
  'acceleration-reversed': 'Aceleração descontínua',
  'braking-reversed': 'Desaceleração descontínua',
  'crossing-gap': 'Cruzamento sem resolução suficiente',
  'insufficient-samples': 'Amostras insuficientes',
  'session-ended': 'Sessão encerrada durante o evento',
  pause: 'Evento interrompido pela pausa',
  'speed-mode': 'Modo de velocidade alterado',
  processing: 'Processamento interrompido',
};
function best(events: PerformanceEvent[], type: PerformanceEvent['type']) {
  const valid = events.filter(
    (e) => e.type === type && e.status === 'estimated',
  );
  const result = valid.reduce<PerformanceEvent | null>(
    (a, b) => (!a || b.durationMs! < a.durationMs! ? b : a),
    null,
  );
  return {
    count: valid.length,
    label: result
      ? formatEventTime(result)
      : 'Medição indisponível: dados insuficientes.',
  };
}
export function EventResults({
  events,
  truncated,
  detailed = false,
}: {
  events: PerformanceEvent[];
  truncated?: boolean;
  detailed?: boolean;
}) {
  const [page, setPage] = useState(0);
  const a = best(events, 'acceleration'),
    b = best(events, 'braking');
  return (
    <section aria-label="Eventos estimados da sessão">
      <dl className="session-summary-metrics">
        <div>
          <dt>0–100 km/h · {a.count} válidos</dt>
          <dd className="event-result">{a.label}</dd>
        </div>
        <div>
          <dt>100–0 km/h · {b.count} válidos</dt>
          <dd className="event-result">{b.label}</dd>
        </div>
      </dl>
      <p>
        Detecção passiva · análise pessoal · experimental. Melhor estimativa
        desta sessão; sem certificação ou publicação automática.
      </p>
      {truncated && (
        <p role="alert">
          Limite de eventos atingido. Resumo limitado ao trecho registrado.
        </p>
      )}
      {detailed && events.length > 0 && (
        <>
          <ul className="telemetry-events">
            {events.slice(page * 20, page * 20 + 20).map((e) => (
              <li key={e.id}>
                <strong>
                  {e.type === 'acceleration' ? '0–100' : '100–0'} ·{' '}
                  {e.status === 'estimated'
                    ? formatEventTime(e)
                    : e.status === 'rejected'
                      ? 'Rejeitado'
                      : 'Inconclusivo'}
                </strong>
                <p>
                  {new Date(e.startMs).toLocaleTimeString('pt-BR')} –{' '}
                  {new Date(e.endMs).toLocaleTimeString('pt-BR')} ·{' '}
                  {e.quality.sampleCount} amostras · maior intervalo{' '}
                  {e.quality.maxGapMs} ms · origem{' '}
                  {e.quality.sources.join(', ')} · {e.version}.
                </p>
                <p>
                  Método: estimativa linear entre amostras adjacentes.{' '}
                  {e.reason && (reasons[e.reason] ?? e.reason)}
                  {e.force &&
                    ` · G longitudinal: ${e.force.peakG.toFixed(2)} G (estimado, calibração registrada).`}
                </p>
              </li>
            ))}
          </ul>
          {events.length > 20 && (
            <div className="session-summary-actions">
              <button
                className="button"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Anteriores
              </button>
              <button
                className="button"
                disabled={(page + 1) * 20 >= events.length}
                onClick={() => setPage(page + 1)}
              >
                Próximos
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
const empty: never[] = [];
export function AdvancedResults({ summary = false }: { summary?: boolean }) {
  const { controller, snapshot } = useRide();
  const a = snapshot.activity;
  if (!a || !RIDE_MODES[a.payload.mode].advanced) return null;
  const data: AdvancedTelemetry | undefined = a.payload.telemetry;
  const events =
    data?.events ?? (summary ? empty : controller.telemetry.events);
  return (
    <details className="ride-preparation panel" open={summary || undefined}>
      <summary>Telemetria avançada · análise pessoal</summary>
      <EventResults
        events={events}
        truncated={data?.truncated ?? false}
        detailed={summary}
      />
      {controller.telemetry.failed && (
        <p role="alert">
          Processamento avançado indisponível. GPS e mapa continuam disponíveis.
        </p>
      )}
      {!summary && (
        <p>
          Gráficos mostram as últimas 600 amostras disponíveis; o resumo utiliza
          o histórico registrado.
        </p>
      )}
      <TelemetryCharts
        points={summary ? a.payload.points : a.payload.points.slice(-600)}
        motion={
          summary
            ? (a.payload.motion?.samples ?? empty)
            : controller.motion.chartSamples()
        }
        speed={
          summary
            ? (a.payload.speedProcessing?.samples ?? empty)
            : controller.speed.chartSamples()
        }
        start={a.payload.startedAt}
        events={events}
      />
      {RIDE_MODES[a.payload.mode].lapPreparation &&
        a.payload.route?.plan.verification !== 'verified' && (
          <p>
            Tempos de volta indisponíveis. Selecione um circuito verificado com
            linha de largada/chegada. Selecionar Pista não verifica um circuito
            fechado.
          </p>
        )}
    </details>
  );
}
