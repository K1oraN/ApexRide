import { BIKE_CATEGORIES, CC_BANDS } from '@apex-ride/ride-core/comparison';
import { ChevronDown } from 'lucide-react';
import { Input, Select } from '../components/design-system';
export function SimilarityFilters({
  params,
  change,
}: {
  params: URLSearchParams;
  change: (key: string, value: string) => void;
}) {
  return (
    <section className="panel history-panel similarity-filter-panel">
      <details open>
        <summary>
          <h2>Filtrar atividades semelhantes</h2>
          <ChevronDown size={20} aria-hidden />
        </summary>
        <p>Refine a busca. Os filtros são aplicados automaticamente.</p>
        <div className="comparison-filters">
          <label>
            Categoria da moto
            <Select
              value={params.get('category') ?? ''}
              onChange={(e) => change('category', e.target.value)}
            >
              <option value="">Todas</option>
              {BIKE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label>
            Faixa de cilindrada
            <Select
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
            </Select>
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
              <Input
                value={params.get(key) ?? ''}
                maxLength={key === 'state' ? 2 : 120}
                onChange={(e) => change(key, e.target.value)}
              />
            </label>
          ))}
          <label>
            Região
            <Select
              value={params.get('region') ?? ''}
              onChange={(e) => change('region', e.target.value)}
            >
              <option value="">Todas</option>
              {['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map(
                (r) => (
                  <option key={r}>{r}</option>
                ),
              )}
            </Select>
          </label>
        </div>
        <p>
          Categoria sem fonte verificável: Não classificada. Região desconhecida
          não corresponde a filtros administrativos.
        </p>
      </details>
    </section>
  );
}
