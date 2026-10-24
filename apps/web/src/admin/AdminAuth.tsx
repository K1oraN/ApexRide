import { useState, type SubmitEvent } from 'react';
import { Button, Checkbox, Input } from '../components/design-system';
import { authRequest } from '../services/auth';
import { errorText } from './service';
export function AdminAuth({
  enrolled,
  onVerified,
}: {
  enrolled: boolean;
  onVerified: () => void;
}) {
  const [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [recovery, setRecovery] = useState(false),
    [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!enrolled && !setup) {
        setSetup(await authRequest('/admin/mfa/enroll', 'POST', { password }));
        setPassword('');
      } else {
        const data = await authRequest<{ recoveryCodes: string[] }>(
          '/admin/mfa/verify',
          'POST',
          { password, ...(recovery ? { recoveryCode: code } : { code }) },
        );
        setPassword('');
        setCode('');
        setSetup(null);
        if (data.recoveryCodes.length) setCodes(data.recoveryCodes);
        else onVerified();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-card panel">
      <span className="eyebrow">ACESSO PRIVILEGIADO</span>
      <h1>Autenticação administrativa</h1>
      <p>
        Confirme a senha da sua conta e o autenticador. A sessão privilegiada
        dura 30 minutos; ações críticas exigem confirmação nos últimos cinco
        minutos.
      </p>
      {error && <p role="alert">{error}</p>}
      {codes.length ? (
        <>
          <h2>Guarde os códigos de recuperação</h2>
          <p>
            Cada código funciona uma vez. Eles são exibidos somente agora.
            Guarde-os em local seguro.
          </p>
          <ul>
            {codes.map((c) => (
              <li key={c}>
                <code>{c}</code>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            onClick={() => {
              setCodes([]);
              onVerified();
            }}
          >
            Guardei os códigos · Abrir painel
          </Button>
        </>
      ) : (
        <form className="account-form" onSubmit={(e) => void submit(e)}>
          {setup && (
            <div className="admin-evidence">
              <p>
                Adicione uma conta TOTP no seu aplicativo autenticador. Chave de
                configuração:
              </p>
              <code>{setup.secret}</code>
              <p>
                Use o nome Apex Ride Admin, seis dígitos e intervalo de 30
                segundos.
              </p>
            </div>
          )}
          <label className="account-field">
            Senha atual
            <Input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {(enrolled || setup) && (
            <>
              <label className="account-field">
                {recovery ? 'Código de recuperação' : 'Código do autenticador'}
                <Input
                  autoComplete="one-time-code"
                  inputMode={recovery ? 'text' : 'numeric'}
                  required
                  maxLength={recovery ? 100 : 6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              {enrolled && (
                <label className="check-field">
                  <Checkbox
                    checked={recovery}
                    onChange={(e) => {
                      setRecovery(e.target.checked);
                      setCode('');
                    }}
                  />
                  Usar código de recuperação
                </label>
              )}
            </>
          )}
          <Button variant="primary" disabled={busy}>
            {busy
              ? 'Validando…'
              : !enrolled && !setup
                ? 'Configurar autenticador'
                : 'Confirmar autenticação'}
          </Button>
        </form>
      )}
    </section>
  );
}
