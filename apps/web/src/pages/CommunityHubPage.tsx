import { ArrowRight, CalendarDays, MessageCircle, Trophy, UserRound, UsersRound } from 'lucide-react';
import { Link } from 'react-router';
import { ButtonLink } from '../components/design-system';
import { Feed } from '../social/Feed';
import '../styles/community-hub.css';

/** Community is the social content hub. Account, group management and personal
 * progression are accessible via "Mais opções", not duplicated in the feed. */
export function CommunityHubPage() {
  return (
    <div className="community-hub community-hub--feed">
      <section className="community-hub-hero panel" aria-labelledby="community-hub-title">
        <div className="community-hub-hero-content">
          <span className="community-hub-eyebrow">APEX RIDE / RIDERS CONNECT</span>
          <h1 id="community-hub-title">NOSSA <span>COMUNIDADE.</span></h1>
          <p>Compartilhe sua jornada, acompanhe os riders, descubra eventos e participe dos rankings.</p>
          <div className="community-hub-hero-actions">
            <ButtonLink to="/perfil" variant="secondary">
              <UserRound size={19} aria-hidden="true" /> Meu perfil <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>
          </div>
        </div>
        <div className="community-hub-hero-mark" aria-hidden="true">
          <div className="community-hub-mark-ring"><UsersRound size={64} strokeWidth={1.25} /></div>
        </div>
      </section>
      <nav className="community-hub-navigation" aria-label="Seções da comunidade">
        <Link to="/comunidade" className="community-hub-tab is-current" aria-current="page">
          <MessageCircle size={19} aria-hidden="true" /><span>Publicações</span>
        </Link>
        <Link to="/comunidade/rankings" className="community-hub-tab">
          <Trophy size={19} aria-hidden="true" /><span>Rankings</span>
        </Link>
        <Link to="/comunidade/eventos" className="community-hub-tab">
          <CalendarDays size={19} aria-hidden="true" /><span>Eventos</span>
        </Link>
      </nav>
      <div className="community-hub-grid">
        <section className="community-hub-feed-column" aria-labelledby="community-feed-title">
          <div className="community-hub-section-heading">
            <div>
              <span className="community-hub-kicker">SOCIAL / FEED</span>
              <h2 id="community-feed-title">Publicações</h2>
            </div>
            <span className="community-hub-live-label">Conteúdo da comunidade</span>
          </div>
          <div className="community-hub-feed-wrap"><Feed /></div>
        </section>
      </div>
    </div>
  );
}
