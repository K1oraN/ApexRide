import { useState, type SubmitEvent } from 'react';
import { Button, Input, Select, Textarea } from '../components/design-system';
import type { Action } from './actions';
import { adminRequest, errorText, type Row } from './service';
export function ActionForm({
  action,
  onDone,
  onCancel,
}: {
  action: Action;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
      Object.fromEntries(
        action.fields.map((f) => [
          f.key,
          f.type === 'checkbox'
            ? false
            : (f.value ?? f.options?.[0]?.[0] ?? ''),
        ]),
      ),
    ),
    [confirm, setConfirm] = useState(false),
    [typed, setTyped] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      let path = action.path;
      const body: Row = { ...action.extra };
      for (const field of action.fields) {
        const value = values[field.key];
        if (path.includes('{' + field.key + '}')) {
          path = path.replace(
            '{' + field.key + '}',
            encodeURIComponent(String(value)),
          );
          continue;
        }
        body[field.key] =
          field.type === 'datetime-local'
            ? value
              ? new Date(String(value)).toISOString()
              : null
            : field.key === 'permissions'
              ? String(value)
                  .split(',')
                  .map((x) => x.trim())
                  .filter(Boolean)
              : value;
      }
      if (
        /\/(warn|restrict|suspend)$/.test(path) ||
        /\/admin\/reports\/.+\/resolve$/.test(path) ||
        path === '/admin/gamification/adjustments/request' ||
        /\/admin\/operators\/.+\/roles$/.test(path) ||
        /\/admin\/roles\/.+\/permissions$/.test(path)
      )
        body.operationId = operationId;
      // Only endpoints that support operation IDs receive them.
      if (/\/appeals\/.+\/resolve$/.test(path) || path === '/admin/settings')
        delete body.operationId;
      await adminRequest(path, 'POST', body);
      onDone();
    } catch (e) {
      setError(errorText(e));
      setConfirm(false);
      setTyped('');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel admin-action">
      <h2>{action.label}</h2>
      {error && <p role="alert">{error}</p>}
      <form className="account-form" onSubmit={(e) => void submit(e)}>
        {!confirm ? (
          action.fields.map((f) => (
            <label
              className={
                f.type === 'checkbox' ? 'check-field' : 'account-field'
              }
              key={f.key}
            >
              {f.type !== 'checkbox' && f.label}
              {f.options ? (
                <Select
                  aria-label={f.label}
                  value={String(values[f.key])}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                >
                  {f.options.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea
                  aria-label={f.label}
                  rows={4}
                  maxLength={2000}
                  required={f.required}
                  value={String(values[f.key])}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                />
              ) : (
                <Input
                  aria-label={f.label}
                  type={f.type ?? 'text'}
                  required={f.required}
                  maxLength={1000}
                  checked={f.type === 'checkbox' ? !!values[f.key] : undefined}
                  value={
                    f.type === 'checkbox' ? undefined : String(values[f.key])
                  }
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [f.key]:
                        f.type === 'checkbox'
                          ? e.target.checked
                          : e.target.value,
                    }))
                  }
                />
              )}{' '}
              {f.type === 'checkbox' && f.label}
            </label>
          ))
        ) : (
          <div className="admin-confirm">
            <h3>Revise a decisão antes de executar</h3>
            {action.fields.map((f) => (
              <p key={f.key}>
                <strong>{f.label}:</strong>{' '}
                {f.options?.find(([key]) => key === values[f.key])?.[1] ??
                  String(values[f.key] || 'Não informado')}
              </p>
            ))}
            <p>
              O servidor verificará permissões, estado atual e auditoria antes
              de confirmar a ação.
            </p>
            {action.critical && (
              <label className="account-field">
                Digite CONFIRMAR
                <Input
                  required
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <Button
              variant="secondary"
              type="button"
              onClick={() => setConfirm(false)}
            >
              Corrigir decisão
            </Button>
          </div>
        )}
        <div className="admin-pagination">
          <Button
            variant="primary"
            disabled={
              busy || (confirm && action.critical && typed !== 'CONFIRMAR')
            }
          >
            {busy
              ? 'Processando…'
              : confirm
                ? 'Executar decisão'
                : 'Revisar decisão'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}
