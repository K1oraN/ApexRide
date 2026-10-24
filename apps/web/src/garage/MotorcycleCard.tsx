import { motorcycleEngine } from '../services/motorcycles';
import { useState } from 'react';
import { RideIcon } from '../components/Brand';
import { CardLink } from '../components/design-system';
import { Chip } from '../components/ui';
import { apiUrl } from '../services/auth';
import type { Motorcycle } from '../services/motorcycles';
export function MotorcyclePhoto({ bike }: { bike: Motorcycle }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = bike.photoUrl
    ? `${apiUrl(bike.photoUrl)}?v=${encodeURIComponent(bike.updatedAt)}`
    : null;
  return src && failed !== src ? (
    <img
      className="photo motorcycle-photo"
      src={src}
      crossOrigin="use-credentials"
      alt={`${bike.brand} ${bike.model}`}
      onError={() => setFailed(src)}
    />
  ) : (
    <div
      className="motorcycle-photo motorcycle-photo-empty"
      role="img"
      aria-label={
        src ? 'Fotografia temporariamente indisponível' : 'Moto sem fotografia'
      }
    >
      <RideIcon size={64} />
      <span>
        {src ? 'Fotografia indisponível' : 'Sua moto, sua próxima aventura'}
      </span>
    </div>
  );
}
export function MotorcycleCard({ bike }: { bike: Motorcycle }) {
  return (
    <CardLink
      className="garage-preview panel motorcycle-card"
      to={`/garagem/${bike.id}`}
      aria-label={`Ver ${bike.brand} ${bike.model}`}
    >
      <MotorcyclePhoto bike={bike} />
      {bike.isPrimary && (
        <span className="motorcycle-primary">
          <Chip accent>Moto principal</Chip>
        </span>
      )}
      <div className="garage-bike-info">
        <h3>
          <span className="motorcycle-brand">{bike.brand}</span>
          <span className="motorcycle-model">{bike.model}</span>
        </h3>
        <p>
          {bike.year} · {motorcycleEngine(bike)}
        </p>
        <small>Ver detalhes →</small>
      </div>
    </CardLink>
  );
}
