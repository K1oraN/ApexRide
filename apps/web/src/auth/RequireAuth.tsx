import { Navigate, Outlet, useLocation } from 'react-router';
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
      <section className="account-card panel">
        <h1>Conexão indisponível</h1>
        <p role="alert">{error}</p>
        <button
          className="button button-primary"
          onClick={() => void refresh()}
        >
          Tentar novamente
        </button>
      </section>
    );
  if (!user)
    return (
      <Navigate
        replace
        to={`/entrar?retorno=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  return <Outlet key={user.id} />;
}
