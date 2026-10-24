import {
  ArrowRight,
  AtSign,
  LockKeyhole,
  LogIn,
  Mail,
  UserRound,
  UserRoundPlus,
} from 'lucide-react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { safeReturnTo } from '../auth/returnTo';
import { useAuth } from '../auth/useAuth';
import { Field, PasswordField } from '../components/AccountFields';
import { Button, ButtonLink, Checkbox } from '../components/design-system';
import { AuthBrand } from '../components/PublicLayout';
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
  const returnTo = safeReturnTo(params.get('retorno'));
  const returnQuery = `?retorno=${encodeURIComponent(returnTo)}`;
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [displayName, setDisplayName] = useState(''),
    [username, setUsername] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false),
    [legal, setLegal] = useState<LegalConfig | null>(null);
  const [legalAttempt, setLegalAttempt] = useState(0);
  const [recoveryAvailable, setRecoveryAvailable] = useState<boolean | null>(
    null,
  );
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
    if (mode !== 'register' && mode !== 'forgot') return;
    let active = true;
    authService
      .config()
      .then((data) => {
        if (active) {
          setLegal(data.legal);
          setRecoveryAvailable(data.passwordRecoveryAvailable);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [mode, legalAttempt]);
  if (status === 'loading' && (mode === 'login' || mode === 'register'))
    return (
      <p className="page-loading" role="status">
        Verificando sua sessão…
      </p>
    );
  if (user && (mode === 'login' || mode === 'register'))
    return <Navigate replace to={returnTo} />;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (mode === 'forgot' && recoveryAvailable !== true) return;
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
    submitting.current = true;
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
          city: '',
          state: '',
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
      submitting.current = false;
      setBusy(false);
    }
  }
  async function resend() {
    if (submitting.current) return;
    submitting.current = true;
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
      submitting.current = false;
      setBusy(false);
    }
  }
  const done = Boolean(message) && mode !== 'forgot' && mode !== 'login';
  return (
    <div className={`auth-page auth-${mode}`}>
      <AuthBrand />
      <div className="auth-columns">
        <div className="auth-story">
          <span className="public-eyebrow">
            {mode === 'register' ? 'CRIE SUA CONTA' : 'PILOTE MAIS LONGE'}
          </span>
          <h1>
            {mode === 'login' ? (
              <>
                SUA PRÓXIMA
                <br />
                <em>ROTA COMEÇA AQUI.</em>
              </>
            ) : mode === 'register' ? (
              <>
                FAÇA PARTE
                <br />
                <em>DA COMUNIDADE.</em>
              </>
            ) : (
              titles[mode]
            )}
          </h1>
          <p>
            {mode === 'register'
              ? 'Novas rotas, pessoas e experiências que te levam mais longe.'
              : 'Descubra novos caminhos e viva histórias que merecem ser lembradas.'}
          </p>
        </div>
        <section className="auth-form-card" aria-label={titles[mode]}>
          <div className="auth-form-heading">
            <h2>
              {mode === 'login'
                ? 'Bom ter você de volta.'
                : mode === 'register'
                  ? 'Sua jornada começa agora.'
                  : mode === 'forgot'
                    ? 'Recupere seu acesso.'
                    : mode === 'reset'
                      ? 'Escolha uma nova senha.'
                      : 'Confirme seu e-mail.'}
            </h2>
            <p>
              {mode === 'login'
                ? 'Entre para continuar sua jornada.'
                : mode === 'register'
                  ? 'Crie seu perfil. A moto você adiciona depois.'
                  : mode === 'forgot'
                    ? 'Informe seu e-mail para receber as instruções de recuperação.'
                    : 'O link é pessoal e funciona uma única vez, por até 30 minutos.'}
            </p>
          </div>
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
          {mode === 'forgot' && recoveryAvailable === false && (
            <p role="status">
              O envio de e-mails não está habilitado nesta instalação. A
              recuperação ficará disponível após a configuração do serviço.
            </p>
          )}
          {mode === 'forgot' && recoveryAvailable === null && !error && (
            <p role="status">Verificando a disponibilidade da recuperação…</p>
          )}
          {mode === 'forgot' && error && (
            <button
              className="text-link"
              type="button"
              onClick={() => {
                setError('');
                setLegalAttempt((attempt) => attempt + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
          {(mode === 'reset' || mode === 'verify') && !token ? (
            <p role="alert">Link inválido. Solicite um novo e-mail.</p>
          ) : (
            !done && (
              <form className="account-form" onSubmit={submit}>
                <fieldset
                  disabled={
                    busy || (mode === 'forgot' && recoveryAvailable !== true)
                  }
                >
                  {mode === 'register' && (
                    <>
                      <Field
                        label="Nome completo"
                        icon={<UserRound size={23} />}
                        placeholder="Seu nome e sobrenome"
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
                        icon={<AtSign size={23} />}
                        placeholder="Ex.: lucasmoto"
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
                      label={mode === 'login' ? 'E-mail ou usuário' : 'E-mail'}
                      icon={<Mail size={23} />}
                      placeholder={
                        mode === 'login'
                          ? 'Digite seu e-mail ou usuário'
                          : 'exemplo@email.com'
                      }
                      name="email"
                      type={mode === 'login' ? 'text' : 'email'}
                      autoComplete={mode === 'login' ? 'username' : 'email'}
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
                      icon={<LockKeyhole size={23} />}
                      placeholder={
                        mode === 'login'
                          ? 'Digite sua senha'
                          : 'Mínimo de 15 caracteres'
                      }
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
                        Use de 15 a 128 caracteres. Frases longas e
                        gerenciadores de senhas são bem-vindos.
                      </small>
                      <PasswordField
                        label="Confirmar senha"
                        icon={<LockKeyhole size={23} />}
                        placeholder="Digite a senha novamente"
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
                            <Checkbox
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
                      ) : error ? (
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => {
                            setError('');
                            setLegalAttempt((attempt) => attempt + 1);
                          }}
                        >
                          Tentar carregar os termos novamente
                        </button>
                      ) : (
                        <p role="status">Carregando informações dos termos…</p>
                      )}
                    </>
                  )}
                  <Button
                    className="public-button primary"
                    variant="primary"
                    size="lg"
                    loading={busy}
                    type="submit"
                    disabled={
                      busy ||
                      (mode === 'register' && !legal) ||
                      (mode === 'forgot' && recoveryAvailable !== true)
                    }
                  >
                    {mode === 'register' ? (
                      <UserRoundPlus size={22} />
                    ) : (
                      <LogIn size={22} />
                    )}
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
                    <ArrowRight size={19} />
                  </Button>
                </fieldset>
              </form>
            )
          )}
          {mode === 'login' && (
            <div className="auth-help">
              <Link className="text-link" to={`/recuperar-senha${returnQuery}`}>
                Esqueci minha senha
              </Link>
              <button
                type="button"
                className="text-link"
                disabled={busy || !email.includes('@')}
                onClick={() => void resend()}
              >
                Reenviar confirmação de e-mail
              </button>
            </div>
          )}
          <div className="auth-switch">
            {mode === 'login' ? (
              <>
                <span>Ainda não faz parte?</span>
                <ButtonLink
                  className="public-button secondary"
                  variant="outline"
                  size="lg"
                  to={`/cadastro${returnQuery}`}
                >
                  <UserRoundPlus size={21} />
                  Criar conta
                  <ArrowRight size={18} />
                </ButtonLink>
              </>
            ) : (
              <>
                <span>
                  {mode === 'register' && !done
                    ? 'Já tenho conta'
                    : 'Continue sua jornada'}
                </span>
                <Link className="text-link" to={`/entrar${returnQuery}`}>
                  {done ? 'Voltar para entrar' : 'Entrar agora'}{' '}
                  <ArrowRight size={17} />
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
