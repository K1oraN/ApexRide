import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useGamification, changeGamification } from './useGamification';
import type { XpEntry, ProgressData } from './types';
import { ProgressSummary } from './Progress';
export function XpHistoryPage() {
  const [params] = useSearchParams(),
    [page, setPage] = useState(1),
    [reason, setReason] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const ride = params.get('rideId') ?? '';
  const { data, error, reload } = useGamification<{
      items: XpEntry[];
      hasMore: boolean;
    }>(`/gamification/me/xp-history?page=${page}`),
    p = useGamification<{ progress: ProgressData }>('/gamification/me');
  async function review() {
    setBusy(true);
    try {
      await changeGamification('/gamification/me/reviews', 'POST', {
        rideId: ride,
        reason,
      });
      setMessage('Solicitação registrada para revisão.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gamification-page">
      <Link className="text-link" to="/perfil">
        Voltar ao perfil
      </Link>
      <h1>Histórico de XP</h1>
      <section className="panel gamification-card">
        <ProgressSummary data={p.data?.progress ?? null} />
        <p>
          Saldo confirmado pelo servidor. Atividades no aparelho aguardam
          sincronização e validação.
        </p>
      </section>
      {error && (
        <p role="alert">
          {error}
          <button className="button" onClick={reload}>
            Tentar novamente
          </button>
        </p>
      )}
      <div className="panel gamification-card">
        {data?.items.length === 0 && <p>Nenhuma concessão registrada.</p>}
        {data?.items.map((e) => (
          <article className="xp-entry" key={e.id}>
            <div>
              <strong>{e.reason}</strong>
              <small>
                {new Date(e.created_at).toLocaleString('pt-BR')} · Regra v
                {e.rule_version} ·{' '}
                {e.status === 'reversal' ? 'Correção rastreável' : 'Confirmada'}
              </small>
              {e.source_type === 'ride' && e.status !== 'reversal' && (
                <Link className="text-link" to={`/historico/${e.source_id}`}>
                  Atividade de origem
                </Link>
              )}
            </div>
            <strong>
              {e.xp_delta > 0 ? '+' : ''}
              {e.xp_delta} XP
            </strong>
          </article>
        ))}
        <div className="gamification-actions">
          <button
            className="button"
            disabled={page <= 1}
            onClick={() => setPage((n) => n - 1)}
          >
            Página anterior
          </button>
          <span>Página {page}</span>
          <button
            className="button"
            disabled={!data?.hasMore}
            onClick={() => setPage((n) => n + 1)}
          >
            Próxima página
          </button>
        </div>
      </div>
      <details className="panel gamification-card">
        <summary>Solicitar revisão de uma atividade</summary>
        {ride ? (
          <p>Atividade selecionada no Histórico.</p>
        ) : (
          <p>
            Abra uma atividade no <Link to="/historico">Histórico</Link> e
            escolha a solicitação de revisão na área de Experiência.
          </p>
        )}
        <label className="account-field">
          Motivo da revisão
          <textarea
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={busy || !reason.trim() || !ride}
          onClick={() => void review()}
        >
          Solicitar revisão
        </button>
        {message && <p role="status">{message}</p>}
      </details>
    </div>
  );
}
