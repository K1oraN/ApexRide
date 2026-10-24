import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Field, PasswordField } from './AccountFields';
import {
  Button,
  CardLink,
  Combobox,
  Dialog,
  SegmentedControl,
  SelectField,
} from './design-system';
const tokens = readFileSync('src/styles/tokens.css', 'utf8');

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});
async function render(children: ReactNode) {
  await act(async () => root.render(<MemoryRouter>{children}</MemoryRouter>));
}
async function key(element: Element, key: string) {
  await act(async () =>
    element.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    ),
  );
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('loading blocks repeated activation and keeps an accessible action name', async () => {
  const click = vi.fn();
  await render(
    <Button loading variant="primary" onClick={click}>
      Salvar moto
    </Button>,
  );
  const button = container.querySelector('button')!;
  button.click();
  expect(click).not.toHaveBeenCalled();
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.textContent).toBe('Salvar moto');
  await render(
    <Button disabled onClick={click}>
      Indisponível
    </Button>,
  );
  expect(button.getAttribute('aria-busy')).toBeNull();
  button.click();
  expect(click).not.toHaveBeenCalled();
});

it('fields associate labels and error explanations without losing native restrictions', async () => {
  await render(
    <>
      <Field
        label="Ano"
        type="number"
        min={1885}
        max={2027}
        error="Informe um ano válido."
      />
      <SelectField
        label="Categoria"
        hint="Use a categoria da moto."
        defaultValue="naked"
      >
        <option value="naked">Naked</option>
        <option value="sport">Sport</option>
      </SelectField>
    </>,
  );
  const input = container.querySelector('input')!;
  expect(container.querySelector('label')?.htmlFor).toBe(input.id);
  expect(input.min).toBe('1885');
  expect(input.max).toBe('2027');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(
    document.getElementById(input.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toBe('Informe um ano válido.');
  const select = container.querySelector('select')!;
  expect(select.value).toBe('naked');
  expect(
    document.getElementById(select.getAttribute('aria-describedby')!)
      ?.textContent,
  ).toContain('categoria da moto');
});

it('password visibility toggle preserves value and never submits the form', async () => {
  const submit = vi.fn((e: React.SubmitEvent<HTMLFormElement>) =>
    e.preventDefault(),
  );
  await render(
    <form onSubmit={submit}>
      <PasswordField
        label="Senha"
        defaultValue="senha preservada"
        autoComplete="current-password"
      />
    </form>,
  );
  const input = container.querySelector('input')!;
  const button = container.querySelector('button')!;
  await act(async () => button.click());
  expect(input.type).toBe('text');
  expect(input.value).toBe('senha preservada');
  expect(button.getAttribute('aria-label')).toBe('Ocultar senha');
  expect(button.getAttribute('aria-pressed')).toBe('true');
  await act(async () => button.click());
  expect(input.type).toBe('password');
  expect(input.autocomplete).toBe('current-password');
  expect(submit).not.toHaveBeenCalled();
});

const options = [
  { value: 'maceio', label: 'Maceió / AL' },
  { value: 'sao', label: 'São Miguel dos Campos / AL' },
];
function ComboExample() {
  const [value, setValue] = useState('maceio');
  return (
    <Combobox
      label="Região"
      value={value}
      onChange={setValue}
      options={options}
    />
  );
}
it('combobox searches accents, selects with keyboard and preserves selection on Escape', async () => {
  await render(<ComboExample />);
  const input = container.querySelector('input')!;
  input.focus();
  await key(input, 'ArrowDown');
  expect(input.getAttribute('aria-expanded')).toBe('true');
  await type(input, 'sao');
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await key(input, 'Enter');
  expect(input.value).toBe('São Miguel dos Campos / AL');
  await key(input, 'ArrowDown');
  expect(
    document.getElementById(input.getAttribute('aria-activedescendant')!)
      ?.textContent,
  ).toContain('São Miguel');
  await key(input, 'Enter');
  expect(input.value).toBe('São Miguel dos Campos / AL');
  await key(input, 'ArrowDown');
  await type(input, 'maceio');
  await key(input, 'Escape');
  expect(input.value).toBe('São Miguel dos Campos / AL');
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
it('combobox reports empty search and closes with Tab without changing value', async () => {
  await render(<ComboExample />);
  const input = container.querySelector('input')!;
  await key(input, 'ArrowDown');
  await type(input, 'inexistente');
  expect(document.querySelector('[role="listbox"]')?.textContent).toContain(
    'Nenhuma opção',
  );
  await key(input, 'Enter');
  expect(input.getAttribute('aria-expanded')).toBe('true');
  await key(input, 'Tab');
  expect(input.value).toBe('Maceió / AL');
});
it('combobox follows page scroll without dropping the query before keyboard selection', async () => {
  await render(<ComboExample />);
  const input = container.querySelector('input')!;
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
    top: 200,
    bottom: 244,
    left: 16,
    right: 300,
    width: 284,
    height: 44,
    x: 16,
    y: 200,
    toJSON: () => ({}),
  });
  await key(input, 'ArrowDown');
  await type(input, 'sao');
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
  });
  expect(input.getAttribute('aria-expanded')).toBe('true');
  expect(input.value).toBe('sao');
  await key(input, 'Enter');
  expect(input.value).toBe('São Miguel dos Campos / AL');
});

it('segmented navigation skips disabled items and supports Home and End', async () => {
  const change = vi.fn();
  await render(
    <SegmentedControl
      label="Categorias"
      value="a"
      onChange={change}
      options={[
        { value: 'a', label: 'Todas' },
        { value: 'b', label: 'Bloqueada', disabled: true },
        { value: 'c', label: 'Circuitos' },
      ]}
    />,
  );
  const buttons = container.querySelectorAll('button');
  buttons[0]!.focus();
  await key(buttons[0]!, 'ArrowRight');
  expect(document.activeElement).toBe(buttons[2]);
  expect(change).toHaveBeenLastCalledWith('c');
  await key(buttons[2]!, 'Home');
  expect(document.activeElement).toBe(buttons[0]);
  await key(buttons[0]!, 'End');
  expect(document.activeElement).toBe(buttons[2]);
});

it('segmented choices never submit their containing form', async () => {
  const submit = vi.fn((event: React.SubmitEvent<HTMLFormElement>) =>
    event.preventDefault(),
  );
  const change = vi.fn();
  await render(
    <form onSubmit={submit}>
      <SegmentedControl
        label="Período"
        value="month"
        onChange={change}
        options={[
          { value: 'month', label: 'Este mês' },
          { value: 'year', label: 'Este ano' },
        ]}
      />
    </form>,
  );
  const buttons = container.querySelectorAll('button');
  await act(async () => buttons[1]!.click());
  expect(change).toHaveBeenLastCalledWith('year');
  buttons[0]!.focus();
  await key(buttons[0]!, 'ArrowRight');
  expect(change).toHaveBeenLastCalledWith('year');
  expect(document.activeElement).toBe(buttons[1]);
  expect(submit).not.toHaveBeenCalled();
});

it('dialog cancel respects busy state, stable callbacks and restores previous focus', async () => {
  const show = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: show,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  const close = vi.fn();
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  await render(
    <Dialog open onClose={() => close()} title="Excluir moto">
      <p>Confirme a remoção.</p>
    </Dialog>,
  );
  expect(
    document.querySelector('dialog')?.getAttribute('aria-labelledby'),
  ).toBe(document.querySelector('dialog h2')?.id);
  await render(
    <Dialog
      open
      dismissible={false}
      onClose={() => close()}
      title="Excluir moto"
    >
      <p>Excluindo…</p>
    </Dialog>,
  );
  expect(show).toHaveBeenCalledTimes(1);
  await act(async () =>
    document
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { cancelable: true })),
  );
  expect(close).not.toHaveBeenCalled();
  await render(
    <Dialog open onClose={() => close()} title="Excluir moto">
      Pronto
    </Dialog>,
  );
  await act(async () =>
    document
      .querySelector('dialog')!
      .dispatchEvent(new Event('cancel', { cancelable: true })),
  );
  expect(close).toHaveBeenCalledTimes(1);
  await render(null);
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

it('interactive card remains a native keyboard link', async () => {
  await render(<CardLink to="/garagem/123">Gerenciar moto</CardLink>);
  const link = container.querySelector('a')!;
  expect(link.getAttribute('href')).toBe('/garagem/123');
  link.focus();
  expect(document.activeElement).toBe(link);
  expect(link.getAttribute('role')).toBeNull();
});

function luminance(hex: string) {
  const rgb = hex
    .match(/[a-f\d]{2}/gi)!
    .map((part) => parseInt(part, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
function color(name: string) {
  return tokens.match(new RegExp(`--${name}:\\s*(#[a-f\\d]{6})`, 'i'))![1]!;
}
it('primary button states and normal text tokens meet 4.5:1 contrast', () => {
  const ratio = (a: string, b: string) =>
    (Math.max(luminance(a), luminance(b)) + 0.05) /
    (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const state of ['action', 'action-hover', 'action-pressed'])
    expect(ratio('#ffffff', color(state)), state).toBeGreaterThanOrEqual(4.5);
  for (const foreground of [
    'text',
    'muted',
    'subtle',
    'success',
    'warning',
    'danger',
  ])
    for (const background of ['background', 'panel', 'panel-light'])
      expect(
        ratio(color(foreground), color(background)),
        `${foreground}/${background}`,
      ).toBeGreaterThanOrEqual(4.5);
});
