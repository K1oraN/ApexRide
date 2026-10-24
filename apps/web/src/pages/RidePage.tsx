import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import { AdvancedResults } from '../ride/AdvancedResults';
import { OfflinePanel } from '../offline/OfflinePanel';
import {
  ArrowLeft,
  ChevronDown,
  Gauge,
  LocateFixed,
  Route,
  Square,
  Timer,
} from 'lucide-react';
import { useEffect } from 'react';
import { useState } from 'react';
import { routeService } from '../services/routes';
import '../styles/routes.css';
import { Link, useSearchParams } from 'react-router';
import {
  RacingFlagIcon as Flag,
  ModeIcon,
  RideIcon,
} from '../components/Brand';
import { RideMap } from '../components/maps/RideMap';
import { GpsIndicator } from '../components/telemetry/GpsIndicator';
import { useRide } from '../ride/context';
import { rideGps, rideMetrics } from '../ride/controller';
import { RideSummary } from '../ride/RideSummary';
import { MotionPreparation } from '../ride/MotionPreparation';
import { MotionForceCards } from '../ride/MotionForceCards';
import { formatDuration } from '../ride/format';
import { useAuth } from '../auth/useAuth';
import { useGarage } from '../garage/context';
import { MotorcyclePhoto } from '../garage/MotorcycleCard';
import '../styles/ride-session.css';
import { MetricCard } from '../components/telemetry/Metrics';
import { SpeedDisplay } from '../ride/SpeedDisplay';
import { SpeedSettings } from '../ride/SpeedSettings';
import { rideModes, type RideMode } from '../data/demo';
import { VideoPanel } from '../video/VideoPanel';
import { authRequest } from '../services/auth';
import { events } from '../events/service';
import type { SocialEvent } from '../events/types';

export function RidePage() {
  const [params, setParams] = useSearchParams();
  const { controller, snapshot } = useRide();
  const [routeError, setRouteError] = useState('');
  const plan = snapshot.activity?.payload.route?.plan ?? snapshot.selectedRoute;
  const routeId = params.get('percurso');
  const eventId = params.get('evento');
  useEffect(() => {
    const abort = new AbortController();
    if (eventId && !snapshot.activity && snapshot.state !== 'waiting-gps') {
      controller.selectEvent(null);
      void authRequest<{ event: SocialEvent; authorizationId: string }>(
        `/events/${eventId}/ride-association`,
        'POST',
        {},
        abort.signal,
      )
        .then(async (r) => {
          const map = await events.map(eventId, abort.signal);
          if (abort.signal.aborted) return;
          controller.selectEvent({
            id: eventId,
            title: r.event.title,
            authorizationId: r.authorizationId,
          });
          controller.selectRoute(map.route?.plan ?? null);
          setRouteError('');
        })
        .catch((e) => {
          if (!abort.signal.aborted) {
            controller.selectEvent(null);
            setRouteError(e.message);
          }
        });
    }
    return () => abort.abort();
  }, [eventId, controller, snapshot.activity, snapshot.state]);
  useEffect(() => {
    let live = true;
    if (
      routeId &&
      !eventId &&
      !snapshot.activity &&
      snapshot.state !== 'waiting-gps'
    )
      void routeService
        .detail(routeId)
        .then(({ route }) => {
          if (live) {
            if (route.status !== 'approved')
              throw new Error('Selecione um percurso aprovado.');
            controller.selectRoute({
              id: route.id,
              version: route.version,
              name: route.name,
              kind: route.kind,
              geometry: route.geometry,
              distanceMeters: route.distanceMeters,
              verification: route.verification,
              startLine: route.startLine,
              direction: route.direction,
              waypoints: route.waypoints,
            });
            setRouteError('');
          }
        })
        .catch((e) => {
          if (live) setRouteError(e.message);
        });
    return () => {
      live = false;
    };
  }, [routeId, eventId, controller, snapshot.activity, snapshot.state]);
  const { user } = useAuth();
  const garage = useGarage();
  const gps = rideGps(snapshot);
  const activity = snapshot.activity;
  const metrics = rideMetrics(snapshot);
  const bike =
    garage.motorcycles.find((b) => b.id === params.get('moto')) ??
    garage.motorcycles.find((b) => b.isPrimary) ??
    garage.motorcycles[0];
  const busy = Boolean(activity) || snapshot.state === 'waiting-gps';
  useEffect(() => () => controller.stopPreview(), [controller]);
  const mode =
    rideModes.find(
      (mode) => mode.id === (activity?.payload.mode ?? params.get('modo')),
    ) ?? rideModes[2]!;
  function selectMode(value: string) {
    const next = new URLSearchParams(params);
    next.set('modo', value as RideMode);
    setParams(next);
  }
  if (activity && user?.id !== activity.ownerId)
    return (
      <section className="account-card panel">
        <h1>Ride aguardando sua conta</h1>
        <p>
          Entre na conta que iniciou esta atividade para continuar ou salvar.
        </p>
        <Link className="text-link" to="/entrar">
          Entrar na conta
        </Link>
      </section>
    );
  if (activity?.payload.endedAt)
    return (
      <div className="ride-page panel">
        <OfflinePanel />
        <RideSummary />
      </div>
    );
  return (
    <div className="ride-page panel">
      <OfflinePanel />
      {snapshot.selectedEvent && (
        <section className="panel route-progress">
          <p>
            Passeio:{' '}
            <Link
              className="text-link"
              to={`/comunidade/eventos/${snapshot.selectedEvent.id}`}
            >
              {snapshot.selectedEvent.title}
            </Link>{' '}
            · Localização social exige autorização separada.
          </p>
          {!activity && (
            <button
              className="text-link"
              onClick={() => {
                controller.selectEvent(null);
                const next = new URLSearchParams(params);
                next.delete('evento');
                setParams(next);
              }}
            >
              Desvincular evento
            </button>
          )}
        </section>
      )}
      {routeError && <p role="alert">{routeError}</p>}
      {plan && (
        <section
          className="panel route-progress"
          aria-label="Acompanhamento da rota"
        >
          <strong>{plan.name}</strong>
          {snapshot.activity?.payload.route?.abandoned ? (
            <p>Acompanhamento abandonado · GPS da sessão continua.</p>
          ) : (
            <>
              <p>
                {snapshot.routeProgress?.determinate
                  ? `${Math.round(snapshot.routeProgress.percent)}% aproximado · ${(snapshot.routeProgress.remaining / 1000).toFixed(1)} km restantes`
                  : 'Progresso temporariamente indeterminado'}
              </p>
              <progress
                max="100"
                value={snapshot.routeProgress?.percent ?? 0}
              />
              <p>
                {snapshot.routeProgress?.completed
                  ? 'Rota concluída · a sessão continua'
                  : {
                      'on-route': 'Na rota',
                      'possible-deviation': 'Possível desvio',
                      'off-route': 'Fora da rota',
                      inaccurate: 'Localização imprecisa',
                    }[snapshot.routeProgress?.status ?? 'inaccurate']}
              </p>
              {activity?.payload.mode === 'pista' &&
                plan.verification === 'verified' && (
                  <p>Voltas estimadas: {snapshot.laps.length}</p>
                )}
              {!activity ? (
                <button
                  className="text-link"
                  onClick={() => {
                    controller.selectRoute(null);
                    const next = new URLSearchParams(params);
                    next.delete('percurso');
                    setParams(next);
                  }}
                >
                  Remover seleção
                </button>
              ) : (
                snapshot.state === 'paused' && (
                  <button
                    className="text-link"
                    onClick={controller.abandonRoute}
                  >
                    Deixar de acompanhar rota
                  </button>
                )
              )}
            </>
          )}
        </section>
      )}
      <div className="ride-page-heading">
        <div className="ride-title">
          <Link to="/" aria-label="Voltar ao início">
            <ArrowLeft />
          </Link>
          <div>
            <span className="eyebrow">
              {activity ? 'SESSÃO DE PILOTAGEM' : 'PRÉVIA GPS'}
            </span>
            <h1>
              MODO <em>{mode.name.toUpperCase()}</em>
            </h1>
            <p>{mode.subtitle}</p>
          </div>
        </div>
        <label className="mode-selector">
          <ModeIcon mode={mode.id} />
          <span className="sr-only">Modo de pilotagem</span>
          <select
            aria-label="Modo de pilotagem"
            value={mode.id}
            disabled={busy}
            onChange={(e) => selectMode(e.target.value)}
          >
            {rideModes.map((mode) => (
              <option value={mode.id} key={mode.id}>
                Modo {mode.name}
              </option>
            ))}
          </select>
          <ChevronDown size={18} />
        </label>
      </div>
      <section
        className="ride-preparation panel"
        aria-label="Preparação do Ride"
      >
        <h2>
          {activity
            ? `${activity.bike.brand} ${activity.bike.model}`
            : 'Prepare seu Ride'}
        </h2>
        {!activity &&
          (!user ? (
            <p>
              <Link className="text-link" to="/entrar">
                Entre na conta para iniciar uma sessão
              </Link>
            </p>
          ) : garage.loading ? (
            <p>Carregando garagem…</p>
          ) : garage.error && !garage.offline ? (
            <p role="alert">
              {garage.error}{' '}
              <button
                className="text-link"
                onClick={() => void garage.refresh()}
              >
                Tentar carregar garagem
              </button>
            </p>
          ) : !bike ? (
            <p>
              <Link className="text-link" to="/garagem/nova">
                Cadastre uma moto para iniciar
              </Link>
            </p>
          ) : (
            <div className="ride-bike-selection">
              <MotorcyclePhoto bike={bike} />
              <div>
                <label>
                  Moto da garagem
                  <select
                    aria-label="Moto da garagem"
                    value={bike.id}
                    disabled={busy}
                    onChange={(e) => {
                      const next = new URLSearchParams(params);
                      next.set('moto', e.target.value);
                      setParams(next);
                    }}
                  >
                    {garage.motorcycles.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.brand} {b.model}
                        {b.isPrimary ? ' · Principal' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <p>
                  {bike.brand} {bike.model} · {bike.year} ·{' '}
                  {bike.displacementCc} cc
                </p>
              </div>
            </div>
          ))}
        <p>
          {activity
            ? `Registro local incremental. Tempo total: ${formatDuration(metrics.elapsedMs)}. Finalize para revisar e escolher salvar.`
            : 'Configure a moto e o modo antes de se deslocar. O início aguarda uma posição GPS utilizável.'}
        </p>
        {snapshot.error && <p role="alert">{snapshot.error}</p>}
        <SpeedSettings />
        {!activity && garage.offline && (
          <p>
            Motos previamente autorizadas neste aparelho. A garagem será
            validada pelo servidor ao sincronizar.
          </p>
        )}
      </section>
      <VideoPanel preparation />
      <MotionPreparation />
      <div className="ride-status">
        <span className="demo-live">
          <span />
          {activity ? 'SESSÃO GPS' : 'PRÉVIA GPS'}
        </span>
        <span className="preview-state">
          {snapshot.state === 'running'
            ? 'Em andamento'
            : snapshot.state === 'paused'
              ? 'Pausado'
              : snapshot.state === 'waiting-gps'
                ? 'Aguardando GPS'
                : 'Sem gravação ativa'}
        </span>
        <GpsIndicator status={gps.status} />
      </div>
      <div className="ride-dashboard">
        <div className="dashboard-side">
          <MetricCard
            icon={<Timer />}
            label="Tempo de ride"
            value={activity ? formatDuration(metrics.activeMs) : '—'}
          />
          <MetricCard
            icon={<Route />}
            label="Distância"
            value={activity ? (metrics.distanceMeters / 1000).toFixed(2) : '—'}
            unit="km"
          />
        </div>
        <SpeedDisplay />
        <div className="dashboard-side">
          <MetricCard
            icon={<Gauge />}
            label="Vel. média"
            value={metrics.averageKmh?.toFixed(1) ?? '—'}
            unit="km/h"
          />
          <MetricCard
            icon={<Gauge />}
            label="Vel. máxima"
            value={metrics.maximumKmh?.toFixed(1) ?? '—'}
            unit="km/h"
          />
        </div>
      </div>
      {RIDE_MODES[mode.id].advanced && (
        <>
          <div className="lean-grid">
            <MetricCard
              icon={<RideIcon size={42} />}
              label="Ângulo esquerdo"
              value="—"
              unit="°"
              progress={null}
            />
            <div className="bike-alignment" aria-hidden>
              <span />
              <RideIcon size={65} />
              <span />
            </div>
            <MetricCard
              icon={<RideIcon size={42} />}
              label="Ângulo direito"
              value="—"
              unit="°"
              progress={null}
            />
          </div>
          <MotionForceCards />
        </>
      )}
      <AdvancedResults />
      <div className="ride-preview-grid">
        <section className="panel">
          <RideMap gps={gps} plan={plan} />
        </section>
        <VideoPanel />
      </div>
      <div className="ride-controls">
        <button
          className="button pause-button"
          disabled={snapshot.state === 'waiting-gps'}
          onClick={
            activity
              ? snapshot.state === 'paused'
                ? controller.resume
                : controller.pause
              : gps.active
                ? controller.stopPreview
                : controller.activateGps
          }
          aria-pressed={gps.active}
          aria-describedby="gps-purpose"
        >
          {gps.active ? <Square fill="currentColor" /> : <LocateFixed />}
          <span>
            {activity
              ? snapshot.state === 'paused'
                ? 'Continuar'
                : 'Pausar'
              : gps.active
                ? 'Encerrar GPS'
                : 'Ativar GPS'}
          </span>
        </button>
        <button
          className="button record-button"
          disabled={
            busy ||
            !user ||
            !bike ||
            (Boolean(eventId) && snapshot.selectedEvent?.id !== eventId) ||
            (Boolean(routeId) && snapshot.selectedRoute?.id !== routeId) ||
            garage.loading ||
            (Boolean(garage.error) && !garage.offline)
          }
          onClick={() =>
            controller.start(
              user?.id ?? '',
              bike,
              mode.id,
              user?.privacy.activityVisibility ?? 'public',
            )
          }
        >
          <Square fill="currentColor" />
          <span>Iniciar Ride</span>
        </button>
        <button
          className="button save-button"
          disabled={!activity}
          onClick={() => {
            if (window.confirm('Finalizar a atividade e abrir o resumo?'))
              controller.finish();
          }}
        >
          <Flag />
          <span>Finalizar</span>
        </button>
      </div>
      {snapshot.state === 'waiting-gps' && (
        <button className="text-link" onClick={controller.cancelWaiting}>
          Cancelar espera do GPS
        </button>
      )}
      <div className="gps-details">
        <p role="status" aria-live="polite">
          {gps.message}
        </p>
        {gps.reading && (
          <p>
            Precisão horizontal: ±{Math.round(gps.reading.accuracy)} m · Última
            leitura:{' '}
            <time dateTime={new Date(gps.reading.timestamp).toISOString()}>
              {new Date(gps.reading.timestamp).toLocaleTimeString('pt-BR')}
            </time>
            .{gps.speedKmh === null && ' Velocidade indisponível.'}
          </p>
        )}
        {gps.active &&
          (gps.status === 'unavailable' || gps.status === 'stale') && (
            <button className="text-link" onClick={controller.retryGps}>
              Tentar GPS novamente
            </button>
          )}
        <p id="gps-purpose">
          O GPS só é solicitado por sua ação. Localização e atividade são
          gravadas no aparelho; o envio aguarda sua confirmação no resumo. A
          sessão é preservada ao navegar no Apex Ride. O provedor do mapa recebe
          a região visualizada. Alta precisão pode aumentar o consumo de
          bateria.
        </p>
      </div>
      <p className="ride-footnote">
        Força G estimada quando calibrada; inclinação dinâmica indisponível.
        Vídeo opcional conforme suporte do navegador. A recuperação inclui
        somente gravações locais confirmadas; as amostras mais recentes ainda em
        memória podem ser perdidas. O GPS pode ser interrompido com a tela
        bloqueada ou em segundo plano; trechos ausentes não serão reconstruídos.
      </p>
    </div>
  );
}
