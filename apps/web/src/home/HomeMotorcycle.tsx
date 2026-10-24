import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { RideIcon } from '../components/Brand';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Skeleton,
} from '../components/design-system';
import { useGarage } from '../garage/context';
import { MotorcyclePhoto } from '../garage/MotorcycleCard';
import '../styles/garage.css';

export function HomeMotorcycle() {
  const { motorcycles, loading, error, offline, refresh } = useGarage();
  const bike = motorcycles.find((item) => item.isPrimary);
  return (
    <Card className="home-motorcycle" aria-label="Minha moto">
      <div className="home-section-title">
        <h2>Minha moto</h2>
        <Link className="text-link action-link" to="/garagem">
          Ver garagem <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {loading ? (
        <Skeleton label="Carregando minha moto…" lines={2} />
      ) : bike ? (
        <>
          {offline && (
            <p className="home-data-note" role="status">
              Garagem salva neste aparelho. Sem atualização do servidor.
            </p>
          )}
          <Link className="home-bike-card" to={`/garagem/${bike.id}`}>
            <MotorcyclePhoto key={bike.id} bike={bike} />
            <div className="home-bike-copy">
              <Badge>Moto selecionada</Badge>
              <h3>
                {bike.brand} <strong>{bike.model}</strong>
              </h3>
              <p>
                {bike.year} · {bike.displacementCc.toLocaleString('pt-BR')} cc
              </p>
              <span className="text-link action-link">
                Ver detalhes <ChevronRight size={18} aria-hidden />
              </span>
            </div>
          </Link>
        </>
      ) : error ? (
        <div className="home-inline-empty">
          <p role="status">Não foi possível atualizar sua garagem.</p>
          <Button onClick={() => void refresh()}>Tentar novamente</Button>
        </div>
      ) : (
        <div className="home-inline-empty">
          <RideIcon size={32} />
          <div>
            <h3>
              {motorcycles.length
                ? 'Escolha sua moto principal'
                : 'Adicione sua primeira moto à Garagem.'}
            </h3>
            <p>
              {motorcycles.length
                ? 'Defina na Garagem a moto que aparecerá aqui.'
                : 'Sua moto, seus percursos, suas histórias.'}
            </p>
          </div>
          <ButtonLink
            variant="secondary"
            to={motorcycles.length ? '/garagem' : '/garagem/nova'}
          >
            <Plus size={18} aria-hidden />
            {motorcycles.length ? 'Escolher moto' : 'Adicionar moto'}
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}
