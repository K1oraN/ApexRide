import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useOffline } from '../offline/context';
import { localHistory, syncLabels, type Receipt } from './local-history';
import { historyService } from './service';
import type { HistoryRide } from './types';
import { formatDuration } from '../ride/format';
export function OfflineHistory({
  params,
  remote,
  available,
}: {
  params: URLSearchParams;
  remote: HistoryRide[];
  available: boolean;
}) {
  const { user } = useAuth(),
    offline = useOffline();
  const state = useSyncExternalStore(offline.subscribe, offline.getSnapshot),
    connection = useSyncExternalStore(
      offline.connectivity.subscribe,
      offline.connectivity.getSnapshot,
    );
  const [resolved, setResolved] = useState<{
      owner: string;
      receipts: Receipt[];
    } | null>(null),
    [page, setPage] = useState(1),
    [message, setMessage] = useState('');
  const signature = state.sessions
    .filter((r) => r.ownerId === user?.id && r.payload.endedAt)
    .map((r) => r.payload.clientId)
    .join(',');
  useEffect(() => {
    let live = true;
    if (!user || !available || !signature) return;
    const ids = signature.split(',');
    void (async () => {
      const receipts: Receipt[] = [];
      for (let i = 0; i < ids.length; i += 100)
        receipts.push(
          ...(await historyService.receipts(ids.slice(i, i + 100))).receipts,
        );
      if (live) setResolved({ owner: user.id, receipts });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [signature, available, user?.id, user, connection]);
  if (!user) return null;
  const rows = localHistory(
      state.sessions,
      state.queue,
      user.id,
      params,
      remote,
      available,
      resolved?.owner === user.id ? resolved.receipts : [],
    ),
    pages = Math.max(1, Math.ceil(rows.length / 12)),
    current = Math.min(page, pages);
  return (
    <section className="panel history-panel" aria-label="Histórico no aparelho">
      <h2>No aparelho</h2>
      <p>
        {available
          ? 'Prévia local separada do total remoto. Cópias já sincronizadas são reconciliadas pelo identificador da sessão.'
          : 'O histórico remoto completo está indisponível. Esta lista contém somente cópias desta conta disponíveis neste aparelho.'}
      </p>
      <button
        className="button"
        onClick={() =>
          void offline.sync.run(true).catch((e) => setMessage(e.message))
        }
      >
        Sincronizar agora
      </button>
      {message && <p role="status">{message}</p>}
      {rows.length ? (
        <>
          <div className="history-grid">
            {rows.slice((current - 1) * 12, current * 12).map((row) => {
              const queued = state.queue.find(
                  (q) => q.id === row.id && q.ownerId === user.id,
                ),
                metrics = row.history?.metrics ?? row.confirmation?.metrics;
              return (
                <article className="panel history-card" key={row.id}>
                  <Link to={`/historico/local/${row.payload.clientId}`}>
                    <h3>
                      {row.payload.mode} —{' '}
                      {new Date(row.payload.startedAt).toLocaleDateString(
                        'pt-BR',
                      )}
                    </h3>
                    <p>
                      {row.bike.brand} {row.bike.model}
                    </p>
                    <p>
                      {metrics
                        ? `${(metrics.distanceMeters / 1000).toFixed(2)} km · ${formatDuration(metrics.activeMs)}`
                        : 'Métricas disponíveis nos detalhes.'}
                    </p>
                    <p>
                      {row.payload.visibility === 'public'
                        ? 'Pública'
                        : 'Privada'}{' '}
                      ·{' '}
                      {queued
                        ? syncLabels[queued.state]
                        : 'Finalizada · aguardando decisão'}
                    </p>
                    {queued?.error && <p>{queued.error}</p>}
                  </Link>
                </article>
              );
            })}
          </div>
          <div className="history-actions">
            <button
              className="button"
              disabled={current <= 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Locais anteriores
            </button>
            <span>
              {current}/{pages}
            </span>
            <button
              className="button"
              disabled={current >= pages}
              onClick={() => setPage((n) => n + 1)}
            >
              Próximas locais
            </button>
          </div>
        </>
      ) : (
        <p>Nenhuma atividade local adicional para estes filtros.</p>
      )}
    </section>
  );
}
