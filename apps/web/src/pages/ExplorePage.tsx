import { useEffect, useState } from 'react';
import {
  Flame,
  Mountain,
  Radio,
  Route,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { RacingFlagIcon as Flag } from '../components/Brand';
import { RouteMap } from '../components/maps/RouteMap';
import { PersistedRouteCard } from '../components/routes/PersistedRouteCard';
import { Popover, SectionTitle } from '../components/ui';
import { routeService, type RouteRecord } from '../services/routes';
import { useAuth } from '../auth/useAuth';
import '../styles/routes.css';
import { CommunityDiscovery } from '../similarity/CommunityDiscovery';
const tabs = [
  { id: 'route', label: 'Rotas', icon: Route },
  { id: 'circuit', label: 'Circuitos', icon: Flag },
  { id: 'live', label: 'Ao vivo', icon: Radio },
  { id: 'popular', label: 'Popular', icon: Flame },
] as const;
export function ExplorePage() {
  const navigate = useNavigate(),
    { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(''),
    [tab, setTab] = useState('route');
  const [city, setCity] = useState(''),
    [state, setState] = useState(''),
    [sort, setSort] = useState('recent'),
    [scope, setScope] = useState('');
  const [near, setNear] = useState<[number, number] | null>(null),
    [bbox, setBbox] = useState('');
  const [routes, setRoutes] = useState<RouteRecord[]>([]),
    [featured, setFeatured] = useState<RouteRecord[]>([]);
  const [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const filtering =
    !!query ||
    tab !== 'route' ||
    !!city ||
    !!state ||
    !!scope ||
    !!near ||
    !!bbox ||
    sort !== 'recent';
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (tab === 'live') {
        setRoutes([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      const q = new URLSearchParams({
        q: query,
        city,
        state,
        sort: tab === 'popular' ? 'favorites' : sort,
        page: String(page),
        limit: '20',
      });
      if (tab !== 'popular') q.set('kind', tab);
      if (!filtering) q.set('state', 'AL');
      if (near) {
        q.set('lon', String(near[0]));
        q.set('lat', String(near[1]));
      }
      if (bbox) q.set('bbox', bbox);
      void Promise.all([
        routeService.list(q, scope),
        filtering
          ? Promise.resolve(null)
          : routeService.list(
              new URLSearchParams({ kind: 'circuit', limit: '1', state: 'AL' }),
            ),
      ])
        .then(([data, circuit]) => {
          if (live) {
            setRoutes(data.routes);
            setMore(data.hasMore);
            setFeatured(circuit?.routes ?? []);
          }
        })
        .catch((e) => {
          if (live) {
            setRoutes([]);
            setFeatured([]);
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
  }, [
    query,
    tab,
    city,
    state,
    sort,
    scope,
    near,
    bbox,
    page,
    refresh,
    filtering,
    user?.id,
  ]);
  function change(action: () => void) {
    setPage(1);
    action();
  }
  async function favorite(r: RouteRecord) {
    if (!user) {
      navigate('/entrar');
      return;
    }
    try {
      await routeService.favorite(r.id, !r.favorite);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function nearby() {
    if (!navigator.geolocation) {
      setError('GPS indisponível neste navegador.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        change(() => {
          setNear([p.coords.longitude, p.coords.latitude]);
          setSort('nearest');
          setBbox('');
        }),
      () =>
        setError('Localização não obtida. Você pode pesquisar pela cidade.'),
      { timeout: 15000, maximumAge: 60000, enableHighAccuracy: false },
    );
  }
  const cards = (items: RouteRecord[], compact = false) => (
    <div className="route-grid">
      {items.map((r) => (
        <PersistedRouteCard
          route={r}
          compact={compact}
          key={r.id}
          onFavorite={(r) => void favorite(r)}
        />
      ))}
    </div>
  );
  const empty = (
    <div className="empty-state panel" role="status">
      <Search size={30} />
      <h2>Nenhuma rota encontrada</h2>
      <p>
        Tente outro nome, cidade ou filtro. Apenas percursos aprovados aparecem
        publicamente.
      </p>
    </div>
  );
  return (
    <div className="explore-page">
      <h1 className="sr-only">Explorar rotas em Alagoas e no Brasil</h1>
      {user && <CommunityDiscovery />}
      <div className="search-row">
        <label className="search-input">
          <Search aria-hidden />
          <span className="sr-only">Pesquisar rotas, cidades ou lugares</span>
          <input
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            placeholder="Buscar rotas, cidades, praias ou pontos turísticos..."
            type="search"
            maxLength={120}
          />
        </label>
        <Popover
          label="Filtrar rotas"
          className="filter-popover"
          trigger={<SlidersHorizontal />}
        >
          <label className="filter-label">
            Cidade
            <input
              aria-label="Cidade"
              value={city}
              maxLength={120}
              onChange={(e) => change(() => setCity(e.target.value))}
            />
          </label>
          <label className="filter-label">
            Estado
            <input
              aria-label="Estado"
              value={state}
              maxLength={2}
              onChange={(e) =>
                change(() => setState(e.target.value.toUpperCase()))
              }
            />
          </label>
          <label className="filter-label">
            Ordenar
            <select
              value={sort}
              onChange={(e) => change(() => setSort(e.target.value))}
            >
              <option value="recent">Mais recentes</option>
              <option value="favorites">Mais favoritados</option>
              <option value="shortest">Menor distância</option>
              <option value="longest">Maior distância</option>
              {near && <option value="nearest">Mais próximos</option>}
            </select>
          </label>
          {user && (
            <label className="filter-label">
              Coleção
              <select
                value={scope}
                onChange={(e) => change(() => setScope(e.target.value))}
              >
                <option value="">Publicados</option>
                <option value="/mine">Meus percursos</option>
                <option value="/favorites">Favoritos</option>
              </select>
            </label>
          )}
          <button className="button" onClick={nearby}>
            Perto de mim
          </button>
          <button
            className="text-link"
            onClick={() =>
              change(() => {
                setNear(null);
                setBbox('');
                setCity('');
                setState('');
                setSort('recent');
                setScope('');
                setQuery('');
              })
            }
          >
            Limpar filtros
          </button>
          <Link className="text-link" to="/explorar/novo">
            Criar percurso
          </Link>
          {user?.administrativeAccess && (
            <Link className="text-link" to="/admin/routes">
              Moderação
            </Link>
          )}
        </Popover>
      </div>
      <div className="explore-tabs" aria-label="Categorias de exploração">
        <Link className="button" to="/comunidade/eventos">
          Eventos
        </Link>
        {tabs.map((t) => (
          <button
            className={`button ${tab === t.id ? 'button-primary' : ''}`}
            aria-pressed={tab === t.id}
            key={t.id}
            onClick={() => change(() => setTab(t.id))}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </div>
      <RouteMap
        routes={tab === 'live' ? [] : [...routes, ...featured]}
        selected={params.get('rota') ?? undefined}
        onSelect={(id) => setParams({ rota: id })}
        onBounds={(b) =>
          change(() => {
            setBbox(b);
            setNear(null);
            if (sort === 'nearest') setSort('recent');
          })
        }
      />
      {params.get('rota') && (
        <section className="selected-route panel">
          <Link className="button" to={`/explorar/${params.get('rota')}`}>
            Abrir detalhes do percurso
          </Link>
          <button className="button" onClick={() => setParams({})}>
            Fechar seleção
          </button>
        </section>
      )}
      {error && (
        <div className="empty-state panel" role="alert">
          <p>{error}</p>
          <button className="button" onClick={() => setRefresh((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty-state panel" role="status">
          Carregando percursos…
        </div>
      ) : tab === 'live' ? (
        <section className="search-results">
          <SectionTitle icon={Radio}>AO VIVO</SectionTitle>
          <div className="empty-state panel">
            <Radio size={34} />
            <h2>Nenhuma transmissão ativa</h2>
            <p>Localização ao vivo estará disponível em uma próxima etapa.</p>
          </div>
        </section>
      ) : filtering ? (
        <section className="search-results">
          <SectionTitle icon={tab === 'circuit' ? Flag : Route}>
            RESULTADOS · FILTROS ATIVOS
          </SectionTitle>
          {routes.length ? cards(routes) : !error && empty}
        </section>
      ) : (
        <>
          <section>
            <SectionTitle icon={Flag}>CIRCUITO EM DESTAQUE</SectionTitle>
            {featured[0] ? (
              <PersistedRouteCard
                route={featured[0]}
                featured
                onFavorite={(r) => void favorite(r)}
              />
            ) : (
              <div className="empty-state panel">
                Nenhum circuito aprovado em Alagoas disponível.
              </div>
            )}
          </section>
          <section>
            <SectionTitle
              icon={Route}
              aside={<span>Percursos cadastrados</span>}
            >
              ROTAS PRÓXIMAS
            </SectionTitle>
            {routes.length ? cards(routes.slice(0, 2)) : !error && empty}
          </section>
          <section>
            <SectionTitle icon={Mountain}>MAIS ROTAS EM ALAGOAS</SectionTitle>
            {cards(
              routes.slice(2).filter((r) => r.state === 'AL'),
              true,
            )}
          </section>
        </>
      )}
      {tab !== 'live' && (
        <div className="route-tools">
          <button
            className="button"
            disabled={page === 1 || loading}
            onClick={() => setPage((n) => n - 1)}
          >
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            className="button"
            disabled={!more || loading}
            onClick={() => setPage((n) => n + 1)}
          >
            Próxima
          </button>
          <Link className="text-link" to="/explorar/novo">
            Criar percurso
          </Link>
        </div>
      )}
    </div>
  );
}
