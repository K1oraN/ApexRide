import { useEffect, useState } from 'react';
import { adminRequest, errorText, type Row } from './service';
export function RankingDetails({ season }: { season: string }) {
  const [page, setPage] = useState(1),
    [results, setResults] = useState(false),
    [items, setItems] = useState<Row[]>([]),
    [more, setMore] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    const path = results
      ? `/admin/gamification/results?page=${page}`
      : `/admin/rankings/entries?season=${encodeURIComponent(season)}&page=${page}`;
    void adminRequest<{ items: Row[]; hasMore: boolean }>(
      path,
      'GET',
      undefined,
      c.signal,
    )
      .then((d) => {
        setItems(d.items);
        setMore(d.hasMore);
        setError('');
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [season, page, results]);
  return (
    <section className="panel admin-action">
      <h2>
        {results
          ? 'Resultados pessoais estimados de pista'
          : 'Entradas voluntárias · ' + season}
      </h2>
      <p>
        Resultados de GPS permanecem experimentais; a classificação pública de
        tempos continua indisponível.
      </p>
      <button
        className="button"
        onClick={() => {
          setPage(1);
          setItems([]);
          setResults((v) => !v);
        }}
      >
        {results ? 'Consultar participantes' : 'Consultar resultados de pista'}
      </button>
      {error && <p role="alert">{error}</p>}
      {!items.length ? (
        <p>Nenhuma entrada nesta página.</p>
      ) : (
        items.map((row, i) => (
          <article key={i} className="admin-evidence">
            <p>
              Conta: {String(row.user_id)}
              {row.username ? ' · @' + row.username : ''}
            </p>
            <p>
              {row.ride_id
                ? 'Atividade: ' + row.ride_id
                : 'Pontuação derivada: ' + row.score}
            </p>
            <p>
              Estado:{' '}
              {row.suspended
                ? 'Entrada suspensa'
                : String(
                    row.review_state ??
                      row.state ??
                      'Elegível conforme consentimento e privacidade atuais',
                  )}
            </p>
            {row.reason ? <p>{String(row.reason)}</p> : null}
            {Array.isArray(row.estimated_laps) &&
              row.estimated_laps.map((l, i) => (
                <p key={i}>
                  Volta {String((l as Row).lap)} ·{' '}
                  {String((l as Row).estimatedSeconds)} s estimados
                </p>
              ))}
          </article>
        ))
      )}
      <div className="admin-pagination">
        <button
          className="button"
          disabled={page === 1}
          onClick={() => setPage((v) => v - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          className="button"
          disabled={!more}
          onClick={() => setPage((v) => v + 1)}
        >
          Próxima
        </button>
      </div>
    </section>
  );
}
