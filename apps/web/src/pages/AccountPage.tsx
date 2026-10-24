import { useState, type SubmitEvent } from 'react';
import { SpeedSettings } from '../ride/SpeedSettings';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Field, PasswordField, StateField } from '../components/AccountFields';
import { authRequest, type User, type Privacy } from '../services/auth';
import { RankingPreferences } from '../gamification/RankingPreferences';
import '../styles/gamification.css';
export function AccountPage({
  privacyOnly = false,
}: {
  privacyOnly?: boolean;
}) {
  const { user, updateUser, logout, endSession } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? ''),
    [username, setUsername] = useState(user?.username ?? '');
  const [biography, setBiography] = useState(user?.biography ?? ''),
    [city, setCity] = useState(user?.city ?? ''),
    [state, setState] = useState(user?.state ?? '');
  const [profileVisibility, setProfileVisibility] = useState(
      user?.privacy.profileVisibility ?? 'public',
    ),
    [activityVisibility, setActivityVisibility] = useState(
      user?.privacy.activityVisibility ?? 'public',
    );
  const [oldPassword, setOldPassword] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  if (!user) return null;
  const account = user;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  function saveProfile(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const data = await authRequest<{ user: User }>('/users/me', 'PATCH', {
        displayName,
        username,
        biography,
        city,
        state,
      });
      updateUser(data.user);
      setMessage('Perfil atualizado.');
    });
  }
  function savePrivacy(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const data = await authRequest<{ privacy: Privacy }>(
        '/users/me/privacy',
        'PATCH',
        { profileVisibility, activityVisibility },
      );
      updateUser({ ...account, privacy: data.privacy });
      setMessage('Preferências de privacidade salvas.');
    });
  }
  function savePassword(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError('As senhas precisam ser iguais.');
      return;
    }
    void run(async () => {
      await authRequest('/users/me/password', 'PATCH', {
        currentPassword: oldPassword,
        newPassword,
      });
      endSession();
      navigate('/entrar', { replace: true });
    });
  }
  return (
    <section className="account-card panel">
      <span className="eyebrow">APEX RIDE · MINHA CONTA</span>
      <h1>{privacyOnly ? 'PRIVACIDADE' : 'EDITAR PERFIL'}</h1>
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
      {privacyOnly ? (
        <form className="account-form" onSubmit={savePrivacy}>
          <fieldset disabled={busy}>
            <label className="account-field">
              <span>Visibilidade do perfil</span>
              <select
                value={profileVisibility}
                onChange={(e) =>
                  setProfileVisibility(e.target.value as 'public' | 'private')
                }
              >
                <option value="public">Público</option>
                <option value="private">Privado</option>
              </select>
            </label>
            <p>
              O perfil público apresenta nome, usuário, biografia, cidade e
              estado. E-mail e dados da conta permanecem restritos. Ao torná-lo
              privado, o perfil deixa de estar disponível na consulta pública.
            </p>
            <label className="account-field">
              <span>Visibilidade padrão de atividades futuras</span>
              <select
                value={activityVisibility}
                onChange={(e) =>
                  setActivityVisibility(e.target.value as 'public' | 'private')
                }
              >
                <option value="public">Público</option>
                <option value="private">Privado</option>
              </select>
            </label>
            <p>
              Novas contas começam com atividades públicas por padrão. A
              preferência será utilizada quando o módulo de atividades estiver
              disponível.
            </p>
            <div className="privacy-info panel">
              <strong>Localização ao vivo: desativada</strong>
              <p>
                O compartilhamento terá autorização separada quando for
                desenvolvido. Nenhum acesso ao GPS é solicitado nesta etapa.
              </p>
            </div>
            <button type="submit" className="button button-primary">
              {busy ? 'Salvando…' : 'Salvar privacidade'}
            </button>
          </fieldset>
        </form>
      ) : (
        <>
          <SpeedSettings />
          <form className="account-form" onSubmit={saveProfile}>
            <fieldset disabled={busy}>
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
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]{3,30}"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <label className="account-field">
                <span>Biografia</span>
                <textarea
                  name="biography"
                  maxLength={300}
                  rows={4}
                  value={biography}
                  onChange={(e) => setBiography(e.target.value)}
                />
              </label>
              <Field
                label="Cidade (opcional)"
                autoComplete="address-level2"
                maxLength={80}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <StateField value={state} onChange={setState} />
              <Field
                label="E-mail da conta"
                type="email"
                value={account.email}
                readOnly
              />
              <small>
                A alteração de e-mail exige um fluxo de verificação seguro e
                está indisponível nesta etapa. Avatar padrão; envio de foto em
                uma etapa futura.
              </small>
              <button className="button button-primary" type="submit">
                {busy ? 'Salvando…' : 'Salvar perfil'}
              </button>
            </fieldset>
          </form>
          <form
            className="account-form account-section"
            onSubmit={savePassword}
          >
            <h2>ALTERAR SENHA</h2>
            <p>
              Confirmar a alteração encerra todas as sessões. Entre novamente
              com sua nova senha.
            </p>
            <fieldset disabled={busy}>
              <PasswordField
                label="Senha atual"
                autoComplete="current-password"
                maxLength={128}
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
              <PasswordField
                label="Nova senha"
                autoComplete="new-password"
                minLength={15}
                maxLength={128}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <small>Use de 15 a 128 caracteres.</small>
              <PasswordField
                label="Confirmar nova senha"
                autoComplete="new-password"
                minLength={15}
                maxLength={128}
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <button className="button button-outline" type="submit">
                {busy ? 'Aguarde…' : 'Alterar senha e sair'}
              </button>
            </fieldset>
          </form>
        </>
      )}
      <RankingPreferences />
      <div className="account-links">
        <Link
          className="text-link"
          to={privacyOnly ? '/configuracoes' : '/privacidade'}
        >
          {privacyOnly ? 'Editar perfil' : 'Configurações de privacidade'}
        </Link>
        <Link className="text-link" to="/perfil">
          Meu perfil
        </Link>
        <button
          className="button button-muted"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await logout();
            })
          }
        >
          Sair da conta
        </button>
      </div>
    </section>
  );
}
