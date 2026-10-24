import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/ui';
import { apiUrl } from '../services/auth';
import { usePage } from '../social/usePage';
import { social } from '../social/service';
import { roleNames, type Group, type Invitation } from './types';
import '../styles/social.css';
import '../styles/groups.css';
export function GroupCard({ g }: { g: Group }) {
  return (
    <article className="panel social-summary motorcycle-group-card">
      <div className="group-heading">
        <Avatar
          name={g.name}
          src={g.images.avatar ? apiUrl(g.images.avatar) : undefined}
          placeholder={!g.images.avatar}
        />
        <div>
          <h3>
            <Link to={`/comunidade/grupos/${g.id}`}>{g.name}</Link>
          </h3>
          <small>
            {g.privacy_type === 'public' ? 'Público' : 'Privado'} ·{' '}
            {[g.city, g.state].filter(Boolean).join(', ') || 'Brasil'}
          </small>
        </div>
      </div>
      <p className="post-text">{g.description.slice(0, 200)}</p>
      <p>{g.categories.join(' · ')}</p>
      <small>
        {g.member_count !== null ? `${g.member_count} membros · ` : ''}
        {g.role && g.member_status === 'active'
          ? roleNames[g.role]
          : g.member_status === 'pending'
            ? 'Solicitação pendente'
            : g.member_status === 'rejected'
              ? 'Solicitação recusada'
              : 'Conhecer grupo'}
      </small>
    </article>
  );
}
export function GroupList({ profileId }: { profileId: string }) {
  const p = usePage<Group>(`/groups?profileId=${profileId}`);
  return (
    <>
      <h3>Grupos públicos autorizados</h3>
      {p.data.items.map((g) => (
        <GroupCard key={g.id} g={g} />
      ))}
      <PageState p={p} empty="Nenhuma participação pública disponível." />
    </>
  );
}
export function PageState({
  p,
  empty,
}: {
  p: {
    loading: boolean;
    error: string;
    data: { items: unknown[]; nextCursor: string | null };
    reload: () => Promise<void>;
    more: () => Promise<void>;
  };
  empty: string;
}) {
  return (
    <>
      {p.loading && <p role="status">Carregando…</p>}
      {p.error && (
        <p role="alert">
          {p.error}{' '}
          <button className="button" onClick={() => void p.reload()}>
            Tentar novamente
          </button>
        </p>
      )}
      {!p.loading && !p.error && !p.data.items.length && (
        <p className="panel social-summary">{empty}</p>
      )}
      {p.data.nextCursor && (
        <button
          className="button"
          disabled={p.loading}
          onClick={() => void p.more()}
        >
          Carregar mais
        </button>
      )}
    </>
  );
}
function Inbox() {
  const p = usePage<Invitation>('/groups/invitations/mine'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState<Record<string, boolean>>({});
  async function act(i: Invitation, action: string) {
    setBusy(true);
    try {
      await social(`/groups/invitations/${i.id}/${action}`, 'POST', {
        acceptRules: accepted[i.id],
        rulesVersion: i.rules_version,
      });
      await p.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Convites recebidos</h2>
      {p.data.items.map((i) => (
        <article className="panel social-summary" key={i.id}>
          <h3>{i.name}</h3>
          <p>Expira em {new Date(i.expires_at).toLocaleString('pt-BR')}</p>
          <ol>
            {i.rules.map((r, n) => (
              <li key={n}>{r}</li>
            ))}
          </ol>
          <label>
            <input
              type="checkbox"
              checked={accepted[i.id] ?? false}
              onChange={(e) =>
                setAccepted((old) => ({ ...old, [i.id]: e.target.checked }))
              }
            />
            Li e aceito as regras
          </label>
          <div className="social-controls">
            <button
              className="button"
              disabled={busy || !accepted[i.id]}
              onClick={() => void act(i, 'accept')}
            >
              Aceitar convite
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void act(i, 'reject')}
            >
              Recusar convite
            </button>
          </div>
        </article>
      ))}
      <PageState p={p} empty="Nenhum convite pendente." />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function GroupsPage() {
  const { user } = useAuth();
  return <GroupsView key={user?.id ?? 'anonymous'} />;
}
function GroupsView() {
  const [params] = useSearchParams();
  const { user } = useAuth(),
    [q, setQ] = useState(''),
    [term, setTerm] = useState(''),
    [filter, setFilter] = useState(
      user && params.get('filter') === 'mine' ? 'mine' : 'all',
    ),
    [city, setCity] = useState(''),
    [state, setState] = useState(''),
    [category, setCategory] = useState(''),
    [sort, setSort] = useState('recent'),
    [inbox, setInbox] = useState(false);
  const query = new URLSearchParams({
      q: term,
      filter,
      city,
      state,
      category,
      sort,
    }),
    p = usePage<Group>(`/groups?${query}`);
  return (
    <div className="groups-page">
      <Link className="text-link" to="/comunidade">
        Voltar à Comunidade
      </Link>
      <div className="section-title">
        <h1>GRUPOS</h1>
        {user && (
          <Link className="button button-primary" to="/comunidade/grupos/novo">
            Criar grupo
          </Link>
        )}
      </div>
      <p>Comunidades por região e interesses. Explore todo o Brasil.</p>
      <form
        className="panel social-summary account-form"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(q);
          setInbox(false);
        }}
      >
        <label className="account-field">
          Pesquisar grupos
          <input
            maxLength={100}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button className="button">Pesquisar</button>
        <div className="group-filters">
          <label className="account-field">
            Participação
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setInbox(false);
              }}
            >
              {[
                ['all', 'Todos acessíveis'],
                ['public', 'Públicos'],
                ['private', 'Privados descobríveis'],
                ...(user
                  ? [
                      ['mine', 'Meus grupos'],
                      ['admin', 'Administro'],
                      ['owner', 'Sou proprietário'],
                      ['pending', 'Solicitações e resultados'],
                    ]
                  : []),
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="account-field">
            Cidade
            <input
              maxLength={100}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <label className="account-field">
            Estado
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Todo o Brasil</option>
              {'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'
                .split(' ')
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </label>
          <label className="account-field">
            Categoria
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas</option>
              {BIKE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="account-field">
            Ordenação
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">Mais recentes</option>
              <option value="name">Nome</option>
              <option value="members">
                Mais membros (contagens autorizadas)
              </option>
            </select>
          </label>
        </div>
      </form>
      {user && (
        <div className="social-controls">
          <button
            className="button"
            onClick={() => {
              setFilter('mine');
              setInbox(false);
            }}
          >
            Meus grupos
          </button>
          <button
            className="button"
            aria-pressed={inbox}
            onClick={() => setInbox(!inbox)}
          >
            Convites recebidos
          </button>
        </div>
      )}
      {inbox ? (
        <Inbox />
      ) : (
        <>
          <div className="groups-grid">
            {p.data.items.map((g) => (
              <GroupCard key={g.id} g={g} />
            ))}
          </div>
          <PageState
            p={p}
            empty="Nenhum grupo encontrado. Ajuste os filtros ou crie uma comunidade."
          />
        </>
      )}
      {!user && (
        <Link className="button" to="/entrar">
          Entre para participar ou criar grupos
        </Link>
      )}
    </div>
  );
}
