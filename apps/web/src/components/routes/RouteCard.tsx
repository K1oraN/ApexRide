import {
  Camera,
  ChevronRight,
  Clock3,
  Heart,
  Palmtree,
  Route,
  Signal,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { type DemoRoute, rideModes } from '../../data/demo';
import { ModeIcon } from '../Brand';
import { Chip, Photo } from '../ui';

export function RouteCard({
  route,
  featured = false,
  compact = false,
}: {
  route: DemoRoute;
  featured?: boolean;
  compact?: boolean;
}) {
  const [favorite, setFavorite] = useState(false);
  const mode = rideModes.find((mode) => mode.id === route.mode)!;
  return (
    <article
      className={`route-card panel ${featured ? 'route-featured' : ''} ${compact ? 'route-compact' : ''}`}
    >
      <Photo src={route.image} alt={`Paisagem ilustrativa — ${route.name}`} />
      {!featured && (
        <button
          className={`favorite-button ${favorite ? 'is-favorite' : ''}`}
          aria-label={`${favorite ? 'Desmarcar' : 'Marcar'} ${route.name} como favorito local`}
          aria-pressed={favorite}
          onClick={() => setFavorite(!favorite)}
        >
          <Heart size={21} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      )}
      <div className="route-card-content">
        <h3>{route.name}</h3>
        {!compact && <p>{route.itinerary}</p>}
        <div className="route-metrics">
          <span>
            <Route />
            {route.distance} km
          </span>
          <span>
            <Clock3 />
            {route.duration}
          </span>
          {!compact && (
            <span>
              <Signal />
              {route.difficulty}
            </span>
          )}
        </div>
        {!compact && (
          <div className="chips">
            <Chip accent>
              <ModeIcon mode={route.mode} size={17} />
              {mode.name}
            </Chip>
            {route.tags.map((tag) => (
              <Chip key={tag}>
                {tag === 'Turismo' || tag === 'Paisagens' ? (
                  <Camera size={16} />
                ) : (
                  <Palmtree size={16} />
                )}
                {tag}
              </Chip>
            ))}
          </div>
        )}
        {featured && (
          <Link
            className="route-open icon-button"
            to={`/explorar?rota=${route.id}`}
            aria-label={`Ver demonstração de ${route.name}`}
          >
            <ChevronRight />
          </Link>
        )}
      </div>
    </article>
  );
}
