import {
  Bell,
  BookOpen,
  ChevronDown,
  Compass,
  House,
  LogOut,
  MapPin,
  Menu,
  Settings,
  Target,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react';
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useNavigation } from '../navigation/context';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { LiveBanner } from '../events/LiveBanner';
import { useRide } from '../ride/context';
import { HelmetIcon, Logo, RideIcon } from './Brand';
import { ButtonLink, EmptyState } from './design-system';
import { Avatar, Popover } from './ui';
import { PageErrorBoundary } from './PageErrorBoundary';
import '../styles/guide.css';
import '../styles/apex-stage-01.css';

export function Layout() {
  const { snapshot: ride } = useRide();
  const navigation = useNavigation();
  const navigating = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
  );
  const { user, status, error, refresh, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const region = [user?.city, user?.state].filter(Boolean).join(', ');

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  async function signOut() {
    if (loggingOut) return;
    setLogoutError('');
    setLoggingOut(true);
    try {
      // The auth provider handles pending offline activities and cancellation.
      await logout();
    } catch (cause) {
      setLogoutError(
        cause instanceof Error ? cause.message : 'Não foi possível sair.',
      );
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <Link to="/app" className="brand-link" aria-label="Apex Ride — Início">
          <Logo />
        </Link>
        <div className="header-tools">
          <Popover
            key={location.pathname}
            label="Mais opções"
            className="app-more-menu"
            trigger={<Menu size={23} />}
          >
            <nav aria-label="Mais opções" className="app-menu-links">
              <Link to="/perfil">
                <UserRound size={19} />
                Meu perfil
              </Link>
              <Link to="/comunidade/grupos?filter=mine">
                <UsersRound size={19} />
                Meus grupos
              </Link>
              <Link to="/perfil/conquistas">
                <Trophy size={19} />
                Missões e conquistas
              </Link>
              <Link to="/perfil/xp">
                <Target size={19} />
                Minha evolução
              </Link>
              <Link to="/guia">
                <BookOpen size={19} />
                Guia
              </Link>
              <Link to="/configuracoes">
                <Settings size={19} />
                Configurações
              </Link>
            </nav>
            <div className="app-menu-footer">
              <button
                type="button"
                className="app-menu-signout"
                disabled={!user || loggingOut}
                onClick={() => void signOut()}
              >
                <LogOut size={19} aria-hidden />
                {loggingOut ? 'Saindo…' : 'Sair da conta'}
              </button>
              {logoutError && <p role="alert">{logoutError}</p>}
            </div>
          </Popover>
          <Popover
            label="Localização"
            className="location-menu"
            trigger={
              <>
                <MapPin size={18} />
                <span>{region || 'Minha região'}</span>
                <ChevronDown size={15} />
              </>
            }
          >
            <p>{region || 'Você ainda não definiu sua região.'}</p>
            <small>
              Informação do seu perfil. O GPS não é consultado aqui.
            </small>
            <ButtonLink to="/configuracoes" variant="ghost">
              {region ? 'Editar região' : 'Definir região'}
            </ButtonLink>
          </Popover>
          <Popover
            label="Notificações"
            className="notifications"
            trigger={<Bell size={25} />}
          >
            <EmptyState title="Notificações" icon={<Bell size={24} />}>
              As notificações ainda não estão disponíveis. Nenhum alerta foi
              gerado.
            </EmptyState>
          </Popover>
          <Link
            className="profile-link"
            to={user ? '/perfil' : '/entrar'}
            aria-label={
              user
                ? `Abrir perfil de ${user.displayName}`
                : 'Entrar na sua conta'
            }
          >
            <Avatar name={user?.displayName ?? 'Visitante'} placeholder />
            <span>
              {user?.displayName ??
                (status === 'loading' ? 'Aguarde…' : 'Entrar')}
              <small>{user ? `@${user.username}` : 'Minha conta'}</small>
            </span>
          </Link>
        </div>
      </header>
      <LiveBanner />
      {navigating.active &&
        !location.pathname.startsWith('/explorar/navegar') && (
          <div className="session-warning">
            <Link className="text-link action-link" to="/explorar/navegar">
              Navegação ativa · Voltar às orientações
            </Link>
          </div>
        )}
      {status === 'error' && (
        <div className="session-warning">
          <span>{error}</span>
          <button className="text-link" onClick={() => void refresh()}>
            Tentar novamente
          </button>
        </div>
      )}
      {ride.activity &&
        ride.state !== 'saved' &&
        location.pathname !== '/ride' && (
          <div className="session-warning">
            <Link className="text-link action-link" to="/ride">
              Ride{' '}
              {ride.state === 'running'
                ? 'em andamento'
                : ride.state === 'paused'
                  ? 'pausado'
                  : 'aguardando conclusão'}{' '}
              · Voltar ao painel
            </Link>
          </div>
        )}
      <main id="conteudo" className="page-content" tabIndex={-1} ref={main}>
        <PageErrorBoundary key={location.pathname}>
          <Suspense
            fallback={
              <p className="page-loading" role="status">
                Carregando página…
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </PageErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const location = useLocation();
  const { snapshot } = useRide();
  const state =
    snapshot.state === 'running'
      ? 'active'
      : snapshot.state === 'paused'
        ? 'paused'
        : ['finished', 'saving'].includes(snapshot.state)
          ? 'finishing'
          : snapshot.state === 'waiting-gps' || location.pathname === '/ride'
            ? 'preparing'
            : 'inactive';
  const label = {
    active: 'ATIVO',
    paused: 'PAUSADO',
    finishing: 'FINALIZAR',
    preparing: snapshot.state === 'waiting-gps' ? 'GPS…' : 'RIDE',
    inactive: 'RIDE',
  }[state];
  const description = {
    active: 'Ride em andamento',
    paused: 'Ride pausado',
    finishing: 'Ride aguardando conclusão',
    preparing:
      snapshot.state === 'waiting-gps'
        ? 'Ride aguardando GPS'
        : 'Preparação do Ride',
    inactive: 'Nenhum Ride em andamento',
  }[state];
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <NavLink to="/app" end>
        <House />
        <span>Início</span>
      </NavLink>
      <NavLink to="/explorar">
        <Compass />
        <span>Explorar</span>
      </NavLink>
      <NavLink
        to="/ride"
        aria-label="Ride"
        aria-describedby="ride-nav-status"
        data-ride-state={state}
        className={({ isActive }) => `ride-nav ${isActive ? 'active' : ''}`}
      >
        <span className="ride-nav-circle">
          <RideIcon size={35} />
          <strong>{label}</strong>
        </span>
        <span id="ride-nav-status" className="sr-only">
          {description}
        </span>
      </NavLink>
      <NavLink
        to="/comunidade"
        className={({ isActive }) =>
          isActive || location.pathname === '/perfil' ? 'active' : ''
        }
        aria-current={location.pathname === '/perfil' ? 'page' : undefined}
      >
        <UsersRound />
        <span>Comunidade</span>
      </NavLink>
      <NavLink to="/garagem">
        <HelmetIcon />
        <span>Garagem</span>
      </NavLink>
    </nav>
  );
}
