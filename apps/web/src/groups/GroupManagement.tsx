import { useState } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Checkbox,
  Input,
  Select,
  Textarea,
} from '../components/design-system';
import { Report } from '../social/Feed';
import { social } from '../social/service';
import type { Person } from '../social/types';
import { usePage } from '../social/usePage';
import { PageState } from './GroupsPage';
import {
  roleNames,
  statusNames,
  type Group,
  type GroupMember,
  type Invitation,
} from './types';
export function GroupMembers({
  g,
  requests = false,
  onChange,
}: {
  g: Group;
  requests?: boolean;
  onChange: () => void;
}) {
  const [q, setQ] = useState(''),
    p = usePage<GroupMember>(
      `/groups/${g.id}/${requests ? 'join-requests' : 'members'}?q=${encodeURIComponent(q)}`,
    );
  return (
    <section>
      <h2>{requests ? 'Solicitações pendentes' : 'Membros autorizados'}</h2>
      <label className="account-field">
        Pesquisar membros
        <Input
          maxLength={100}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <p>Perfis privados e bloqueios limitam as informações exibidas.</p>
      {p.data.items.map((m) => (
        <Member
          key={m.id}
          g={g}
          m={m}
          requests={requests}
          onSaved={() => {
            void p.reload();
            onChange();
          }}
        />
      ))}
      <PageState
        p={p}
        empty={
          requests
            ? 'Nenhum pedido pendente.'
            : 'Nenhum membro visível nesta página.'
        }
      />
    </section>
  );
}
function Member({
  g,
  m,
  requests,
  onSaved,
}: {
  g: Group;
  m: GroupMember;
  requests: boolean;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(''),
    [role, setRole] = useState(m.role === 'owner' ? 'member' : m.role),
    [hours, setHours] = useState(24),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [transfer, setTransfer] = useState(false);
  const rank = { owner: 3, admin: 2, moderator: 1, member: 0 },
    manage = Boolean(g.role && rank[g.role] > rank[m.role]);
  async function act(action: string, method = 'POST', body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await social(
        `/groups/${g.id}/${action}`,
        method,
        body ?? {
          reason,
          expiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
        },
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const member = `members/${m.id}`;
  return (
    <article className="group-member panel">
      <div>
        <Link to={`/comunidade/u/${m.username}`}>
          <strong>{m.displayName}</strong>
        </Link>
        <p>
          {roleNames[m.role]} · {statusNames[m.status] ?? m.status}{' '}
          {m.suspended ? '· Suspenso' : ''}
        </p>
        {m.joined_at && (
          <small>
            Desde {new Date(m.joined_at).toLocaleDateString('pt-BR')}
          </small>
        )}
      </div>
      {requests ? (
        <div className="social-controls">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void act(`join-requests/${m.id}/approve`)}
          >
            Aprovar
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void act(`join-requests/${m.id}/reject`)}
          >
            Recusar solicitação
          </Button>
        </div>
      ) : (
        <>
          {manage && (
            <fieldset className="account-form" disabled={busy}>
              <label className="account-field">
                Motivo da medida
                <Input
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="account-field">
                Suspensão (horas, até 720)
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
              </label>
              <div className="social-controls">
                {m.status === 'banned' ? (
                  <Button
                    variant="secondary"
                    onClick={() => void act(`${member}/ban`, 'DELETE')}
                  >
                    Revogar banimento
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="destructive"
                      disabled={!reason.trim()}
                      onClick={() => void act(member, 'DELETE')}
                    >
                      Remover membro
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!reason.trim()}
                      onClick={() => void act(`${member}/ban`)}
                    >
                      Banir membro
                    </Button>
                    {m.suspended ? (
                      <Button
                        variant="secondary"
                        onClick={() => void act(`${member}/suspend`, 'DELETE')}
                      >
                        Encerrar suspensão
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={
                          !reason.trim() ||
                          m.status !== 'active' ||
                          hours < 1 ||
                          hours > 720
                        }
                        onClick={() => void act(`${member}/suspend`)}
                      >
                        Suspender membro
                      </Button>
                    )}
                  </>
                )}
              </div>
            </fieldset>
          )}
          {g.role === 'owner' &&
            m.role !== 'owner' &&
            m.status === 'active' && (
              <fieldset className="account-form" disabled={busy}>
                <label className="account-field">
                  Cargo
                  <Select
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                  >
                    {['member', 'moderator', 'admin'].map((r) => (
                      <option key={r} value={r}>
                        {roleNames[r as keyof typeof roleNames]}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button
                  variant="secondary"
                  onClick={() => void act(`${member}/role`, 'PATCH', { role })}
                >
                  Alterar cargo
                </Button>
                <label>
                  <Checkbox
                    checked={transfer}
                    onChange={(e) => setTransfer(e.target.checked)}
                  />
                  Confirmo transferir a propriedade para {m.displayName}
                </label>
                <Button
                  variant="secondary"
                  disabled={!transfer || m.suspended}
                  onClick={() =>
                    void act('transfer-ownership', 'POST', {
                      userId: m.id,
                      confirm: true,
                    })
                  }
                >
                  Transferir propriedade
                </Button>
              </fieldset>
            )}
          <Report id={m.id} kind="group_member" groupId={g.id} />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function GroupInvites({ g }: { g: Group }) {
  const p = usePage<Invitation>(`/groups/${g.id}/invitations`),
    [q, setQ] = useState(''),
    [people, setPeople] = useState<Person[]>([]),
    [target, setTarget] = useState(''),
    [limit, setLimit] = useState(1),
    [days, setDays] = useState(7),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState<string | null>(null);
  async function find(cursor?: string) {
    try {
      const r = await social<{ items: Person[]; nextCursor: string | null }>(
        `/users/search?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      setPeople((old) => (cursor ? [...old, ...r.items] : r.items));
      setMore(r.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function invite() {
    setBusy(true);
    setError('');
    try {
      const r = await social<{
        invitation: { id: string; token: string | null };
      }>(`/groups/${g.id}/invitations`, 'POST', {
        userId: target || null,
        usageLimit: limit,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
      });
      setUrl(
        r.invitation.token
          ? `${location.origin}/comunidade/grupos/convite/${r.invitation.id}#token=${r.invitation.token}`
          : 'Convite enviado à área de grupos da pessoa selecionada.',
      );
      await p.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel social-composer">
      <h2>Convidar motociclistas</h2>
      <fieldset disabled={busy} className="account-form">
        <label className="account-field">
          Buscar motociclista
          <Input
            maxLength={80}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          disabled={!q.trim()}
          onClick={() => void find()}
        >
          Buscar pessoa
        </Button>
        <label className="account-field">
          Destinatário
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Link limitado e revogável</option>
            {people.map((p) => (
              <option value={p.id} key={p.id}>
                {p.displayName} · @{p.username}
              </option>
            ))}
          </Select>
        </label>
        {more && (
          <Button variant="secondary" onClick={() => void find(more)}>
            Mais pessoas
          </Button>
        )}
        <label className="account-field">
          Expiração (dias)
          <Input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        {!target && (
          <label className="account-field">
            Limite de usos
            <Input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
        )}
        <Button
          variant="secondary"
          disabled={days < 1 || days > 30 || limit < 1 || limit > 100}
          onClick={() => void invite()}
        >
          Gerar convite
        </Button>
      </fieldset>
      {url && (
        <label className="account-field">
          Resultado do convite
          <Textarea readOnly rows={4} value={url} />
          <small>Guarde o link agora. O token é mostrado uma única vez.</small>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <h3>Convites criados</h3>
      {p.data.items.map((i) => (
        <div className="group-member" key={i.id}>
          <p>
            {i.id.slice(0, 8)} · {statusNames[i.status ?? 'pending']} ·{' '}
            {i.usage_count}/{i.usage_limit} usos ·{' '}
            {new Date(i.expires_at).toLocaleString('pt-BR')}
          </p>
          <Button
            variant="secondary"
            disabled={busy || i.status !== 'pending'}
            onClick={() => {
              setBusy(true);
              void social(`/groups/${g.id}/invitations/${i.id}`, 'DELETE')
                .then(() => p.reload())
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Revogar convite
          </Button>
        </div>
      ))}
      <PageState p={p} empty="Nenhum convite criado." />
    </section>
  );
}
export function GroupAudit({ g }: { g: Group }) {
  const p = usePage<{
    id: string;
    action: string;
    actor_id: string;
    target_id: string | null;
    reason: string;
    created_at: string;
  }>(`/groups/${g.id}/audit`);
  return (
    <section>
      <h2>Auditoria</h2>
      {p.data.items.map((a) => (
        <div className="panel social-summary" key={a.id}>
          <strong>{a.action}</strong>
          <p>
            {new Date(a.created_at).toLocaleString('pt-BR')} · Responsável:{' '}
            {a.actor_id}
          </p>
          <p>{a.reason}</p>
        </div>
      ))}
      <PageState p={p} empty="Nenhuma ação registrada." />
    </section>
  );
}
export function GroupReports({ g }: { g: Group }) {
  const p = usePage<{
      id: string;
      reason: string;
      detail: string;
      escalation: string;
      reviewed: boolean;
      post_id: string | null;
      comment_id: string | null;
      group_member_id: string | null;
    }>(`/groups/${g.id}/reports`),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section>
      <h2>Denúncias internas</h2>
      <p>
        A identidade do denunciante fica protegida. A análise interna preserva o
        registro enviado à plataforma.
      </p>
      {p.data.items.map((r) => (
        <article key={r.id} className="panel social-summary">
          <strong>{r.reason}</strong>
          <p>{r.detail}</p>
          <p>
            Alvo: {r.post_id ?? r.comment_id ?? r.group_member_id ?? 'Grupo'} ·{' '}
            {r.reviewed ? 'Analisada internamente' : 'Pendente'} · Plataforma
          </p>
          <Button
            variant="secondary"
            disabled={busy || r.reviewed}
            onClick={() => {
              setBusy(true);
              void social(`/groups/${g.id}/reports/${r.id}/review`, 'POST', {
                reason: 'Analisada pela moderação interna',
              })
                .then(() => p.reload())
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Registrar análise
          </Button>
        </article>
      ))}
      <PageState p={p} empty="Nenhuma denúncia disponível." />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
