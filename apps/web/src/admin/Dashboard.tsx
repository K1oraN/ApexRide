import { useEffect, useState } from 'react';
import { adminRequest, errorText } from './service';
const labels: Record<string, string> = {
  users: 'Contas cadastradas',
  new_users: 'Novas contas no período',
  active_users: 'Contas ativas no período',
  posts: 'Publicações disponíveis',
  groups: 'Grupos ativos',
  events: 'Eventos programados',
  pending_routes: 'Rotas em revisão',
  pending_circuits: 'Circuitos sem verificação',
  open_reports: 'Denúncias abertas',
  priority_reports: 'Denúncias prioritárias',
  reviewing: 'Casos em análise',
  pending_xp: 'Processamentos de XP',
  xp_anomalies: 'Anomalias de XP',
  privacy_requests: 'Solicitações de privacidade',
  incidents: 'Incidentes em andamento',
  active_social_sessions: 'Sessões de GPS social',
};
type Data = {
  metrics: Record<string, number>;
  registrationsByDay: { day: string; count: number }[];
  period: { from: string; to: string };
  activeDefinition: string;
  inventoryDefinition: string;
};
export function AdminDashboard() {
  const [days, setDays] = useState('7'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let start = new Date(Date.now() - Number(days || 7) * 86400000),
      end = new Date();
    if (days === '1') {
      start = new Date();
      start.setHours(0, 0, 0, 0);
    }
    if (days === 'custom') {
      if (!from || !to) return;
      start = new Date(from);
      end = new Date(to);
    }
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setData(null);
        setError('');
      }
    });
    void adminRequest<Data>(
      '/admin/dashboard?' +
        new URLSearchParams({
          from: start.toISOString(),
          to: end.toISOString(),
        }),
      'GET',
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      });
    return () => controller.abort();
  }, [days, from, to, revision]);
  return (
    <>
      <span className="eyebrow">OPERAÇÃO DA PLATAFORMA</span>
      <h1>Visão geral</h1>
      <div className="admin-filters">
        <label className="account-field">
          Período
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">Hoje</option>
            <option value="7">Últimos sete dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        {days === 'custom' && (
          <>
            <label className="account-field">
              Início
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="account-field">
              Fim
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button className="button" onClick={() => setRevision((n) => n + 1)}>
          Atualizar indicadores
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">
          {days === 'custom' && (!from || !to)
            ? 'Selecione início e fim.'
            : 'Carregando indicadores reais…'}
        </p>
      ) : (
        <>
          <p>
            {new Date(data.period.from).toLocaleString('pt-BR')} —{' '}
            {new Date(data.period.to).toLocaleString('pt-BR')}
          </p>
          <p className="admin-muted">
            {data.activeDefinition} {data.inventoryDefinition}
          </p>
          <div className="admin-metrics">
            {Object.entries(data.metrics).map(([k, value]) => (
              <article className="panel" key={k}>
                <p>{labels[k] ?? k}</p>
                <strong>{value.toLocaleString('pt-BR')}</strong>
              </article>
            ))}
          </div>
          <figure className="panel admin-action">
            <figcaption>Novas contas por dia · America/Sao_Paulo</figcaption>
            <div
              className="admin-daily-chart"
              role="img"
              aria-label={data.registrationsByDay
                .map((d) => `${d.day}: ${d.count} contas`)
                .join('; ')}
            >
              {data.registrationsByDay.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.count} contas`}>
                  <span
                    style={{
                      height: `${(d.count / Math.max(1, ...data.registrationsByDay.map((v) => v.count))) * 100}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <small className="admin-muted">
              {data.registrationsByDay[0]?.day} —{' '}
              {data.registrationsByDay.at(-1)?.day} · Contagens reais no período
              selecionado.
            </small>
          </figure>
          <p className="admin-muted">
            Prioridade alta: denúncia de dados pessoais ou atividade perigosa.
            Uma denúncia exige análise e não comprova infração. GPS social é
            exibido somente como agregado.
          </p>
        </>
      )}
    </>
  );
}
