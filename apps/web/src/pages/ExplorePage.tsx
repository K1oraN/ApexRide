import {
  Compass,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  MapPin,
  Plus,
  Route,
  SlidersHorizontal,
  Folder,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Coordinate } from '@apex-ride/ride-core/routes';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Input,
  SearchInput,
  SegmentedControl,
  Select,
} from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import { PersistedRouteCard } from '../components/routes/PersistedRouteCard';
import { SectionTitle } from '../components/ui';
import { useRide } from '../ride/context';
import { DestinationSearch } from '../routes/DestinationSearch';
import { routeService, type RouteRecord } from '../services/routes';
import '../styles/routes.css';
import '../styles/explore.css';
const tabs = [
  { value: 'route', label: 'Rotas', icon: <Route /> },
  { value: 'circuit', label: 'Circuitos', icon: <Flag /> },
  { value: 'destinations', label: 'Destinos', icon: <MapPin /> },
  { value: 'favorites', label: 'Favoritos', icon: <Heart /> },
  { value: 'mine', label: 'Meus percursos', icon: <Folder /> },
];
const defaults = {
  city: '',
  state: '',
  category: '',
  minDistance: '',
  maxDistance: '',
  sort: 'recent',
};
export function ExplorePage() {
  const { user } = useAuth(),
    { controller: ride } = useRide(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'route',
    query = params.get('q') ?? '';
  const filters = Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      params.get(key) ?? value,
    ]),
  ) as typeof defaults;
  const [draft, setDraft] = useState(defaults),
    [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState<RouteRecord[]>([]),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [center, setCenter] = useState<Coordinate | undefined>(),
    [locationMessage, setLocationMessage] = useState('');
  const [locationPoint, setLocationPoint] = useState<{
    coordinate: Coordinate;
    accuracy: number;
  } | null>(null);
  const pendingLocation = useRef(false),
    ownsGps = useRef(false);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => value !== defaults[key as keyof typeof defaults],
  ).length;
  function change(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.delete('rota');
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  }
  function releaseLocation() {
    if (
      ownsGps.current &&
      !ride.navigationGpsShared() &&
      !ride.gpsShared() &&
      !['running', 'waiting-gps'].includes(ride.getSnapshot().state)
    )
      ride.gps.stop();
    ownsGps.current = false;
  }
  useEffect(() => {
    const off = ride.gps.subscribe(() => {
      if (!pendingLocation.current) return;
      const gps = ride.gps.getSnapshot(),
        reading = gps.reading;
      if (
        gps.status === 'available' &&
        reading &&
        reading.accuracy <= 20 &&
        Date.now() - reading.timestamp <= 10000
      ) {
        const coordinate: Coordinate = [reading.longitude, reading.latitude];
        setCenter(coordinate);
        setLocationPoint({ coordinate, accuracy: reading.accuracy });
        setLocationMessage(
          `Posição atual · precisão aproximada de ${Math.round(reading.accuracy)} m. Não compartilhada.`,
        );
        pendingLocation.current = false;
      } else setLocationMessage(gps.message);
    });
    return () => {
      off();
      pendingLocation.current = false;
      if (
        ownsGps.current &&
        !ride.navigationGpsShared() &&
        !ride.gpsShared() &&
        !['running', 'waiting-gps'].includes(ride.getSnapshot().state)
      )
        ride.gps.stop();
    };
  }, [ride]);
  // Release our one-shot GPS after React commits the accepted location.
  useEffect(() => {
    if (locationPoint && !pendingLocation.current) releaseLocation();
  });
  const requestKey = new URLSearchParams(params);
  requestKey.delete('rota');
  const key = requestKey.toString();
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (tab === 'destinations') {
        setLoading(false);
        setRoutes([]);
        return;
      }
      setLoading(true);
      setError('');
      const q = new URLSearchParams(key);
      if (['route', 'circuit'].includes(tab)) q.set('kind', tab);
      else q.delete('kind');
      q.set('limit', '20');
      if (q.get('sort') === '') q.delete('sort');
      for (const field of ['minDistance', 'maxDistance'])
        if (q.get(field)) q.set(field, String(Number(q.get(field)) * 1000));
      void routeService
        .list(q, ['mine', 'favorites'].includes(tab) ? '/' + tab : '')
        .then((result) => {
          if (live) {
            setRoutes(result.routes);
            setMore(result.hasMore);
          }
        })
        .catch((e) => {
          if (live) {
            setRoutes([]);
            setError(e.message);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, tab, refresh, user?.id]);
  async function favorite(route: RouteRecord) {
    if (!user) {
      navigate('/entrar?retorno=%2Fexplorar');
      return;
    }
    try {
      await routeService.favorite(route.id, !route.favorite);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selected = routes.find((r) => r.id === params.get('rota'));
  return (
    <div className="explore-page explore-refined">
      <div className="explore-heading">
        <div>
          <p className="eyebrow">SEU PRÓXIMO DESTINO</p>
          <h1>
            EXPLORE <em>MAIS LONGE</em>
          </h1>
        </div>
        <Link className="text-link action-link" to="/comunidade/eventos">
          Eventos
        </Link>
      </div>
      {tab !== 'destinations' && (
        <div className="search-row">
          <SearchInput
            label="Buscar percursos cadastrados"
            maxLength={120}
            placeholder="Para onde vamos? Rotas, cidades e circuitos"
            value={query}
            onChange={(e) => change({ q: e.target.value })}
          />
          <Button
            aria-expanded={open}
            aria-label={`Filtros${activeFilters ? ` · ${activeFilters} ativos` : ''}`}
            onClick={() => {
              setDraft(filters);
              setOpen(true);
            }}
          >
            <SlidersHorizontal />
            <span>Filtros{activeFilters ? ` (${activeFilters})` : ''}</span>
          </Button>
        </div>
      )}
      {query && (
        <Button variant="ghost" onClick={() => change({ q: '' })}>
          Limpar busca de percursos
        </Button>
      )}
      <SegmentedControl
        label="Categorias de exploração"
        value={tab}
        onChange={(value) => {
          if (!user && ['mine', 'favorites', 'destinations'].includes(value)) {
            navigate('/entrar?retorno=%2Fexplorar');
            return;
          }
          change({ tab: value, q: '' });
        }}
        options={tabs}
      />
      {tab === 'destinations' && (
        <section className="panel destination-panel">
          <h2>Buscar um destino</h2>
          <DestinationSearch
            onSelect={(coordinate) => {
              setCenter(coordinate);
              setLocationPoint(null);
              navigate(`/explorar/navegar?destino=${coordinate.join(',')}`);
            }}
          />
        </section>
      )}
      <div className="explore-map-area">
        <div className="explore-map-heading">
          <div>
            <Compass />
            <span>
              <strong>Descubra novos destinos</strong>
              <small>Percursos reais. Novas possibilidades.</small>
            </span>
          </div>
          <ButtonLink variant="primary" to="/explorar/novo" size="lg">
            <Plus />
            Criar percurso
          </ButtonLink>
        </div>
        <RouteMap
          routes={routes}
          selected={params.get('rota') ?? undefined}
          onSelect={(id) => {
            const next = new URLSearchParams(params);
            next.set('rota', id);
            setParams(next);
          }}
          onBounds={(bbox) => change({ bbox })}
          caption="Seu próximo caminho"
          description="Selecione um percurso para explorar."
          centerPoint={center}
          points={
            locationPoint
              ? [
                  {
                    id: 'me',
                    coordinate: locationPoint.coordinate,
                    label: 'Posição consultada',
                    color: '#69b5ff',
                    radiusMeters: locationPoint.accuracy,
                    stale: true,
                  },
                ]
              : []
          }
        />
      </div>
      <div className="route-tools">
        <Button
          variant="secondary"
          onClick={() => {
            pendingLocation.current = true;
            ownsGps.current = !ride.gps.getSnapshot().active;
            setLocationMessage('Aguardando autorização e posição precisa…');
            ride.gps.start();
            const gps = ride.gps.getSnapshot();
            if (
              gps.status === 'denied' ||
              gps.status === 'unsupported' ||
              gps.status === 'insecure'
            )
              setLocationMessage(gps.message);
          }}
        >
          <MapPin />
          Minha localização
        </Button>
        <ButtonLink variant="outline" to="/explorar/navegar">
          Planejar navegação
        </ButtonLink>
        {params.get('bbox') && (
          <Button variant="ghost" onClick={() => change({ bbox: '' })}>
            Remover região do mapa
          </Button>
        )}
      </div>
      {locationMessage && <p role="status">{locationMessage}</p>}
      {selected && (
        <section className="panel selected-route">
          <strong>{selected.name}</strong>
          <div className="route-tools">
            <ButtonLink to={`/explorar/${selected.id}`}>
              Abrir detalhes do percurso
            </ButtonLink>
            {selected.kind === 'route' && (
              <ButtonLink
                variant="primary"
                to={`/explorar/navegar?percurso=${selected.id}`}
              >
                Navegar
              </ButtonLink>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('rota');
                setParams(next);
              }}
            >
              Fechar seleção
            </Button>
          </div>
        </section>
      )}
      {tab !== 'destinations' && (
        <section>
          <SectionTitle icon={tab === 'circuit' ? Flag : Route}>
            {query || activeFilters
              ? 'RESULTADOS · FILTROS ATIVOS'
              : tab === 'mine'
                ? 'MEUS PERCURSOS'
                : tab === 'favorites'
                  ? 'SEUS FAVORITOS'
                  : tab === 'circuit'
                    ? 'CIRCUITOS CADASTRADOS'
                    : 'ROTAS EM DESTAQUE'}
          </SectionTitle>
          {loading ? (
            <p role="status">Carregando percursos…</p>
          ) : error ? (
            <div className="panel empty-state" role="alert">
              <p>{error}</p>
              <Button onClick={() => setRefresh((n) => n + 1)}>
                Tentar novamente
              </Button>
            </div>
          ) : routes.length ? (
            <div className="route-grid">
              {routes.map((route, index) => (
                <PersistedRouteCard
                  key={route.id}
                  route={route}
                  featured={index === 0 && !query}
                  onFavorite={(r) => void favorite(r)}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nenhuma rota encontrada">
              Tente outro nome, cidade ou filtro. Apenas percursos aprovados
              aparecem publicamente. Crie seu primeiro rascunho pelo botão
              próximo ao mapa.
            </EmptyState>
          )}
          <nav className="page-pagination" aria-label="Páginas de percursos">
            <Button
              disabled={page === 1 || loading}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page - 1));
                setParams(next);
              }}
            >
              <ChevronLeft aria-hidden />
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              disabled={!more || loading}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page + 1));
                setParams(next);
              }}
            >
              Próxima
              <ChevronRight aria-hidden />
            </Button>
          </nav>
        </section>
      )}
      {user?.administrativeAccess && (
        <Link className="text-link action-link" to="/admin/routes">
          Moderação de percursos
        </Link>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Filtrar percursos"
        variant="drawer"
      >
        <form
          className="explore-filter-form"
          onSubmit={(e) => {
            e.preventDefault();
            change(draft);
            setOpen(false);
          }}
        >
          <label>
            Estado (UF)
            <Input
              value={draft.state}
              maxLength={2}
              pattern="[A-Za-z]{2}|"
              onChange={(e) =>
                setDraft({ ...draft, state: e.target.value.toUpperCase() })
              }
              placeholder="Todo o Brasil"
            />
          </label>
          <label>
            Cidade
            <Input
              value={draft.city}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            />
          </label>
          <label>
            Categoria
            <Input
              value={draft.category}
              maxLength={60}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder="Ex.: Turismo"
            />
          </label>
          <div className="coordinate-form">
            {(['minDistance', 'maxDistance'] as const).map((field) => (
              <label key={field}>
                {field === 'minDistance'
                  ? 'Distância mínima (km)'
                  : 'Distância máxima (km)'}
                <Input
                  type="number"
                  min="0"
                  max="5000"
                  step="0.1"
                  value={draft[field]}
                  onChange={(e) =>
                    setDraft({ ...draft, [field]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Ordenação
            <Select
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
            >
              <option value="recent">Mais recentes</option>
              <option value="favorites">Mais favoritados</option>
              <option value="shortest">Menor distância</option>
              <option value="longest">Maior distância</option>
            </Select>
          </label>
          <div className="route-tools">
            <Button type="submit" variant="primary">
              Aplicar filtros
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(defaults);
                change({ ...defaults, bbox: '', q: '' });
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
