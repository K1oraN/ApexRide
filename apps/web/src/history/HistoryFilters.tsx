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
  const select = (key: string, label: string, values: [string, string][]) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={params.get(key) ?? ''}
        onChange={(e) => onChange(key, e.target.value)}
      >
        {values.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <details className="panel history-filters">
      <summary>Filtros de atividades</summary>
      <div className="history-filter-grid">
        <label>
          Pesquisar atividades
          <input
            aria-label="Pesquisar atividades"
            type="search"
            maxLength={120}
            value={params.get('q') ?? ''}
            onChange={(e) => onChange('q', e.target.value)}
          />
        </label>
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
              <input
                aria-label="De"
                type="date"
                value={params.get('start') ?? ''}
                onChange={(e) => onChange('start', e.target.value)}
              />
            </label>
            <label>
              Até
              <input
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
        <button className="button" onClick={() => onChange('*', '')}>
          Limpar filtros
        </button>
      </div>
    </details>
  );
}
