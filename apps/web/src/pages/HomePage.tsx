import {
  ArrowUpRight,
  ChevronRight,
  CircleGauge,
  Gauge,
  Signal,
  Timer,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ModeIcon } from '../components/Brand';
import { CommunityPreview } from '../social/CommunityPreview';
import '../styles/social.css';
import { IllustrativeMap } from '../components/maps/IllustrativeMap';
import { MetricCard, RideSummary } from '../components/telemetry/Metrics';
import { Speedometer } from '../components/telemetry/Speedometer';
import { SectionTitle } from '../components/ui';
import { photos, rideModes } from '../data/demo';
import { HistoryPreview } from '../history/HistoryPreview';

export function HomePage() {
  const { user } = useAuth();
  return (
    <div className="home-page">
      <h1 className="sr-only">Apex Ride — Início</h1>
      <section className="home-hero panel" aria-label="Alagoas sob duas rodas">
        <img
          src={photos.ride}
          alt="Motociclista em uma curva no litoral — fotografia ilustrativa"
          fetchPriority="high"
        />
        <div className="hero-copy">
          <span className="eyebrow">ROTAS É EXPERIÊNCIAS</span>
          <h2>
            ALAGOAS
            <br />
            <em>SOB DUAS RODAS</em>
          </h2>
          <p>
            Praias, serras e curvas
            <br />
            que fazem histórias.
          </p>
          <Link to="/explorar" className="button button-primary">
            Explorar rotas
            <ChevronRight size={22} />
          </Link>
        </div>
      </section>
      <section>
        <SectionTitle aside={<span>Qual é o plano de hoje?</span>}>
          INICIAR NOVO RIDE
        </SectionTitle>
        <div className="ride-mode-grid">
          {rideModes.map((mode) => (
            <Link
              className="mode-card panel"
              to={
                user
                  ? `/ride?modo=${mode.id}`
                  : `/entrar?retorno=${encodeURIComponent(`/ride?modo=${mode.id}`)}`
              }
              key={mode.id}
            >
              <ModeIcon mode={mode.id} />
              <span>
                <strong>{mode.name}</strong>
                <small>{mode.description}</small>
              </span>
              <ChevronRight className="mode-chevron" />
            </Link>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle to="/historico" action="Ver todas">
          ÚLTIMO RIDE
        </SectionTitle>
        <HistoryPreview />
      </section>
      <div className="home-instruments">
        <section className="home-map panel">
          <IllustrativeMap variant="home" />
          <RideSummary />
        </section>
        <section className="home-telemetry panel">
          <SectionTitle icon={Signal} to="/ride" action="">
            TELEMETRIA · INICIE UM RIDE
          </SectionTitle>
          <div className="home-gauges">
            <Speedometer value={null} source="gps" compact />
            <div className="home-metric-list">
              <MetricCard
                icon={<Timer />}
                label="Vel. média"
                value="—"
                unit="km/h"
              />
              <MetricCard
                icon={<Gauge />}
                label="Vel. máxima"
                value="—"
                unit="km/h"
              />
              <MetricCard
                icon={<ArrowUpRight />}
                label="Ângulo de curva"
                value="Indisponível"
                progress={null}
              />
              <MetricCard
                icon={<CircleGauge />}
                label="Força de frenagem"
                value="—"
                unit="G"
                progress={null}
              />
            </div>
          </div>
        </section>
      </div>
      <section>
        <SectionTitle icon={UsersRound} to="/comunidade">
          COMUNIDADE APEX
        </SectionTitle>
        <CommunityPreview key={user?.id ?? 'anonymous'} />
      </section>
    </div>
  );
}
