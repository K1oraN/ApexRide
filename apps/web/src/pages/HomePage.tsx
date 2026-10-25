import { ArrowRight, Compass, Route, UsersRound } from 'lucide-react';
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
  const firstName = name.trim().split(/\s+/)[0] || 'piloto';

  return (
    <div className="home-dashboard apex-home-v2">
      <h1 className="sr-only">Apex Ride — Início</h1>

      <section className="home-banner panel" aria-label="Sua próxima aventura">
        <img
          src={photos.cover}
          alt="Motociclista em uma estrada litorânea ao pôr do sol — imagem ilustrativa"
          fetchPriority="high"
        />
        <div className="home-banner-copy">
          <span className="eyebrow">
            BEM-VINDO, {firstName.toLocaleUpperCase('pt-BR')}
          </span>
          <h2>
            MAIS DO QUE
            <br />
            ROTAS.
            <br />
            <em>É EVOLUÇÃO.</em>
          </h2>
          <p>
            Descubra novos destinos, acompanhe seu desempenho e compartilhe cada
            quilômetro da sua jornada.
          </p>
          <ButtonLink
            to="/explorar"
            variant="primary"
            className="apex-home-hero-cta"
          >
            <Route size={21} aria-hidden />
            Encontrar rotas
            <ArrowRight size={19} aria-hidden />
          </ButtonLink>
        </div>
        <span className="apex-home-hero-watermark" aria-hidden="true">
          PILOTE MAIS LONGE
        </span>
      </section>

      <HomeQuickRide local={local} />
      <HomeSystemStatus local={local} />
      <HomeMotorcycle />
      <HomePerformance local={local}>
        <HomeRecentRides local={local} />
      </HomePerformance>

      <nav className="apex-home-shortcuts" aria-label="Atalhos do Apex Ride">
        <ButtonLink to="/explorar" variant="outline">
          <Compass size={20} aria-hidden />
          Explorar destinos
          <ArrowRight size={17} aria-hidden />
        </ButtonLink>
        <ButtonLink to="/comunidade" variant="outline">
          <UsersRound size={20} aria-hidden />
          Ver comunidade
          <ArrowRight size={17} aria-hidden />
        </ButtonLink>
      </nav>
    </div>
  );
}
