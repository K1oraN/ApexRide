import { BIKE_CATEGORIES, CC_BANDS } from '@apex-ride/ride-core/comparison';
export function SimilarityFilters({
  params,
  change,
}: {
  params: URLSearchParams;
  change: (key: string, value: string) => void;
}) {
  return (
    <section className="panel history-panel">
      <h2>Filtrar atividades semelhantes</h2>
      <div className="comparison-filters">
        <label>
          Categoria da moto
          <select
            value={params.get('category') ?? ''}
            onChange={(e) => change('category', e.target.value)}
          >
            <option value="">Todas</option>
            {BIKE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Faixa de cilindrada
          <select
            aria-label="Faixa de cilindrada"
            value={params.get('ccBand') ?? ''}
            onChange={(e) => change('ccBand', e.target.value)}
          >
            <option value="">Todas</option>
            {CC_BANDS.map(([a, b], i) => (
              <option value={i} key={i}>
                {i === 4 ? 'Acima de 1000 cc' : `${a}–${b} cc`}
              </option>
            ))}
          </select>
        </label>
        {(['brand', 'model', 'city', 'state'] as const).map((key, i) => (
          <label key={key}>
            {
              [
                'Marca',
                'Modelo',
                'Cidade do trajeto',
                'Estado do trajeto (UF)',
              ][i]
            }
            <input
              value={params.get(key) ?? ''}
              maxLength={key === 'state' ? 2 : 120}
              onChange={(e) => change(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          Região
          <select
            value={params.get('region') ?? ''}
            onChange={(e) => change('region', e.target.value)}
          >
            <option value="">Todas</option>
            {['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map(
              (r) => (
                <option key={r}>{r}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <p>
        Categoria sem fonte verificável: Não classificada. Região desconhecida
        não corresponde a filtros administrativos.
      </p>
    </section>
  );
}
