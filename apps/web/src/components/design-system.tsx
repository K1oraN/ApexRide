import { AlertCircle, Check, ChevronDown, Search, X } from 'lucide-react';
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useCallback,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router';

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'selected';
type ButtonStyle = {
  variant?: ButtonVariant | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl' | undefined;
  loading?: boolean;
};
function buttonClass(
  { variant = 'secondary', size = 'md' }: ButtonStyle,
  className = '',
) {
  return `button ui-button button-${variant} button-${size} ${className}`.trim();
}
export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonStyle & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      {...props}
      className={buttonClass({ variant, size }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ui-spinner" aria-hidden />}
      {children}
    </button>
  );
}
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: LinkProps & Omit<ButtonStyle, 'loading'>) {
  return (
    <Link {...props} className={buttonClass({ variant, size }, className)} />
  );
}
export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-button ${className ?? ''}`}
      aria-label={label}
      title={props.title ?? label}
    >
      {children}
    </button>
  );
}
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...props} className={`ui-input ${className ?? ''}`} />;
}
export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return <select {...props} className={`ui-select ${className ?? ''}`} />;
}
/** Native radios for short, explicit choices; longer lists remain selects. */
export function ChoiceSelect({
  children,
  value,
  onChange,
  disabled = false,
  'aria-label': label,
}: {
  children: ReactNode;
  value: string | number;
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  const name = useId();
  const flatten = (nodes: ReactNode): ReactNode[] =>
    Children.toArray(nodes).flatMap((node) =>
      isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
        ? flatten(node.props.children)
        : [node],
    );
  const options = flatten(children);
  return (
    <div
      role="radiogroup"
      aria-disabled={disabled || undefined}
      aria-label={label}
      className="choice-cards"
      data-options={options.length}
    >
      {options.map((child) => {
        if (
          !isValidElement<{
            value: string;
            children: ReactNode;
            disabled?: boolean;
          }>(child)
        )
          return null;
        const option = child.props;
        return (
          <label
            key={option.value}
            className={String(value) === String(option.value) ? 'selected' : ''}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={String(value) === String(option.value)}
              disabled={disabled || option.disabled}
              onChange={() => onChange({ target: { value: option.value } })}
            />
            <span>{option.children}</span>
          </label>
        );
      })}
    </div>
  );
}
export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
}) {
  return <textarea {...props} className={`ui-textarea ${className ?? ''}`} />;
}
export function Checkbox({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      {...props}
      type="checkbox"
      className={`ui-checkbox ${className ?? ''}`}
    />
  );
}
export function Switch(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>,
) {
  return (
    <Checkbox
      {...props}
      role="switch"
      className={`ui-switch ${props.className ?? ''}`}
    />
  );
}
export function Radio({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <input {...props} type="radio" className={`ui-radio ${className ?? ''}`} />
  );
}
export function SearchInput({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className="ui-search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search aria-hidden size={22} />
      <Input {...props} id={id} type="search" />
    </div>
  );
}
export function SelectField({
  label,
  hint,
  error,
  id: provided,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const generated = useId(),
    id = provided ?? generated;
  return (
    <div className="account-field ui-field">
      <label htmlFor={id}>{label}</label>
      <Select
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-help` : undefined}
      />
      {(error || hint) && (
        <small
          className={error ? 'ui-field-error' : 'ui-field-hint'}
          id={`${id}-help`}
        >
          {error || hint}
        </small>
      )}
    </div>
  );
}
export function Card({
  as: Tag = 'section',
  variant = 'info',
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article';
  variant?: 'info' | 'stat' | 'action';
}) {
  return (
    <Tag
      {...props}
      className={`panel ui-card ui-card-${variant} ${className ?? ''}`}
    />
  );
}
export function CardLink({ className, ...props }: LinkProps) {
  return (
    <Link
      {...props}
      className={`panel ui-card ui-card-action ${className ?? ''}`}
    />
  );
}
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'active';
}) {
  return (
    <span
      {...props}
      className={`ui-badge ui-badge-${tone} ${className ?? ''}`}
    />
  );
}
export function StatusCard({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  return (
    <Card className="ui-status-card">
      <span className="ui-status-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <h3>{label}</h3>
        <Badge tone={tone}>{value}</Badge>
      </div>
    </Card>
  );
}
export function StatCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
}) {
  return (
    <Card variant="stat">
      {icon && (
        <span className="ui-stat-icon" aria-hidden>
          {icon}
        </span>
      )}
      <strong className="ui-stat-value">
        {value} {unit && <small>{unit}</small>}
      </strong>
      <span className="ui-stat-label">{label}</span>
    </Card>
  );
}
export function EmptyState({
  title,
  children,
  icon,
  action,
  className = '',
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`empty-state panel ui-empty-state ${className}`}>
      <span className="ui-empty-icon" aria-hidden>
        {icon ?? <Search size={28} />}
      </span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  );
}
export function Skeleton({
  label = 'Carregando…',
  lines = 3,
}: {
  label?: string;
  lines?: number;
}) {
  return (
    <div className="ui-skeleton" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} aria-hidden />
      ))}
    </div>
  );
}
export function Feedback({
  tone = 'error',
  children,
  action,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`ui-feedback ui-feedback-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden>
        {tone === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
      </span>
      <div>
        {children}
        {action}
      </div>
    </div>
  );
}
export function PageHeader({
  title,
  accent,
  description,
  action,
  eyebrow,
}: {
  title: string;
  accent?: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>
          {title} {accent && <em>{accent}</em>}
        </h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export interface Segment {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}
export function SegmentedControl({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Segment[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`ui-segmented ${className}`}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ),
        ];
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (index < 0) return;
        event.preventDefault();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index +
                  (event.key === 'ArrowRight' ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
        buttons[next]?.click();
      }}
    >
      {options.map((item) => (
        <Button
          key={item.value}
          type="button"
          variant={value === item.value ? 'selected' : 'secondary'}
          aria-pressed={value === item.value}
          disabled={item.disabled}
          onClick={() => onChange(item.value)}
        >
          {item.icon}
          {item.label}
        </Button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  variant = 'dialog',
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: 'dialog' | 'drawer';
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  const closeRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    closeRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      if (dismissibleRef.current) closeRef.current();
    };
    element.addEventListener('cancel', cancel);
    return () => {
      element.removeEventListener('cancel', cancel);
      element.close();
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <dialog
      ref={ref}
      className={`ui-dialog ui-${variant}`}
      aria-labelledby={titleId}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <IconButton
          label="Fechar janela"
          onClick={onClose}
          disabled={!dismissible}
        >
          <X size={20} />
        </IconButton>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

export interface ComboOption {
  value: string;
  label: string;
}
const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
export function Combobox({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecione uma opção',
  disabled = false,
  hint,
  onSearch,
}: {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  onSearch?: (query: string) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    wrapper = useRef<HTMLDivElement>(null),
    list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    left: 16,
    top: 0,
    width: 240,
    maxHeight: 240,
  });
  const selected = options.find((option) => option.value === value);
  const visible = onSearch
    ? options
    : options.filter((option) =>
        normalize(option.label).includes(normalize(query)),
      );
  const place = useCallback(() => {
    const rect = input.current?.getBoundingClientRect();
    if (!rect) return;
    const bottom = innerHeight - rect.bottom - 100;
    const above = bottom < 180 && rect.top > bottom;
    const maxHeight = Math.min(
      240,
      Math.max(80, above ? rect.top - 24 : bottom),
    );
    setPosition({
      left: Math.max(12, Math.min(rect.left, innerWidth - rect.width - 12)),
      top: above ? Math.max(12, rect.top - maxHeight - 8) : rect.bottom + 8,
      width: Math.min(rect.width, innerWidth - 24),
      maxHeight,
    });
  }, []);
  function show() {
    if (disabled) return;
    place();
    setOpen(true);
    setQuery('');
    onSearch?.('');
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
  }
  function choose(option: ComboOption) {
    onChange(option.value);
    setOpen(false);
    setQuery('');
    input.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !wrapper.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const reposition = () => {
      const rect = input.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > innerHeight) setOpen(false);
      else place();
    };
    const scroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !list.current?.contains(event.target)
      )
        reposition();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open, place]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector('[data-highlighted="true"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  return (
    <div className="ui-field account-field" ref={wrapper}>
      <label htmlFor={id}>{label}</label>
      <div className="ui-combobox">
        <Input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={
            open && visible[active] ? `${id}-option-${active}` : undefined
          }
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={open ? query : (selected?.label ?? '')}
          disabled={disabled}
          placeholder={placeholder}
          title={selected?.label}
          onClick={() => {
            if (!open) show();
          }}
          onChange={(event) => {
            if (!open) {
              place();
              setOpen(true);
            }
            setQuery(event.target.value);
            onSearch?.(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
            }
            if (event.key === 'Tab') setOpen(false);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!open) show();
              else
                setActive((index) =>
                  Math.max(
                    0,
                    Math.min(
                      visible.length - 1,
                      index + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                  ),
                );
            }
            if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (visible[active]) choose(visible[active]);
            }
          }}
        />
        <ChevronDown size={18} aria-hidden />
      </div>
      {hint && (
        <small id={`${id}-hint`} className="ui-field-hint">
          {hint}
        </small>
      )}
      {selected && selected.label.length > 32 && (
        <small className="ui-field-hint">Selecionado: {selected.label}</small>
      )}
      {open &&
        createPortal(
          <ul
            id={`${id}-list`}
            ref={list}
            role="listbox"
            aria-label={label}
            className="ui-combobox-list"
            style={position}
          >
            {visible.length ? (
              visible.map((option, index) => (
                <li
                  role="option"
                  aria-selected={option.value === value}
                  id={`${id}-option-${index}`}
                  key={option.value}
                  data-highlighted={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  {option.label}
                  {option.value === value && <Check size={16} aria-hidden />}
                </li>
              ))
            ) : (
              <li role="presentation" className="ui-no-options">
                Nenhuma opção encontrada
              </li>
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
