import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { historyService } from '../history/service';
import { HistoryFilters } from '../history/HistoryFilters';
import { RideHistoryCard } from '../history/RideHistoryCard';
import { historyParams } from '../history/filters';
import type { HistoryOptions, HistoryResult } from '../history/types';
import '../styles/history.css';
import { OfflineHistory } from '../history/OfflineHistory';
import { useOffline } from '../offline/context';
import { useSyncExternalStore } from 'react';
import { SimilarGroups } from '../similarity/SimilarGroups';
export function HistoryPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const serialized = params.toString();
  const offline = useOffline(),
    offlineState = useSyncExternalStore(offline.subscribe, offline.getSnapshot);
  const signature = offlineState.queue
    .filter((q) => q.ownerId === user?.id)
    .map((q) => `${q.id}:${q.state}`)
    .join(',');
  const [result, setResult] = useState<HistoryResult | null>(null),
    [options, setOptions] = useState<HistoryOptions>({
      motorcycles: [],
      routes: [],
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      void historyService
        .list(historyParams(new URLSearchParams(serialized)))
        .then((r) => {
          if (live) setResult(r);
        })
        .catch((e) => {
          if (live) {
            setResult(null);
            setError(e.message);
          }
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [serialized, user?.id, refresh, signature]);
  useEffect(() => {
    let live = true;
    void historyService
      .options()
      .then((r) => {
        if (live) setOptions(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id, refresh]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (key === '*') next.forEach((_, k) => next.delete(k));
    else if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(key === '*' ? {} : next);
  }
  const local = offlineState.sessions.filter(
    (s) => s.ownerId === user?.id && s.payload.endedAt,
  );
  const mergedOptions: HistoryOptions = {
    motorcycles: [
      ...new Map(
        [
          ...options.motorcycles,
          ...local.map((s) => ({ id: s.bike.id, motorcycle: s.bike })),
        ].map((b) => [b.id, b]),
      ).values(),
    ],
    routes: [
      ...new Map(
        [
          ...options.routes,
          ...local
            .filter((s) => s.payload.route)
            .map((s) => ({
              id: s.payload.route!.plan.id,
              name: s.payload.route!.plan.name,
            })),
        ].map((r) => [r.id, r]),
      ).values(),
    ],
  };
  return (
    <div className="history-page">
      <div className="history-heading">
        <div>
          <span className="eyebrow">MEUS RIDES</span>
          <h1>Histórico de Rides</h1>
          <p>
            {result
              ? `${result.total} atividade(s) salva(s) na conta`
              : 'Atividades da sua conta'}
          </p>
        </div>
        <Link className="text-link" to="/perfil">
          Voltar ao perfil
        </Link>
      </div>
      <HistoryFilters
        params={params}
        options={mergedOptions}
        onChange={change}
      />
      <SimilarGroups key={signature + refresh} />
      <VideoRecovery />
      <OfflineHistory
        params={params}
        remote={result?.rides ?? []}
        available={!error && !loading && !!result}
      />
      {['pending', 'error'].includes(params.get('sync') ?? '') ? (
        <p>Filtro aplicado às atividades no aparelho.</p>
      ) : loading ? (
        <p className="panel empty-state" role="status">
          Carregando histórico…
        </p>
      ) : error ? (
        <div className="panel empty-state" role="alert">
          <p>{error}</p>
          <button className="button" onClick={() => setRefresh((n) => n + 1)}>
            Tentar novamente
          </button>
        </div>
      ) : result?.rides.length ? (
        <div className="history-grid" aria-label="Histórico sincronizado">
          {result.rides.map((r) => (
            <RideHistoryCard ride={r} key={r.id} />
          ))}
        </div>
      ) : (
        <div className="panel empty-state">
          <h2>Nenhuma atividade encontrada</h2>
          <p>Altere os filtros ou salve seu primeiro Ride.</p>
          <Link className="button button-primary" to="/ride">
            Preparar Ride
          </Link>
        </div>
      )}
      {!['pending', 'error'].includes(params.get('sync') ?? '') && (
        <div className="route-tools">
          <button
            className="button"
            disabled={loading || (result?.page ?? 1) <= 1}
            onClick={() => change('page', String((result?.page ?? 1) - 1))}
          >
            Anterior
          </button>
          <span>Página {result?.page ?? 1}</span>
          <button
            className="button"
            disabled={loading || !result?.hasMore}
            onClick={() => change('page', String((result?.page ?? 1) + 1))}
          >
            Próxima
          </button>
          <Link className="text-link" to="/estatisticas">
            Estatísticas
          </Link>
        </div>
      )}
    </div>
  );
}
import { VideoRecovery } from '../video/VideoLibrary';
