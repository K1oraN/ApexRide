import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Field, PasswordField, StateField } from '../components/AccountFields';
import { authRequest, authService, type LegalConfig } from '../services/auth';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
const titles = {
  login: 'ENTRAR',
  register: 'CRIAR CONTA',
  forgot: 'RECUPERAR ACESSO',
  reset: 'NOVA SENHA',
  verify: 'CONFIRMAR E-MAIL',
};
export function AuthPage({ mode }: { mode: Mode }) {
  const { user, status, login, endSession } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requested = params.get('retorno') ?? '/perfil';
  const returnTo =
    /^\/(perfil|configuracoes|privacidade|ride|garagem)(\?|$)/.test(
      requested,
    ) || /^\/comunidade\/grupos(?:\/[a-zA-Z0-9-]+)*(?:[?#]|$)/.test(requested)
      ? requested
      : '/perfil';
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [displayName, setDisplayName] = useState(''),
    [username, setUsername] = useState(''),
    [city, setCity] = useState(''),
    [state, setState] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false),
    [legal, setLegal] = useState<LegalConfig | null>(null);
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  );
  useEffect(() => {
    if (mode === 'reset' || mode === 'verify')
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
  }, [mode]);
  useEffect(() => {
    if (mode !== 'register') return;
    let active = true;
    authService
      .config()
      .then((data) => {
        if (active) setLegal(data.legal);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  if (status === 'loading' && mode === 'login')
    return (
      <p className="page-loading" role="status">
        Verificando sua sessão…
      </p>
    );
  if (user && (mode === 'login' || mode === 'register'))
    return <Navigate replace to={returnTo} />;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (
      (mode === 'register' || mode === 'reset') &&
      password !== confirmation
    ) {
      setError('As senhas precisam ser iguais.');
      return;
    }
    if (
      mode === 'register' &&
      (!/^[\p{L}\p{M}\p{N} ._'’-]+$/u.test(displayName.trim()) ||
        !/[\p{L}\p{N}]/u.test(displayName))
    ) {
      setError('Informe um nome de exibição válido.');
      return;
    }
    if (
      mode === 'register' &&
      ['me', 'auth', 'admin', 'api'].includes(username.toLowerCase())
    ) {
      setError('Escolha outro nome de usuário.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate(returnTo, { replace: true });
      }
      if (mode === 'register' && legal) {
        const result = await authService.register({
          displayName,
          username,
          email,
          password,
          city,
          state,
          acceptTerms,
          termsVersion: legal.termsVersion,
          privacyVersion: legal.privacyVersion,
        });
        setMessage(result.message);
        setPassword('');
        setConfirmation('');
      }
      if (mode === 'forgot') {
        const result = await authRequest<{ message: string }>(
          '/auth/password/forgot',
          'POST',
          { email },
        );
        setMessage(result.message);
      }
      if (mode === 'reset') {
        const result = await authRequest<{ message: string }>(
          '/auth/password/reset',
          'POST',
          { token, password },
        );
        endSession();
        setMessage(result.message);
        setPassword('');
        setConfirmation('');
      }
      if (mode === 'verify') {
        const result = await authRequest<{ message: string }>(
          '/auth/email/verify',
          'POST',
          { token },
        );
        setMessage(result.message);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Não foi possível concluir.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await authRequest<{ message: string }>(
        '/auth/email/resend',
        'POST',
        { email },
      );
      setMessage(result.message);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Falha ao solicitar envio.',
      );
    } finally {
      setBusy(false);
    }
  }
  const done = Boolean(message) && mode !== 'forgot' && mode !== 'login';
  return (
    <section className="account-card panel">
      <span className="eyebrow">APEX RIDE · SUA CONTA</span>
      <h1>{titles[mode]}</h1>
      <p>
        {mode === 'login'
          ? 'Entre para acessar seu perfil e suas preferências.'
          : mode === 'register'
            ? 'Seu perfil começa aqui. Cidade e estado são opcionais.'
            : mode === 'forgot'
              ? 'Informe seu e-mail para receber as instruções de recuperação.'
              : 'Os links são pessoais, expiram em 30 minutos e funcionam uma única vez.'}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {(mode === 'reset' || mode === 'verify') && !token ? (
        <p role="alert">Link inválido. Solicite um novo e-mail.</p>
      ) : (
        !done && (
          <form className="account-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              {mode === 'register' && (
                <>
                  <Field
                    label="Nome de exibição"
                    name="displayName"
                    autoComplete="name"
                    minLength={2}
                    maxLength={60}
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                  <Field
                    label="Nome de usuário"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    pattern="[A-Za-z0-9_]{3,30}"
                    title="3 a 30 letras, números ou sublinhado"
                    minLength={3}
                    maxLength={30}
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </>
              )}
              {['login', 'register', 'forgot'].includes(mode) && (
                <Field
                  label="E-mail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
              {['login', 'register', 'reset'].includes(mode) && (
                <PasswordField
                  label="Senha"
                  name="password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  minLength={mode === 'login' ? 1 : 15}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
              {['register', 'reset'].includes(mode) && (
                <>
                  <small>
                    Use de 15 a 128 caracteres. Frases longas e gerenciadores de
                    senhas são bem-vindos.
                  </small>
                  <PasswordField
                    label="Confirmar senha"
                    name="confirmation"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={128}
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </>
              )}
              {mode === 'register' && (
                <>
                  <Field
                    label="Cidade (opcional)"
                    name="city"
                    autoComplete="address-level2"
                    maxLength={80}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <StateField value={state} onChange={setState} />
                  {legal ? (
                    <>
                      <p className="legal-note">
                        {legal.preliminary
                          ? 'Ambiente de pré-lançamento: textos definitivos dos Termos de Uso e da Política de Privacidade pendentes. O aceite registrado é preliminar.'
                          : ''}{' '}
                        <a
                          className="text-link"
                          href={legal.termsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Termos de Uso
                        </a>{' '}
                        ·{' '}
                        <a
                          className="text-link"
                          href={legal.privacyUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Política de Privacidade
                        </a>
                      </p>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          required
                          checked={acceptTerms}
                          onChange={(e) => setAcceptTerms(e.target.checked)}
                        />
                        <span>
                          {legal.preliminary
                            ? 'Estou ciente do aviso preliminar e concordo em prosseguir neste ambiente de testes.'
                            : 'Li e aceito os Termos de Uso e a Política de Privacidade.'}
                        </span>
                      </label>
                    </>
                  ) : (
                    <p role="status">Carregando informações dos termos…</p>
                  )}
                </>
              )}
              <button
                className="button button-primary"
                type="submit"
                disabled={busy || (mode === 'register' && !legal)}
              >
                {busy
                  ? 'Aguarde…'
                  : mode === 'login'
                    ? 'Entrar'
                    : mode === 'register'
                      ? 'Criar conta'
                      : mode === 'forgot'
                        ? 'Enviar instruções'
                        : mode === 'reset'
                          ? 'Redefinir senha'
                          : 'Confirmar e-mail'}
              </button>
            </fieldset>
          </form>
        )
      )}
      <div className="account-links">
        {mode === 'login' ? (
          <>
            <Link className="text-link" to="/cadastro">
              Criar conta
            </Link>
            <Link className="text-link" to="/recuperar-senha">
              Esqueci minha senha
            </Link>
            <button
              type="button"
              className="text-link"
              disabled={busy || !email}
              onClick={() => void resend()}
            >
              Reenviar confirmação de e-mail
            </button>
          </>
        ) : (
          <Link className="text-link" to="/entrar">
            Voltar para entrar
          </Link>
        )}
      </div>
    </section>
  );
}
