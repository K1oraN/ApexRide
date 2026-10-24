import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="account-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
export function PasswordField({
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="account-field">
      <span>{label}</span>
      <span className="password-input">
        <input {...props} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="icon-button"
          aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </span>
    </label>
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
      <select
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
      </select>
    </label>
  );
}
