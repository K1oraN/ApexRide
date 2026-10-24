import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Link } from 'react-router';
import { photos } from '../data/demo';

export function Avatar({
  name,
  large = false,
  placeholder = false,
  src,
}: {
  name: string;
  large?: boolean;
  placeholder?: boolean;
  src?: string | undefined;
}) {
  if (placeholder)
    return (
      <svg
        className={`avatar default-avatar ${large ? 'avatar-large' : ''}`}
        role="img"
        aria-label={`Avatar padrão de ${name}`}
        viewBox="0 0 44 44"
        width={large ? 140 : 44}
        height={large ? 140 : 44}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="22" cy="15" r="7" />
        <path d="M8 38v-4c0-12 28-12 28 0v4" />
      </svg>
    );
  return (
    <img
      className={`avatar ${large ? 'avatar-large' : ''}`}
      src={src ?? photos.avatar}
      alt={src ? `Avatar de ${name}` : `Avatar ilustrativo de ${name}`}
      loading="lazy"
      width={large ? 140 : 44}
      height={large ? 140 : 44}
    />
  );
}

export function SectionTitle({
  children,
  icon: Icon,
  to,
  action = 'Ver todos',
  aside,
}: {
  children: ReactNode;
  icon?: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  to?: string;
  action?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>
        {Icon && <Icon size={22} aria-hidden />}
        {children}
      </h2>
      <div className="section-aside">
        {aside}
        {to && (
          <Link
            className="text-link"
            to={to}
            aria-label={
              action
                ? `${action} — ${String(children).toLocaleLowerCase('pt-BR')}`
                : `Abrir ${String(children).toLocaleLowerCase('pt-BR')}`
            }
          >
            {action}
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

export function UnavailableButton({
  children,
  className = '',
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`button ${className}`}
      disabled
      title="Demonstração: funcionalidade disponível em uma próxima etapa"
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function Progress({
  value,
  max = 100,
  label,
}: {
  value: number;
  max?: number;
  label: string;
}) {
  return (
    <progress className="progress" aria-label={label} value={value} max={max} />
  );
}

export function Chip({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span className={`chip ${accent ? 'chip-accent' : ''}`}>{children}</span>
  );
}

export function Photo({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      className={`photo ${className}`}
      src={src}
      alt={alt}
      loading="lazy"
      width={1536}
      height={1024}
    />
  );
}

export function Popover({
  label,
  trigger,
  children,
  className = '',
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);
  return (
    <div className={`popover ${className}`} ref={wrapper}>
      <button
        ref={button}
        type="button"
        className="popover-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} className="popover-content">
          <div className="popover-title">
            <strong>{label}</strong>
            <button
              className="icon-button"
              aria-label="Fechar menu"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
