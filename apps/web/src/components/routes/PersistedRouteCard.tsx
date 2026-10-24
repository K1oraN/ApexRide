import { ChevronRight, Clock3, Heart, Route } from 'lucide-react';
import { Link } from 'react-router';
import type { RouteRecord } from '../../services/routes';
import { Chip } from '../ui';
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
  const coordinates = route.geometry.coordinates;
  const xs = coordinates.map((p) => p[0]),
    ys = coordinates.map((p) => p[1]);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    spanX = Math.max(0.00001, Math.max(...xs) - minX),
    spanY = Math.max(0.00001, Math.max(...ys) - minY);
  const scale = Math.min(280 / spanX, 130 / spanY);
  const path = coordinates
    .map(
      (p, index) =>
        `${index ? 'L' : 'M'}${(20 + (p[0] - minX) * scale).toFixed(1)},${(150 - (p[1] - minY) * scale).toFixed(1)}`,
    )
    .join(' ');
  return (
    <article
      className={`route-card panel ${featured ? 'route-featured' : ''} ${compact ? 'route-compact' : ''}`}
    >
      <svg
        className="route-preview-art"
        viewBox="0 0 320 170"
        role="img"
        aria-label={`Geometria cadastrada de ${route.name} · miniatura sem mapa de fundo`}
      >
        <path d={path} />
      </svg>
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
            <Heart aria-hidden />
            {route.favorites} favorito(s)
          </span>
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
            {route.status !== 'approved' && (
              <Chip>
                {route.status === 'draft'
                  ? 'Rascunho privado'
                  : route.status === 'pending'
                    ? 'Em análise'
                    : route.status === 'rejected'
                      ? 'Rejeitado'
                      : 'Arquivado'}
              </Chip>
            )}
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
