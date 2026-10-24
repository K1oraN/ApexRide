import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { ButtonLink } from './components/design-system';
import { Layout } from './components/Layout';
import { PublicLayout } from './components/PublicLayout';
import { LiveProvider } from './events/LiveProvider';
import { GarageProvider } from './garage/GarageProvider';
import { LandingPage } from './pages/LandingPage';
import { RideProvider } from './ride/RideProvider';
import { NavigationProvider } from './navigation/NavigationProvider';
import './styles/account.css';
import './styles/garage.css';

const DiscoveriesPage = lazy(() =>
  import('./pages/DiscoveriesPage').then((m) => ({
    default: m.DiscoveriesPage,
  })),
);

const CatalogPage = lazy(() =>
  import('./garage/CatalogSheet').then((m) => ({
    default: m.CatalogPage,
  })),
);

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({
    default: m.HomePage,
  })),
);

const AdminPage = lazy(() =>
  import('./admin/AdminPage').then((m) => ({
    default: m.AdminPage,
  })),
);

const MyCases = lazy(() =>
  import('./admin/MyCases').then((m) => ({
    default: m.MyCases,
  })),
);

const AchievementsPage = lazy(() =>
  import('./gamification/AchievementsPage').then((m) => ({
    default: m.AchievementsPage,
  })),
);

const XpHistoryPage = lazy(() =>
  import('./gamification/XpHistoryPage').then((m) => ({
    default: m.XpHistoryPage,
  })),
);

const RankingsPage = lazy(() =>
  import('./gamification/RankingsPage').then((m) => ({
    default: m.RankingsPage,
  })),
);

const EventsPage = lazy(() =>
  import('./events/EventsPage').then((m) => ({
    default: m.EventsPage,
  })),
);

const EventDetailsPage = lazy(() =>
  import('./events/EventDetailsPage').then((m) => ({
    default: m.EventDetailsPage,
  })),
);

const EventCreatePage = lazy(() =>
  import('./events/EventDetailsPage').then((m) => ({
    default: m.EventCreatePage,
  })),
);

const EventLiveMapPage = lazy(() =>
  import('./events/EventLiveMapPage').then((m) => ({
    default: m.EventLiveMapPage,
  })),
);

const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({
    default: m.AuthPage,
  })),
);

const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((m) => ({
    default: m.AccountPage,
  })),
);

// ETAPA 7.1 — Comunidade Premium
const CommunityHubPage = lazy(() =>
  import('./pages/CommunityHubPage').then((module) => ({
    default: module.CommunityHubPage,
  })),
);

// Perfil anterior preservado para a Etapa 7.2
const CommunityPage = lazy(() =>
  import('./pages/CommunityPage').then((module) => ({
    default: module.CommunityPage,
  })),
);

const SocialProfilePage = lazy(() =>
  import('./social/Profile').then((m) => ({
    default: m.SocialProfilePage,
  })),
);

const GroupsPage = lazy(() =>
  import('./groups/GroupsPage').then((m) => ({
    default: m.GroupsPage,
  })),
);

const GroupDetailsPage = lazy(() =>
  import('./groups/GroupDetailsPage').then((m) => ({
    default: m.GroupDetailsPage,
  })),
);

const GroupCreatePage = lazy(() =>
  import('./groups/GroupDetailsPage').then((m) => ({
    default: m.GroupCreatePage,
  })),
);

const GroupInvitationPage = lazy(() =>
  import('./groups/GroupDetailsPage').then((m) => ({
    default: m.GroupInvitationPage,
  })),
);

const ExplorePage = lazy(() =>
  import('./pages/ExplorePage').then((module) => ({
    default: module.ExplorePage,
  })),
);

const GaragePage = lazy(() =>
  import('./pages/GaragePage').then((module) => ({
    default: module.GaragePage,
  })),
);

const HealthPage = lazy(() =>
  import('./pages/HealthPage').then((module) => ({
    default: module.HealthPage,
  })),
);

const RidePage = lazy(() =>
  import('./pages/RidePage').then((module) => ({
    default: module.RidePage,
  })),
);

const GuidePage = lazy(() =>
  import('./pages/GuidePage').then((m) => ({
    default: m.GuidePage,
  })),
);

const RideSessionsPage = lazy(() =>
  import('./pages/RideWorkspacePages').then((m) => ({
    default: m.RideSessionsPage,
  })),
);

const RideCircuitsPage = lazy(() =>
  import('./pages/RideWorkspacePages').then((m) => ({
    default: m.RideCircuitsPage,
  })),
);

const RideTelemetryPage = lazy(() =>
  import('./pages/RideWorkspacePages').then((m) => ({
    default: m.RideTelemetryPage,
  })),
);

const RideMediaPage = lazy(() =>
  import('./pages/RideWorkspacePages').then((m) => ({
    default: m.RideMediaPage,
  })),
);

const MotorcyclePage = lazy(() =>
  import('./pages/GaragePage').then((m) => ({
    default: m.MotorcyclePage,
  })),
);

const RouteDetailPage = lazy(() =>
  import('./pages/RoutePages').then((m) => ({
    default: m.RouteDetailPage,
  })),
);

const RouteEditorPage = lazy(() =>
  import('./pages/RoutePages').then((m) => ({
    default: m.RouteEditorPage,
  })),
);

const NavigationPage = lazy(() =>
  import('./navigation/NavigationPage').then((m) => ({
    default: m.NavigationPage,
  })),
);

const RouteModerationPage = lazy(() =>
  import('./pages/RoutePages').then((m) => ({
    default: m.RouteModerationPage,
  })),
);

const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((m) => ({
    default: m.HistoryPage,
  })),
);

const RideDetailsPage = lazy(() =>
  import('./pages/RideDetailsPage').then((m) => ({
    default: m.RideDetailsPage,
  })),
);

const ReplayPage = lazy(() =>
  import('./pages/ReplayPage').then((m) => ({
    default: m.ReplayPage,
  })),
);

const ComparisonPage = lazy(() =>
  import('./pages/ComparisonPage').then((m) => ({
    default: m.ComparisonPage,
  })),
);

const SimilarityPage = lazy(() =>
  import('./pages/SimilarityPage').then((m) => ({
    default: m.SimilarityPage,
  })),
);

const PublicRidePage = lazy(() =>
  import('./pages/PublicRidePage').then((m) => ({
    default: m.PublicRidePage,
  })),
);

const LocalRideDetailsPage = lazy(() =>
  import('./pages/LocalRideDetailsPage').then((m) => ({
    default: m.LocalRideDetailsPage,
  })),
);

const RideStatisticsPage = lazy(() =>
  import('./pages/RideStatisticsPage').then((m) => ({
    default: m.RideStatisticsPage,
  })),
);

export function App() {
  return (
    <AuthProvider>
      <GarageProvider>
        <RideProvider>
          <NavigationProvider>
            <LiveProvider>
              <Routes>
                {/* Administração */}
                <Route
                  path="admin/:section?"
                  element={
                    <Suspense
                      fallback={<p role="status">Carregando administração…</p>}
                    >
                      <AdminPage />
                    </Suspense>
                  }
                />

                {/* Área autenticada */}
                <Route element={<RequireAuth />}>
                  <Route element={<Layout />}>
                    {/* Início */}
                    <Route path="app" element={<HomePage />} />

                    {/* Explorar e rotas */}
                    <Route path="explorar" element={<ExplorePage />} />

                    <Route path="explorar/:id" element={<RouteDetailPage />} />

                    {/* Ride */}
                    <Route path="ride" element={<RidePage />} />

                    <Route path="ride/sessoes" element={<RideSessionsPage />} />

                    <Route
                      path="ride/circuitos"
                      element={<RideCircuitsPage />}
                    />

                    <Route
                      path="ride/telemetria"
                      element={<RideTelemetryPage />}
                    />

                    <Route
                      path="ride/videos"
                      element={<RideMediaPage key="library" />}
                    />

                    <Route
                      path="ride/estudio"
                      element={<RideMediaPage key="studio" studio />}
                    />

                    {/* Garagem e catálogo */}
                    <Route
                      path="garagem/catalogo/:variantId"
                      element={<CatalogPage />}
                    />

                    <Route
                      path="garagem/nova"
                      element={<MotorcyclePage key="new" />}
                    />

                    <Route
                      path="garagem/:id"
                      element={<MotorcyclePage key="detail" />}
                    />

                    <Route
                      path="garagem/:id/editar"
                      element={<MotorcyclePage key="edit" edit />}
                    />

                    <Route path="garagem" element={<GaragePage />} />

                    {/* Guias e descobertas */}
                    <Route path="guia" element={<GuidePage />} />

                    <Route path="descobertas" element={<DiscoveriesPage />} />

                    {/* ETAPA 7.1 — Nova Comunidade */}
                    <Route path="comunidade" element={<CommunityHubPage />} />

                    {/* Equipes */}
                    <Route path="comunidade/grupos" element={<GroupsPage />} />

                    <Route
                      path="comunidade/grupos/:id"
                      element={<GroupDetailsPage />}
                    />

                    <Route
                      path="comunidade/grupos/convite/:invitationId"
                      element={<GroupInvitationPage />}
                    />

                    <Route
                      path="comunidade/grupos/novo"
                      element={<GroupCreatePage />}
                    />

                    {/* Perfil social de motociclistas */}
                    <Route
                      path="comunidade/u/:username"
                      element={<SocialProfilePage />}
                    />

                    {/* Rankings */}
                    <Route
                      path="comunidade/rankings"
                      element={<RankingsPage />}
                    />

                    {/* Eventos */}
                    <Route path="comunidade/eventos" element={<EventsPage />} />

                    <Route
                      path="comunidade/eventos/:id"
                      element={<EventDetailsPage />}
                    />

                    <Route
                      path="comunidade/eventos/novo"
                      element={<EventCreatePage />}
                    />

                    <Route
                      path="comunidade/eventos/:id/mapa"
                      element={<EventLiveMapPage />}
                    />

                    {/* Histórico */}
                    <Route path="historico" element={<HistoryPage />} />

                    <Route path="historico/:id" element={<RideDetailsPage />} />

                    <Route
                      path="historico/:id/replay"
                      element={<ReplayPage />}
                    />

                    <Route
                      path="historico/:id/semelhantes"
                      element={<SimilarityPage />}
                    />

                    <Route
                      path="historico/local/:clientId/replay"
                      element={<ReplayPage />}
                    />

                    <Route
                      path="historico/local/:clientId"
                      element={<LocalRideDetailsPage />}
                    />

                    {/* Comparação de rotas */}
                    <Route
                      path="explorar/:id/comparar"
                      element={<ComparisonPage />}
                    />

                    {/* Estatísticas */}
                    <Route
                      path="estatisticas"
                      element={<RideStatisticsPage />}
                    />

                    {/* Editor e navegação */}
                    <Route
                      path="explorar/novo"
                      element={<RouteEditorPage key="new-route" />}
                    />

                    <Route
                      path="explorar/navegar"
                      element={<NavigationPage />}
                    />

                    <Route
                      path="explorar/:id/editar"
                      element={<RouteEditorPage key="edit-route" />}
                    />

                    <Route
                      path="explorar/moderacao"
                      element={<RouteModerationPage />}
                    />

                    {/* Perfil pessoal */}
                    <Route path="perfil" element={<CommunityPage />} />

                    <Route path="perfil/medidas" element={<MyCases />} />

                    <Route
                      path="perfil/conquistas"
                      element={<AchievementsPage />}
                    />

                    <Route path="perfil/xp" element={<XpHistoryPage />} />

                    {/* Configurações */}
                    <Route path="configuracoes" element={<AccountPage />} />

                    <Route
                      path="privacidade"
                      element={<AccountPage key="privacy" privacyOnly />}
                    />

                    {/* Diagnóstico técnico */}
                    <Route path="tecnico" element={<HealthPage />} />
                  </Route>
                </Route>

                {/* Área pública */}
                <Route element={<PublicLayout />}>
                  {/* Landing Page */}
                  <Route index element={<LandingPage />} />

                  {/* Ride compartilhado */}
                  <Route
                    path="compartilhar/rides/:id"
                    element={<PublicRidePage />}
                  />

                  {/* Autenticação */}
                  <Route
                    path="entrar"
                    element={<AuthPage key="login" mode="login" />}
                  />

                  <Route
                    path="cadastro"
                    element={<AuthPage key="register" mode="register" />}
                  />

                  <Route
                    path="recuperar-senha"
                    element={<AuthPage key="forgot" mode="forgot" />}
                  />

                  <Route
                    path="redefinir-senha"
                    element={<AuthPage key="reset" mode="reset" />}
                  />

                  <Route
                    path="verificar-email"
                    element={<AuthPage key="verify" mode="verify" />}
                  />

                  {/* Documentação */}
                  <Route
                    path="documentos"
                    element={
                      <section className="account-card panel">
                        <h1>Documentos para publicação</h1>

                        <p>
                          Os textos definitivos dos Termos de Uso e da Política
                          de Privacidade ainda precisam ser fornecidos e
                          revisados pelo responsável antes do lançamento. O
                          ambiente atual registra apenas ciência preliminar para
                          testes.
                        </p>

                        <Link className="text-link action-link" to="/cadastro">
                          Voltar ao cadastro
                        </Link>
                      </section>
                    }
                  />

                  {/* Página não encontrada */}
                  <Route
                    path="*"
                    element={
                      <section className="empty-state panel">
                        <h1>Página não encontrada</h1>

                        <ButtonLink variant="outline" to="/">
                          Voltar ao início
                        </ButtonLink>
                      </section>
                    }
                  />
                </Route>
              </Routes>
            </LiveProvider>
          </NavigationProvider>
        </RideProvider>
      </GarageProvider>
    </AuthProvider>
  );
}
