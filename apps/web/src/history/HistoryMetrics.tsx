import { formatDuration } from '../ride/format';
import type { HistoryDetail } from './detail-types';
export function HistoryMetrics({ ride }: { ride: HistoryDetail }) {
  const stats = ride.motion?.stats,
    advanced = ride.mode !== 'passeio';
  const metrics: [string, string][] = [
    [
      'Distância',
      `${(ride.distance_meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`,
    ],
    ['Tempo ativo', formatDuration(ride.active_ms)],
    [
      'Tempo total',
      formatDuration(
        new Date(ride.ended_at).getTime() - new Date(ride.started_at).getTime(),
      ),
    ],
    ['Tempo pausado', formatDuration(ride.paused_ms)],
    [
      'Velocidade média',
      ride.average_kmh === null
        ? 'Indisponível'
        : `${ride.average_kmh.toFixed(1)} km/h`,
    ],
    [
      'Velocidade máxima GPS',
      ride.maximum_kmh === null
        ? 'Indisponível'
        : `${ride.maximum_kmh.toFixed(1)} km/h`,
    ],
  ];
  return (
    <section className="panel history-panel">
      <h2>Resumo</h2>
      <dl className="session-summary-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {advanced && (
        <>
          <h3>Sensores · estimativas pessoais</h3>
          <dl className="session-summary-metrics">
            {(
              [
                ['Aceleração G estimada', stats?.maxAccelerationG, 'G'],
                ['Frenagem G estimada', stats?.maxBrakingG, 'G'],
                ['Inclinação máxima esquerda', stats?.maxLeft, '°'],
                ['Inclinação máxima direita', stats?.maxRight, '°'],
                ['Inclinação média esquerda', stats?.meanLeft, '°'],
                ['Inclinação média direita', stats?.meanRight, '°'],
              ] as const
            ).map(([l, v, u]) => (
              <div key={l}>
                <dt>{l}</dt>
                <dd>
                  {v === null || v === undefined
                    ? 'Indisponível'
                    : `${v.toFixed(2)} ${u}`}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            {ride.motion
              ? `Calibração ${ride.motion.calibration?.valid ? 'válida na referência salva' : 'ausente ou perdida'} · ${stats?.validSamples ?? 0} amostras válidas · método ${ride.motion.version}.`
              : 'Esta atividade não possui medições de sensores salvas.'}{' '}
            Inclinação dinâmica permanece indisponível até homologação física.
          </p>
          {ride.motion?.truncated && (
            <p>Série de sensores incompleta: limite de registro atingido.</p>
          )}
        </>
      )}
      {ride.route_snapshot && (
        <p>
          Percurso planejado: {ride.route_snapshot.name} ·{' '}
          {
            {
              completed: 'Concluído',
              partial: 'Parcialmente realizado',
              abandoned: 'Acompanhamento abandonado',
              indeterminate: 'Progresso indeterminado',
            }[ride.route_result?.completion ?? 'indeterminate']
          }{' '}
          ·{' '}
          {ride.route_snapshot.verification === 'verified'
            ? 'Circuito verificado na versão utilizada'
            : 'Sem verificação de pista'}
          .
        </p>
      )}
    </section>
  );
}
