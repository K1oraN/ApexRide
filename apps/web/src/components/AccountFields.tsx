import { Eye, EyeOff } from 'lucide-react';
import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { IconButton, Input, Select } from './design-system';
export function Field({
  label,
  icon,
  hint,
  error,
  success,
  id: providedId,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon?: ReactNode;
  hint?: string;
  error?: string;
  success?: string;
}) {
  const generated = useId(),
    id = providedId ?? generated;
  return (
    <div className="account-field ui-field">
      {icon && (
        <span className="auth-field-icon" aria-hidden>
          {icon}
        </span>
      )}
      <label htmlFor={id}>{label}</label>
      <Input
        {...props}
        id={id}
        data-state={!error && success ? 'success' : undefined}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={
          error || hint || success ? `${id}-help` : props['aria-describedby']
        }
      />
      {(error || success || hint) && (
        <small
          id={`${id}-help`}
          className={
            error
              ? 'ui-field-error'
              : success
                ? 'ui-field-success'
                : 'ui-field-hint'
          }
        >
          {error || success || hint}
        </small>
      )}
    </div>
  );
}
export function PasswordField({
  label,
  icon,
  id: providedId,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
  icon?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const generated = useId(),
    id = providedId ?? generated;
  return (
    <div className="account-field ui-field">
      {icon && (
        <span className="auth-field-icon" aria-hidden>
          {icon}
        </span>
      )}
      <label htmlFor={id}>{label}</label>
      <span className="password-input">
        <Input {...props} id={id} type={visible ? 'text' : 'password'} />
        <IconButton
          label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </IconButton>
      </span>
    </div>
  );
}
const states = [
  'AL',
  'AC',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];
export function StateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="account-field">
      <span>Estado (opcional)</span>
      <Select
        name="state"
        autoComplete="address-level1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Não informado</option>
        {states.map((uf) => (
          <option key={uf} value={uf}>
            {uf === 'AL' ? 'Alagoas (AL)' : uf}
          </option>
        ))}
      </Select>
    </label>
  );
}
