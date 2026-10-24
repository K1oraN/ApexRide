import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import type { GpsSnapshot } from '../../services/gps/preview';
import { RideMapController, type MapState } from './rideMapController';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../styles/gps.css';
import type { RoutePlan } from '@apex-ride/ride-core/routes';
import type { ReplayTimeline } from '../../replay/timeline';
import type { ReplayEngine } from '../../replay/engine';
import { OfflineReplayTrace } from '../../replay/OfflineReplayTrace';

export function RideMap({
  gps,
  plan = null,
  replay,
}: {
  gps: GpsSnapshot;
  plan?: RoutePlan | null;
  replay?: {
    timeline: ReplayTimeline;
    engine: ReplayEngine;
    reducedMotion: boolean;
  };
}) {
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<RideMapController | null>(null);
  const [state, setState] = useState<MapState>('loading');
  const [following, setFollowing] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const online = () => {
      if (state === 'error') setAttempt((n) => n + 1);
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [state]);
  useEffect(() => {
    const instance = new RideMapController(
      container.current!,
      setState,
      setFollowing,
    );
    controller.current = instance;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => instance.resize());
    observer?.observe(container.current!);
    return () => {
      observer?.disconnect();
      instance.destroy();
      controller.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    if (!replay) controller.current?.update(gps);
  }, [gps, attempt, replay]);
  useEffect(() => {
    if (!replay) return;
    const map = controller.current!;
    map.configureReplay(replay.timeline, replay.reducedMotion);
    const update = () => {
      const s = replay.engine.getSnapshot();
      map.updateReplay(s.time, s.state === 'playing');
      if (s.state === 'completed') map.replayOverview();
    };
    const offFrame = replay.engine.onFrame((time) => {
      if (!replay.reducedMotion)
        map.updateReplay(
          time,
          replay.engine.getSnapshot().state === 'playing',
          false,
        );
    });
    const offState = replay.engine.subscribe(update);
    update();
    return () => {
      offFrame();
      offState();
    };
  }, [replay, attempt]);
  useEffect(() => {
    controller.current?.setPlan(plan);
  }, [plan, attempt]);
  return (
    <div
      className="illustrative-map map-ride gps-map"
      role="region"
      aria-label={
        replay
          ? 'Mapa do replay privado'
          : gps.overview
            ? 'Mapa do percurso completo'
            : 'Mapa em tempo real da prévia GPS'
      }
    >
      <div className="gps-map-canvas" ref={container} />
      {state !== 'ready' &&
        gps.segments.length > 0 &&
        (replay ? (
          <OfflineReplayTrace
            timeline={replay.timeline}
            engine={replay.engine}
          />
        ) : (
          <OfflineTrace gps={gps} />
        ))}
      <div className="map-panel-title">
        <MapPin size={19} />
        <span>
          {replay
            ? 'REPLAY · PERCURSO REGISTRADO'
            : gps.overview
              ? 'PERCURSO REGISTRADO'
              : 'MAPA AO VIVO · GPS PURO'}
        </span>
      </div>
      <div className="map-controls">
        <button
          className="icon-button"
          aria-label={
            replay
              ? 'Acompanhar motocicleta no replay'
              : gps.overview
                ? 'Centralizar trajeto'
                : 'Acompanhar motociclista'
          }
          aria-pressed={following}
          disabled={(!replay && !gps.reading) || state !== 'ready'}
          onClick={() =>
            replay
              ? controller.current?.replayFollow()
              : controller.current?.recenter()
          }
        >
          <LocateFixed />
        </button>
        <button
          className="icon-button"
          aria-label="Ampliar mapa"
          disabled={state !== 'ready'}
          onClick={() => controller.current?.zoom(1)}
        >
          <Plus />
        </button>
        <button
          className="icon-button"
          aria-label="Reduzir mapa"
          disabled={state !== 'ready'}
          onClick={() => controller.current?.zoom(-1)}
        >
          <Minus />
        </button>
      </div>
      {replay && (
        <button
          className="button replay-overview"
          onClick={() => controller.current?.replayOverview()}
          disabled={state !== 'ready'}
        >
          Ver percurso completo
        </button>
      )}
      <span className="map-disclaimer">
        {replay
          ? following
            ? 'Acompanhamento disponível · arraste para explorar'
            : 'Explorando mapa · acompanhamento suspenso'
          : gps.overview
            ? 'Início I · Fim F · Trajeto registrado'
            : !gps.reading
              ? 'Vista inicial · Maceió/AL'
              : following
                ? 'Acompanhando motociclista'
                : 'Explorando mapa'}
      </span>
      {state !== 'ready' && (
        <div className="gps-map-notice" role="status">
          {state === 'loading' ? (
            'Carregando mapa…'
          ) : (
            <>
              <span>
                Mapa indisponível. GPS, coordenadas e traçado continuam no
                aparelho.
              </span>
              <button
                className="text-link"
                onClick={() => {
                  setState('loading');
                  setFollowing(true);
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar carregar mapa
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function OfflineTrace({ gps }: { gps: GpsSnapshot }) {
  const points = gps.segments.flat();
  const west = Math.min(...points.map((p) => p.longitude));
  const east = Math.max(...points.map((p) => p.longitude));
  const south = Math.min(...points.map((p) => p.latitude));
  const north = Math.max(...points.map((p) => p.latitude));
  const span = Math.max(
    (east - west) * Math.cos((south * Math.PI) / 180),
    north - south,
    0.0001,
  );
  return (
    <svg
      className="offline-trace"
      viewBox="0 0 300 180"
      role="img"
      aria-label="Traçado GPS local sem base cartográfica"
    >
      {gps.segments.map((segment, index) => (
        <polyline
          key={index}
          fill="none"
          stroke="#ff202b"
          strokeWidth="3"
          points={segment
            .map(
              (p) =>
                `${20 + (((p.longitude - west) * Math.cos((south * Math.PI) / 180)) / span) * 140},${160 - ((p.latitude - south) / span) * 140}`,
            )
            .join(' ')}
        />
      ))}
    </svg>
  );
}
