import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button, ButtonLink } from '../components/design-system';
import { useGarage } from './context';
import { MotorcycleCard } from './MotorcycleCard';
export function GaragePreview() {
  const { user } = useAuth();
  const { motorcycles, loading, error, refresh } = useGarage();
  if (!user)
    return (
      <div className="garage-empty panel">
        <p>Entre na sua conta para ver sua garagem.</p>
        <Link className="text-link action-link" to="/entrar?retorno=%2Fgaragem">
          Acessar garagem
        </Link>
      </div>
    );
  if (loading) return <p role="status">Carregando garagem…</p>;
  if (error)
    return (
      <div className="garage-empty panel">
        <p role="alert">{error}</p>
        <Button variant="secondary" onClick={() => void refresh()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!motorcycles.length)
    return (
      <div className="garage-empty panel">
        <p>
          Sua garagem está vazia. Cadastre sua primeira moto para começar sua
          jornada no Apex Ride.
        </p>
        <ButtonLink variant="primary" to="/garagem/nova">
          Adicionar Moto
        </ButtonLink>
      </div>
    );
  return (
    <div className="profile-motorcycles">
      {motorcycles.map((bike) => (
        <MotorcycleCard key={bike.id} bike={bike} />
      ))}
    </div>
  );
}
