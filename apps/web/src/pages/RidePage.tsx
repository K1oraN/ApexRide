import { ChoiceSelect } from '../components/design-system';
import { LocateFixed, Pause, Play, Route, Square, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { RacingFlagIcon as Flag, RideIcon } from '../components/Brand';
import { Button, ButtonLink, Select } from '../components/design-system';
import { RideMap } from '../components/maps/RideMap';
import { GpsIndicator } from '../components/telemetry/GpsIndicator';
import { rideModes, type RideMode } from '../data/demo';
import { events } from '../events/service';
import type { SocialEvent } from '../events/types';
import { useGarage } from '../garage/context';
import { MotorcyclePhoto } from '../garage/MotorcycleCard';
import { OfflinePanel } from '../offline/OfflinePanel';
import { useRide } from '../ride/context';
import { rideGps, rideMetrics } from '../ride/controller';
import { formatDuration } from '../ride/format';
import { MotionPreparation } from '../ride/MotionPreparation';
import { RideSummary } from '../ride/RideSummary';
import { RideDashboard } from '../ride/RideDashboard';
import { RideCircuitPanel } from '../ride/RideCircuitPanel';
import { RideSectionNav } from '../ride/RideSectionNav';
import { SpeedSettings } from '../ride/SpeedSettings';
import { authRequest } from '../services/auth';
import { routeService } from '../services/routes';
import { ActiveVideoPanel, VideoPanel } from '../video/VideoPanel';
import '../styles/ride-session.css';
import '../styles/routes.css';
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
  const [videoOpen, setVideoOpen] = useState(false);
  function selectMode(value: string) {
    const next = new URLSearchParams(params);
    next.set('modo', value as RideMode);
    setParams(next);
  }
  if (activity && user?.id !== activity.ownerId) return null;
  if (activity?.payload.endedAt)
    return (
      <div className="ride-page ride-workspace">
        <RideSectionNav />
        <RideSummary />
        <OfflinePanel compact />
      </div>
    );
  const preparing = !activity && snapshot.state !== 'waiting-gps';
  const waiting = snapshot.state === 'waiting-gps';
  const paused = snapshot.state === 'paused';
  return (
    <div className={`ride-page ride-workspace ride-state-${snapshot.state}`}>
      <RideSectionNav />
      <div className="ride-workspace-heading">
        <div>
          <span className="eyebrow">SUA PRÓXIMA EXPERIÊNCIA</span>
          <h1>
            {activity || waiting ? 'RIDE ' : 'PREPARE SEU '}
            <em>
              {waiting
                ? 'AGUARDANDO GPS'
                : activity
                  ? paused
                    ? 'PAUSADO'
                    : 'ATIVO'
                  : 'RIDE'}
            </em>
          </h1>
        </div>
        <div className="ride-mode-choices">
          {preparing ? (
            <ChoiceSelect
              aria-label="Modo de pilotagem"
              value={mode.id}
              disabled={busy}
              onChange={(e) => selectMode(e.target.value)}
            >
              {rideModes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </ChoiceSelect>
          ) : (
            <span className="chip">{mode.name}</span>
          )}
        </div>
      </div>
      {routeError && <p role="alert">{routeError}</p>}
      {preparing && (
        <section
          className="ride-preparation panel ride-preflight"
          aria-label="Preparação do Ride"
        >
          <h2>Moto e contexto</h2>
          {garage.loading ? (
            <p role="status">Carregando garagem…</p>
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
            <div className="ride-no-bike">
              <p>Escolha a moto que vai acompanhar você.</p>
              <ButtonLink to="/garagem/nova" variant="secondary">
                Cadastre uma moto para iniciar
              </ButtonLink>
            </div>
          ) : (
            <div className="ride-bike-selection">
              <MotorcyclePhoto bike={bike} />
              <label>
                Moto da garagem
                <Select
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
                </Select>
                <small>
                  {bike.year} · {bike.displacementCc} cc
                </small>
              </label>
            </div>
          )}
          <div className="ride-context-choice">
            <span>Contexto da atividade</span>
            <div aria-label="Contexto da atividade" role="group">
              <Button
                variant={
                  !plan && !snapshot.selectedEvent ? 'primary' : 'secondary'
                }
                onClick={() => {
                  controller.selectEvent(null);
                  controller.selectRoute(null);
                  const next = new URLSearchParams(params);
                  next.delete('evento');
                  next.delete('percurso');
                  setParams(next);
                }}
              >
                Livre
              </Button>
              <ButtonLink
                variant={
                  plan && !snapshot.selectedEvent ? 'primary' : 'secondary'
                }
                to="/explorar"
              >
                Com rota
              </ButtonLink>
              <ButtonLink
                variant={snapshot.selectedEvent ? 'primary' : 'secondary'}
                to="/comunidade/eventos"
              >
                Com evento
              </ButtonLink>
            </div>
          </div>
          <div className="ride-preflight-gps">
            <GpsIndicator status={gps.status} />
            <span>
              GPS suficiente para iniciar · câmera e sensores opcionais
            </span>
          </div>
          <div className="ride-start-actions">
            <Button
              variant="primary"
              size="xl"
              className="record-button"
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
              <RideIcon />
              <span>Iniciar Ride</span>
              <Play size={18} aria-hidden />
            </Button>
            <Button
              variant="secondary"
              onClick={
                gps.active ? controller.stopPreview : controller.activateGps
              }
            >
              {gps.active ? <Square /> : <LocateFixed />}
              {gps.active ? 'Encerrar GPS' : 'Ativar GPS'}
            </Button>
          </div>
          {garage.offline && (
            <p>
              Motos previamente autorizadas neste aparelho. A garagem será
              validada pelo servidor ao sincronizar.
            </p>
          )}
        </section>
      )}
      {(activity || waiting) && (
        <section className="ride-status panel" aria-label="Estado da sessão">
          <span className="ride-record-indicator" aria-hidden>
            {snapshot.state === 'running' ? (
              <Square fill="currentColor" />
            ) : paused ? (
              <Pause />
            ) : (
              <LocateFixed />
            )}
          </span>
          <div>
            <strong className="preview-state">
              {snapshot.state === 'running'
                ? 'Em andamento'
                : paused
                  ? 'Pausado'
                  : 'Aguardando GPS'}
            </strong>
            <span>
              {activity
                ? `${activity.bike.brand} ${activity.bike.model} · ${mode.name}`
                : 'O registro começa após uma posição válida'}
            </span>
          </div>
          <div className="ride-status-clock">
            <Timer size={16} aria-hidden />
            <strong>
              {activity ? formatDuration(rideMetrics(snapshot).activeMs) : '—'}
            </strong>
          </div>
          <GpsIndicator status={gps.status} />
        </section>
      )}
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      {waiting && (
        <Button variant="secondary" onClick={controller.cancelWaiting}>
          Cancelar espera do GPS
        </Button>
      )}
      <RideDashboard
        mode={mode.id}
        controls={
          activity && (
            <div className="ride-controls ride-active-controls">
              <Button
                variant={paused ? 'primary' : 'secondary'}
                disabled={waiting}
                onClick={paused ? controller.resume : controller.pause}
              >
                {paused ? <Play /> : <Pause />}
                <span>{paused ? 'Continuar' : 'Pausar'}</span>
              </Button>
              <Button
                variant="secondary"
                className="ride-finish-button"
                onClick={() => {
                  if (window.confirm('Finalizar a atividade e abrir o resumo?'))
                    controller.finish();
                }}
              >
                <Flag />
                <span>Finalizar</span>
              </Button>
            </div>
          )
        }
      />

      {plan && (
        <section
          className="panel route-progress"
          aria-label="Acompanhamento da rota"
        >
          <h2>
            <Route size={20} aria-hidden />
            {plan.name}
          </h2>
          <p>
            {snapshot.activity?.payload.route?.abandoned
              ? 'Acompanhamento abandonado · GPS da sessão continua.'
              : snapshot.routeProgress?.completed
                ? 'Rota concluída · a sessão continua'
                : snapshot.routeProgress?.determinate
                  ? `${Math.round(snapshot.routeProgress.percent)}% aproximado · ${(snapshot.routeProgress.remaining / 1000).toFixed(1)} km restantes`
                  : 'Progresso temporariamente indeterminado'}
          </p>
          <progress
            max="100"
            value={
              snapshot.routeProgress?.determinate
                ? snapshot.routeProgress.percent
                : undefined
            }
          />
          {!activity && !waiting && (
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
          )}
          {paused && (
            <button className="text-link" onClick={controller.abandonRoute}>
              Deixar de acompanhar rota
            </button>
          )}
          <Link className="text-link action-link" to="/explorar/navegar">
            Abrir navegação
          </Link>
        </section>
      )}
      {snapshot.selectedEvent && (
        <section className="panel route-progress">
          <p>
            Evento:{' '}
            <Link
              className="text-link action-link"
              to={`/comunidade/eventos/${snapshot.selectedEvent.id}`}
            >
              {snapshot.selectedEvent.title}
            </Link>
          </p>
          <small>Compartilhamento social exige autorização separada.</small>
          {!activity && !waiting && (
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
      {(preparing || paused) && (
        <section
          className="ride-optional-settings"
          aria-label="Configurações opcionais"
        >
          <details
            data-ride-setting="video"
            open={videoOpen}
            onToggle={(e) => setVideoOpen(e.currentTarget.open)}
          >
            <summary>Vídeo opcional</summary>
            <VideoPanel preparation />
            <VideoPanel />
          </details>
          {preparing && (
            <>
              <details data-ride-setting="motion">
                <summary>Diagnóstico e calibração de sensores</summary>
                <MotionPreparation />
              </details>
              <details data-ride-setting="speed">
                <summary>GPS Puro ou Assistido</summary>
                <SpeedSettings />
              </details>
            </>
          )}
        </section>
      )}
      {activity && !paused && <ActiveVideoPanel />}
      <section className="panel ride-map-panel">
        <RideMap gps={gps} plan={plan} />
      </section>
      {mode.id === 'pista' && <RideCircuitPanel />}
      <div className="gps-details">
        <p role="status">{gps.message}</p>
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
      </div>
      <OfflinePanel compact />
    </div>
  );
}
