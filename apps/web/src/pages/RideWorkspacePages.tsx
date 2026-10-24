import { Camera, Clapperboard, Film } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button, ButtonLink, SearchInput } from '../components/design-system';
import { PersistedRouteCard } from '../components/routes/PersistedRouteCard';
import { OfflinePanel } from '../offline/OfflinePanel';
import { AdvancedResults } from '../ride/AdvancedResults';
import { useRide } from '../ride/context';
import { RideCircuitPanel } from '../ride/RideCircuitPanel';
import { RideSectionNav } from '../ride/RideSectionNav';
import { SpeedSettings } from '../ride/SpeedSettings';
import { formatDuration } from '../ride/format';
import { routeService, type RouteRecord } from '../services/routes';
import { VideoLibrary } from '../video/VideoLibrary';
import { useRideVideo } from '../video/context';
import { videoRepository } from '../video/repository';
import type { VideoSegment } from '../video/types';
import { HistoryPage } from './HistoryPage';
import '../styles/ride-session.css';

export function RideSessionsPage() {
  const { snapshot } = useRide();
  return (
    <div className="ride-workspace">
      <RideSectionNav />
      <header className="ride-workspace-heading">
        <div>
          <span className="eyebrow">SEU PERCURSO</span>
          <h1>
            MINHAS <em>SESSÕES</em>
          </h1>
        </div>
      </header>
      {snapshot.activity && (
        <section className="panel ride-hub-current">
          <h2>
            {snapshot.activity.bike.brand} {snapshot.activity.bike.model}
          </h2>
          <p>
            {snapshot.state === 'running'
              ? 'Sessão em andamento'
              : snapshot.state === 'paused'
                ? 'Sessão pausada'
                : 'Sessão aguardando conclusão'}
          </p>
          <ButtonLink to="/ride" variant="primary">
            Voltar à sessão
          </ButtonLink>
        </section>
      )}
      <OfflinePanel compact />
      <HistoryPage embedded />
    </div>
  );
}

export function RideTelemetryPage() {
  const { snapshot } = useRide();
  return (
    <div className="ride-workspace">
      <RideSectionNav />
      <header className="ride-workspace-heading">
        <div>
          <span className="eyebrow">ANÁLISE PESSOAL</span>
          <h1>
            MINHA <em>TELEMETRIA</em>
          </h1>
        </div>
      </header>
      {snapshot.activity ? (
        <AdvancedResults expanded />
      ) : (
        <section className="panel empty-state">
          <h2>Nenhuma sessão em análise</h2>
          <p>
            Os gráficos usam as amostras da sessão. Para uma atividade anterior,
            abra seus detalhes no Histórico.
          </p>
          <ButtonLink to="/ride/sessoes" variant="secondary">
            Escolher sessão
          </ButtonLink>
        </section>
      )}
      {snapshot.activity?.payload.mode === 'passeio' && (
        <p>
          Modo Passeio registra GPS e métricas básicas. Eventos avançados não
          são calculados neste modo.
        </p>
      )}
      {snapshot.state !== 'running' && snapshot.state !== 'waiting-gps' && (
        <section className="panel ride-help">
          <SpeedSettings />
        </section>
      )}
    </div>
  );
}

export function RideCircuitsPage() {
  const [data, setData] = useState<{
    rows: RouteRecord[];
    more: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  async function favorite(route: RouteRecord) {
    try {
      await routeService.favorite(route.id, !route.favorite);
      setData((current) =>
        current
          ? {
              ...current,
              rows: current.rows.map((row) =>
                row.id === route.id
                  ? { ...row, favorite: !route.favorite }
                  : row,
              ),
            }
          : current,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let live = true;
    void routeService
      .list(
        new URLSearchParams({ kind: 'circuit', page: String(page), q: query }),
      )
      .then((r) => {
        if (live) {
          setData({ rows: r.routes, more: r.hasMore });
          setError('');
        }
      })
      .catch((e) => {
        if (live) {
          setData(null);
          setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [page, query]);
  return (
    <div className="ride-workspace">
      <RideSectionNav />
      <header className="ride-workspace-heading">
        <div>
          <span className="eyebrow">PILOTAGEM EM CIRCUITO</span>
          <h1>
            CIRCUITOS E <em>VOLTAS</em>
          </h1>
        </div>
      </header>
      <RideCircuitPanel />
      <div className="history-filter-toolbar">
        <SearchInput
          label="Pesquisar circuitos"
          placeholder="Buscar circuito por nome ou cidade…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <h2>Circuitos disponíveis</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Carregando circuitos…</p>
      ) : data.rows.length ? (
        <div className="route-card-grid">
          {data.rows.map((route) => (
            <PersistedRouteCard
              key={route.id}
              route={route}
              onFavorite={(route) => void favorite(route)}
            />
          ))}
        </div>
      ) : (
        <section className="panel empty-state">
          <p>Nenhum circuito disponível para esta conta.</p>
          <Link className="text-link action-link" to="/explorar">
            Explorar percursos
          </Link>
        </section>
      )}
      <div className="page-pagination">
        <Button
          variant="secondary"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>Página {page}</span>
        <Button
          variant="secondary"
          disabled={!data?.more}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

export function RideMediaPage({ studio = false }: { studio?: boolean }) {
  const { user } = useAuth();
  const { snapshot } = useRideVideo();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{
    owner: string;
    rows: VideoSegment[];
  } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let live = true;
    if (user) {
      const owner = user.id;
      void videoRepository
        .recover(owner)
        .then(() => videoRepository.list(owner))
        .then((rows) => {
          if (live) {
            setData({ owner, rows });
            setError('');
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }
    return () => {
      live = false;
    };
  }, [user, revision, snapshot.segments]);
  const rows = data?.owner === user?.id ? (data?.rows ?? []) : [];
  const clients = [
    ...new Set(
      rows
        .filter((row) =>
          `${row.clientId} ${new Date(row.createdAt).toLocaleString('pt-BR')} ${row.applied.facingMode === 'user' ? 'frontal' : row.applied.facingMode === 'environment' ? 'traseira' : ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((row) => row.clientId),
    ),
  ];
  const selected = clients.includes(params.get('sessao') ?? '')
    ? params.get('sessao')!
    : '';
  const segment = rows.find((row) => row.clientId === selected);
  return (
    <div className="ride-workspace ride-media-page">
      <RideSectionNav />
      <header className="ride-workspace-heading">
        <div>
          <span className="eyebrow">SOMENTE NESTE APARELHO</span>
          <h1>
            {studio ? (
              <>
                ESTÚDIO <em>RIDE</em>
              </>
            ) : (
              <>
                MEUS <em>VÍDEOS</em>
              </>
            )}
          </h1>
          <p>
            {studio
              ? 'Escolha uma gravação para compor, alinhar e exportar com telemetria.'
              : 'Seus arquivos locais, separados por sessão e câmera.'}
          </p>
        </div>
        {studio ? <Clapperboard aria-hidden /> : <Camera aria-hidden />}
      </header>
      <SearchInput
        label="Pesquisar gravações"
        placeholder="Buscar por data, câmera ou sessão…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Consultando arquivos locais…</p>}
      {data && !rows.length && (
        <section className="panel empty-state">
          <Film size={40} aria-hidden />
          <h2>Nenhum vídeo neste aparelho</h2>
          <p>
            Ative a câmera opcional antes do Ride. Sessões sem vídeo continuam
            com Histórico e Replay.
          </p>
          <ButtonLink to="/ride" variant="primary">
            Preparar Ride
          </ButtonLink>
        </section>
      )}
      {query && rows.length > 0 && !clients.length && (
        <p role="status">Nenhuma gravação corresponde à busca.</p>
      )}
      <div className="ride-media-grid">
        {clients.map((id, index) => {
          const items = rows.filter((row) => row.clientId === id),
            first = items[0]!;
          return (
            <article
              className={`panel ride-media-card ${selected === id ? 'selected' : ''}`}
              key={id}
            >
              <Film size={30} aria-hidden />
              <h2>Sessão local {index + 1}</h2>
              <p>{new Date(first.createdAt).toLocaleString('pt-BR')}</p>
              <p>
                {items.length} segmento(s) ·{' '}
                {(
                  items.reduce((sum, row) => sum + row.bytes, 0) /
                  1024 /
                  1024
                ).toFixed(1)}{' '}
                MB
              </p>
              <p>
                ~
                {formatDuration(
                  items.reduce(
                    (sum, row) =>
                      sum +
                      (row.mediaDurationMs ?? row.durationEstimatedMs ?? 0),
                    0,
                  ),
                )}{' '}
                conhecidos ·{' '}
                {items.some((row) => row.state !== 'complete')
                  ? 'Contém trecho não finalizado'
                  : 'Arquivos finalizados'}
              </p>
              <Button
                variant={selected === id ? 'primary' : 'secondary'}
                onClick={() => setParams({ sessao: id })}
              >
                {studio ? 'Editar esta gravação' : 'Abrir segmentos'}
              </Button>
            </article>
          );
        })}
      </div>
      {selected && (
        <VideoLibrary
          key={`${user?.id}:${selected}:${studio}`}
          clientId={selected}
          serverId={segment?.serverId}
          studio={studio}
        />
      )}
      <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>
        Atualizar arquivos
      </Button>
    </div>
  );
}
