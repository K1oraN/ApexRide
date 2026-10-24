import { Activity, MoveDown, MoveUp } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { Button, Checkbox, Select } from '../components/design-system';
import { RideMap } from '../components/maps/RideMap';
import { MetricCard } from '../components/telemetry/Metrics';
import { Speedometer } from '../components/telemetry/Speedometer';
import { TelemetryCharts } from '../ride/TelemetryCharts';
import type { GpsSnapshot } from '../services/gps/preview';
import '../styles/history.css';
import '../styles/replay.css';
import '../styles/ride-session.css';
import { ReplayEngine } from './engine';
import { ReplayMarks, ReplayTicks } from './ReplayMarks';
import { prepareReplay, type ReplayInput } from './timeline';
const empty: never[] = [];
const labels = {
  idle: 'Não iniciado',
  loading: 'Carregando',
  ready: 'Pronto',
  playing: 'Reproduzindo',
  paused: 'Pausado',
  seeking: 'Procurando instante',
  completed: 'Concluído',
  error: 'Erro',
};
function replayTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((s / 60) % 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
export function ReplayPanel({ input }: { input: ReplayInput }) {
  const timeline = useMemo(() => prepareReplay(input), [input]);
  const engine = useMemo(
    () => new ReplayEngine(input.payload.clientId),
    [input.payload.clientId],
  );
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = () => {
      setReduced(media?.matches ?? false);
      engine.pause();
    };
    media?.addEventListener('change', change);
    return () => media?.removeEventListener('change', change);
  }, [engine]);
  useEffect(() => {
    if (timeline.available) engine.load(timeline.clock.duration);
    else
      engine.fail(
        'Dados insuficientes: são necessários dois pontos GPS válidos e intervalos ativos registrados.',
      );
    const unbind = engine.bindVisibility();
    return () => {
      unbind();
      engine.cleanup();
    };
  }, [engine, timeline]);
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const frame = timeline.frame(snapshot.time);
  const map = useMemo(
    () => ({ timeline, engine, reducedMotion: reduced }),
    [timeline, engine, reduced],
  );
  const chart = useMemo(
    () => ({ engine, duration: timeline.clock.duration }),
    [engine, timeline],
  );
  const gps = useMemo<GpsSnapshot>(
    () => ({
      overview: true,
      active: false,
      status: 'available',
      message: 'Replay privado',
      speedKmh: null,
      reading: null,
      segments: timeline.groups.map((g) =>
        g.map((s) => ({ ...s.value, altitudeAccuracy: null })),
      ),
    }),
    [timeline],
  );
  const events = useMemo(
    () =>
      timeline.originalEvents.flatMap((e) => {
        const at = timeline.events.find((m) => m.id === e.id);
        return at ? [{ ...e, startMs: at.start, endMs: at.end }] : [];
      }),
    [timeline],
  );
  if (!timeline.available)
    return (
      <section className="panel history-panel">
        <h2>Replay indisponível</h2>
        <p role="status">
          Dados insuficientes: são necessários dois pontos GPS válidos e
          intervalos ativos registrados. Nenhuma animação foi iniciada.
        </p>
      </section>
    );
  return (
    <div className="replay-content">
      <section
        className="panel history-panel replay-controls"
        aria-label="Controles de replay"
      >
        <span className="eyebrow">REPLAY PRIVADO · DADOS REGISTRADOS</span>
        <p role="status">
          {labels[snapshot.state]}
          {snapshot.error ? ` · ${snapshot.error}` : ''}
        </p>
        <label className="replay-timeline">
          Linha do tempo · tempo ativo
          <input
            type="range"
            aria-label="Instante do replay"
            min={0}
            max={timeline.clock.duration}
            step={100}
            value={snapshot.time}
            style={
              {
                '--replay-progress': `${(snapshot.time / timeline.clock.duration) * 100}%`,
              } as CSSProperties
            }
            aria-valuetext={`${replayTime(snapshot.time)} de ${replayTime(timeline.clock.duration)}`}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              engine.beginSeek();
            }}
            onPointerUp={engine.endSeek}
            onPointerCancel={engine.endSeek}
            onBlur={engine.endSeek}
            onChange={(e) => engine.seek(Number(e.target.value))}
          />
        </label>
        <ReplayTicks timeline={timeline} />
        <div className="replay-time">
          <output aria-label="Tempo reproduzido">
            {replayTime(snapshot.time)}
          </output>
          <span>{replayTime(timeline.clock.duration)}</span>
        </div>
        <div className="history-actions">
          <Button
            variant="primary"
            disabled={reduced}
            onClick={snapshot.state === 'playing' ? engine.pause : engine.play}
          >
            {snapshot.state === 'playing'
              ? 'Pausar replay'
              : snapshot.state === 'paused'
                ? 'Continuar replay'
                : 'Iniciar replay'}
          </Button>
          <Button variant="secondary" onClick={engine.restart}>
            Reiniciar
          </Button>
          <Button
            variant="outline"
            onClick={() => engine.seek(snapshot.time - 10000)}
          >
            Voltar 10 s
          </Button>
          <Button
            variant="secondary"
            onClick={() => engine.seek(snapshot.time + 10000)}
          >
            Avançar 10 s
          </Button>
          <label>
            Velocidade do replay
            <Select
              aria-label="Velocidade do replay"
              value={snapshot.speed}
              onChange={(e) => engine.setPlaybackSpeed(Number(e.target.value))}
            >
              {[0.5, 1, 2, 4].map((speed) => (
                <option key={speed} value={speed}>
                  {speed.toLocaleString('pt-BR')}×
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label>
          <Checkbox
            checked={reduced}
            onChange={(e) => {
              engine.pause();
              setReduced(e.target.checked);
            }}
          />{' '}
          Consultar sem animação (movimento reduzido)
        </label>
        <p>
          {replayTime(timeline.clock.paused)} de pausas excluídas ·{' '}
          {timeline.groups.length} trechos registrados. A velocidade do replay
          não altera a velocidade da moto.
        </p>
        {timeline.gaps.length > 0 && (
          <details>
            <summary>
              Pausas e dados ausentes · {timeline.gaps.length} limites
            </summary>
            <ul>
              {timeline.gaps.slice(0, 50).map((g, i) => (
                <li key={i}>
                  <button
                    className="text-link"
                    onClick={() => engine.seek(g.start)}
                  >
                    {g.reason} · {(g.start / 1000).toFixed(1)}–
                    {(g.end / 1000).toFixed(1)} s
                  </button>
                </li>
              ))}
            </ul>
            {timeline.gaps.length > 50 && (
              <p>
                Primeiros 50 limites listados; todas as lacunas são preservadas
                no mapa e nos gráficos.
              </p>
            )}
          </details>
        )}
        {input.payload.motion?.truncated ||
        input.payload.speedProcessing?.truncated ? (
          <p>
            Série histórica incompleta: trechos não registrados ficam
            indisponíveis.
          </p>
        ) : null}
      </section>
      <section
        className="panel history-panel"
        aria-label="Mapa e posição do replay"
      >
        <h2>Percurso registrado</h2>
        <RideMap gps={gps} replay={map} />
        <p role="status">
          {frame.gap
            ? 'Dados de posição ausentes neste intervalo. O replay continua até a próxima amostra válida.'
            : frame.position?.interpolated
              ? 'Posição visual interpolada entre amostras próximas.'
              : 'Posição GPS registrada.'}
        </p>
      </section>
      <section
        className="panel history-panel replay-telemetry"
        aria-label="Telemetria sincronizada"
      >
        <Speedometer
          value={frame.speedKmh}
          source={frame.speedSource}
          status={
            frame.speedKmh === null
              ? 'Velocidade indisponível'
              : frame.speedSource === 'assisted'
                ? 'GPS Assistido · estimativa registrada'
                : 'GPS original registrado'
          }
        />
        <div className="replay-metrics">
          <MetricCard
            icon={<MoveUp />}
            label="Aceleração estimada"
            value={
              frame.accelerationG === null
                ? '—'
                : frame.accelerationG.toFixed(2)
            }
            unit="G"
          />
          <MetricCard
            icon={<MoveDown />}
            label="Frenagem estimada"
            value={frame.brakingG === null ? '—' : frame.brakingG.toFixed(2)}
            unit="G"
          />
          <MetricCard
            icon={<Activity />}
            label="Inclinação estimada"
            value={
              frame.lean === null
                ? '—'
                : `${Math.abs(frame.lean).toFixed(1)}° · ${frame.lean < 0 ? 'esquerda' : frame.lean > 0 ? 'direita' : 'centro'}`
            }
          />
          <p>
            {frame.calibrated
              ? 'Sensor calibrado · confiança limitada · estimativas registradas.'
              : 'Sensores indisponíveis ou sem calibração válida neste instante.'}{' '}
            Inclinação dinâmica não homologada permanece indisponível nas
            atividades atuais.
          </p>
        </div>
      </section>
      <section className="panel history-panel">
        <h2>Gráficos sincronizados</h2>
        <TelemetryCharts
          prepared={timeline.charts}
          points={empty}
          motion={empty}
          speed={empty}
          start={0}
          events={events}
          replay={chart}
        />
      </section>
      <section className="panel history-panel">
        <h2>Eventos registrados</h2>
        {frame.event && (
          <p role="status">
            Em reprodução: {frame.event.label} · {frame.event.status}
          </p>
        )}
        {timeline.events.length ? (
          <ReplayMarks
            marks={timeline.events}
            current={frame.event?.id}
            engine={engine}
          />
        ) : (
          <p>Nenhum evento registrado com alinhamento temporal confiável.</p>
        )}
      </section>
      {input.payload.mode === 'pista' &&
        input.payload.route?.plan.kind === 'circuit' && (
          <section className="panel history-panel">
            <h2>Voltas registradas</h2>
            {frame.lap && <p role="status">Em reprodução: {frame.lap.label}</p>}
            {timeline.laps.length ? (
              <ReplayMarks
                marks={timeline.laps}
                current={frame.lap?.id}
                engine={engine}
              />
            ) : (
              <p>
                Nenhuma volta persistida e alinhada em circuito verificado.
                Voltas não são recalculadas pelo replay.
              </p>
            )}
          </section>
        )}
    </div>
  );
}
