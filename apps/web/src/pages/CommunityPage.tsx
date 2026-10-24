import {
  Camera,
  MapPin,
  Route,
  Settings,
  Signpost,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ButtonLink } from '../components/design-system';
import { MetricCard } from '../components/telemetry/Metrics';
import { Avatar, SectionTitle, UnavailableButton } from '../components/ui';
import { photos } from '../data/demo';
import { AchievementPreview, ProgressSummary } from '../gamification/Progress';
import type { ProgressData } from '../gamification/types';
import { useGamification } from '../gamification/useGamification';
import { GaragePreview } from '../garage/GaragePreview';
import { HistoryPreview } from '../history/HistoryPreview';
import { useHistoryStats } from '../history/useHistoryStats';
import { Feed } from '../social/Feed';
import { MySocial } from '../social/Profile';
import { social } from '../social/service';
import type { SocialProfile } from '../social/types';

export function CommunityPage() {
  const { user } = useAuth();
  const progression = useGamification<{ progress: ProgressData }>(
    '/gamification/me',
  );
  const [counts, setCounts] = useState<SocialProfile | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      if (user)
        void social<{ profile: SocialProfile }>(`/users/${user.username}`)
          .then((r) => {
            if (live) setCounts(r.profile);
          })
          .catch(() => {});
    };
    load();
    window.addEventListener('apex:social-changed', load);
    return () => {
      live = false;
      window.removeEventListener('apex:social-changed', load);
    };
  }, [user]);
  const { data: statistics } = useHistoryStats();
  const profile = {
    name: user?.displayName ?? 'Entre no Apex Ride',
    username: user ? `@${user.username}` : 'Crie seu perfil',
    city:
      [user?.city, user?.state].filter(Boolean).join(', ') ||
      'Localidade não informada',
    biography:
      user?.biography ||
      (user
        ? 'Adicione uma biografia nas configurações.'
        : 'Entre ou crie uma conta para personalizar seu perfil.'),
    routes: statistics?.totals.total ?? '—',
    distance: statistics
      ? (statistics.totals.distance_meters / 1000).toLocaleString('pt-BR', {
          maximumFractionDigits: 1,
        })
      : '—',
    followers: counts?.id === user?.id ? (counts?.followers ?? '—') : '—',
    following: counts?.id === user?.id ? (counts?.following ?? '—') : '—',
  };
  return (
    <div className="community-page">
      <section className="profile-hero">
        <img className="profile-cover" src={photos.cover} alt="" />
        <div className="profile-identification">
          <div className="profile-avatar">
            <Avatar name={profile.name} large placeholder />
            <UnavailableButton
              className="avatar-camera"
              label="Alterar foto indisponível nesta demonstração"
            >
              <Camera size={21} />
            </UnavailableButton>
          </div>
          <div className="profile-copy">
            <span className="eyebrow">MEU PERFIL</span>
            <h1>{profile.name}</h1>
            <div className="xp-label">
              <span>{profile.username}</span>
            </div>
            <ProgressSummary data={progression.data?.progress ?? null} />
            {progression.error && <p role="status">{progression.error}</p>}
            {user && (
              <div className="gamification-actions">
                <Link className="text-link action-link" to="/perfil/xp">
                  Histórico de XP
                </Link>
                <Link className="text-link action-link" to="/perfil/conquistas">
                  Conquistas e metas
                </Link>
              </div>
            )}
            <p className="profile-city">
              <MapPin size={18} />
              {profile.city}
            </p>
            <p className="profile-bio">{profile.biography}</p>
            <small>
              {user
                ? `Perfil ${user.privacy.profileVisibility === 'public' ? 'público' : 'privado'}`
                : 'Perfil pessoal disponível após login'}
            </small>
          </div>
          <ButtonLink
            to={user ? '/configuracoes' : '/entrar'}
            variant="secondary"
            className="edit-profile"
          >
            <Settings size={19} />
            {user ? 'Editar perfil' : 'Entrar na conta'}
          </ButtonLink>
        </div>
        <div className="profile-stats">
          <MetricCard
            icon={<Signpost />}
            label="Rides salvos"
            value={profile.routes}
          />
          <MetricCard
            icon={<Route />}
            label="km percorridos"
            value={profile.distance}
          />
          <MetricCard
            icon={<UsersRound />}
            label="Seguidores"
            value={profile.followers}
          />
          <MetricCard
            icon={<UsersRound />}
            label="Seguindo"
            value={profile.following}
          />
        </div>
      </section>
      <div className="profile-top-grid">
        <section>
          <SectionTitle to="/garagem" action="Ver garagem">
            MINHA GARAGEM
          </SectionTitle>
          <GaragePreview />
        </section>
        <section>
          <SectionTitle>CONQUISTAS</SectionTitle>
          <AchievementPreview />
        </section>
      </div>
      <div className="profile-social-grid">
        <section>
          <SectionTitle to="/historico" action="Ver todas">
            ÚLTIMAS ATIVIDADES
          </SectionTitle>
          <HistoryPreview profile />
          <SectionTitle>PUBLICAÇÕES</SectionTitle>
          <Feed key={user?.id ?? 'anonymous'} />
        </section>
        <div className="social-sidebar">
          <section>
            <SectionTitle>MOTOCICLISTAS</SectionTitle>
            <MySocial key={user?.id ?? 'anonymous'} />
            <SectionTitle to="/comunidade/grupos" action="Ver grupos">
              COMUNIDADES
            </SectionTitle>
            <div className="panel social-summary">
              <p>Encontre comunidades por região e estilo de motocicleta.</p>
              <div className="social-controls">
                <ButtonLink variant="secondary" to="/comunidade/grupos">
                  Grupos
                </ButtonLink>
                <ButtonLink variant="secondary" to="/comunidade/eventos">
                  Eventos
                </ButtonLink>
                {user && (
                  <ButtonLink
                    variant="secondary"
                    to="/comunidade/grupos?filter=mine"
                  >
                    Meus grupos
                  </ButtonLink>
                )}
              </div>
            </div>
          </section>
          <section>
            <SectionTitle to="/comunidade/rankings" action="Ver rankings">
              RANKING REGIONAL
            </SectionTitle>
            <div className="panel social-summary">
              <p>
                XP sazonal, exploração e participação comunitária. Participação
                pública opcional.
              </p>
              <ButtonLink variant="secondary" to="/comunidade/rankings">
                Rankings
              </ButtonLink>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
