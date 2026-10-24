import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ComparisonResults } from '../comparison/ComparisonResults';
import type { ComparisonResult } from '../comparison/types';
import { Button } from '../components/design-system';
import { MatchMap } from '../similarity/MatchMap';
import {
  labels,
  similarityService,
  statusLabels,
  type SimilarMatch,
  type SimilarStatus,
} from '../similarity/service';
import { SimilarityFilters } from '../similarity/SimilarityFilters';
import '../styles/comparison.css';
import '../styles/history.css';
export function SimilarityPage() {
  const { id } = useParams();
  return <SimilarityDetails key={id} id={id!} />;
}
function SimilarityDetails({ id }: { id: string }) {
  const [params, setParams] = useSearchParams(),
    serialized = params.toString();
  const [matches, setMatches] = useState<SimilarMatch[]>([]),
    [status, setStatus] = useState<SimilarStatus | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const selected = matches.find((m) => m.id === params.get('atividade'));
  useEffect(() => {
    const abort = new AbortController();
    const q = new URLSearchParams(serialized);
    q.delete('atividade');
    const timer = setTimeout(() => {
      void Promise.all([
        similarityService.list(id, q, abort.signal),
        similarityService.status(id),
      ])
        .then(([list, state]) => {
          if (!abort.signal.aborted) {
            setMatches(list.matches);
            setMore(list.hasMore);
            setStatus(state);
            setError('');
          }
        })
        .catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [id, serialized, attempt]);
  function change(key: string, value: string) {
    const q = new URLSearchParams(params);
    if (value) q.set(key, value);
    else q.delete(key);
    if (key !== 'page') q.delete('page');
    if (key !== 'atividade') q.delete('atividade');
    setResult(null);
    setParams(q);
  }
  async function compare() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      setResult(await similarityService.compare(id, selected.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reprocess() {
    setBusy(true);
    try {
      await similarityService.reprocess(id);
      setResult(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="history-page">
      <Link className="text-link action-link" to={`/historico/${id}`}>
        Voltar à atividade
      </Link>
      <header className="panel history-panel">
        <h1>Trajetos Semelhantes</h1>
        <p>
          Reconhecimento privado pelo GPS registrado, com ou sem rota
          cadastrada.
        </p>
        <p role="status">
          {status ? statusLabels[status.status] : 'Consultando análise…'}
          {status?.reason ? ` · ${status.reason}` : ''}
        </p>
        {status?.truncated && (
          <p>Busca limitada a 40 candidatos; a lista pode estar incompleta.</p>
        )}
        <div className="history-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setAttempt((n) => n + 1)}
          >
            Atualizar análise
          </Button>
          <Button
            variant="secondary"
            disabled={busy || status?.status === 'processing'}
            onClick={() => void reprocess()}
          >
            Solicitar reanálise
          </Button>
          <Link
            className="text-link action-link"
            to={`/historico/${id}/replay`}
          >
            Abrir replay original
          </Link>
        </div>
      </header>
      <SimilarityFilters params={params} change={change} />
      {error && (
        <section className="panel history-panel">
          <p role="alert">{error}</p>
          <p>
            Sem conexão, novas correspondências aguardam análise. Histórico e
            Replay locais continuam disponíveis.
          </p>
        </section>
      )}
      <section className="panel history-panel">
        <h2>Atividades próprias encontradas</h2>
        {!matches.length && (
          <p>Nenhuma correspondência disponível nesta consulta.</p>
        )}
        {matches.map((m) => (
          <article key={m.id}>
            <h3>{m.title}</h3>
            <p>
              {labels[m.classification]} · {(m.sharedMeters / 1000).toFixed(2)}{' '}
              km comuns · sentido{' '}
              {m.direction === 'same'
                ? 'equivalente'
                : m.direction === 'opposite'
                  ? 'contrário'
                  : m.direction === 'mixed'
                    ? 'misto'
                    : 'indeterminado'}
            </p>
            <p>
              Cobertura desta atividade: {(m.coverageA * 100).toFixed(1)}% · da
              outra: {(m.coverageB * 100).toFixed(1)}%
            </p>
            {m.issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
            <div className="history-actions">
              <Button
                variant="secondary"
                aria-pressed={selected?.id === m.id}
                onClick={() => change('atividade', m.id)}
              >
                Selecionar e ver mapa
              </Button>
              <Link className="text-link action-link" to={`/historico/${m.id}`}>
                Abrir atividade
              </Link>
            </div>
          </article>
        ))}
        <div className="history-actions">
          <Button
            variant="secondary"
            disabled={Number(params.get('page') ?? 1) <= 1}
            onClick={() =>
              change('page', String(Number(params.get('page') ?? 1) - 1))
            }
          >
            Anterior
          </Button>
          <Button
            variant="secondary"
            disabled={!more}
            onClick={() =>
              change('page', String(Number(params.get('page') ?? 1) + 1))
            }
          >
            Próxima
          </Button>
        </div>
      </section>
      {selected && (
        <>
          <MatchMap key={selected.id} id={id} match={selected} />
          <section className="panel history-panel">
            <h2>Comparação dos trechos comuns</h2>
            <p>
              Totais de atividades diferentes são contexto; a comparação utiliza
              somente os trechos equivalentes.
            </p>
            <Button
              variant="primary"
              disabled={
                busy ||
                selected.direction !== 'same' ||
                !selected.pieces.length ||
                selected.classification === 'inconclusive'
              }
              onClick={() => void compare()}
            >
              Comparar trechos comuns
            </Button>
          </section>
        </>
      )}
      {result && (
        <ComparisonResults result={result} busy={busy} onLaps={() => {}} />
      )}
    </div>
  );
}
