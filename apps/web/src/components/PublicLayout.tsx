import { ArrowLeft } from 'lucide-react';
import { Suspense, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import '../styles/public.css';
import '../styles/apex-stage-02.css';
import { Logo } from './Brand';

export function PublicLayout() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    if (location.hash) return;
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.current?.focus({ preventScroll: true });
  }, [location.pathname, location.hash]);
  return (
    <div className="public-site">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <main id="conteudo" tabIndex={-1} ref={main}>
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
    </div>
  );
}

export function AuthBrand() {
  return (
    <div className="auth-brand-row">
      <Link to="/" aria-label="Apex Ride — site">
        <Logo />
      </Link>
      <Link className="back-to-site" to="/">
        <ArrowLeft size={16} /> Voltar para o site
      </Link>
    </div>
  );
}
