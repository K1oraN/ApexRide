import { RacingFlagIcon } from '../components/Brand';
import { useRide } from './context';
import { formatDuration } from './format';

export function RideCircuitPanel() {
  const { controller, snapshot } = useRide();
  const plan = snapshot.activity?.payload.route?.plan ?? snapshot.selectedRoute;
  const eligible =
    plan?.kind === 'circuit' &&
    plan.verification === 'verified' &&
    plan.startLine &&
    plan.direction &&
    snapshot.activity?.payload.mode === 'pista';
  const laps = snapshot.laps;
  const last = laps.at(-1);
  const best = laps.reduce<typeof last>(
    (a, b) => (!a || b.durationMs < a.durationMs ? b : a),
    undefined,
  );
  const start = controller.currentLapStartedAt();
  const current =
    eligible && snapshot.state === 'running' && start !== null
      ? Math.max(0, snapshot.now - start)
      : null;
  return (
    <section
      className="panel ride-circuit-panel"
      aria-label="Voltas do circuito"
    >
      <h2>
        <RacingFlagIcon /> Circuito e voltas
      </h2>
      <p>
        {plan?.kind === 'circuit'
          ? `${plan.name} · versão ${plan.version}`
          : 'Nenhum circuito selecionado'}
      </p>
      <dl className="ride-lap-metrics">
        <div>
          <dt>Volta atual</dt>
          <dd>
            {current === null
              ? '—'
              : `${laps.length + 1} · ${formatDuration(current)}`}
          </dd>
        </div>
        <div>
          <dt>Última volta</dt>
          <dd>{last ? formatDuration(last.durationMs) : '—'}</dd>
        </div>
        <div>
          <dt>Melhor volta</dt>
          <dd>{best ? formatDuration(best.durationMs) : '—'}</dd>
        </div>
        <div>
          <dt>Diferença da melhor</dt>
          <dd>
            {last && best && laps.length > 1
              ? `+${((last.durationMs - best.durationMs) / 1000).toFixed(1)} s`
              : '—'}
          </dd>
        </div>
      </dl>
      <p>
        {eligible
          ? 'Estimativas pessoais por GPS; a primeira passagem válida abre o cronômetro.'
          : 'Exige modo Pista, circuito verificado, linha de largada e sentido válidos. Selecionar Pista não comprova local fechado.'}
      </p>
      {snapshot.inconclusiveLaps > 0 && (
        <p>
          {snapshot.inconclusiveLaps} volta(s) inconclusiva(s). Pausas e perda
          de qualidade interrompem a observação.
        </p>
      )}
      {laps.length > 0 && (
        <ol className="ride-lap-list">
          {laps.map((lap) => (
            <li key={lap.number}>
              Volta {lap.number} · {formatDuration(lap.durationMs)} · estimada ·
              precisão GPS até ±{Math.round(lap.accuracy)} m
            </li>
          ))}
        </ol>
      )}
      <small>
        Mesma sessão, geometria e versão. Sem cronometragem oficial ou
        publicação automática.
      </small>
    </section>
  );
}
