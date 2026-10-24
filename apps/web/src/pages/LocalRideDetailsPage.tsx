import { calculateMetrics } from '@apex-ride/ride-core';
import {
  assistedChart,
  gpsChart,
  motionChart,
  type ChartData,
} from '@apex-ride/ride-core/charts';
import { trackPreview } from '@apex-ride/ride-core/history';
import { detectLaps, type Lap } from '@apex-ride/ride-core/routes';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button, ButtonLink } from '../components/design-system';
import { HistoryMetrics } from '../history/HistoryMetrics';
import { HistoryTrackMap } from '../history/HistoryTrackMap';
import type { HistoryDetail } from '../history/detail-types';
import { syncLabels } from '../history/local-history';
import { useOffline } from '../offline/context';
import type { LocalSession } from '../offline/repository';
import { EventResults } from '../ride/AdvancedResults';
import { TelemetryCharts } from '../ride/TelemetryCharts';
import type { Activity } from '../ride/controller';
import '../styles/history.css';
import '../styles/ride-session.css';
import { VideoLibrary } from '../video/VideoLibrary';
export function LocalRideDetailsPage() {
  const { clientId } = useParams(),
    { user } = useAuth(),
    offline = useOffline(),
    navigate = useNavigate();
  const state = useSyncExternalStore(offline.subscribe, offline.getSnapshot),
    connection = useSyncExternalStore(
      offline.connectivity.subscribe,
      offline.connectivity.getSnapshot,
    );
  const [data, setData] = useState<{
      activity: Activity;
      row: LocalSession;
    } | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [charts, setCharts] = useState<ChartData | null>(null),
    [laps, setLaps] = useState<Lap[]>([]);
  useEffect(() => {
    let live = true;
    if (user && clientId)
      void offline.repo
        .read(user.id, clientId)
        .then((result) => {
          if (live) {
            if (!result.activity.payload.endedAt)
              throw new Error(
                'Esta sessão ainda precisa ser finalizada ou recuperada no Ride.',
              );
            setData(result);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [clientId, user?.id, user, offline]);
  const found = state.sessions.find(
    (r) => r.ownerId === user?.id && r.payload.clientId === clientId,
  );
  useEffect(() => {
    if (found?.confirmation && connection === 'online')
      navigate(`/historico/${found.confirmation.id}`, { replace: true });
  }, [found?.confirmation, connection, navigate]);
  async function discard() {
    if (
      !window.confirm(
        'Descartar esta atividade e seus vídeos locais? Uma sessão que já teve envio exige confirmação de exclusão no servidor.',
      )
    )
      return;
    try {
      await offline.cancelHistory(clientId!);
      navigate('/historico');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const a = data?.activity,
    belongs = a?.ownerId === user?.id;
  if (!a || !data || !belongs)
    return (
      <section className="account-card panel">
        <h1>Atividade no aparelho</h1>
        <p role={error ? 'alert' : 'status'}>
          {error || 'Carregando cópia local…'}
        </p>
        <Link className="text-link action-link" to="/historico">
          Voltar ao histórico
        </Link>
      </section>
    );
  const p = a.payload,
    m =
      data.row.history?.metrics ??
      data.row.confirmation?.metrics ??
      calculateMetrics(p.startedAt, p.endedAt, p.intervals, p.points);
  const queued = state.queue.find(
      (q) => q.ownerId === user?.id && q.id === data.row.id,
    ),
    motion = p.motion;
  const ride: HistoryDetail = {
    id: p.clientId,
    client_id: p.clientId,
    title: `${p.mode} — ${new Date(p.startedAt).toLocaleDateString('pt-BR')}`,
    description: '',
    mode: p.mode,
    visibility: p.visibility,
    motorcycle_id: p.motorcycleId,
    motorcycle_snapshot: a.bike,
    started_at: new Date(p.startedAt).toISOString(),
    ended_at: new Date(p.endedAt).toISOString(),
    active_ms: m.activeMs,
    paused_ms: m.pausedMs,
    distance_meters: m.distanceMeters,
    average_kmh: m.averageKmh,
    maximum_kmh: m.maximumKmh,
    route_id: p.route?.plan.id ?? null,
    route_name: p.route?.plan.name ?? null,
    route_snapshot: p.route?.plan ?? null,
    route_completion: null,
    route_result: null,
    point_count: p.points.length,
    event_count: p.telemetry?.events.length ?? 0,
    lap_count: laps.length,
    best_lap_ms: laps.length
      ? Math.min(...laps.map((l) => l.durationMs))
      : null,
    motion: motion ?? null,
    telemetry_summary: p.telemetry ?? null,
    updated_at: new Date(data.row.recordedAt).toISOString(),
  };
  function load() {
    setCharts({
      gps: gpsChart(p.points),
      assisted: assistedChart(
        p.speedProcessing?.samples ?? [],
        p.startedAt,
        p.points,
      ),
      force: motionChart(motion?.samples ?? [], p.startedAt, 'force'),
      lean: motionChart(motion?.samples ?? [], p.startedAt, 'lean'),
    });
    if (p.route)
      setLaps(
        detectLaps(
          p.route.plan,
          p.route.abandoned
            ? p.points.filter(
                (point) => point.timestamp <= p.route!.abandonedAt!,
              )
            : p.points,
          p.mode,
        ),
      );
  }
  return (
    <div className="history-detail">
      <Link className="text-link action-link" to="/historico">
        Voltar ao histórico
      </Link>
      <header className="panel history-panel">
        <span className="eyebrow">CÓPIA DESTE APARELHO</span>
        <h1>{ride.title}</h1>
        <p>
          {a.bike.brand} {a.bike.model} ·{' '}
          {queued
            ? syncLabels[queued.state]
            : 'Finalizada · aguardando decisão'}
        </p>
        <p>
          O histórico local pode estar incompleto. Compartilhamento e edição de
          metadados exigem uma atividade sincronizada.
        </p>
        {queued?.error && <p>{queued.error}</p>}
        <div className="history-actions">
          <ButtonLink
            variant="primary"
            to={`/historico/local/${p.clientId}/replay`}
          >
            Reproduzir Ride
          </ButtonLink>
          <Button
            variant="secondary"
            onClick={() =>
              void offline.sync.run(true).catch((e) => setMessage(e.message))
            }
          >
            Sincronizar agora
          </Button>
          {data.row.decision === 'review' && (
            <Button
              variant="secondary"
              onClick={() =>
                void offline.recover(clientId!).then(() => navigate('/ride'))
              }
            >
              Revisar para salvar no Ride
            </Button>
          )}
          <Button variant="destructive" onClick={() => void discard()}>
            Descartar atividade local
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
      </header>
      <HistoryMetrics ride={ride} />
      <VideoLibrary clientId={p.clientId} />
      <HistoryTrackMap
        track={trackPreview(p.points)}
        plan={p.route?.plan ?? null}
      />
      <section className="panel history-panel">
        <h2>Gráficos locais</h2>
        {!charts ? (
          <Button variant="secondary" onClick={load}>
            Carregar gráficos locais
          </Button>
        ) : (
          <>
            <TelemetryCharts
              points={[]}
              motion={[]}
              speed={[]}
              prepared={charts}
              start={p.startedAt}
              events={p.telemetry?.events ?? []}
            />
            {p.mode !== 'passeio' && (
              <EventResults events={p.telemetry?.events ?? []} detailed />
            )}
            <p>
              {laps.length} voltas estimadas locais · sem confirmação do
              servidor.
            </p>
            <ol>
              {laps.map((l) => (
                <li key={l.number}>
                  Volta {l.number}: ~{(l.durationMs / 1000).toFixed(1)} s
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
