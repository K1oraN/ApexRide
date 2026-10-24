import { LogOut, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Logo } from '../components/Brand';
import { Button, ButtonLink } from '../components/design-system';
import { authRequest } from '../services/auth';
import { AdminAuth } from './AdminAuth';
import { AdminDashboard } from './Dashboard';
import { AdminWorkspace } from './Workspace';
import './admin.css';
import { errorText, type AdminAccess } from './service';
const navigation = [
  ['', 'Visão geral', 'dashboard.read'],
  ['users', 'Usuários', 'users.read'],
  ['reports', 'Denúncias', 'reports.read'],
  ['appeals', 'Recursos', 'reports.review'],
  ['groups', 'Grupos', 'groups.moderate'],
  ['events', 'Eventos', 'events.moderate'],
  ['routes', 'Rotas', 'routes.review'],
  ['circuits', 'Circuitos', 'circuits.verify'],
  ['gamification', 'Integridade de XP', 'xp.review'],
  ['rankings', 'Rankings e pista', 'rankings.manage'],
  ['approvals', 'Aprovações', 'roles.approve'],
  ['operators', 'Operadores', 'roles.manage'],
  ['roles', 'Permissões', 'roles.manage'],
  ['audit', 'Auditoria', 'audit.read'],
  ['security', 'Segurança', 'security.read'],
  ['incidents', 'Incidentes', 'incidents.manage'],
  ['privacy', 'Privacidade', 'privacy.requests'],
  ['settings', 'Configurações', 'settings.manage'],
];
export function AdminPage() {
  const { user, status } = useAuth(),
    { section = '' } = useParams(),
    [access, setAccess] = useState<AdminAccess | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [reauth, setReauth] = useState(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const a = await authRequest<AdminAccess>('/admin/access');
      if (current !== generation.current || document.hidden) return;
      setAccess(a);
      setError('');
      setReauth(false);
    } catch (e) {
      if (current !== generation.current) return;
      setAccess(null);
      setError(errorText(e));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    const check = () => {
      if (active && !document.hidden) void refresh();
    };
    check();
    const denied = () => {
      generation.current++;
      setAccess(null);
      setError('Acesso negado ou autenticação expirada. Revalide seu acesso.');
    };
    const visibility = () => {
      if (document.hidden) {
        generation.current++;
        setAccess(null);
        setLoading(true);
      } else check();
    };
    const timer = setInterval(check, 30000);
    const offline = () => {
      generation.current++;
      setAccess(null);
      setError(
        'Sem conexão. Reconecte para revalidar o acesso administrativo.',
      );
    };
    window.addEventListener('apex:admin-denied', denied);
    window.addEventListener('offline', offline);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      invalidate();
      clearInterval(timer);
      window.removeEventListener('apex:admin-denied', denied);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [user, refresh, invalidate]);
  const allowed = navigation.filter(
    (n) =>
      access?.permissions.includes('admin.' + n[2]) ||
      (n[0] === 'incidents' &&
        access?.permissions.includes('admin.security.read')) ||
      (n[0] === 'approvals' && access?.permissions.includes('admin.xp.adjust')),
  );
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">
        Pular para o conteúdo
      </a>
      <header className="admin-header">
        <Link to="/app" aria-label="Apex Ride — Início">
          <Logo />
        </Link>
        <span>
          <ShieldCheck size={20} />
          Administração interna
        </span>
        <Link className="text-link action-link" to="/app">
          Voltar ao Apex Ride
        </Link>
      </header>
      {loading || status === 'loading' ? (
        <p role="status">Validando acesso…</p>
      ) : !user ? (
        <section className="account-card panel">
          <h1>Área administrativa protegida</h1>
          <p>Entre na sua conta para validar seu acesso.</p>
          <ButtonLink variant="primary" to="/entrar">
            Entrar
          </ButtonLink>
        </section>
      ) : error ? (
        <section className="account-card panel">
          <h1>Acesso administrativo indisponível</h1>
          <p role="alert">{error}</p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Revalidar acesso
          </Button>
        </section>
      ) : access && (!access.verified || reauth) ? (
        <AdminAuth
          enrolled={access.mfaEnrolled}
          onVerified={() => void refresh()}
        />
      ) : access ? (
        <div className="admin-body">
          <aside className="admin-sidebar">
            <p className="eyebrow">CENTRAL APEX RIDE</p>
            <nav aria-label="Administração">
              {allowed.map(([path, label]) => (
                <NavLink
                  key={path}
                  to={'/admin' + (path ? '/' + path : '')}
                  end
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <Button variant="secondary" onClick={() => setReauth(true)}>
              Reautenticar
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void authRequest('/admin/logout', 'POST', {})
                  .then(() => refresh())
                  .catch((e) => setError(errorText(e)))
              }
            >
              <LogOut size={16} />
              Encerrar sessão administrativa
            </Button>
          </aside>
          <main
            id="admin-content"
            tabIndex={-1}
            className="admin-content"
            key={section}
          >
            {allowed.some((n) => n[0] === section) ? (
              section ? (
                <AdminWorkspace
                  section={section}
                  permissions={access.permissions}
                  operatorId={access.id}
                />
              ) : (
                <AdminDashboard />
              )
            ) : (
              <p role="alert">Sem permissão para esta seção.</p>
            )}
          </main>
        </div>
      ) : null}
    </div>
  );
}
