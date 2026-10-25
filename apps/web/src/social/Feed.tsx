import {
  Heart,
  ImagePlus,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Share2,
} from 'lucide-react';
/* APEX STAGE 07 FEED */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  EmptyState,
  Feedback,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../components/design-system';
import { Avatar, Popover } from '../components/ui';
import { apiUrl } from '../services/auth';
import '../styles/social.css';
import { Composer } from './Composer';
import { social } from './service';
import type { Comment, SocialPost } from './types';
import { usePage } from './usePage';
export function Report({
  id,
  kind,
  groupId,
}: {
  id: string;
  kind: 'post' | 'comment' | 'profile' | 'group' | 'group_member';
  groupId?: string;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState('spam'),
    [detail, setDetail] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await social('/reports', 'POST', {
        id,
        kind,
        reason,
        detail,
        ...(groupId ? { groupId } : {}),
      });
      setMessage('Denúncia recebida para análise.');
      setOpen(false);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        Denunciar{kind === 'comment' ? ' comentário' : ''}
      </Button>
      {open && (
        <div className="account-form">
          <label className="account-field">
            Motivo
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries({
                harassment: 'Assédio',
                offensive: 'Conteúdo ofensivo',
                spam: 'Spam',
                fraud: 'Fraude',
                personal_data: 'Dados pessoais',
                dangerous: 'Conteúdo perigoso',
                other: 'Outro',
              }).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="account-field">
            Detalhes opcionais
            <Textarea
              aria-label="Detalhes opcionais"
              maxLength={500}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </label>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void send()}
          >
            Enviar denúncia
          </Button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
function Moderate({
  groupId,
  id,
  kind,
  onSaved,
}: {
  groupId: string;
  id: string;
  kind: 'posts' | 'comments';
  onSaved: () => void;
}) {
  const [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details className="social-summary">
      <summary>Moderar conteúdo</summary>
      <label className="account-field">
        Motivo da ocultação
        <Input
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        disabled={busy || !reason.trim()}
        onClick={() => {
          setBusy(true);
          void social(`/groups/${groupId}/moderate/${kind}/${id}`, 'POST', {
            reason,
          })
            .then(onSaved)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Ocultar conteúdo
      </Button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
function Comments({
  post,
  onChange,
  canModerate = false,
}: {
  post: SocialPost;
  onChange: () => void;
  canModerate?: boolean;
}) {
  const { user } = useAuth(),
    p = usePage<Comment>(`/posts/${post.id}/comments`);
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    try {
      await social(path, method, body);
      if (method === 'POST') setText('');
      await p.reload();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="post-comments">
      <p>Comentários · mais recentes primeiro</p>
      {p.data.items.map((c) => (
        <div className="comment" key={c.id}>
          <Avatar name={c.author.displayName} placeholder />
          <div>
            <Link to={`/comunidade/u/${c.author.username}`}>
              <strong>{c.author.displayName}</strong>
            </Link>
            <p>{c.text}</p>
            <small>{new Date(c.created_at).toLocaleString('pt-BR')}</small>
            {user?.id === c.author.id ? (
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => void act(`/comments/${c.id}`, 'DELETE')}
              >
                Excluir comentário
              </Button>
            ) : (
              user && <Report id={c.id} kind="comment" />
            )}
            {canModerate && post.group_id && (
              <Moderate
                groupId={post.group_id}
                id={c.id}
                kind="comments"
                onSaved={() => {
                  void p.reload();
                  onChange();
                }}
              />
            )}
          </div>
        </div>
      ))}
      {p.loading && <p role="status">Carregando comentários…</p>}
      {!p.loading && !p.error && !p.data.items.length && (
        <p>Nenhum comentário ainda.</p>
      )}
      {p.error && (
        <p role="alert">
          {p.error}
          <Button variant="secondary" onClick={() => void p.reload()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {p.data.nextCursor && (
        <Button
          variant="secondary"
          disabled={p.loading}
          onClick={() => void p.more()}
        >
          Mais comentários
        </Button>
      )}
      {user ? (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act(`/posts/${post.id}/comments`, 'POST', { text });
          }}
        >
          <label className="account-field">
            Escrever comentário
            <Textarea
              aria-label="Escrever comentário"
              required
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <Button variant="secondary" disabled={busy || !text.trim()}>
            Enviar comentário
          </Button>
        </form>
      ) : (
        <Link to="/entrar">Entre para comentar</Link>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function LivePost({
  post,
  onUpdate,
  onRemove,
  canModerate = false,
}: {
  post: SocialPost;
  onUpdate: (p: SocialPost) => void;
  onRemove: () => void;
  canModerate?: boolean;
}) {
  const { user } = useAuth();
  const [shareMessage, setShareMessage] = useState('');
  const [comments, setComments] = useState(false),
    [edit, setEdit] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function refresh() {
    try {
      const r = await social<{ post: SocialPost }>(`/posts/${post.id}`);
      onUpdate(r.post);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function sharePost() {
    setShareMessage('');
    const link = new URL('/comunidade', window.location.origin);
    link.searchParams.set('post', post.id);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Publicação Apex Ride',
          url: link.href,
        });
        setShareMessage(
          'Compartilhamento iniciado. O acesso depende das permissões do autor.',
        );
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link.href);
        setShareMessage(
          'Link copiado. O acesso depende das permissões do autor.',
        );
      } else {
        setShareMessage('Copie o endereço: ' + link.href);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setShareMessage(
        'Não foi possível compartilhar agora. Copie o endereço: ' + link.href,
      );
    }
  }
  async function action(kind: 'like' | 'delete') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (kind === 'delete') {
        await social(`/posts/${post.id}`, 'DELETE');
        onRemove();
      } else {
        const r = await social<{ post: SocialPost }>(
          `/posts/${post.id}/like`,
          post.liked ? 'DELETE' : 'POST',
        );
        onUpdate(r.post);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (edit)
    return (
      <Composer
        post={post}
        onCancel={() => setEdit(false)}
        onSaved={() => {
          setEdit(false);
          void refresh();
        }}
      />
    );
  return (
    <article
      className="post panel"
      aria-label={`Publicação de ${post.author.displayName}`}
    >
      <header className="post-heading">
        <Avatar name={post.author.displayName} placeholder />
        <div>
          <Link to={`/comunidade/u/${post.author.username}`}>
            <strong>{post.author.displayName}</strong>
          </Link>
          <small>
            {new Date(post.created_at).toLocaleString('pt-BR')} ·{' '}
            {post.group_id
              ? 'Grupo · acesso autorizado'
              : post.visibility === 'public'
                ? 'Público'
                : post.visibility === 'private'
                  ? 'Somente eu'
                  : 'Seguidores'}
            {post.updated_at !== post.created_at ? ' · editada' : ''}
          </small>
        </div>
        {user && (
          <Popover
            label="Opções da publicação"
            trigger={<MoreHorizontal size={23} />}
          >
            {user.id === post.author_id ? (
              <>
                <Button variant="secondary" onClick={() => setEdit(true)}>
                  Editar publicação
                </Button>
                <Button variant="destructive" onClick={() => setConfirm(true)}>
                  Excluir publicação
                </Button>
              </>
            ) : (
              <Report id={post.id} kind="post" />
            )}
          </Popover>
        )}
      </header>
      {post.text && <p className="post-text">{post.text}</p>}
      {post.achievement && (
        <p className="chip">Conquista · {post.achievement.name}</p>
      )}
      <div className="social-post-photos">
        {post.media.map((m, i) => (
          <a key={m.id} href={apiUrl(m.url)} target="_blank" rel="noreferrer">
            <img
              className="post-photo"
              src={apiUrl(m.url)}
              srcSet={`${apiUrl(m.thumbnailUrl)} 480w, ${apiUrl(m.url)} 1600w`}
              sizes="(max-width: 600px) 100vw, 650px"
              width={m.width}
              height={m.height}
              loading="lazy"
              alt={`Fotografia ${i + 1} da publicação de ${post.author.displayName}`}
            />
          </a>
        ))}
      </div>
      {post.motorcycle && (
        <p className="social-summary">
          {post.motorcycle.brand} {post.motorcycle.model} ·{' '}
          {post.motorcycle.year} ·{' '}
          {post.motorcycle.displacementCc === null
            ? 'Elétrica'
            : `${post.motorcycle.displacementCc} cc`}
        </p>
      )}
      {post.motorcycle_id && !post.motorcycle && <p>Moto indisponível.</p>}
      {post.ride ? (
        <div className="social-summary">
          <p>
            {post.ride.mode} · {post.ride.day}
          </p>
          <p>
            {post.ride.distanceKm} km · {post.ride.activeMinutes} min
          </p>
          <Link
            className="text-link action-link"
            to={`/compartilhar/rides/${post.ride.id}`}
          >
            Abrir resumo autorizado do Ride
          </Link>
          <small>Resumo sem mapa, GPS ou telemetria detalhada.</small>
        </div>
      ) : (
        post.ride_id && (
          <p>
            Resumo do Ride indisponível: confira a privacidade ou exclusão da
            atividade.
          </p>
        )
      )}
      <div className="post-actions">
        <button
          disabled={!user || busy}
          aria-label="Curtir publicação"
          aria-pressed={post.liked}
          className={post.liked ? 'liked' : ''}
          onClick={() => void action('like')}
        >
          <Heart fill={post.liked ? 'currentColor' : 'none'} />
          {post.likes}
        </button>
        <button aria-expanded={comments} onClick={() => setComments(!comments)}>
          <MessageCircle />
          {post.comments}
          <span className="sr-only"> comentários</span>
        </button>
        <button
          type="button"
          onClick={() => void sharePost()}
          aria-label="Compartilhar publicação"
        >
          <Share2 size={20} aria-hidden="true" />
          <span>Compartilhar</span>
        </button>
        {user && user.id !== post.author_id && (
          <Link
            className="text-link action-link"
            to={`/comunidade/u/${post.author.username}`}
          >
            {post.following ? 'Seguindo' : 'Ver perfil / Seguir'}
          </Link>
        )}
      </div>
      {shareMessage && (
        <p className="community-stage-share-message" role="status">
          {shareMessage}
        </p>
      )}
      {confirm && (
        <div className="social-summary">
          <p>
            Excluir esta publicação e suas fotografias? A moto e o Ride serão
            preservados.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void action('delete')}
          >
            Confirmar exclusão
          </Button>
          <Button variant="outline" onClick={() => setConfirm(false)}>
            Cancelar exclusão
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {canModerate && post.group_id && (
        <Moderate
          groupId={post.group_id}
          id={post.id}
          kind="posts"
          onSaved={onRemove}
        />
      )}
      {comments && (
        <Comments
          post={post}
          canModerate={canModerate}
          onChange={() => void refresh()}
        />
      )}
    </article>
  );
}
export function Feed({
  username,
  compact = false,
  groupId,
  canPost = true,
  canModerate = false,
}: {
  username?: string;
  compact?: boolean;
  groupId?: string;
  canPost?: boolean;
  canModerate?: boolean;
}) {
  const { user } = useAuth();
  const [mode, setMode] = useState('public'),
    [composing, setComposing] = useState(false),
    [notice, setNotice] = useState('');
  const [query, setQuery] = useSearchParams();
  const selectedRide = query.get('ride') ?? '';
  const path = groupId
    ? `/groups/${groupId}/posts`
    : username
      ? `/users/${encodeURIComponent(username)}/posts`
      : `/feed${mode === 'following' ? '/following' : ''}${compact ? '?limit=2' : ''}`;
  const p = usePage<SocialPost>(path);
  const update = (post: SocialPost) =>
    p.setData((old) => ({
      ...old,
      items: old.items.map((s) => (s.id === post.id ? post : s)),
    }));
  function close() {
    setComposing(false);
    if (selectedRide) {
      const next = new URLSearchParams(query);
      next.delete('ride');
      setQuery(next, { replace: true });
    }
  }
  return (
    <div className="social-feed" aria-label="Publicações reais">
      {!compact && !username && !groupId && (
        <div className="social-controls">
          <Button
            variant={mode === 'public' ? 'selected' : 'secondary'}
            aria-pressed={mode === 'public'}
            onClick={() => setMode('public')}
          >
            Para todos
          </Button>
          <Button
            variant={mode === 'following' ? 'selected' : 'secondary'}
            disabled={!user}
            aria-pressed={mode === 'following'}
            onClick={() => setMode('following')}
          >
            Seguindo
          </Button>
          <Button variant="secondary" onClick={() => void p.reload()}>
            Atualizar feed
          </Button>
        </div>
      )}
      {!compact &&
        user &&
        canPost &&
        !composing &&
        !selectedRide &&
        (!username || username === user.username) && (
          <div className="feed-composer-prompt">
            <Avatar name={user.displayName} placeholder />
            <Button
              variant="secondary"
              type="button"
              onClick={() => setComposing(true)}
            >
              <PencilLine size={19} aria-hidden="true" />
              Compartilhe sua próxima aventura…
            </Button>
            <ImagePlus size={24} aria-hidden="true" />
          </div>
        )}
      {!compact && user && (composing || selectedRide) && (
        <Composer
          groupId={groupId}
          rideId={selectedRide}
          onCancel={close}
          onSaved={() => {
            close();
            setNotice(
              groupId
                ? 'Publicação confirmada no grupo.'
                : 'Publicação confirmada. Consulte também seu perfil para posts restritos.',
            );
            void p.reload();
          }}
        />
      )}
      {notice && <p role="status">{notice}</p>}
      {p.data.items.map((post) => (
        <LivePost
          canModerate={canModerate}
          key={post.id}
          post={post}
          onUpdate={update}
          onRemove={() => {
            p.setData((old) => ({
              ...old,
              items: old.items.filter((s) => s.id !== post.id),
            }));
            setNotice('Publicação removida.');
          }}
        />
      ))}
      {p.loading && <Skeleton label="Carregando publicações…" />}
      {p.error && (
        <Feedback tone="error">
          {p.error}
          <Button variant="secondary" onClick={() => void p.reload()}>
            Tentar novamente
          </Button>
        </Feedback>
      )}
      {!p.loading && !p.error && !p.data.items.length && (
        <EmptyState
          icon={<MessageCircle size={26} />}
          title="Sua comunidade começa aqui"
          children={
            mode === 'following'
              ? 'Nenhuma publicação das contas seguidas. Descubra motociclistas para seguir.'
              : 'Nenhuma publicação por aqui ainda.'
          }
          action={
            !user ? (
              <Link className="text-link action-link" to="/entrar">
                Entre para participar
              </Link>
            ) : undefined
          }
        />
      )}
      {!compact && p.data.nextCursor && (
        <Button
          variant="secondary"
          disabled={p.loading}
          onClick={() => void p.more()}
        >
          Carregar mais publicações
        </Button>
      )}
      {!p.loading &&
        !p.error &&
        p.data.items.length > 0 &&
        !p.data.nextCursor && <p role="status">Sem novas publicações.</p>}
    </div>
  );
}
