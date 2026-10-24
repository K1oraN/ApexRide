import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useOffline } from '../offline/context';
import { ApiError } from '../services/auth';
import { loadServerReplay, localReplay } from '../replay/load';
import type { ReplayInput } from '../replay/timeline';
import { ReplayPanel } from '../replay/ReplayPanel';
export function ReplayPage() {
  const { id, clientId } = useParams(),
    { user } = useAuth();
  return <ReplayDetails key={`${user?.id}:${id ?? clientId}`} />;
}
function ReplayDetails() {
  const [params] = useSearchParams();
  const { id, clientId } = useParams(),
    { user } = useAuth(),
    offline = useOffline();
  const [result, setResult] = useState<{
      owner: string;
      input: ReplayInput;
      local: boolean;
    } | null>(null),
    [error, setError] = useState(''),
    [progress, setProgress] = useState('Carregando atividade…'),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController(),
      owner = user.id;
    const local = async (client: string) => {
      const row = await offline.repo.read(owner, client);
      if (row.activity.ownerId !== owner || !row.activity.payload.endedAt)
        throw new Error('Atividade local indisponível ou ainda em gravação.');
      return localReplay(row.activity.payload);
    };
    const load = async () => {
      try {
        let input: ReplayInput,
          fromLocal = Boolean(clientId);
        if (clientId) input = await local(clientId);
        else {
          try {
            input = await loadServerReplay(id!, abort.signal, (p) => {
              if (!abort.signal.aborted) setProgress(p);
            });
          } catch (e) {
            const copy = offline
              .getSnapshot()
              .sessions.find(
                (s) => s.ownerId === owner && s.confirmation?.id === id,
              );
            if (
              !(e instanceof ApiError) ||
              ![0, 503].includes(e.status) ||
              !copy
            )
              throw e;
            input = await local(copy.payload.clientId);
            fromLocal = true;
          }
        }
        if (!abort.signal.aborted) {
          setError('');
          setResult({ owner, input, local: fromLocal });
        }
      } catch (e) {
        if (!abort.signal.aborted) {
          setError((e as Error).message);
          setResult(null);
        }
      }
    };
    void load();
    return () => abort.abort();
  }, [id, clientId, user, offline, attempt]);
  return (
    <div className="history-detail">
      <Link className="text-link" to="/historico">
        Voltar ao histórico
      </Link>
      {params.get('semelhantes') && (
        <Link
          className="text-link"
          to={`/historico/${encodeURIComponent(params.get('semelhantes')!)}/semelhantes?atividade=${encodeURIComponent(params.get('atividade') ?? '')}`}
        >
          Voltar aos trajetos semelhantes
        </Link>
      )}
      {params.get('comparar') && (
        <Link
          className="text-link"
          to={`/explorar/${encodeURIComponent(params.get('comparar')!)}/comparar?atividades=${encodeURIComponent(params.get('atividades') ?? '')}&executar=1`}
        >
          Voltar à comparação
        </Link>
      )}
      <header className="panel history-panel">
        <h1>Reproduzir Ride</h1>
        <p>
          Replay privado do proprietário ·{' '}
          {result?.local
            ? 'dados deste aparelho, sem exigir sincronização'
            : 'atividade salva'}
        </p>
      </header>
      {error ? (
        <section className="panel history-panel">
          <p role="alert">Falha ao carregar replay: {error}</p>
          <button
            className="button"
            onClick={() => {
              setError('');
              setProgress('Carregando atividade…');
              setAttempt((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </section>
      ) : result?.owner === user?.id ? (
        <ReplayPanel input={result!.input} />
      ) : (
        <p role="status">{progress}</p>
      )}
    </div>
  );
}
