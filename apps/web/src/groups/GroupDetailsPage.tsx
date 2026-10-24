import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/ui';
import { apiUrl } from '../services/auth';
import { social } from '../social/service';
import { Feed, Report } from '../social/Feed';
import { GroupForm } from './GroupForm';
import {
  GroupAudit,
  GroupInvites,
  GroupMembers,
  GroupReports,
} from './GroupManagement';
import { roleNames, type Group } from './types';
import '../styles/social.css';
import '../styles/groups.css';
export function GroupCreatePage() {
  return (
    <div className="groups-page">
      <Link className="text-link" to="/comunidade/grupos">
        Voltar aos grupos
      </Link>
      <GroupForm />
    </div>
  );
}
export function GroupDetailsPage() {
  const { id } = useParams(),
    { user } = useAuth();
  return <Details key={`${id}:${user?.id ?? 'anonymous'}`} id={id!} />;
}
function Details({ id }: { id: string }) {
  const [group, setGroup] = useState<Group | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('posts'),
    [accepted, setAccepted] = useState(false),
    [confirm, setConfirm] = useState('');
  const { user } = useAuth(),
    navigate = useNavigate();
  useEffect(() => {
    const c = new AbortController();
    void social<{ group: Group }>(`/groups/${id}`, 'GET', undefined, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setGroup(r.group);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setGroup(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, revision]);
  useEffect(() => {
    const refresh = () => {
      setLoading(true);
      setRevision((n) => n + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  async function act(action: string, method = 'POST') {
    if (!group) return;
    setBusy(true);
    setError('');
    try {
      await social(`/groups/${id}${action ? `/${action}` : ''}`, method, {
        acceptRules: accepted,
        rulesVersion: group.rules_version,
        confirm: true,
      });
      setConfirm('');
      setAccepted(false);
      if (method === 'DELETE') navigate('/comunidade/grupos');
      else {
        setLoading(true);
        setRevision((n) => n + 1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const g = group,
    member = g?.member_status === 'active',
    staff = member && g?.role !== 'member',
    admin = member && (g?.role === 'owner' || g?.role === 'admin'),
    canInvite = member && (admin || g?.members_can_invite);
  const reload = () => {
    setTab('members');
    setLoading(true);
    setRevision((n) => n + 1);
  };
  return (
    <div className="groups-page">
      <Link className="text-link" to="/comunidade/grupos">
        Voltar aos grupos
      </Link>
      {loading && <p role="status">Carregando grupo…</p>}
      {error && (
        <p role="alert">
          {error}
          <button
            className="button"
            onClick={() => {
              setError('');
              setRevision((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {g && !loading && (
        <>
          <section className="panel social-summary">
            {g.images.cover && (
              <img
                className="group-cover"
                src={apiUrl(g.images.cover)}
                alt={`Capa de ${g.name}`}
                loading="lazy"
              />
            )}
            <div className="group-heading">
              <Avatar
                name={g.name}
                src={g.images.avatar ? apiUrl(g.images.avatar) : undefined}
                placeholder={!g.images.avatar}
              />
              <div>
                <h1>{g.name}</h1>
                <p>
                  {g.privacy_type === 'public' ? 'Público' : 'Privado'} ·{' '}
                  {g.discovery_mode === 'unlisted' ? 'Não listado · ' : ''}
                  {[g.city, g.state].filter(Boolean).join(', ') || 'Brasil'}
                </p>
              </div>
            </div>
            <p className="post-text">{g.description}</p>
            <p>{g.categories.join(' · ')}</p>
            {member && (
              <Link
                className="button"
                to={`/comunidade/eventos?groupId=${g.id}&filter=all`}
              >
                Eventos do grupo
              </Link>
            )}
            <p>
              {g.member_count !== null ? `${g.member_count} membros · ` : ''}
              {member && g.role
                ? roleNames[g.role]
                : g.member_status === 'pending'
                  ? 'Solicitação pendente'
                  : g.member_status === 'rejected'
                    ? 'Solicitação recusada'
                    : 'Visitante'}{' '}
              · {g.status === 'archived' ? 'Arquivado' : 'Ativo'}
            </p>
            {user ? (
              <>
                <div className="social-controls">
                  {g.member_status === 'pending' ? (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void act('leave')}
                    >
                      Cancelar solicitação
                    </button>
                  ) : member ? (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setConfirm('leave')}
                    >
                      Sair do grupo
                    </button>
                  ) : (
                    <button
                      className="button button-primary"
                      disabled={busy || !accepted || g.status !== 'active'}
                      onClick={() => void act('join')}
                    >
                      {g.privacy_type === 'private' ||
                      g.join_policy === 'approval'
                        ? 'Solicitar entrada'
                        : 'Entrar no grupo'}
                    </button>
                  )}
                  {canInvite && (
                    <button className="button" onClick={() => setTab('invite')}>
                      Convidar
                    </button>
                  )}
                  <button
                    className="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(location.origin + `/comunidade/grupos/${id}`)
                        .then(() =>
                          setError(
                            'Link copiado. Grupos não listados exigem convite.',
                          ),
                        )
                        .catch(() =>
                          setError('Não foi possível copiar o link.'),
                        );
                    }}
                  >
                    Copiar link do grupo
                  </button>
                </div>
                {(!member || g.accepted_rules_version !== g.rules_version) && (
                  <div className="social-summary">
                    <h3>Regras · versão {g.rules_version}</h3>
                    <ol className="group-rules">
                      {g.rules.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ol>
                    <label>
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                      />
                      Li e aceito as regras atuais
                    </label>
                    {member && (
                      <button
                        className="button"
                        disabled={busy || !accepted}
                        onClick={() => void act('accept-rules')}
                      >
                        Aceitar regras atualizadas
                      </button>
                    )}
                  </div>
                )}
                <Report id={id} kind="group" />
              </>
            ) : (
              <Link className="button" to="/entrar">
                Entrar para participar
              </Link>
            )}
          </section>
          <div className="social-controls">
            {[
              ['posts', 'Publicações'],
              ['about', 'Sobre'],
              ['rules', 'Regras'],
              ...(member ? [['members', 'Membros']] : []),
              ...(staff ? [['reports', 'Denúncias']] : []),
              ...(admin
                ? [
                    ['requests', 'Solicitações'],
                    ['settings', 'Administração'],
                    ['audit', 'Auditoria'],
                  ]
                : []),
            ].map(([key, name]) => (
              <button
                className="button"
                key={key}
                aria-pressed={tab === key}
                onClick={() => setTab(key!)}
              >
                {name}
              </button>
            ))}
          </div>
          {tab === 'posts' &&
            (g.privacy_type === 'public' || member ? (
              <Feed
                key={`${id}:${revision}`}
                groupId={id}
                canPost={Boolean(
                  member &&
                  g.status === 'active' &&
                  (staff || g.posting_policy === 'members') &&
                  g.accepted_rules_version === g.rules_version,
                )}
                canModerate={Boolean(staff)}
              />
            ) : (
              <p className="panel social-summary">
                Grupo privado. O feed e as fotografias ficam disponíveis após a
                aprovação.
              </p>
            ))}
          {tab === 'about' && (
            <section className="panel social-summary">
              <h2>Sobre</h2>
              <p className="post-text">{g.description}</p>
              <p>
                As categorias são interesses do grupo. Sua Garagem e seu
                Histórico são compartilhados somente por uma ação sua.
              </p>
            </section>
          )}
          {tab === 'rules' && (
            <section className="panel social-summary">
              <h2>Regras · versão {g.rules_version}</h2>
              {g.rules.length ? (
                <ol className="group-rules">
                  {g.rules.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              ) : (
                <p>Este grupo ainda não definiu regras.</p>
              )}
            </section>
          )}
          {tab === 'members' && member && (
            <GroupMembers g={g} onChange={reload} />
          )}
          {tab === 'requests' && admin && (
            <GroupMembers
              g={g}
              requests
              onChange={() => {
                setLoading(true);
                setRevision((n) => n + 1);
              }}
            />
          )}
          {tab === 'invite' && canInvite && <GroupInvites g={g} />}
          {tab === 'audit' && admin && <GroupAudit g={g} />}
          {tab === 'reports' && staff && <GroupReports g={g} />}
          {tab === 'settings' && admin && (
            <>
              <GroupForm
                group={g}
                onSaved={() => {
                  setLoading(true);
                  setRevision((n) => n + 1);
                }}
              />
              {g.role === 'owner' && (
                <section className="panel social-summary">
                  <h2>Estado do grupo</h2>
                  <p>
                    Para transferir a propriedade, escolha um membro ativo na
                    área Membros. A exclusão é lógica e preserva auditoria e
                    denúncias.
                  </p>
                  <div className="social-controls">
                    <button
                      className="button"
                      onClick={() =>
                        setConfirm(
                          g.status === 'archived' ? 'restore' : 'archive',
                        )
                      }
                    >
                      {g.status === 'archived'
                        ? 'Restaurar grupo'
                        : 'Arquivar grupo'}
                    </button>
                    <button
                      className="button"
                      onClick={() => setConfirm('delete')}
                    >
                      Excluir grupo
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
          {confirm && (
            <div
              className="panel social-summary"
              role="dialog"
              aria-label="Confirmar ação no grupo"
            >
              <p>
                {confirm === 'leave'
                  ? 'Confirmar saída? O proprietário precisa transferir a propriedade primeiro.'
                  : confirm === 'delete'
                    ? 'Confirmar exclusão lógica? O conteúdo deixará de ser acessível.'
                    : confirm === 'archive'
                      ? 'Arquivar grupo? Novas interações serão bloqueadas.'
                      : 'Restaurar este grupo?'}
              </p>
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() =>
                  void act(
                    confirm === 'delete' ? '' : confirm,
                    confirm === 'delete' ? 'DELETE' : 'POST',
                  )
                }
              >
                Confirmar ação
              </button>
              <button className="button" onClick={() => setConfirm('')}>
                Cancelar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function GroupInvitationPage() {
  const { user } = useAuth();
  const { invitationId } = useParams();
  return <InvitationView key={`${user?.id ?? 'anonymous'}:${invitationId}`} />;
}
function InvitationView() {
  const { invitationId } = useParams(),
    { user } = useAuth(),
    loc = useLocation(),
    navigate = useNavigate();
  const [token] = useState(() =>
      new URLSearchParams(loc.hash.slice(1)).get('token'),
    ),
    [group, setGroup] = useState<Group | null>(null),
    [error, setError] = useState(''),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    const c = new AbortController();
    void social<{ group: Group }>(
      `/groups/invitations/${invitationId}/preview`,
      'POST',
      { token },
      c.signal,
    )
      .then((r) => {
        if (!c.signal.aborted) setGroup(r.group);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setGroup(null);
        }
      });
    return () => c.abort();
  }, [invitationId, token, user]);
  async function act(action: string) {
    if (!group) return;
    setBusy(true);
    try {
      await social(`/groups/invitations/${invitationId}/${action}`, 'POST', {
        token,
        acceptRules: accepted,
        rulesVersion: group.rules_version,
      });
      navigate(
        action === 'accept'
          ? `/comunidade/grupos/${group.id}`
          : '/comunidade/grupos',
      );
    } catch (e) {
      setError((e as Error).message);
      setGroup(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="groups-page">
      <h1>Convite para grupo</h1>
      {!user && (
        <Link
          className="button"
          to={`/entrar?retorno=${encodeURIComponent(loc.pathname + loc.hash)}`}
        >
          Entre na sua conta para consultar o convite
        </Link>
      )}
      {error && <p role="alert">{error}</p>}
      {group && (
        <section className="panel social-summary">
          <h2>{group.name}</h2>
          <p>{group.description}</p>
          <p>
            O convite permite conhecer a apresentação. O conteúdo privado exige
            aceitação.
          </p>
          <ol>
            {group.rules.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            Li e aceito as regras
          </label>
          <div className="social-controls">
            <button
              className="button button-primary"
              disabled={busy || !accepted}
              onClick={() => void act('accept')}
            >
              Aceitar convite
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void act('reject')}
            >
              Recusar convite
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
