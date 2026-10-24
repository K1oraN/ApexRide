import { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button, Combobox, SearchInput } from '../components/design-system';
import { catalogService, type CatalogVariant } from '../services/catalog';
export function CatalogPicker({
  onSelect,
  onManual,
}: {
  onSelect: (v: CatalogVariant) => void;
  onManual: () => void;
}) {
  const [coverage, setCoverage] = useState<{
    brands: number;
    models: number;
    variants: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    catalogService
      .coverage()
      .then((r) => {
        if (active) setCoverage(r.coverage);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [brandQuery, setBrandQuery] = useState(''),
    [modelQuery, setModelQuery] = useState(''),
    [yearQuery, setYearQuery] = useState('');
  const [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [years, setYears] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]),
    [brand, setBrand] = useState(''),
    [query, setQuery] = useState(''),
    [model, setModel] = useState(''),
    [year, setYear] = useState(''),
    [page, setPage] = useState(1),
    [items, setItems] = useState<CatalogVariant[]>([]),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      Promise.all([
        catalogService.facets(
          'brands',
          new URLSearchParams({ q: brandQuery }).toString(),
        ),
        catalogService.facets(
          'models',
          new URLSearchParams({ brand, q: modelQuery }).toString(),
        ),
        catalogService.facets(
          'years',
          new URLSearchParams({ brand, model, q: yearQuery }).toString(),
        ),
      ])
        .then(([b, m, y]) => {
          if (active) {
            const merge = (
              old: { id: string; name: string }[],
              rows: { id: string; name: string }[],
              id: string,
            ) => [
              ...rows,
              ...old.filter(
                (x) => x.id === id && !rows.some((v) => v.id === id),
              ),
            ];
            setBrands((old) => merge(old, b.items, brand));
            setModels((old) => merge(old, m.items, model));
            setYears((old) => merge(old, y.items, year));
          }
        })
        .catch(() => {
          if (active)
            setError('Catálogo indisponível. Você pode cadastrar manualmente.');
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [brandQuery, modelQuery, yearQuery, brand, model, year]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      setError('');
      catalogService
        .search(
          new URLSearchParams({
            brand,
            q: query,
            ...(model ? { model } : {}),
            ...(year ? { year } : {}),
            page: String(page),
          }).toString(),
        )
        .then((r) => {
          if (active) {
            setItems(r.items);
            setMore(r.hasMore);
          }
        })
        .catch(() => {
          if (active) {
            setItems([]);
            setError(
              'Não foi possível consultar o catálogo. Tente novamente ou cadastre manualmente.',
            );
          }
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [brand, query, model, year, page]);
  return (
    <section
      className="catalog-picker panel"
      aria-label="Catálogo de motocicletas"
    >
      <header>
        <BookOpen aria-hidden />
        <div>
          <h2>Encontre sua moto</h2>
          <p>Catálogo inicial do Brasil · escolha a versão exata.</p>
        </div>
      </header>
      {coverage && (
        <p className="garage-muted">
          Base inicial · {coverage.brands} marcas · {coverage.models} modelos ·{' '}
          {coverage.variants} versões/ano · fichas parciais.
        </p>
      )}
      <div className="catalog-search-grid">
        <Combobox
          label="Marca do catálogo"
          onSearch={setBrandQuery}
          value={brand}
          onChange={(v) => {
            setBrand(v);
            setModel('');
            setYear('');
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todas as marcas' },
            ...brands.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <SearchInput
          label="Buscar modelo no catálogo"
          placeholder="Modelo, ano ou versão…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setModel('');
            setYear('');
            setPage(1);
          }}
        />
      </div>
      <div className="catalog-search-grid">
        <Combobox
          label="Modelo do catálogo"
          onSearch={setModelQuery}
          value={model}
          onChange={(v) => {
            setModel(v);
            setYear('');
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todos os modelos' },
            ...models.map((v) => ({ value: v.id, label: v.name })),
          ]}
        />
        <Combobox
          label="Ano-modelo do catálogo"
          onSearch={setYearQuery}
          value={year}
          onChange={(v) => {
            setYear(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'Todos os anos' },
            ...years.map((v) => ({ value: v.id, label: v.name })),
          ]}
        />
      </div>
      {busy && <p role="status">Consultando versões…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="catalog-results">
        {items.map((v) => (
          <button
            type="button"
            key={v.id}
            className="catalog-result"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              catalogService
                .detail(v.id, v.revision)
                .then((r) => onSelect(r.variant))
                .catch(() =>
                  setError('Falha ao abrir a ficha. Tente novamente.'),
                )
                .finally(() => setBusy(false));
            }}
          >
            <Search size={20} aria-hidden />
            <span>
              <strong>
                {v.brand} {v.model}
              </strong>
              <small>
                {v.model_year} · {v.name}
              </small>
            </span>
            <ChevronRight aria-hidden />
          </button>
        ))}
      </div>
      {!items.length && !busy && !error && (
        <p>Não encontramos esse modelo no catálogo.</p>
      )}
      <nav className="page-pagination" aria-label="Páginas do catálogo">
        <Button
          type="button"
          disabled={page === 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft />
          Anterior
        </Button>
        <span>Página {page}</span>
        <Button
          type="button"
          disabled={!more || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
          <ChevronRight />
        </Button>
      </nav>
      <Button type="button" variant="outline" onClick={onManual}>
        Minha moto não está na lista · Cadastrar manualmente
      </Button>
    </section>
  );
}
