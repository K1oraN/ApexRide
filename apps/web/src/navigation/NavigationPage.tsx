import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Navigation,
  Volume2,
  VolumeX,
  ArrowUp,
  Trash2,
  Route,
} from 'lucide-react';
import { validCoordinate, type Coordinate } from '@apex-ride/ride-core/routes';
import { useAuth } from '../auth/useAuth';
import { Button, ButtonLink, Input } from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import { DestinationSearch } from '../routes/DestinationSearch';
import { useRide } from '../ride/context';
import { routeService } from '../services/routes';
import { useNavigation } from './context';
import '../styles/explore.css';
import '../styles/navigation.css';
const states = {
  idle: 'Defina seu destino',
  planning: 'Calculando itinerário',
  ready: 'Pronto para navegar',
  navigating: 'Navegação ativa',
  inaccurate: 'Aguardando GPS confiável',
  'off-route': 'Fora da rota',
  recalculating: 'Recalculando',
  offline: 'Sem conexão',
  arrived: 'Você chegou',
  paused: 'Orientação suspensa',
  ended: 'Navegação encerrada',
  error: 'Cálculo indisponível',
};
const meters = (value: number | null) =>
  value === null
    ? '—'
    : value >= 1000
      ? `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
      : `${Math.round(value)} m`;
export function NavigationPage() {
  const navigation = useNavigation(),
    snapshot = useSyncExternalStore(
      navigation.subscribe,
      navigation.getSnapshot,
    ),
    { snapshot: ride } = useRide(),
    { user } = useAuth();
  const [params] = useSearchParams(),
    routeId = params.get('percurso');
  const [points, setPoints] = useState<Coordinate[]>(() => {
      const input = params.get('destino')?.split(',').map(Number);
      return validCoordinate(input)
        ? [input]
        : (navigation.getSnapshot().plan?.waypoints ?? []);
    }),
    [name, setName] = useState(
      () => navigation.getSnapshot().name || 'Meu destino',
    ),
    [error, setError] = useState(''),
    [voice, setVoice] = useState(false),
    [approved, setApproved] = useState(false),
    [follow, setFollow] = useState(true);
  const [restore, setRestore] = useState<{
    points: Coordinate[];
    name: string;
  } | null>(() => {
    try {
      const raw = sessionStorage.getItem(
        `apex.navigation.plan.${user?.id ?? 'none'}`,
      );
      const value = raw ? JSON.parse(raw) : null;
      if (
        value &&
        Array.isArray(value.points) &&
        value.points.length >= 2 &&
        value.points.length <= 25 &&
        value.points.every(validCoordinate) &&
        typeof value.name === 'string'
      )
        return value;
    } catch {
      /* Optional local plan. */
    }
    return null;
  });
  const spoken = useRef('');
  const storageKey = `apex.navigation.plan.${user?.id ?? 'none'}`;
  function endNavigation() {
    navigation.end();
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional local storage. */
    }
  }
  useEffect(() => {
    let live = true;
    if (navigation.isActive()) return;
    if (routeId)
      void routeService
        .detail(routeId)
        .then(({ route }) => {
          if (live) {
            setPoints(route.waypoints);
            setName(route.name);
            setApproved(route.status === 'approved');
            if (route.kind === 'circuit') {
              setPoints([]);
              setError(
                'Circuitos são acompanhados no modo pista do Ride, respeitando sua verificação.',
              );
            }
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [routeId, params, navigation]);
  async function calculate() {
    setError('');
    await navigation.plan(points, name);
    if (navigation.getSnapshot().state === 'ready') {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ points, name }));
      } catch {
        /* In-memory navigation remains usable. */
      }
    }
  }
  const instruction = snapshot.plan?.maneuvers[snapshot.nextIndex];
  const reliable =
    snapshot.state === 'navigating' && snapshot.nextDistance !== null;
  useEffect(() => {
    if (!voice || !reliable || !instruction || !('speechSynthesis' in window)) {
      window.speechSynthesis?.cancel();
      spoken.current = '';
      return;
    }
    const bucket =
      snapshot.nextDistance! < 80
        ? 'near'
        : snapshot.nextDistance! < 400
          ? 'approach'
          : 'far';
    const key = `${snapshot.plan?.geometry.coordinates[0]?.join(',')}:${snapshot.nextIndex}:${bucket}`;
    if (spoken.current === key) return;
    spoken.current = key;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `${instruction.instruction}. Em ${meters(snapshot.nextDistance)}.`,
    );
    utterance.lang = 'pt-BR';
    window.speechSynthesis.speak(utterance);
  }, [
    voice,
    reliable,
    instruction,
    snapshot.nextDistance,
    snapshot.nextIndex,
    snapshot.plan,
  ]);
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const reading = snapshot.reading;
  const fresh =
    reading &&
    reading.accuracy <= 20 &&
    !['inaccurate', 'offline'].includes(snapshot.state);
  const location: Coordinate | undefined = fresh
    ? [reading.longitude, reading.latitude]
    : undefined;
  return (
    <section className="navigation-page" data-active={snapshot.active}>
      <div className="navigation-title">
        <Link to="/explorar" className="text-link action-link">
          Voltar para Explorar
        </Link>
        <span>{states[snapshot.state]}</span>
      </div>
      <div className="navigation-heading">
        <h1>{snapshot.active ? snapshot.name : 'Planejar navegação'}</h1>
      </div>
      {snapshot.active || ['arrived', 'paused'].includes(snapshot.state) ? (
        <>
          <div
            className={`navigation-instruction panel ${reliable ? 'reliable' : ''}`}
            role="status"
          >
            <Navigation size={36} />
            <div>
              <strong>
                {snapshot.state === 'arrived'
                  ? 'Você chegou ao destino'
                  : reliable && instruction
                    ? instruction.instruction
                    : states[snapshot.state]}
              </strong>
              <span>
                {reliable
                  ? meters(snapshot.nextDistance)
                  : 'Orientação por manobras suspensa'}
              </span>
            </div>
          </div>
          <p role="status">{snapshot.message}</p>
          {snapshot.active && (
            <div className="navigation-primary-actions">
              <Button size="lg" onClick={navigation.pause}>
                Suspender orientação
              </Button>
              <Button size="lg" variant="destructive" onClick={endNavigation}>
                Encerrar navegação
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {snapshot.message && <p role="status">{snapshot.message}</p>}
          {restore && !points.length && (
            <div className="panel destination-panel">
              <p>
                Há um planejamento desta conta salvo nesta aba. A posição GPS
                não foi armazenada. Recalcule para retomar.
              </p>
              <Button
                onClick={() => {
                  setPoints(restore.points);
                  setName(restore.name);
                  setRestore(null);
                }}
              >
                Revisar planejamento anterior
              </Button>
            </div>
          )}
          <details className="navigation-plan-card panel" open={!routeId}>
            <summary>
              <Route size={20} aria-hidden />
              <span>Origem, paradas e destino</span>
              <small>{points.length} ponto(s)</small>
            </summary>
            <DestinationSearch
              disabled={snapshot.state === 'planning'}
              onSelect={(point) => {
                if (points.length < 25) setPoints([...points, point]);
                else setError('Máximo de 25 pontos.');
              }}
            />
            <ol className="navigation-waypoints">
              {points.map((point, index) => (
                <li key={index}>
                  <span>
                    {index === 0
                      ? 'Origem'
                      : index === points.length - 1
                        ? 'Destino'
                        : `Parada ${index}`}{' '}
                    · {point[1].toFixed(4)}, {point[0].toFixed(4)}
                  </span>
                  <div className="route-tools">
                    <Button
                      aria-label={`Subir ponto ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...points];
                        [next[index - 1], next[index]] = [
                          next[index]!,
                          next[index - 1]!,
                        ];
                        setPoints(next);
                      }}
                    >
                      <ArrowUp size={17} aria-hidden />
                    </Button>
                    <Button
                      aria-label={`Remover ponto ${index + 1}`}
                      onClick={() =>
                        setPoints(points.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 size={17} aria-hidden />
                      <span>Remover</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </details>
          <label className="navigation-name-field">
            Nome do destino
            <Input
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button
            variant="primary"
            size="lg"
            disabled={
              points.length < 2 ||
              snapshot.state === 'planning' ||
              !navigator.onLine
            }
            className="navigation-calculate"
            onClick={() => void calculate()}
          >
            <Navigation size={20} aria-hidden />
            Calcular itinerário com instruções
          </Button>
        </>
      )}
      <RouteMap
        routes={
          snapshot.plan
            ? [{ id: 'navigation', geometry: snapshot.plan.geometry }]
            : []
        }
        selected="navigation"
        waypoints={snapshot.plan?.waypoints ?? points}
        onPoint={
          !snapshot.active && !['paused', 'arrived'].includes(snapshot.state)
            ? (point) => {
                if (points.length < 25) setPoints([...points, point]);
              }
            : undefined
        }
        points={
          location
            ? [
                {
                  id: 'me',
                  coordinate: location,
                  label: 'Sua posição',
                  color: '#65baff',
                  radiusMeters: reading!.accuracy,
                },
              ]
            : []
        }
        centerPoint={follow ? location : undefined}
        follow={follow}
        caption="Navegação Apex Ride"
        description="Rota planejada · confira sempre a sinalização."
      />
      {snapshot.plan && (
        <>
          <div className="navigation-summary panel">
            <div>
              <span>Restante</span>
              <strong>{meters(snapshot.remaining)}</strong>
            </div>
            <div>
              <span>Tempo aproximado</span>
              <strong>
                {snapshot.remainingSeconds === null
                  ? '—'
                  : `~${Math.ceil(snapshot.remainingSeconds / 60)} min`}
              </strong>
            </div>
            <div>
              <span>GPS</span>
              <strong>
                {fresh ? `±${Math.round(reading!.accuracy)} m` : 'Aguardando'}
              </strong>
            </div>
          </div>
          <div className="navigation-actions">
            {!snapshot.active && snapshot.state !== 'arrived' && (
              <Button
                variant="primary"
                size="lg"
                disabled={
                  !['ready', 'paused', 'ended'].includes(snapshot.state)
                }
                onClick={navigation.start}
              >
                {snapshot.state === 'paused'
                  ? 'Retomar orientação'
                  : 'Iniciar somente navegação'}
              </Button>
            )}
            {snapshot.active && (
              <>
                <Button
                  size="lg"
                  disabled={
                    !navigator.onLine ||
                    !fresh ||
                    snapshot.state === 'recalculating'
                  }
                  onClick={() => void navigation.recalculate()}
                >
                  Recalcular percurso
                </Button>
              </>
            )}
            {!snapshot.active && (
              <Button size="lg" onClick={endNavigation}>
                Encerrar navegação
              </Button>
            )}
            <Button onClick={() => setFollow(!follow)}>
              {follow ? 'Explorar mapa livremente' : 'Seguir minha posição'}
            </Button>
            {'speechSynthesis' in window ? (
              <Button
                aria-pressed={voice}
                onClick={() => {
                  spoken.current = '';
                  setVoice(!voice);
                  window.speechSynthesis.cancel();
                }}
              >
                {voice ? <Volume2 /> : <VolumeX />}
                {voice ? 'Desativar voz' : 'Ativar voz'}
              </Button>
            ) : (
              <p>Orientação por voz indisponível neste navegador.</p>
            )}
            <ButtonLink
              variant="outline"
              to={routeId && approved ? `/ride?percurso=${routeId}` : '/ride'}
            >
              {ride.activity
                ? 'Abrir Ride em andamento'
                : 'Navegar e registrar Ride'}
            </ButtonLink>
          </div>
          <p>
            O Ride tem início, pausa e finalização próprios no seu painel.
            Encerrar navegação preserva a gravação.
          </p>
        </>
      )}
    </section>
  );
}
