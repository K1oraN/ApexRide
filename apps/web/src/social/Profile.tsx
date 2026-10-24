import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Avatar } from '../components/ui';
import { Feed, Report } from './Feed';
import { social } from './service';
import type { Person, SocialProfile } from './types';
import { usePage } from './usePage';
import { GroupList } from '../groups/GroupsPage';
export function PeopleList({
  path,
  action,
  onChanged,
}: {
  path: string;
  action?: 'requests' | 'blocks' | 'followers';
  onChanged?: () => void;
}) {
  const { user } = useAuth(),
    p = usePage<Person>(path);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function act(url: string, method: string) {
    setBusy(true);
    setError('');
    try {
      await social(url, method, method === 'POST' ? {} : undefined);
      await p.reload();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-people">
      {p.data.items.map((person) => (
        <div className="panel social-person" key={person.id}>
          <Avatar name={person.displayName} placeholder />
          <div>
            {action === 'blocks' ? (
              <strong>{person.displayName}</strong>
            ) : (
              <Link to={`/comunidade/u/${person.username}`}>
                <strong>{person.displayName}</strong>
              </Link>
            )}
            <p>@{person.username}</p>
          </div>
          {action === 'requests' ? (
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void act(`/requests/${person.id}/approve`, 'POST')
                }
              >
                Aprovar
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void act(`/requests/${person.id}`, 'DELETE')}
              >
                Recusar
              </button>
            </>
          ) : action === 'blocks' ? (
            <button
              className="button"
              disabled={busy}
              onClick={() => void act(`/blocks/${person.id}`, 'DELETE')}
            >
              Desbloquear
            </button>
          ) : (
            user &&
            user.id !== person.id && (
              <>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      `/users/${person.id}/follow`,
                      person.relationship === 'approved' ||
                        person.relationship === 'pending'
                        ? 'DELETE'
                        : 'POST',
                    )
                  }
                >
                  {person.relationship === 'approved'
                    ? 'Deixar de seguir'
                    : person.relationship === 'pending'
                      ? 'Cancelar solicitação'
                      : 'Seguir'}
                </button>
                {action === 'followers' && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() =>
                      void act(`/followers/${person.id}`, 'DELETE')
                    }
                  >
                    Remover seguidor
                  </button>
                )}
              </>
            )
          )}
        </div>
      ))}
      {p.loading && <p role="status">Carregando contas…</p>}
      {!p.loading && !p.error && !p.data.items.length && (
        <p>Nenhuma conta nesta lista.</p>
      )}
      {(p.error || error) && (
        <p role="alert">
          {p.error || error}
          <button className="button" onClick={() => void p.reload()}>
            Tentar novamente
          </button>
        </p>
      )}
      {p.data.nextCursor && (
        <button
          className="button"
          disabled={p.loading}
          onClick={() => void p.more()}
        >
          Mais contas
        </button>
      )}
    </div>
  );
}
export function Discover() {
  const [term, setTerm] = useState(''),
    [search, setSearch] = useState('');
  return (
    <section>
      <h3>Descobrir motociclistas</h3>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(term.trim());
        }}
      >
        <label className="account-field">
          Nome, usuário ou região
          <input
            maxLength={80}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        <button className="button" disabled={!term.trim()}>
          Buscar perfis
        </button>
      </form>
      {search && (
        <PeopleList
          key={search}
          path={`/users/search?q=${encodeURIComponent(search)}`}
        />
      )}
    </section>
  );
}
export function MySocial() {
  const { user } = useAuth();
  const [tab, setTab] = useState('');
  return (
    <div className="social-people">
      <Discover />
      {user && (
        <>
          <div className="social-controls">
            <Link className="button" to={`/comunidade/u/${user.username}`}>
              Meu perfil social
            </Link>
            <button
              className="button"
              onClick={() => setTab(tab === 'requests' ? '' : 'requests')}
            >
              Solicitações recebidas
            </button>
            <button
              className="button"
              onClick={() => setTab(tab === 'blocks' ? '' : 'blocks')}
            >
              Contas bloqueadas
            </button>
          </div>
          {tab && (
            <PeopleList
              key={tab}
              path={`/${tab}`}
              action={tab as 'requests' | 'blocks'}
            />
          )}
        </>
      )}
    </div>
  );
}
export function SocialProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  return (
    <Profile
      key={`${username}:${user?.id ?? 'anonymous'}`}
      username={username!}
    />
  );
}
function Profile({ username }: { username: string }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SocialProfile | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState('posts'),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [blockConfirm, setBlockConfirm] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void social<{ profile: SocialProfile }>(
      `/users/${encodeURIComponent(username)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((r) => setProfile(r.profile))
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setProfile(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [username, revision]);
  async function act(path: string, method: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await social(path, method, method === 'POST' ? {} : undefined);
      setLoading(true);
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-profile">
      <Link className="text-link" to="/comunidade">
        Voltar à Comunidade
      </Link>
      {loading && <p role="status">Carregando perfil…</p>}
      {error && (
        <p role="alert">
          {error}
          <button className="button" onClick={() => setRevision((n) => n + 1)}>
            Tentar novamente
          </button>
        </p>
      )}
      {profile && (
        <>
          <section className="panel social-summary">
            <Avatar name={profile.displayName} large placeholder />
            <h1>{profile.displayName}</h1>
            <p>
              @{profile.username} · Perfil{' '}
              {profile.visibility === 'public' ? 'público' : 'privado'}
            </p>
            {profile.accessible ? (
              <>
                <p>{profile.biography}</p>
                <p>
                  {[profile.city, profile.state].filter(Boolean).join(', ')}
                </p>
                <div className="social-controls">
                  <button
                    className="button"
                    onClick={() => setTab('followers')}
                  >
                    {profile.followers} seguidores
                  </button>
                  <button
                    className="button"
                    onClick={() => setTab('following')}
                  >
                    {profile.following} seguindo
                  </button>
                  <button className="button" onClick={() => setTab('posts')}>
                    Publicações
                  </button>
                </div>
              </>
            ) : (
              <p>
                Perfil privado. Uma solicitação pendente não libera publicações
                ou listas.
              </p>
            )}
            {user?.id === profile.id ? (
              <Link className="button" to="/configuracoes">
                Editar perfil e privacidade
              </Link>
            ) : user ? (
              <div className="social-controls">
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      `/users/${profile.id}/follow`,
                      profile.relationship === 'approved' ||
                        profile.relationship === 'pending'
                        ? 'DELETE'
                        : 'POST',
                    )
                  }
                >
                  {profile.relationship === 'approved'
                    ? 'Deixar de seguir'
                    : profile.relationship === 'pending'
                      ? 'Cancelar solicitação'
                      : profile.visibility === 'private'
                        ? 'Solicitar seguir'
                        : 'Seguir'}
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setBlockConfirm(true)}
                >
                  Bloquear usuário
                </button>
                <Report id={profile.id} kind="profile" />
              </div>
            ) : (
              <Link className="button" to="/entrar">
                Entre para seguir
              </Link>
            )}
            {blockConfirm && (
              <div>
                <p>
                  Bloquear este usuário? Os seguimentos e solicitações entre
                  vocês serão removidos.
                </p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act(`/blocks/${profile.id}`, 'POST')}
                >
                  Confirmar bloqueio
                </button>
                <button
                  className="button"
                  onClick={() => setBlockConfirm(false)}
                >
                  Cancelar bloqueio
                </button>
              </div>
            )}
          </section>
          {profile.accessible && !loading && <PublicProgress id={profile.id} />}
          {profile.accessible && !loading && (
            <GroupList
              key={`${profile.id}:${revision}`}
              profileId={profile.id}
            />
          )}
          {profile.accessible &&
            !loading &&
            (tab === 'posts' ? (
              <Feed key={revision} username={profile.username} />
            ) : (
              <PeopleList
                key={`${tab}:${revision}`}
                path={`/users/${profile.id}/${tab}`}
                {...(tab === 'followers' && user?.id === profile.id
                  ? { action: 'followers' as const }
                  : {})}
                onChanged={() => setRevision((n) => n + 1)}
              />
            ))}
        </>
      )}
    </div>
  );
}
import { PublicProgress } from '../gamification/PublicProgress';
