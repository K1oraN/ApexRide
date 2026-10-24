import { Search, SlidersHorizontal } from 'lucide-react';
import {
  Button,
  ChoiceSelect,
  Input,
  Select,
} from '../components/design-system';
import type { HistoryOptions } from './types';
export function HistoryFilters({
  params,
  options,
  onChange,
  stats = false,
}: {
  params: URLSearchParams;
  options: HistoryOptions;
  onChange: (key: string, value: string) => void;
  stats?: boolean;
}) {
  const select = (key: string, label: string, values: [string, string][]) => {
    const Control =
      values.length > 1 && values.length < 4 ? ChoiceSelect : Select;
    return (
      <div className="history-filter-field">
        <span>{label}</span>
        <Control
          aria-label={label}
          value={params.get(key) ?? ''}
          onChange={(e) => onChange(key, e.target.value)}
        >
          {values.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Control>
      </div>
    );
  };
  return (
    <section className="history-filter-toolbar">
      <div className="history-search-field">
        <Search size={21} aria-hidden />{' '}
        <label>
          Pesquisar atividades
          <Input
            aria-label="Pesquisar atividades"
            type="search"
            maxLength={120}
            value={params.get('q') ?? ''}
            onChange={(e) => onChange('q', e.target.value)}
          />
        </label>
      </div>
      <details className="panel history-filters">
        <summary>
          <SlidersHorizontal size={18} aria-hidden />
          <span>Filtros de atividades</span>
        </summary>
        <div className="history-filter-grid">
          {select('period', 'Período', [
            ['', 'Todas as atividades'],
            ['7', 'Últimos 7 dias'],
            ['30', 'Últimos 30 dias'],
            ['90', 'Últimos 90 dias'],
            ['year', 'Este ano'],
            ['custom', 'Intervalo personalizado'],
          ])}
          {params.get('period') === 'custom' && (
            <>
              <label>
                De
                <Input
                  aria-label="De"
                  type="date"
                  value={params.get('start') ?? ''}
                  onChange={(e) => onChange('start', e.target.value)}
                />
              </label>
              <label>
                Até
                <Input
                  aria-label="Até"
                  type="date"
                  value={params.get('end') ?? ''}
                  onChange={(e) => onChange('end', e.target.value)}
                />
              </label>
            </>
          )}
          {select('mode', 'Modo', [
            ['', 'Todos os modos'],
            ['passeio', 'Passeio'],
            ['pista', 'Pista'],
            ['misto', 'Misto'],
          ])}
          {select('motorcycleId', 'Motocicleta', [
            ['', 'Todas as motos'],
            ...options.motorcycles.map(
              (b) =>
                [
                  b.id,
                  b.motorcycle
                    ? `${b.motorcycle.brand} ${b.motorcycle.model}`
                    : 'Moto histórica',
                ] as [string, string],
            ),
          ])}
          {select('routeId', 'Rota associada', [
            ['', 'Todas as rotas'],
            ['none', 'Sem rota cadastrada'],
            ...options.routes.map((r) => [r.id, r.name] as [string, string]),
          ])}
          {select('visibility', 'Visibilidade', [
            ['', 'Todas'],
            ['public', 'Públicas'],
            ['private', 'Privadas'],
          ])}
          {!stats &&
            select('sync', 'Sincronização', [
              ['', 'Todas'],
              ['remote', 'Sincronizadas'],
              ['pending', 'Pendentes no aparelho'],
              ['error', 'Com erro de envio'],
            ])}
          {!stats &&
            select('sort', 'Ordenação', [
              ['', 'Mais recentes'],
              ['oldest', 'Mais antigas'],
              ['distance', 'Maior distância'],
              ['duration', 'Maior duração'],
            ])}
          <Button variant="secondary" onClick={() => onChange('*', '')}>
            Limpar filtros
          </Button>
        </div>
      </details>
    </section>
  );
}
