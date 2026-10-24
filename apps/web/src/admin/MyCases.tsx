import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { authRequest } from '../services/auth';
import { errorText, type Row } from './service';
import './admin.css';
export function MyCases() {
  const [notice, setNotice] = useState('');
  useEffect(() => {
    void authRequest<{ notice: string }>('/moderation/notice')
      .then((d) => setNotice(d.notice))
      .catch(() => {});
  }, []);
  const [data, setData] = useState<{
      sanctions: Row[];
      decisions: Row[];
      appeals: Row[];
    } | null>(null),
    [requests, setRequests] = useState<Row[]>([]),
    [target, setTarget] = useState(''),
    [explanation, setExplanation] = useState(''),
    [kind, setKind] = useState('question'),
    [privacy, setPrivacy] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void Promise.all([
      authRequest<{ sanctions: Row[]; decisions: Row[]; appeals: Row[] }>(
        '/moderation/me',
        'GET',
        undefined,
        c.signal,
      ),
      authRequest<{ items: Row[] }>(
        '/privacy/requests',
        'GET',
        undefined,
        c.signal,
      ),
    ])
      .then(([d, p]) => {
        setData(d);
        setRequests(p.items);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorText(e));
      });
    return () => c.abort();
  }, [revision]);
  async function run(path: string, body: Row) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await authRequest(path, 'POST', body);
      setMessage('Solicitação registrada. Acompanhe o estado nesta página.');
      setRevision((n) => n + 1);
      setExplanation('');
      setPrivacy('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-card panel">
      <span className="eyebrow">MINHA CONTA</span>
      <h1>Medidas e solicitações</h1>
      {notice && <p>{notice}</p>}
      <Link className="text-link" to="/configuracoes">
        Voltar à conta
      </Link>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p>
        Consulte medidas e conteste decisões. A identidade de quem denunciou
        permanece protegida.
      </p>
      {!data ? (
        <p role="status">Carregando…</p>
      ) : (
        <>
          <h2>Medidas administrativas</h2>
          {!data.sanctions.length && !data.decisions.length && (
            <p>Nenhuma medida registrada.</p>
          )}
          {data.sanctions.map((s) => (
            <article key={String(s.id)} className="panel admin-action">
              <strong>
                {String(s.sanction_type)} · {String(s.scope)}
              </strong>
              <p>{String(s.reason)}</p>
              <small>
                Política: {String(s.policy_code)} ·{' '}
                {s.revoked_at
                  ? 'Revogada'
                  : s.expires_at
                    ? 'Expira em ' +
                      new Date(String(s.expires_at)).toLocaleString('pt-BR')
                    : 'Sem prazo definido'}
              </small>
              <button
                className="button"
                onClick={() => setTarget('sanction:' + s.id)}
              >
                Contestar medida
              </button>
            </article>
          ))}
          {data.decisions.map((d) => (
            <article key={String(d.id)} className="panel admin-action">
              <strong>{String(d.action)}</strong>
              <p>{String(d.explanation)}</p>
              <button
                className="button"
                onClick={() => setTarget('decision:' + d.id)}
              >
                Contestar decisão
              </button>
            </article>
          ))}
          {target && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const [type, id] = target.split(':');
                void run('/moderation/appeals', {
                  [type === 'sanction' ? 'sanctionId' : 'decisionId']: id,
                  explanation,
                });
              }}
            >
              <h2>Enviar recurso</h2>
              <label className="account-field">
                Fundamentação
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </label>
              <button className="button button-primary" disabled={busy}>
                Enviar para revisão
              </button>
            </form>
          )}
          <h2>Meus recursos</h2>
          {data.appeals.map((a) => (
            <p key={String(a.id)}>
              {String(a.status)} ·{' '}
              {String(a.resolution ?? 'Aguardando análise independente.')}
            </p>
          ))}
        </>
      )}
      <h2>Solicitações de privacidade</h2>
      <p>
        A equipe verificará sua identidade antes de processar dados pessoais.
        Esta solicitação não apaga instantaneamente backups ou vídeos que
        permanecem no aparelho.
      </p>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run('/privacy/requests', {
            kind,
            explanation: privacy,
            operationId: crypto.randomUUID(),
          });
        }}
      >
        <label className="account-field">
          Tipo de solicitação
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {[
              ['question', 'Dúvida'],
              ['access', 'Acesso aos meus dados'],
              ['correction', 'Correção'],
              ['deletion', 'Exclusão de dados'],
              ['consent', 'Revisão de consentimentos'],
              ['export', 'Exportação individual'],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="account-field">
          Descreva sua solicitação
          <textarea
            required
            minLength={5}
            maxLength={1000}
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value)}
          />
        </label>
        <button className="button button-primary" disabled={busy}>
          Registrar solicitação
        </button>
      </form>
      {requests.map((p) => (
        <article key={String(p.id)}>
          <p>
            {String(p.kind)} · {String(p.status)}
          </p>
          <p>{String(p.resolution ?? 'Recebida para análise.')}</p>
        </article>
      ))}
    </section>
  );
}
