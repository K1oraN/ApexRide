import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  Button,
  Combobox,
  Input,
  SearchInput,
  Select,
} from '../components/design-system';
import { catalogService, type CatalogVariant } from '../services/catalog';
import '../styles/catalog-directory.css';

type DirectoryModel = { brand: string; model: string };

export type DirectorySelection = {
  brand: string;
  model: string;
  year: number;
};

type DirectoryDocument = {
  items?: unknown;
};

function isDirectoryModel(value: unknown): value is DirectoryModel {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.brand === 'string' &&
    row.brand.trim().length > 0 &&
    row.brand.length <= 60 &&
    typeof row.model === 'string' &&
    row.model.trim().length > 0 &&
    row.model.length <= 100
  );
}

export function CatalogPicker({
  onSelect,
  onManual,
  onDirectorySelect,
}: {
  onSelect: (variant: CatalogVariant) => void;
  onManual: () => void;
  onDirectorySelect: (selection: DirectorySelection) => void;
}) {
  const [directory, setDirectory] = useState<DirectoryModel[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryBrand, setDirectoryBrand] = useState('');
  const [directoryModel, setDirectoryModel] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryYear, setDirectoryYear] = useState('');
  const [selectionError, setSelectionError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    // The 1,097-entry directory is a public, versioned asset, not a technical fiche.
    const base = import.meta.env.BASE_URL;
    void fetch(`${base}data/motos-brasil-directory.json`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Arquivo de modelos indisponível.');
        const document = (await response.json()) as DirectoryDocument;
        if (!Array.isArray(document.items))
          throw new Error('Formato de lista inválido.');
        const unique = new Map<string, DirectoryModel>();
        for (const item of document.items) {
          if (!isDirectoryModel(item)) continue;
          const key = `${item.brand.toLocaleLowerCase('pt-BR')}\u0000${item.model.toLocaleLowerCase('pt-BR')}`;
          unique.set(key, {
            brand: item.brand.trim(),
            model: item.model.trim(),
          });
        }
        if (!unique.size) throw new Error('Lista nacional vazia.');
        return [...unique.values()];
      })
      .then((items) => {
        if (controller.signal.aborted) return;
        setDirectory(items);
        setDirectoryError('');
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDirectoryError(
          'Não foi possível abrir a lista nacional. Confira se o JSON está em apps/web/public/data/. O cadastro manual continua disponível.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDirectoryLoading(false);
      });
    return () => controller.abort();
  }, []);

  const directoryBrands = useMemo(
    () =>
      [...new Set(directory.map((item) => item.brand))].sort((a, b) =>
        a.localeCompare(b, 'pt-BR'),
      ),
    [directory],
  );
  const directoryModels = useMemo(() => {
    const search = directorySearch.trim().toLocaleLowerCase('pt-BR');
    return directory
      .filter((item) => item.brand === directoryBrand)
      .filter(
        (item) =>
          !search || item.model.toLocaleLowerCase('pt-BR').includes(search),
      )
      .map((item) => item.model)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [directory, directoryBrand, directorySearch]);

  function selectFromDirectory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = Number(directoryYear);
    const maxYear = new Date().getFullYear() + 1;
    if (!directoryBrand || !directoryModel) {
      setSelectionError('Selecione uma marca e um modelo.');
      return;
    }
    if (
      !/^\d{4}$/.test(directoryYear) ||
      !Number.isInteger(year) ||
      year < 1885 ||
      year > maxYear
    ) {
      setSelectionError(`Informe um ano-modelo entre 1885 e ${maxYear}.`);
      return;
    }
    setSelectionError('');
    onDirectorySelect({ brand: directoryBrand, model: directoryModel, year });
  }

  const [coverage, setCoverage] = useState<{
    brands: number;
    models: number;
    variants: number;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void catalogService
      .coverage()
      .then((response) => {
        if (active) setCoverage(response.coverage);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Keep the original official/reviewed catalog search unchanged.
  const [brandQuery, setBrandQuery] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [yearQuery, setYearQuery] = useState('');
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [years, setYears] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brand, setBrand] = useState('');
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CatalogVariant[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void Promise.all([
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
          if (!active) return;
          const merge = (
            old: { id: string; name: string }[],
            rows: { id: string; name: string }[],
            id: string,
          ) => [
            ...rows,
            ...old.filter(
              (x) => x.id === id && !rows.some((item) => item.id === id),
            ),
          ];
          setBrands((old) => merge(old, b.items, brand));
          setModels((old) => merge(old, m.items, model));
          setYears((old) => merge(old, y.items, year));
        })
        .catch(() => {
          if (active)
            setError(
              'Fichas revisadas indisponíveis. Você pode usar a lista nacional ou o cadastro manual.',
            );
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
      void catalogService
        .search(
          new URLSearchParams({
            brand,
            q: query,
            ...(model ? { model } : {}),
            ...(year ? { year } : {}),
            page: String(page),
          }).toString(),
        )
        .then((response) => {
          if (!active) return;
          setItems(response.items);
          setMore(response.hasMore);
        })
        .catch(() => {
          if (!active) return;
          setItems([]);
          setError('Não foi possível consultar as fichas técnicas revisadas.');
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
          <p>Escolha um modelo da lista brasileira e informe o ano-modelo.</p>
        </div>
      </header>

      <form className="catalog-directory" onSubmit={selectFromDirectory}>
        <div className="catalog-directory-heading">
          <h3>Modelos do Brasil</h3>
          <span>
            {directory.length} modelos · {directoryBrands.length} marcas
          </span>
        </div>
        <p className="garage-muted">
          A lista nacional identifica o modelo, mas não contém os anos ou as
          especificações oficiais. O ano é informado por você e a ficha
          permanece pendente até existir uma versão revisada.
        </p>
        {directoryLoading && <p role="status">Carregando lista nacional…</p>}
        {directoryError && <p role="alert">{directoryError}</p>}
        <div className="catalog-directory-grid">
          <label>
            <span>Marca</span>
            <Select
              value={directoryBrand}
              disabled={directoryLoading || !directory.length}
              onChange={(event) => {
                setDirectoryBrand(event.target.value);
                setDirectoryModel('');
                setDirectorySearch('');
                setSelectionError('');
              }}
            >
              <option value="">Escolha uma marca</option>
              {directoryBrands.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span>Pesquisar modelo da marca</span>
            <Input
              type="search"
              value={directorySearch}
              disabled={!directoryBrand}
              onChange={(event) => {
                setDirectorySearch(event.target.value);
                setDirectoryModel('');
              }}
              placeholder="Filtrar por nome…"
            />
          </label>
          <label>
            <span>Modelo</span>
            <Select
              value={directoryModel}
              disabled={!directoryBrand}
              onChange={(event) => {
                setDirectoryModel(event.target.value);
                setSelectionError('');
              }}
            >
              <option value="">Escolha um modelo</option>
              {directoryModels.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span>Ano-modelo da sua moto</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1885}
              max={new Date().getFullYear() + 1}
              step={1}
              value={directoryYear}
              onChange={(event) => {
                setDirectoryYear(event.target.value);
                setSelectionError('');
              }}
              placeholder="Ex.: 2024"
              required
            />
          </label>
        </div>
        {selectionError && <p role="alert">{selectionError}</p>}
        <Button
          type="submit"
          variant="primary"
          disabled={
            directoryLoading ||
            !directoryBrand ||
            !directoryModel ||
            !directoryYear
          }
        >
          Continuar com este modelo
          <ChevronRight size={18} aria-hidden />
        </Button>
      </form>

      <div className="catalog-reviewed">
        <h3>Fichas técnicas verificadas</h3>
        <p className="garage-muted">
          Escolha uma versão oficial quando ela existir para o ano da sua moto.
        </p>
        {coverage && (
          <p className="garage-muted">
            {coverage.brands} marcas · {coverage.models} modelos ·{' '}
            {coverage.variants} versões/ano com referência técnica.
          </p>
        )}
        <div className="catalog-search-grid">
          <Combobox
            label="Marca do catálogo"
            onSearch={setBrandQuery}
            value={brand}
            onChange={(value) => {
              setBrand(value);
              setModel('');
              setYear('');
              setPage(1);
            }}
            options={[
              { value: '', label: 'Todas as marcas' },
              ...brands.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <SearchInput
            label="Buscar modelo no catálogo"
            placeholder="Modelo, ano ou versão…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
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
            onChange={(value) => {
              setModel(value);
              setYear('');
              setPage(1);
            }}
            options={[
              { value: '', label: 'Todos os modelos' },
              ...models.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <Combobox
            label="Ano-modelo do catálogo"
            onSearch={setYearQuery}
            value={year}
            onChange={(value) => {
              setYear(value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'Todos os anos' },
              ...years.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </div>
        {busy && <p role="status">Consultando versões…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="catalog-results">
          {items.map((variant) => (
            <button
              type="button"
              key={variant.id}
              className="catalog-result"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void catalogService
                  .detail(variant.id, variant.revision)
                  .then((response) => onSelect(response.variant))
                  .catch(() =>
                    setError('Falha ao abrir a ficha. Tente novamente.'),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Search size={20} aria-hidden />
              <span>
                <strong>
                  {variant.brand} {variant.model}
                </strong>
                <small>
                  {variant.model_year} · {variant.name}
                </small>
              </span>
              <ChevronRight aria-hidden />
            </button>
          ))}
        </div>
        {!items.length && !busy && !error && (
          <p>Não encontramos uma ficha técnica revisada para esses filtros.</p>
        )}
        <nav
          className="page-pagination"
          aria-label="Páginas do catálogo técnico"
        >
          <Button
            type="button"
            disabled={page === 1 || busy}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft /> Anterior
          </Button>
          <span>Página {page}</span>
          <Button
            type="button"
            disabled={!more || busy}
            onClick={() => setPage((value) => value + 1)}
          >
            Próxima <ChevronRight />
          </Button>
        </nav>
      </div>
      <Button type="button" variant="outline" onClick={onManual}>
        Minha moto não está na lista · Cadastrar manualmente
      </Button>
    </section>
  );
}
