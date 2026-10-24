import { Suspense, useEffect, useRef } from 'react';
import {
  Bell,
  ChevronDown,
  Compass,
  House,
  MapPin,
  UsersRound,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Avatar, Popover } from './ui';
import { HelmetIcon, Logo, RideIcon } from './Brand';
import { useRide } from '../ride/context';
import { LiveBanner } from '../events/LiveBanner';

export function Layout() {
  const { snapshot: ride } = useRide();
  const { user, status, error, refresh } = useAuth();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <Link to="/" className="brand-link" aria-label="Apex Ride — Início">
          <Logo />
        </Link>
        <div className="header-tools">
          <Popover
            label="Localização"
            className="location-menu"
            trigger={
              <>
                <MapPin size={18} />
                <span>Alagoas, BR</span>
                <ChevronDown size={15} />
              </>
            }
          >
            <p>Alagoas, Brasil</p>
            <small>
              Região ilustrativa. Nenhuma localização GPS é consultada.
            </small>
          </Popover>
          <Popover
            label="Notificações"
            className="notifications"
            trigger={
              <>
                <Bell size={27} />
                <span className="notification-dot" />
              </>
            }
          >
            <p>Prévia de notificações</p>
            <small>Nenhuma notificação real nesta demonstração.</small>
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
      <div className="demo-notice">
        <span />
        Pré-lançamento · homologação pendente
      </div>
      <LiveBanner />
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
            <Link className="text-link" to="/ride">
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
        <Suspense
          fallback={
            <p className="page-loading" role="status">
              Carregando página…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const location = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <NavLink to="/" end>
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
        className={({ isActive }) => `ride-nav ${isActive ? 'active' : ''}`}
      >
        <span className="ride-nav-circle">
          <RideIcon size={35} />
          <strong>RIDE</strong>
        </span>
        <span className="sr-only">Ride</span>
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
