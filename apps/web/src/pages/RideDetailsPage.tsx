import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { TrackPreview } from '@apex-ride/ride-core/history';
import type { PerformanceEvent } from '@apex-ride/ride-core/telemetry';
import { historyService } from '../history/service';
import type {
  HistoryDetail,
  HistoryTelemetry,
  HistoryLap,
  DataPage,
} from '../history/detail-types';
import { HistoryMetrics } from '../history/HistoryMetrics';
import { HistoryTrackMap } from '../history/HistoryTrackMap';
import { TelemetryCharts } from '../ride/TelemetryCharts';
import { EventResults } from '../ride/AdvancedResults';
import { RidePrivacyControls } from '../history/RidePrivacyControls';
import '../styles/history.css';
import '../styles/ride-session.css';
import { VideoLibrary } from '../video/VideoLibrary';
import { RideXp } from '../gamification/Progress';
const empty: never[] = [];
export function RideDetailsPage() {
  const { id } = useParams();
  return <RideDetails key={id} />;
}
function RideDetails() {
  const { id } = useParams();
  const [ride, setRide] = useState<HistoryDetail | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [track, setTrack] = useState<TrackPreview | null>(null),
    [trackError, setTrackError] = useState('');
  const [telemetry, setTelemetry] = useState<HistoryTelemetry | null>(null),
    [telemetryError, setTelemetryError] = useState(''),
    [telemetryLoading, setTelemetryLoading] = useState(false);
  const [events, setEvents] = useState<DataPage<PerformanceEvent> | null>(null),
    [laps, setLaps] = useState<DataPage<HistoryLap> | null>(null);
  useEffect(() => {
    let live = true;
    void historyService
      .detail(id!)
      .then((r) => {
        if (live) {
          setRide(r.ride);
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    void historyService
      .track(id!)
      .then((r) => {
        if (live) {
          setTrack(r);
          setTrackError('');
        }
      })
      .catch((e) => {
        if (live) setTrackError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, refresh]);
  async function loadTelemetry() {
    setTelemetryLoading(true);
    setTelemetryError('');
    try {
      const [data, eventData, lapData] = await Promise.all([
        historyService.telemetry(id!),
        historyService.events(id!),
        historyService.laps(id!),
      ]);
      setTelemetry(data);
      setEvents(eventData);
      setLaps(lapData);
    } catch (e) {
      setTelemetryError((e as Error).message);
    } finally {
      setTelemetryLoading(false);
    }
  }
  async function more(kind: 'events' | 'laps', page: number) {
    try {
      if (kind === 'events') setEvents(await historyService.events(id!, page));
      else setLaps(await historyService.laps(id!, page));
    } catch (e) {
      setTelemetryError((e as Error).message);
    }
  }
  return (
    <div className="history-detail">
      <Link className="text-link" to="/historico">
        Voltar ao histórico
      </Link>
      {error && (
        <div className="panel history-panel" role="alert">
          {error}
          <button className="button" onClick={() => setRefresh((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {ride ? (
        <>
          <RideXp id={ride.id} />
          <header className="panel history-panel">
            <span className="eyebrow">ATIVIDADE SALVA · SINCRONIZADA</span>
            <h1>{ride.title}</h1>
            <p>
              {new Date(ride.started_at).toLocaleString('pt-BR')} · Modo{' '}
              {ride.mode} ·{' '}
              {ride.visibility === 'public' ? 'Pública' : 'Privada'}
            </p>
            <p>
              {ride.motorcycle_snapshot
                ? `${ride.motorcycle_snapshot.brand} ${ride.motorcycle_snapshot.model} · ${ride.motorcycle_snapshot.year}`
                : 'Identificação histórica da moto indisponível'}
            </p>
            {ride.description && <p>{ride.description}</p>}
            <Link
              className="button button-primary"
              to={`/historico/${ride.id}/replay`}
            >
              Reproduzir Ride
            </Link>
            <Link className="button" to={`/historico/${ride.id}/semelhantes`}>
              Trajetos Semelhantes
            </Link>
            <Link
              className="button"
              to={`/comunidade?ride=${encodeURIComponent(ride.id)}`}
            >
              Compartilhar na Comunidade
            </Link>
          </header>
          <RidePrivacyControls
            key={`${ride.id}:${ride.updated_at}`}
            ride={ride}
            onSaved={() => setRefresh((n) => n + 1)}
          />
          <HistoryMetrics ride={ride} />
          <VideoLibrary
            clientId={ride.client_id}
            serverId={ride.id}
            {...(ride.motorcycle_snapshot
              ? {
                  historicalBike: `${ride.motorcycle_snapshot.brand} ${ride.motorcycle_snapshot.model}`,
                }
              : {})}
          />
          {ride.route_id && (
            <Link
              className="button"
              to={`/explorar/${ride.route_id}/comparar?atividades=${ride.id}`}
            >
              Comparar atividades nesta rota
            </Link>
          )}
          {track ? (
            <HistoryTrackMap track={track} plan={ride.route_snapshot} />
          ) : (
            <section className="panel history-panel" role="status">
              {trackError || 'Carregando trajeto…'}
            </section>
          )}
          <section className="panel history-panel">
            <h2>Velocidade e telemetria</h2>
            <p>
              Dados históricos preservados. Redução somente para exibição;
              medições ausentes permanecem indisponíveis.
            </p>
            {!telemetry && (
              <button
                className="button"
                disabled={telemetryLoading}
                onClick={() => void loadTelemetry()}
              >
                {telemetryLoading
                  ? 'Carregando gráficos…'
                  : 'Carregar gráficos e eventos'}
              </button>
            )}
            {telemetryError && <p role="alert">{telemetryError}</p>}
            {telemetry && (
              <>
                <p>
                  {telemetry.speed.version ? (
                    <>
                      GPS Assistido: {telemetry.speed.assistedSamples} amostras
                      estimadas · GPS Puro: {telemetry.speed.gpsSamples} ·
                      indisponíveis: {telemetry.speed.unavailableSamples}.{' '}
                      {telemetry.speed.truncated ? 'Série incompleta.' : ''}
                    </>
                  ) : (
                    'Processamento de velocidade assistida não registrado. A série GPS original é independente.'
                  )}
                </p>
                <TelemetryCharts
                  prepared={telemetry.series}
                  points={empty}
                  motion={empty}
                  speed={empty}
                  start={new Date(ride.started_at).getTime()}
                  events={events?.items ?? empty}
                />
                {ride.mode !== 'passeio' && (
                  <>
                    <h3>Eventos · análise pessoal</h3>
                    <p>
                      {ride.event_count} eventos persistidos. Resumo da página
                      atual:
                    </p>
                    <EventResults
                      events={events?.items ?? empty}
                      detailed
                      truncated={ride.telemetry_summary?.truncated ?? false}
                    />
                    <div className="history-actions">
                      <button
                        className="button"
                        disabled={!events || events.page === 1}
                        onClick={() => void more('events', events!.page - 1)}
                      >
                        Eventos anteriores
                      </button>
                      <button
                        className="button"
                        disabled={!events?.hasMore}
                        onClick={() => void more('events', events!.page + 1)}
                      >
                        Próximos eventos
                      </button>
                    </div>
                  </>
                )}
                <h3>Voltas GPS estimadas</h3>
                {ride.lap_count ? (
                  <>
                    <p>
                      {ride.route_snapshot?.name} · {ride.lap_count} volta(s)
                      estimada(s) registrada(s). Inconclusivas:{' '}
                      {ride.route_result?.inconclusiveLaps ?? 0}.
                    </p>
                    {ride.best_lap_ms !== null && (
                      <p>
                        Melhor volta estimada: ~
                        {(ride.best_lap_ms / 1000).toFixed(1)} s.
                      </p>
                    )}
                    <ol>
                      {laps?.items.map((l) => (
                        <li key={l.number}>
                          Volta {l.number}: ~{(l.durationMs / 1000).toFixed(1)}{' '}
                          s · precisão até {l.quality.accuracy} m ·{' '}
                          {l.quality.method}
                        </li>
                      ))}
                    </ol>
                    <div className="history-actions">
                      <button
                        className="button"
                        disabled={!laps || laps.page === 1}
                        onClick={() => void more('laps', laps!.page - 1)}
                      >
                        Voltas anteriores
                      </button>
                      <button
                        className="button"
                        disabled={!laps?.hasMore}
                        onClick={() => void more('laps', laps!.page + 1)}
                      >
                        Próximas voltas
                      </button>
                    </div>
                  </>
                ) : (
                  <p>Nenhuma volta validada foi registrada nesta atividade.</p>
                )}
              </>
            )}
          </section>
          <section className="panel history-panel">
            <h2>Informações adicionais</h2>
            <p>
              {ride.point_count} pontos GPS originais · métricas consolidadas da
              sessão. Nenhum trecho faltante foi inventado.
            </p>
            <p>
              Última atualização:{' '}
              {new Date(ride.updated_at).toLocaleString('pt-BR')}.
            </p>
          </section>
        </>
      ) : (
        !error && <p role="status">Carregando atividade…</p>
      )}
    </div>
  );
}
