import { ChoiceSelect } from '../components/design-system';
import type {
  Coordinate,
  RouteData,
  RouteRecord,
} from '@apex-ride/ride-core/routes';
import { lineLength, validCoordinate } from '@apex-ride/ride-core/routes';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  ButtonLink,
  Input,
  Textarea,
} from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import { CircuitResults } from '../gamification/CircuitResults';
import { routeService } from '../services/routes';
import { DestinationSearch } from '../routes/DestinationSearch';
import { GpxImporter } from '../routes/GpxImporter';
import { ElevationProfile } from '../routes/ElevationProfile';
import { exportGpx } from '../routes/gpx';
import '../styles/routes.css';
import '../styles/explore.css';
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
  const { user } = useAuth();
  const [profilePoint, setProfilePoint] = useState<Coordinate | undefined>();
  const [recoverable, setRecoverable] = useState<{
    data: RouteData;
    kind: string;
    method: string;
  } | null>(() => {
    try {
      const raw = sessionStorage.getItem(
        `apex.route.draft.${user?.id ?? 'none'}.${id ?? 'new'}`,
      );
      const parsed = raw ? JSON.parse(raw) : null;
      if (
        parsed?.data &&
        typeof parsed.data.name === 'string' &&
        typeof parsed.data.description === 'string' &&
        ['route', 'circuit'].includes(parsed.kind) &&
        ['osrm', 'manual'].includes(parsed.method) &&
        Array.isArray(parsed.data.waypoints) &&
        parsed.data.waypoints.length <= 25 &&
        parsed.data.waypoints.every(validCoordinate) &&
        Array.isArray(parsed.data.geometry?.coordinates) &&
        parsed.data.geometry.coordinates.length <= 10000
      )
        return parsed;
    } catch {
      /* Optional local draft. */
    }
    return null;
  });
  const storageKey = `apex.route.draft.${user?.id ?? 'none'}.${id ?? 'new'}`;
  const [data, setData] = useState<RouteData>(blank),
    [kind, setKind] = useState('route'),
    [method, setMethod] = useState('osrm'),
    [gate, setGate] = useState(false),
    [gatePoints, setGatePoints] = useState<Coordinate[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(!id);
  useEffect(() => {
    if (!loaded || recoverable || !data.waypoints.length) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ data, kind, method }),
      );
    } catch {
      /* Keep the working draft in memory. */
    }
  }, [data, kind, method, loaded, storageKey, recoverable]);
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
      importMetadata: null,
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
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Ignore unavailable storage. */
      }
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
      <Link className="text-link action-link" to="/explorar">
        Voltar para Explorar
      </Link>
      {error && <p role="alert">{error}</p>}
      {!loaded ? (
        <p>Carregando editor…</p>
      ) : (
        <>
          {recoverable && (
            <div className="panel destination-panel">
              <p>
                Há um rascunho local desta conta. Restaurar substitui o
                planejamento aberto; revise antes de salvar.
              </p>
              <Button
                onClick={() => {
                  setData(recoverable.data);
                  setKind(recoverable.kind);
                  setMethod(recoverable.method);
                  setRecoverable(null);
                }}
              >
                Restaurar rascunho local
              </Button>
              <Button variant="ghost" onClick={() => setRecoverable(null)}>
                Continuar sem restaurar
              </Button>
            </div>
          )}

          <h2>1 · Definir percurso</h2>
          <div>
            <span>Traçado</span>
            <ChoiceSelect
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
                  importMetadata: null,
                }));
              }}
            >
              <option value="osrm">Calcular por vias existentes</option>
              <option value="manual">
                Desenho manual · sem validação viária
              </option>
            </ChoiceSelect>
          </div>
          <DestinationSearch
            disabled={busy}
            onSelect={(coordinate) => touch(coordinate)}
          />
          <GpxImporter
            disabled={busy}
            onImport={(segment, name) => {
              const coordinates = segment.map((p) => p.coordinate);
              setData((d) => ({
                ...d,
                name: d.name || name,
                waypoints: [coordinates[0]!, coordinates.at(-1)!],
                geometry: { type: 'LineString', coordinates },
                source: 'manual',
                durationSeconds: null,
                startLine: null,
                direction: null,
                importMetadata: {
                  source: 'gpx',
                  version: 1,
                  altitudes: segment.map((p) => p.altitude),
                },
              }));
              setMethod('manual');
              setError('');
            }}
          />
          <p>
            Toque no mapa: o primeiro ponto é a origem, o último é o destino. Os
            demais são paradas. Reordene antes de calcular.
          </p>
          <h2>2 · Revisar trajeto</h2>
          <RouteMap
            routes={shapes}
            selected="draft"
            onPoint={busy ? undefined : touch}
            waypoints={data.waypoints}
            gateLine={data.startLine}
            centerPoint={profilePoint}
            points={
              profilePoint
                ? [
                    {
                      id: 'profile',
                      coordinate: profilePoint,
                      label: 'Ponto do perfil',
                    },
                  ]
                : []
            }
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
                  <Button
                    variant="secondary"
                    aria-label={`Mover ponto ${i + 1} para cima`}
                    disabled={!i || busy}
                    onClick={() => {
                      const ps = [...data.waypoints];
                      [ps[i - 1], ps[i]] = [ps[i]!, ps[i - 1]!];
                      points(ps);
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="secondary"
                    aria-label={`Mover ponto ${i + 1} para baixo`}
                    disabled={i === data.waypoints.length - 1 || busy}
                    onClick={() => {
                      const ps = [...data.waypoints];
                      [ps[i + 1], ps[i]] = [ps[i]!, ps[i + 1]!];
                      points(ps);
                    }}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      points(data.waypoints.filter((_, n) => n !== i))
                    }
                  >
                    Remover
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          {method === 'osrm' ? (
            <>
              <Button
                variant="secondary"
                disabled={
                  busy || data.waypoints.length < 2 || !navigator.onLine
                }
                onClick={() => void calculate()}
              >
                Calcular caminho
              </Button>
              <p>
                O perfil rodoviário depende do provedor e pode não contemplar
                restrições específicas de motocicletas. O resultado não garante
                acesso ou condições da via.
              </p>
            </>
          ) : (
            <p>
              {data.importMetadata
                ? 'GPX importado: geometria fornecida pelo arquivo'
                : 'Desenho manual: percurso definido por você'}
              , sem validação contra a malha viária. Não há duração estimada.
            </p>
          )}
          {data.importMetadata && (
            <ElevationProfile
              coordinates={data.geometry.coordinates}
              altitudes={data.importMetadata.altitudes}
              onPoint={setProfilePoint}
            />
          )}
          {kind === 'circuit' && (
            <>
              <p>
                Cadastre somente uma área fechada apropriada. Publicação e
                verificação para voltas são revisões distintas.
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setGatePoints([]);
                  setGate(true);
                }}
              >
                Definir linha de largada/chegada
              </Button>
              <p>
                {gate
                  ? 'Toque em dois extremos da linha transversal à pista.'
                  : data.startLine
                    ? 'Linha definida.'
                    : 'Linha ainda não definida.'}
              </p>
              <div>
                <span>Direção do cruzamento</span>
                <ChoiceSelect
                  aria-label="Direção do cruzamento"
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
                </ChoiceSelect>
              </div>
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
          <details open>
            <summary>3 · Informações do percurso</summary>
            <div className="editor-info">
              <div>
                <span>Tipo</span>
                <ChoiceSelect
                  aria-label="Tipo"
                  disabled={!!id || busy}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    setData((d) => ({
                      ...d,
                      startLine: null,
                      direction: null,
                    }));
                  }}
                >
                  <option value="route">Rota</option>
                  <option value="circuit">Sugerir circuito fechado</option>
                </ChoiceSelect>
              </div>
              <label>
                Nome
                <Input
                  required
                  maxLength={120}
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                />
              </label>
              <label>
                Descrição
                <Textarea
                  maxLength={4000}
                  value={data.description}
                  onChange={(e) =>
                    setData({ ...data, description: e.target.value })
                  }
                />
              </label>
              <label>
                Cidade
                <Input
                  maxLength={120}
                  value={data.city}
                  onChange={(e) => setData({ ...data, city: e.target.value })}
                />
              </label>
              <label>
                Estado (UF)
                <Input
                  maxLength={2}
                  value={data.state}
                  onChange={(e) =>
                    setData({ ...data, state: e.target.value.toUpperCase() })
                  }
                />
              </label>
              <label>
                Categoria
                <Input
                  maxLength={60}
                  value={data.category}
                  onChange={(e) =>
                    setData({ ...data, category: e.target.value })
                  }
                />
              </label>
            </div>
          </details>
          <h2>4 · Salvar para depois</h2>
          <p>
            O percurso será privado até a aprovação de uma solicitação de
            publicação.
          </p>
          <Button
            variant="primary"
            disabled={
              busy ||
              !data.name.trim() ||
              data.geometry.coordinates.length < 2 ||
              !navigator.onLine
            }
            onClick={() => void save()}
          >
            {busy ? 'Processando…' : 'Salvar rascunho privado'}
          </Button>
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
  const [profilePoint, setProfilePoint] = useState<Coordinate | undefined>();
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
      <Link className="text-link action-link" to="/explorar">
        Voltar para Explorar
      </Link>
      {error && <p role="alert">{error}</p>}
      {route ? (
        <>
          <h1>{route.name}</h1>
          {user && route.kind === 'circuit' && <CircuitResults id={route.id} />}
          <Link
            className="text-link action-link"
            to={`/explorar/${route.id}/comparar`}
          >
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
            centerPoint={profilePoint}
            points={
              profilePoint
                ? [
                    {
                      id: 'profile',
                      coordinate: profilePoint,
                      label: 'Ponto do perfil',
                    },
                  ]
                : []
            }
          />
          <ElevationProfile
            coordinates={route.geometry.coordinates}
            altitudes={route.importMetadata?.altitudes}
            onPoint={setProfilePoint}
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
                ? route.importMetadata
                  ? 'GPX importado · sem validação viária'
                  : 'Desenho manual · sem validação viária'
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
            {route.kind === 'route' && (
              <ButtonLink
                variant="primary"
                to={`/explorar/navegar?percurso=${route.id}`}
              >
                Navegar neste percurso
              </ButtonLink>
            )}
            {route.status === 'approved' && (
              <Button
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(`${location.origin}/explorar/${route.id}`)
                    .catch(() =>
                      setError(
                        'Copie o endereço desta página para compartilhar.',
                      ),
                    );
                }}
              >
                Copiar link aprovado
              </Button>
            )}
            {route.status === 'approved' && (
              <>
                <Button
                  variant="secondary"
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
                </Button>
                <ButtonLink variant="primary" to={`/ride?percurso=${route.id}`}>
                  Seguir rota
                </ButtonLink>
              </>
            )}
            {route.ownerId === user?.id && (
              <>
                <Button
                  onClick={() => {
                    const blob = new Blob(
                      [
                        exportGpx(
                          route.name,
                          route.geometry.coordinates,
                          route.importMetadata?.altitudes,
                        ),
                      ],
                      { type: 'application/gpx+xml' },
                    );
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'percurso-apex.gpx';
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Exportar meu percurso em GPX
                </Button>
                <ButtonLink
                  variant="secondary"
                  to={`/explorar/${route.id}/editar`}
                >
                  Editar
                </ButtonLink>
                {['draft', 'rejected'].includes(route.status) && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(() => routeService.submit(route.id))
                    }
                  >
                    Solicitar publicação
                  </Button>
                )}
                <Button
                  variant="secondary"
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
                </Button>
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
