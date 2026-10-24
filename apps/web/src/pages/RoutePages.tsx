import { Navigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  Coordinate,
  RouteData,
  RouteRecord,
} from '@apex-ride/ride-core/routes';
import { lineLength } from '@apex-ride/ride-core/routes';
import { RouteMap } from '../components/maps/RouteMap';
import { routeService } from '../services/routes';
import { useAuth } from '../auth/useAuth';
import '../styles/routes.css';
import { CircuitResults } from '../gamification/CircuitResults';
const blank: RouteData = {
  name: '',
  description: '',
  city: '',
  state: '',
  category: 'Turismo',
  geometry: { type: 'LineString', coordinates: [] },
  waypoints: [],
  source: 'manual',
  durationSeconds: null,
  startLine: null,
  direction: null,
};
export function RouteEditorPage() {
  const { id } = useParams(),
    navigate = useNavigate();
  const [data, setData] = useState<RouteData>(blank),
    [kind, setKind] = useState('route'),
    [method, setMethod] = useState('osrm'),
    [gate, setGate] = useState(false),
    [gatePoints, setGatePoints] = useState<Coordinate[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(!id);
  useEffect(() => {
    let live = true;
    if (id)
      void routeService
        .detail(id)
        .then((r) => {
          if (live) {
            setData(r.route);
            setKind(r.route.kind);
            setMethod(r.route.source);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [id]);
  function points(next: Coordinate[]) {
    if (next.length > 25) {
      setError('Máximo de 25 pontos.');
      return;
    }
    setData((d) => ({
      ...d,
      waypoints: next,
      geometry: {
        type: 'LineString',
        coordinates: method === 'manual' ? next : [],
      },
      source: method === 'manual' ? 'manual' : 'osrm',
      durationSeconds: null,
    }));
  }
  function touch(p: Coordinate) {
    if (gate) {
      const next = [...gatePoints, p].slice(-2);
      setGatePoints(next);
      if (next.length === 2) {
        setData((d) => ({
          ...d,
          startLine: { type: 'LineString', coordinates: next },
        }));
        setGate(false);
      }
      return;
    }
    points([...data.waypoints, p]);
  }
  async function calculate() {
    setBusy(true);
    setError('');
    try {
      const result = await routeService.calculate(data.waypoints);
      setData((d) => ({ ...d, ...result }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await routeService.save(data, kind, id);
      navigate('/explorar/' + r.route.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const shapes = [
    ...(data.geometry.coordinates.length >= 2
      ? [{ id: 'draft', geometry: data.geometry }]
      : []),
    ...(data.startLine ? [{ id: 'gate', geometry: data.startLine }] : []),
  ];
  return (
    <section className="account-card panel route-editor">
      <h1>{id ? 'Editar percurso' : 'Criar percurso'}</h1>
      <Link className="text-link" to="/explorar">
        Voltar para Explorar
      </Link>
      {error && <p role="alert">{error}</p>}
      {!loaded ? (
        <p>Carregando editor…</p>
      ) : (
        <>
          <label>
            Tipo
            <select
              aria-label="Tipo"
              disabled={!!id || busy}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setData((d) => ({ ...d, startLine: null, direction: null }));
              }}
            >
              <option value="route">Rota</option>
              <option value="circuit">Sugerir circuito fechado</option>
            </select>
          </label>
          <label>
            Nome
            <input
              required
              maxLength={120}
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </label>
          <label>
            Descrição
            <textarea
              maxLength={4000}
              value={data.description}
              onChange={(e) =>
                setData({ ...data, description: e.target.value })
              }
            />
          </label>
          <label>
            Cidade
            <input
              maxLength={120}
              value={data.city}
              onChange={(e) => setData({ ...data, city: e.target.value })}
            />
          </label>
          <label>
            Estado (UF)
            <input
              maxLength={2}
              value={data.state}
              onChange={(e) =>
                setData({ ...data, state: e.target.value.toUpperCase() })
              }
            />
          </label>
          <label>
            Categoria
            <input
              maxLength={60}
              value={data.category}
              onChange={(e) => setData({ ...data, category: e.target.value })}
            />
          </label>
          <label>
            Traçado
            <select
              aria-label="Traçado"
              disabled={busy}
              value={method}
              onChange={(e) => {
                const m = e.target.value;
                setMethod(m);
                setData((d) => ({
                  ...d,
                  source: m as 'manual' | 'osrm',
                  geometry: {
                    type: 'LineString',
                    coordinates: m === 'manual' ? d.waypoints : [],
                  },
                  durationSeconds: null,
                }));
              }}
            >
              <option value="osrm">Calcular por vias existentes</option>
              <option value="manual">
                Desenho manual · sem validação viária
              </option>
            </select>
          </label>
          <p>
            Toque no mapa: o primeiro ponto é a origem, o último é o destino. Os
            demais são paradas. Reordene antes de calcular.
          </p>
          <RouteMap
            routes={shapes}
            selected="draft"
            onPoint={busy ? undefined : touch}
            waypoints={data.waypoints}
            gateLine={data.startLine}
          />
          <ol>
            {data.waypoints.map((p, i) => (
              <li key={`${i}-${p.join(',')}`}>
                {i === 0
                  ? 'Origem'
                  : i === data.waypoints.length - 1
                    ? 'Destino'
                    : `Parada ${i}`}{' '}
                <div className="route-tools">
                  <button
                    className="button"
                    aria-label={`Mover ponto ${i + 1} para cima`}
                    disabled={!i || busy}
                    onClick={() => {
                      const ps = [...data.waypoints];
                      [ps[i - 1], ps[i]] = [ps[i]!, ps[i - 1]!];
                      points(ps);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    className="button"
                    aria-label={`Mover ponto ${i + 1} para baixo`}
                    disabled={i === data.waypoints.length - 1 || busy}
                    onClick={() => {
                      const ps = [...data.waypoints];
                      [ps[i + 1], ps[i]] = [ps[i]!, ps[i + 1]!];
                      points(ps);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      points(data.waypoints.filter((_, n) => n !== i))
                    }
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ol>
          {method === 'osrm' ? (
            <>
              <button
                className="button"
                disabled={
                  busy || data.waypoints.length < 2 || !navigator.onLine
                }
                onClick={() => void calculate()}
              >
                Calcular caminho
              </button>
              <p>
                O perfil rodoviário depende do provedor e pode não contemplar
                restrições específicas de motocicletas. O resultado não garante
                acesso ou condições da via.
              </p>
            </>
          ) : (
            <p>
              Desenho manual: percurso definido por você, sem validação contra a
              malha viária. Não há duração estimada.
            </p>
          )}
          {kind === 'circuit' && (
            <>
              <p>
                Cadastre somente uma área fechada apropriada. Publicação e
                verificação para voltas são revisões distintas.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  setGatePoints([]);
                  setGate(true);
                }}
              >
                Definir linha de largada/chegada
              </button>
              <p>
                {gate
                  ? 'Toque em dois extremos da linha transversal à pista.'
                  : data.startLine
                    ? 'Linha definida.'
                    : 'Linha ainda não definida.'}
              </p>
              <label>
                Direção do cruzamento
                <select
                  value={data.direction ?? ''}
                  onChange={(e) =>
                    setData({
                      ...data,
                      direction: e.target.value
                        ? (Number(e.target.value) as 1 | -1)
                        : null,
                    })
                  }
                >
                  <option value="">Selecione</option>
                  <option value="1">
                    Do lado direito para o esquerdo da linha orientada A → B
                  </option>
                  <option value="-1">
                    Do lado esquerdo para o direito da linha orientada A → B
                  </option>
                </select>
              </label>
            </>
          )}
          {data.geometry.coordinates.length >= 2 && (
            <p>
              Distância aproximada:{' '}
              {(lineLength(data.geometry) / 1000).toLocaleString('pt-BR', {
                maximumFractionDigits: 2,
              })}{' '}
              km
            </p>
          )}
          {id && (
            <p>
              Salvar uma edição retira a publicação e a verificação até nova
              moderação.
            </p>
          )}
          <button
            className="button button-primary"
            disabled={
              busy ||
              !data.name.trim() ||
              data.geometry.coordinates.length < 2 ||
              !navigator.onLine
            }
            onClick={() => void save()}
          >
            {busy ? 'Processando…' : 'Salvar rascunho privado'}
          </button>
        </>
      )}
    </section>
  );
}
export function RouteDetailPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    { user } = useAuth();
  const [route, setRoute] = useState<RouteRecord | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    void routeService
      .detail(id!)
      .then((r) => {
        if (live) setRoute(r.route);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, refresh]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-card panel route-detail">
      <Link className="text-link" to="/explorar">
        Voltar para Explorar
      </Link>
      {error && <p role="alert">{error}</p>}
      {route ? (
        <>
          <h1>{route.name}</h1>
          {user && route.kind === 'circuit' && <CircuitResults id={route.id} />}
          <Link className="text-link" to={`/explorar/${route.id}/comparar`}>
            Comparar atividades nesta rota
          </Link>
          <p>{route.description}</p>
          <p>
            {route.city} / {route.state} ·{' '}
            {route.kind === 'circuit' ? 'Circuito' : 'Rota'} · {route.category}
          </p>
          <RouteMap
            routes={[route]}
            selected={route.id}
            waypoints={route.waypoints ?? []}
            gateLine={route.startLine}
          />
          <dl>
            <dt>Distância</dt>
            <dd>
              {(route.distanceMeters / 1000).toLocaleString('pt-BR', {
                maximumFractionDigits: 2,
              })}{' '}
              km
            </dd>
            <dt>Publicação</dt>
            <dd>
              {
                {
                  draft: 'Rascunho privado',
                  pending: 'Em análise',
                  approved: 'Aprovado',
                  rejected: 'Rejeitado',
                  archived: 'Arquivado',
                }[route.status]
              }
            </dd>
            <dt>Fonte</dt>
            <dd>
              {route.source === 'manual'
                ? 'Desenho manual · sem validação viária'
                : 'OSRM · perfil rodoviário'}
            </dd>
            {route.durationSeconds !== null && (
              <>
                <dt>Duração estimada</dt>
                <dd>
                  ~{Math.round(route.durationSeconds / 60)} min · não garantida
                </dd>
              </>
            )}
            {route.kind === 'circuit' && (
              <>
                <dt>Telemetria de pista</dt>
                <dd>
                  {route.verification === 'verified'
                    ? 'Verificado · voltas GPS estimadas'
                    : 'Sugerido · sem verificação para voltas'}
                </dd>
              </>
            )}
          </dl>
          <ol>
            {route.waypoints?.map((_, i) => (
              <li key={i}>
                {i === 0
                  ? 'Origem'
                  : i === route.waypoints.length - 1
                    ? 'Destino'
                    : `Parada ${i}`}{' '}
                · marcador{' '}
                {i === 0 ? 'I' : i === route.waypoints.length - 1 ? 'F' : i}
              </li>
            ))}
          </ol>
          {route.reason && <p>Moderação: {route.reason}</p>}
          <div className="route-tools">
            {route.status === 'approved' && (
              <>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    if (!user) {
                      navigate('/entrar');
                      return;
                    }
                    void act(() =>
                      routeService.favorite(route.id, !route.favorite),
                    );
                  }}
                >
                  {route.favorite ? 'Desfavoritar' : 'Favoritar'}
                </button>
                <Link
                  className="button button-primary"
                  to={`/ride?percurso=${route.id}`}
                >
                  Seguir rota
                </Link>
              </>
            )}
            {route.ownerId === user?.id && (
              <>
                <Link className="button" to={`/explorar/${route.id}/editar`}>
                  Editar
                </Link>
                {['draft', 'rejected'].includes(route.status) && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void act(() => routeService.submit(route.id))
                    }
                  >
                    Solicitar publicação
                  </button>
                )}
                <button
                  className="button"
                  disabled={busy || route.status === 'archived'}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Arquivar este percurso? Atividades salvas serão preservadas.',
                      )
                    )
                      void act(() => routeService.archive(route.id));
                  }}
                >
                  Arquivar
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        !error && <p>Carregando percurso…</p>
      )}
    </section>
  );
}
export function RouteModerationPage() {
  return <Navigate to="/admin/routes" replace />;
}
