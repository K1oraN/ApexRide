import { Heart, Route, Clock3, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Chip, Photo } from '../ui';
import type { RouteRecord } from '../../services/routes';
export function PersistedRouteCard({
  route,
  featured = false,
  compact = false,
  onFavorite,
}: {
  route: RouteRecord;
  featured?: boolean;
  compact?: boolean;
  onFavorite: (route: RouteRecord) => void;
}) {
  return (
    <article
      className={`route-card panel ${featured ? 'route-featured' : ''} ${compact ? 'route-compact' : ''}`}
    >
      <Photo
        src="/assets/coastal-road.webp"
        alt="Imagem ilustrativa de estrada; não é foto deste percurso"
      />
      <button
        className={`favorite-button ${route.favorite ? 'is-favorite' : ''}`}
        aria-label={`${route.favorite ? 'Desfavoritar' : 'Favoritar'} ${route.name}`}
        aria-pressed={route.favorite}
        onClick={() => onFavorite(route)}
      >
        <Heart size={21} fill={route.favorite ? 'currentColor' : 'none'} />
      </button>
      <div className="route-card-content">
        <h3>
          <Link to={`/explorar/${route.id}`}>{route.name}</Link>
        </h3>
        {!compact && (
          <p>
            {[route.city, route.state].filter(Boolean).join(' / ')} ·{' '}
            {route.description.slice(0, 120)}
          </p>
        )}
        <div className="route-metrics">
          <span>
            <Route />
            {(route.distanceMeters / 1000).toLocaleString('pt-BR', {
              maximumFractionDigits: 1,
            })}{' '}
            km
          </span>
          {route.durationSeconds !== null && (
            <span>
              <Clock3 />~{Math.round(route.durationSeconds / 60)} min
            </span>
          )}
        </div>
        {!compact && (
          <div className="chips">
            <Chip accent>{route.kind === 'circuit' ? 'Circuito' : 'Rota'}</Chip>
            <Chip>{route.category}</Chip>
            {route.kind === 'circuit' && (
              <Chip>
                {route.verification === 'verified'
                  ? 'Verificado para pista'
                  : 'Sem verificação de pista'}
              </Chip>
            )}
          </div>
        )}
        {featured && (
          <Link
            className="route-open icon-button"
            to={`/explorar/${route.id}`}
            aria-label={`Ver ${route.name}`}
          >
            <ChevronRight />
          </Link>
        )}
      </div>
    </article>
  );
}
