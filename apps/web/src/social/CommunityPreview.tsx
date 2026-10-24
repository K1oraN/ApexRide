import { Heart } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '../components/design-system';
import { Avatar, Photo } from '../components/ui';
import { apiUrl } from '../services/auth';
import type { SocialPost } from './types';
import { usePage } from './usePage';
export function CommunityPreview() {
  const p = usePage<SocialPost>('/feed?limit=3');
  return (
    <div aria-label="Prévia real da comunidade">
      {p.loading && <p role="status">Carregando publicações…</p>}
      {p.error && (
        <div className="panel social-summary" role="alert">
          {p.error}
          <Button variant="secondary" onClick={() => void p.reload()}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!p.loading && !p.error && !p.data.items.length && (
        <div className="panel social-summary">
          Nenhuma publicação por aqui ainda.{' '}
          <Link className="text-link action-link" to="/comunidade">
            Participar da Comunidade
          </Link>
        </div>
      )}
      <div className="community-preview">
        {p.data.items.map((post) => (
          <article className="community-photo panel" key={post.id}>
            {post.media[0] ? (
              <Photo
                src={apiUrl(post.media[0].thumbnailUrl)}
                alt={`Fotografia da publicação de ${post.author.displayName}`}
              />
            ) : (
              <p className="social-preview-text">
                {post.text ||
                  post.motorcycle?.model ||
                  (post.ride
                    ? `${post.ride.mode} · ${post.ride.day}`
                    : 'Publicação')}
              </p>
            )}
            <div className="community-photo-info">
              <Avatar name={post.author.displayName} placeholder />
              <div>
                <Link to={`/comunidade/u/${post.author.username}`}>
                  <strong>{post.author.displayName}</strong>
                </Link>
                <small>
                  {new Date(post.created_at).toLocaleDateString('pt-BR')}
                </small>
              </div>
              <span className="community-likes">
                <Heart size={16} fill={post.liked ? 'currentColor' : 'none'} />
                {post.likes}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
