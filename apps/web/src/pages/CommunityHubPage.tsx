import {
  CalendarDays,
  ChevronRight,
  Compass,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Trophy,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/design-system';
import { Feed, LivePost } from '../social/Feed';
import { social } from '../social/service';
import type { SocialPost } from '../social/types';
import '../styles/community-hub.css';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O feed mostra apenas publicações autorizadas pela API. O link direto de
 * uma publicação consulta /social/posts/:id; não contorna as permissões.
 */
export function CommunityHubPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const postId = params.get('post');
  const [spotlight, setSpotlight] = useState<SocialPost | null>(null);
  const [loadingPost, setLoadingPost] = useState(false);
  const [postError, setPostError] = useState('');

  useEffect(() => {
    let live = true;
    setSpotlight(null);
    setPostError('');
    if (!postId) {
      setLoadingPost(false);
      return () => {
        live = false;
      };
    }
    if (!uuid.test(postId)) {
      setPostError('Link de publicação inválido.');
      setLoadingPost(false);
      return () => {
        live = false;
      };
    }
    setLoadingPost(true);
    void social<{ post: SocialPost }>(`/posts/${encodeURIComponent(postId)}`)
      .then(({ post }) => {
        if (live) setSpotlight(post);
      })
      .catch(() => {
        if (live)
          setPostError(
            'Publicação indisponível ou sem autorização para esta conta.',
          );
      })
      .finally(() => {
        if (live) setLoadingPost(false);
      });
    return () => {
      live = false;
    };
  }, [postId]);

  const dismissPost = () => {
    const next = new URLSearchParams(params);
    next.delete('post');
    setParams(next, { replace: true });
  };

  const region = [user?.city, user?.state].filter(Boolean).join(' / ');

  return (
    <div
      className="community-hub community-hub-stage-07"
      aria-label="Comunidade Apex Ride"
    >
      <header className="community-stage-intro">
        <div className="community-stage-intro-copy">
          <span className="community-stage-kicker">
            <UsersRound size={16} aria-hidden="true" /> RIDERS CONNECT
          </span>
          <h1>
            NOSSA <em>COMUNIDADE</em>
          </h1>
          <p>
            Histórias sobre duas rodas. Compartilhe sua jornada, acompanhe
            outros riders e descubra os próximos encontros.
          </p>
          <div className="community-stage-region">
            <MapPin size={15} aria-hidden="true" />
            {region || 'Motociclistas de todo o Brasil'}
          </div>
        </div>
        <div className="community-stage-crest" aria-hidden="true">
          <Compass size={90} strokeWidth={0.9} />
        </div>
      </header>

      <nav
        className="community-stage-navigation"
        aria-label="Seções da comunidade"
      >
        <Link
          className="community-stage-tab is-current"
          to="/comunidade"
          aria-current="page"
        >
          <UsersRound size={22} aria-hidden="true" /> Publicações
        </Link>
        <Link className="community-stage-tab" to="/comunidade/rankings">
          <Trophy size={22} aria-hidden="true" /> Rankings
        </Link>
        <Link className="community-stage-tab" to="/comunidade/eventos">
          <CalendarDays size={22} aria-hidden="true" /> Eventos
        </Link>
      </nav>

      <div className="community-stage-layout">
        <section
          className="community-stage-main"
          aria-label="Feed de publicações"
        >
          {postId && (
            <section
              className="community-stage-spotlight"
              aria-label="Publicação compartilhada"
            >
              <div className="community-stage-spotlight-heading">
                <div>
                  <strong>Publicação compartilhada</strong>
                  <small>Visível somente para contas autorizadas</small>
                </div>
                <Button variant="secondary" size="sm" onClick={dismissPost}>
                  <X size={16} aria-hidden="true" /> Fechar
                </Button>
              </div>
              {loadingPost && <p role="status">Carregando publicação…</p>}
              {postError && <p role="alert">{postError}</p>}
              {spotlight && !loadingPost && (
                <LivePost
                  key={spotlight.id}
                  post={spotlight}
                  onUpdate={setSpotlight}
                  onRemove={dismissPost}
                />
              )}
            </section>
          )}
          <div className="community-stage-feed-heading">
            <div>
              <span className="community-stage-kicker">CONEXÕES / FEED</span>
              <h2>Publicações da comunidade</h2>
            </div>
            <span className="community-stage-feed-subtitle">
              <MessageCircle size={15} aria-hidden="true" /> Conversas reais
            </span>
          </div>
          <div className="community-stage-feed-wrap">
            <Feed key={user?.id ?? 'visitante'} />
          </div>
        </section>

        <aside
          className="community-stage-aside"
          aria-label="Descobrir na comunidade"
        >
          <div className="community-stage-side-card">
            <span className="community-stage-side-icon">
              <Trophy size={24} aria-hidden="true" />
            </span>
            <h2>Rankings dos riders</h2>
            <p>
              Explore classificações por Brasil, estado, cidade e
              características da moto.
            </p>
            <Link
              to="/comunidade/rankings"
              className="community-stage-side-link"
            >
              Ver rankings <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="community-stage-side-card">
            <span className="community-stage-side-icon">
              <CalendarDays size={24} aria-hidden="true" />
            </span>
            <h2>Encontros e eventos</h2>
            <p>
              Conheça passeios e encontros publicados, com informações e
              participação autorizadas.
            </p>
            <Link
              to="/comunidade/eventos"
              className="community-stage-side-link"
            >
              Explorar eventos <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </div>
          <div className="community-stage-privacy">
            <ShieldCheck size={19} aria-hidden="true" />
            <span>
              Fotos, comentários e publicações respeitam a privacidade definida
              pelo autor e as permissões da plataforma.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
