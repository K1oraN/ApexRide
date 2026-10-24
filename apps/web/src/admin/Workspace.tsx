import { RouteMap } from '../components/maps/RouteMap';
import type { Line } from '@apex-ride/ride-core/routes';
import { useEffect, useState } from 'react';
import { apiUrl } from '../services/auth';
import { adminRequest, errorText, type Row } from './service';
import { actions, type Action } from './actions';
import { ActionForm } from './ActionForm';
import { RankingDetails } from './RankingDetails';
const specs: Record<
  string,
  { title: string; path: string; columns: string[] }
> = {
  users: {
    title: 'Usuários',
    path: '/admin/users',
    columns: [
      'display_name',
      'username',
      'effective_status',
      'restricted',
      'created_at',
    ],
  },
  reports: {
    title: 'Central de denúncias',
    path: '/admin/reports',
    columns: ['target_type', 'reason', 'priority', 'status', 'assigned_to'],
  },
  appeals: {
    title: 'Recursos e contestações',
    path: '/admin/appeals',
    columns: ['status', 'explanation', 'created_at'],
  },
  groups: {
    title: 'Supervisão de grupos',
    path: '/admin/groups',
    columns: ['name', 'privacy_type', 'status', 'owner_id'],
  },
  events: {
    title: 'Supervisão de eventos',
    path: '/admin/events',
    columns: ['title', 'visibility', 'status', 'starts_at'],
  },
  routes: {
    title: 'Revisão de rotas',
    path: '/admin/routes',
    columns: ['name', 'kind', 'status', 'verification', 'version'],
  },
  circuits: {
    title: 'Verificação de circuitos',
    path: '/admin/circuits',
    columns: ['name', 'status', 'verification', 'version'],
  },
  gamification: {
    title: 'Integridade de XP',
    path: '/admin/gamification/anomalies',
    columns: ['user_id', 'source_type', 'reason', 'status'],
  },
  rankings: {
    title: 'Rankings e resultados de pista',
    path: '/admin/rankings',
    columns: ['name', 'status', 'revision', 'starts_at'],
  },
  approvals: {
    title: 'Aprovações críticas',
    path: '/admin/approvals',
    columns: ['action_type', 'target_reference', 'status', 'expires_at'],
  },
  operators: {
    title: 'Operadores autorizados',
    path: '/admin/operators',
    columns: ['display_name', 'username', 'roles', 'mfa_enrolled'],
  },
  roles: {
    title: 'Matriz de permissões',
    path: '/admin/roles',
    columns: ['name', 'code', 'permissions'],
  },
  audit: {
    title: 'Auditoria administrativa',
    path: '/admin/audit',
    columns: [
      'action',
      'resource_type',
      'resource_id',
      'outcome',
      'created_at',
    ],
  },
  security: {
    title: 'Segurança · últimas 24 horas',
    path: '/admin/security/overview',
    columns: ['action', 'outcome', 'count'],
  },
  incidents: {
    title: 'Incidentes de segurança',
    path: '/admin/security/incidents',
    columns: ['category', 'severity', 'status', 'created_at'],
  },
  privacy: {
    title: 'Solicitações de privacidade',
    path: '/admin/privacy',
    columns: ['kind', 'status', 'user_id', 'created_at'],
  },
  settings: {
    title: 'Configurações versionadas',
    path: '/admin/settings',
    columns: ['id', 'reason', 'created_at'],
  },
};
const labels: Record<string, string> = {
  id: 'Identificador',
  display_name: 'Nome público',
  username: 'Usuário',
  account_status: 'Estado da conta',
  effective_status: 'Estado efetivo',
  restricted: 'Restrição ativa',
  created_at: 'Registrado em',
  target_type: 'Tipo',
  target_id: 'Recurso',
  reason: 'Motivo',
  priority: 'Prioridade',
  status: 'Estado',
  assigned_to: 'Revisor',
  name: 'Nome',
  privacy_type: 'Privacidade',
  owner_id: 'Responsável',
  title: 'Título',
  visibility: 'Visibilidade',
  starts_at: 'Início',
  ends_at: 'Encerramento',
  kind: 'Tipo',
  verification: 'Verificação',
  version: 'Versão',
  user_id: 'Conta',
  source_type: 'Origem',
  source_id: 'Referência de origem',
  revision: 'Revisão',
  action_type: 'Operação',
  target_reference: 'Referência',
  expires_at: 'Expiração',
  roles: 'Papéis',
  mfa_enrolled: 'MFA confirmado',
  code: 'Código',
  permissions: 'Permissões',
  action: 'Ação',
  resource_type: 'Recurso',
  resource_id: 'Referência',
  outcome: 'Resultado',
  count: 'Quantidade',
  category: 'Categoria',
  severity: 'Gravidade',
  explanation: 'Fundamentação',
  text: 'Texto denunciado',
  author_id: 'Autor',
  detail: 'Relato',
  reviewer_id: 'Operador',
  reason_code: 'Política',
  scope: 'Funcionalidade',
  sanction_type: 'Medida',
  begins_at: 'Início',
  revoked_at: 'Revogada em',
  resolution: 'Resposta',
  identity_verified_at: 'Identidade verificada em',
};
function format(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map(format).join(', ');
  if (typeof value === 'object')
    return Object.entries(value as Row)
      .map(([k, v]) => `${labels[k] ?? k}: ${format(v)}`)
      .join('\n');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value))
    return new Date(value).toLocaleString('pt-BR');
  return String(value);
}
function fieldFormat(key: string, value: unknown) {
  if (key === 'effective_status')
    return (
      (
        {
          active: 'Ativa',
          disabled: 'Desativada',
          restricted: 'Restrita',
          suspended_temporarily: 'Suspensa temporariamente',
          suspended_indefinitely: 'Suspensa por prazo indeterminado',
        } as Record<string, string>
      )[String(value)] ?? format(value)
    );
  return format(value);
}
function Details({ row }: { row: Row }) {
  return (
    <dl>
      {Object.entries(row)
        .filter(
          ([k]) => !['geometry', 'start_line', 'source_report_id'].includes(k),
        )
        .map(([k, value]) => (
          <div key={k}>
            <dt>{labels[k] ?? k.replaceAll('_', ' ')}</dt>
            <dd>{fieldFormat(k, value)}</dd>
          </div>
        ))}
    </dl>
  );
}
export function AdminWorkspace({
  section,
  permissions,
  operatorId,
}: {
  section: string;
  permissions: string[];
  operatorId: string;
}) {
  const spec = specs[section]!,
    [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [query, setQuery] = useState(''),
    [state, setState] = useState(''),
    [selected, setSelected] = useState<Row | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0),
    [action, setAction] = useState<Action | null>(null),
    [message, setMessage] = useState(''),
    [ledgerUser, setLedgerUser] = useState(''),
    [ledger, setLedger] = useState<Row[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setBusy(true);
        setError('');
        setRows([]);
      }
    });
    const params = new URLSearchParams({
      page: String(page),
      ...(query ? { search: query } : {}),
      ...(state ? { status: state } : {}),
    });
    void adminRequest<{ items?: Row[]; routes?: Row[]; hasMore?: boolean }>(
      spec.path + '?' + params,
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        setRows(data.items ?? data.routes ?? []);
        setMore(data.hasMore ?? data.routes?.length === 50);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [spec.path, page, query, state, revision]);
  async function select(row: Row) {
    setSelected(row);
    setDetail(null);
    setAction(null);
    setError('');
    try {
      if (section === 'reports' && row.assigned_to)
        setDetail(await adminRequest(`/admin/reports/${row.id}`));
      else if (section === 'users')
        setDetail(await adminRequest(`/admin/users/${row.id}`));
      else if (['routes', 'circuits'].includes(section))
        setDetail(await adminRequest(`/admin/routes/${row.id}/review`));
      else setDetail(row);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const available = actions(
    section,
    selected
      ? { ...selected, authorId: (detail?.evidence as Row)?.author_id }
      : null,
    permissions,
  );
  return (
    <>
      <span className="eyebrow">PAINEL ADMINISTRATIVO</span>
      <h1>{spec.title}</h1>
      <p className="admin-muted">
        Consultas limitadas à finalidade operacional. Dados privados de GPS,
        vídeos locais e senhas não fazem parte deste painel.
      </p>
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search);
          setState(status);
          setSelected(null);
          setDetail(null);
        }}
      >
        {section === 'users' && (
          <label className="account-field">
            Buscar conta
            <input
              type="search"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome público, usuário ou ID"
            />
          </label>
        )}
        {![
          'roles',
          'operators',
          'settings',
          'rankings',
          'security',
          'routes',
          'circuits',
        ].includes(section) && (
          <label className="account-field">
            Estado
            <input
              value={status}
              maxLength={40}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Todos"
            />
          </label>
        )}
        <button className="button">Filtrar</button>
        <button
          type="button"
          className="button"
          onClick={() => setRevision((n) => n + 1)}
        >
          Atualizar
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {message && (
        <p role="status" className="admin-status">
          {message}
        </p>
      )}
      {busy ? (
        <p role="status">Carregando registros…</p>
      ) : !rows.length ? (
        <p>Nenhum registro nesta página.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">
              {spec.title} · página {page}
            </caption>
            <thead>
              <tr>
                {spec.columns.map((k) => (
                  <th key={k} scope="col">
                    {labels[k] ?? k}
                  </th>
                ))}
                <th scope="col">Revisão</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={String(row.id ?? row.code ?? i)}
                  aria-selected={selected === row}
                >
                  {spec.columns.map((k) => (
                    <td key={k}>{fieldFormat(k, row[k])}</td>
                  ))}
                  <td>
                    <button
                      className="button"
                      onClick={() => void select(row)}
                      aria-label={`Abrir ${String(row.name ?? row.title ?? row.username ?? row.id ?? i + 1)}`}
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="admin-pagination">
        <button
          className="button"
          disabled={page === 1 || busy}
          onClick={() => {
            setPage((p) => p - 1);
            setSelected(null);
            setDetail(null);
          }}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          className="button"
          disabled={!more || busy}
          onClick={() => {
            setPage((p) => p + 1);
            setSelected(null);
            setDetail(null);
          }}
        >
          Próxima
        </button>
      </div>
      {selected && (
        <section className="admin-evidence">
          <h2>Recurso selecionado</h2>
          <Details row={selected} />
          {detail && (
            <>
              {['case', 'report', 'evidence', 'user', 'route'].map((k) =>
                detail[k] && typeof detail[k] === 'object' ? (
                  <div key={k}>
                    <h3>
                      {
                        (
                          {
                            case: 'Caso',
                            report: 'Denúncia',
                            evidence: 'Evidência delimitada',
                            user: 'Conta',
                            route: 'Representação submetida',
                          } as Record<string, string>
                        )[k]
                      }
                    </h3>
                    <Details row={detail[k] as Row} />
                  </div>
                ) : null,
              )}
              {Array.isArray(detail.decisions) &&
                detail.decisions.map((d, i) => (
                  <Details key={i} row={d as Row} />
                ))}
              {Array.isArray(detail.sanctions) &&
                detail.sanctions.map((d, i) => (
                  <Details key={i} row={d as Row} />
                ))}
              {detail.route && (detail.route as Row).geometry ? (
                <RouteMap
                  routes={[
                    {
                      id: String((detail.route as Row).id),
                      geometry: (detail.route as Row).geometry as Line,
                    },
                  ]}
                  gateLine={
                    ((detail.route as Row).start_line ?? null) as Line | null
                  }
                  description="Representação submetida para revisão; nenhuma atividade privada é consultada."
                />
              ) : null}
              {section === 'reports' &&
                (Array.isArray(detail.photos) ? detail.photos : []).map((m) => (
                  <img
                    key={String((m as Row).id)}
                    loading="lazy"
                    src={apiUrl(
                      `/admin/reports/${selected.id}/media/${(m as Row).id}`,
                    )}
                    alt="Fotografia vinculada ao caso"
                  />
                ))}
              {section === 'reports' && selected.target_type === 'photo' && (
                <img
                  src={apiUrl(
                    `/admin/reports/${selected.id}/media/${selected.target_id}`,
                  )}
                  alt="Fotografia denunciada"
                />
              )}
            </>
          )}
          {section === 'reports' && (
            <p>
              Seu ID de operador para atribuição: <code>{operatorId}</code>
            </p>
          )}
        </section>
      )}
      {section === 'gamification' && (
        <section className="panel admin-action">
          <h2>Consultar livro-razão</h2>
          <form
            className="admin-filters"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              void Promise.all([
                adminRequest<{ items: Row[]; balance: string }>(
                  `/admin/gamification/users/${encodeURIComponent(ledgerUser)}/ledger`,
                ),
                adminRequest<{ items: Row[] }>(
                  `/admin/gamification/users/${encodeURIComponent(ledgerUser)}/achievements`,
                ),
              ])
                .then(([d, a]) => {
                  setLedger([...d.items, ...a.items]);
                  setMessage(`Saldo derivado do livro-razão: ${d.balance} XP`);
                })
                .catch((e) => setError(errorText(e)));
            }}
          >
            <label className="account-field">
              ID da conta para consultar XP
              <input
                required
                value={ledgerUser}
                onChange={(e) => setLedgerUser(e.target.value)}
              />
            </label>
            <button className="button">Consultar XP</button>
          </form>
          {ledger?.map((row, i) => (
            <div className="admin-evidence" key={i}>
              <Details row={row} />
            </div>
          ))}
        </section>
      )}
      {section === 'rankings' && selected?.id ? (
        <RankingDetails
          key={String(selected.id)}
          season={String(selected.id)}
        />
      ) : null}
      {available.length > 0 && (
        <section className="admin-pagination" aria-label="Ações autorizadas">
          {available.map((a) => (
            <button
              key={a.label}
              className="button"
              onClick={() => {
                setAction(a);
                setMessage('');
              }}
            >
              {a.label}
            </button>
          ))}
        </section>
      )}
      {action && (
        <ActionForm
          key={action.label + String(selected?.id ?? '')}
          action={action}
          onCancel={() => setAction(null)}
          onDone={() => {
            setAction(null);
            setSelected(null);
            setDetail(null);
            setMessage(
              'Operação confirmada pelo servidor. Solicitações críticas permanecem na fila até aprovação independente.',
            );
            setRevision((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
