import { useState } from 'react';
import { Link } from 'react-router';
import { Bike } from 'lucide-react';
import { apiUrl } from '../services/auth';
import type { Motorcycle } from '../services/motorcycles';
import { Chip } from '../components/ui';
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
      <Bike size={64} aria-hidden />
      <span>
        {src ? 'Fotografia indisponível' : 'Sua moto, sua próxima aventura'}
      </span>
    </div>
  );
}
export function MotorcycleCard({ bike }: { bike: Motorcycle }) {
  return (
    <Link
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
          {bike.year} · {bike.displacementCc} cc
        </p>
        <small>Ver detalhes →</small>
      </div>
    </Link>
  );
}
