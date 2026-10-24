import {
  ArrowRight,
  CalendarDays,
  Compass,
  MessageCircle,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ButtonLink } from '../components/design-system';
import { Feed } from '../social/Feed';
import { MySocial } from '../social/Profile';
import '../styles/community-hub.css';

const quickLinks = [
  {
    to: '/comunidade/grupos',
    title: 'Equipes',
    description: 'Encontre grupos e motociclistas com interesses em comum.',
    Icon: UsersRound,
  },
  {
    to: '/comunidade/eventos',
    title: 'Eventos',
    description: 'Descubra encontros e passeios publicados na comunidade.',
    Icon: CalendarDays,
  },
  {
    to: '/comunidade/rankings',
    title: 'Rankings',
    description: 'Consulte classificações e sua evolução nas categorias.',
    Icon: Trophy,
  },
];

export function CommunityHubPage() {
  const { user } = useAuth();

  return (
    <div className="community-hub">
      <section
        className="community-hub-hero panel"
        aria-labelledby="community-hub-title"
      >
        <div className="community-hub-hero-content">
          <span className="community-hub-eyebrow">
            APEX RIDE / RIDERS CONNECT
          </span>

          <h1 id="community-hub-title">
            NOSSA <span>COMUNIDADE.</span>
          </h1>

          <p>
            Compartilhe suas jornadas, conheça outros motociclistas e acompanhe
            as histórias de quem também vive sobre duas rodas.
          </p>

          <div className="community-hub-hero-actions">
            <ButtonLink to="/perfil" variant="secondary">
              <UserRound size={19} aria-hidden="true" />
              Meu perfil
              <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>
          </div>
        </div>

        <div className="community-hub-hero-mark" aria-hidden="true">
          <div className="community-hub-mark-ring">
            <UsersRound size={64} strokeWidth={1.25} />
          </div>
        </div>
      </section>

      <nav
        className="community-hub-navigation"
        aria-label="Seções da comunidade"
      >
        <Link
          to="/comunidade"
          className="community-hub-tab is-current"
          aria-current="page"
        >
          <MessageCircle size={19} aria-hidden="true" />
          <span>Feed</span>
        </Link>

        <Link to="/comunidade/grupos" className="community-hub-tab">
          <UsersRound size={19} aria-hidden="true" />
          <span>Equipes</span>
        </Link>

        <Link to="/comunidade/eventos" className="community-hub-tab">
          <CalendarDays size={19} aria-hidden="true" />
          <span>Eventos</span>
        </Link>

        <Link to="/comunidade/rankings" className="community-hub-tab">
          <Trophy size={19} aria-hidden="true" />
          <span>Rankings</span>
        </Link>
      </nav>

      <div className="community-hub-grid">
        <section
          className="community-hub-feed-column"
          aria-labelledby="community-feed-title"
        >
          <div className="community-hub-section-heading">
            <div>
              <span className="community-hub-kicker">SOCIAL / FEED</span>
              <h2 id="community-feed-title">Publicações</h2>
            </div>
            <span className="community-hub-live-label">
              Conteúdo da comunidade
            </span>
          </div>

          <div className="community-hub-feed-wrap">
            <Feed />
          </div>
        </section>

        <aside
          className="community-hub-sidebar"
          aria-label="Descoberta e atalhos da comunidade"
        >
          <section className="community-hub-side-card panel">
            <div className="community-hub-side-heading">
              <Compass size={21} aria-hidden="true" />
              <div>
                <span className="community-hub-kicker">EXPLORE A REDE</span>
                <h2>Motociclistas</h2>
              </div>
            </div>

            <p className="community-hub-side-description">
              Busque por nome, usuário ou região informada no perfil.
            </p>

            <MySocial key={user?.id ?? 'anonymous'} />
          </section>

          <section className="community-hub-side-card panel">
            <div className="community-hub-side-heading">
              <UsersRound size={21} aria-hidden="true" />
              <div>
                <span className="community-hub-kicker">
                  APEX RIDE / CONEXÕES
                </span>
                <h2>Explore mais</h2>
              </div>
            </div>

            <div className="community-hub-quick-links">
              {quickLinks.map(({ to, title, description, Icon }) => (
                <Link key={to} to={to} className="community-hub-quick-link">
                  <span className="community-hub-quick-icon">
                    <Icon size={22} aria-hidden="true" />
                  </span>

                  <span className="community-hub-quick-copy">
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>

                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>

          <section className="community-hub-side-card community-hub-profile-card panel">
            <div className="community-hub-side-heading">
              <ShieldCheck size={21} aria-hidden="true" />
              <div>
                <span className="community-hub-kicker">SUA IDENTIDADE</span>
                <h2>Seu espaço</h2>
              </div>
            </div>

            <p>
              {user
                ? `Olá, ${user.displayName}. Personalize seu perfil e acompanhe suas conexões.`
                : 'Entre na sua conta para participar da comunidade.'}
            </p>

            <ButtonLink to="/perfil" variant="outline">
              <UserRound size={18} aria-hidden="true" />
              Abrir meu perfil
            </ButtonLink>
          </section>
        </aside>
      </div>
    </div>
  );
}
