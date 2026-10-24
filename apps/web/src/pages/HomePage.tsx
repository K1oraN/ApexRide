import { ChevronRight, Route } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { ButtonLink } from '../components/design-system';
import { photos } from '../data/demo';
import { HomeMotorcycle } from '../home/HomeMotorcycle';
import { HomePerformance } from '../home/HomePerformance';
import { HomeRecentRides } from '../home/HomeRecentRides';
import { HomeQuickRide, HomeSystemStatus } from '../home/HomeRideStatus';
import { useHomeOffline } from '../home/useHomeOffline';
import '../styles/home.css';

export function HomePage() {
  const { user } = useAuth();
  return user ? <Dashboard key={user.id} name={user.displayName} /> : null;
}
function Dashboard({ name }: { name: string }) {
  const local = useHomeOffline();
  return (
    <div className="home-dashboard">
      <h1 className="sr-only">Apex Ride — Início</h1>
      <section className="home-banner panel" aria-label="Sua próxima aventura">
        <img
          src={photos.cover}
          alt="Motociclista no litoral ao pôr do sol — imagem decorativa"
          fetchPriority="high"
        />
        <div className="home-banner-copy">
          <span className="eyebrow">
            BEM-VINDO, {name.trim().split(/\s+/)[0]}
          </span>
          <h2>
            PRONTO PARA
            <br />
            <em>PILOTAR?</em>
          </h2>
          <p>
            Novas rotas, novos destinos
            <br />e grandes histórias esperam por você.
          </p>
          <ButtonLink to="/explorar" variant="primary">
            <Route size={22} aria-hidden />
            Encontrar rotas
            <ChevronRight size={20} aria-hidden />
          </ButtonLink>
        </div>
      </section>
      <HomeQuickRide local={local} />
      <HomeSystemStatus local={local} />
      <HomeMotorcycle />
      <HomePerformance local={local}>
        <HomeRecentRides local={local} />
      </HomePerformance>
    </div>
  );
}
