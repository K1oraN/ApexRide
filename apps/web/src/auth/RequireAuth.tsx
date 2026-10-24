import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../components/design-system';
import { useAuth } from './useAuth';
export function RequireAuth() {
  const { user, status, error, refresh } = useAuth();
  const location = useLocation();
  if (status === 'loading')
    return (
      <p className="page-loading" role="status">
        Verificando sua sessão…
      </p>
    );
  if (status === 'error')
    return (
      <section className="account-card panel auth-connection">
        <h1>Conexão indisponível</h1>
        <p role="alert">{error}</p>
        <p>
          Seus registros locais permanecem neste aparelho. Reconecte para
          confirmar sua sessão.
        </p>
        <Button variant="primary" onClick={() => void refresh()}>
          Tentar novamente
        </Button>
      </section>
    );
  if (!user)
    return (
      <Navigate
        replace
        to={`/entrar?retorno=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
      />
    );
  return <Outlet key={user.id} />;
}
