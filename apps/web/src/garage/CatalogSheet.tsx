
import { useEffect, useId, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  BookOpen,
  Cog,
  ExternalLink,
  Fuel,
  Gauge,
  Ruler,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  Button,
  ButtonLink,
} from '../components/design-system';
import {
  catalogService,
  type CatalogVariant,
  type Specification,
} from '../services/catalog';
import { powerToKw, torqueToNm } from './units';
import '../styles/catalog-technical-sheet.css';

type Field = {
  key: string;
  label: string;
};

const groups = [
  {
    title: 'Motor',
    description: 'Características e desempenho do propulsor.',
    icon: <Gauge size={20} aria-hidden="true" />,
    fields: [
      { key: 'engine', label: 'Configuração do motor' },
      { key: 'cylinders', label: 'Número de cilindros' },
      { key: 'valves', label: 'Número de válvulas' },
      { key: 'displacement', label: 'Cilindrada' },
      { key: 'power', label: 'Potência máxima' },
      { key: 'powerRpm', label: 'Rotação da potência' },
      { key: 'torque', label: 'Torque máximo' },
      { key: 'torqueRpm', label: 'Rotação do torque' },
      { key: 'cooling', label: 'Arrefecimento' },
      { key: 'injection', label: 'Alimentação' },
      { key: 'compression', label: 'Taxa de compressão' },
    ],
  },
  {
    title: 'Transmissão',
    description: 'Câmbio, embreagem e tração.',
    icon: <Cog size={20} aria-hidden="true" />,
    fields: [
      { key: 'transmission', label: 'Tipo de câmbio' },
      { key: 'gears', label: 'Número de marchas' },
      { key: 'clutch', label: 'Embreagem' },
      { key: 'finalDrive', label: 'Transmissão final' },
    ],
  },
  {
    title: 'Dimensões e pesos',
    description: 'Medidas da motocicleta e massas declaradas.',
    icon: <Ruler size={20} aria-hidden="true" />,
    fields: [
      { key: 'length', label: 'Comprimento' },
      { key: 'width', label: 'Largura' },
      { key: 'height', label: 'Altura' },
      { key: 'wheelbase', label: 'Distância entre-eixos' },
      { key: 'seatHeight', label: 'Altura do assento' },
      { key: 'groundClearance', label: 'Distância do solo' },
      { key: 'dryWeight', label: 'Peso seco' },
      { key: 'wetWeight', label: 'Peso em ordem de marcha' },
    ],
  },
  {
    title: 'Ciclística, freios e rodas',
    description: 'Suspensões, frenagem, pneus e rodas.',
    icon: <ShieldCheck size={20} aria-hidden="true" />,
    fields: [
      { key: 'frontSuspension', label: 'Suspensão dianteira' },
      { key: 'rearSuspension', label: 'Suspensão traseira' },
      { key: 'frontBrake', label: 'Freio dianteiro' },
      { key: 'rearBrake', label: 'Freio traseiro' },
      { key: 'brakeSystem', label: 'Sistema ABS ou CBS' },
      { key: 'frontDiscSize', label: 'Diâmetro do disco dianteiro' },
      { key: 'rearDiscSize', label: 'Diâmetro do disco traseiro' },
      { key: 'frontTyre', label: 'Pneu dianteiro' },
      { key: 'rearTyre', label: 'Pneu traseiro' },
      { key: 'wheels', label: 'Tipo de rodas' },
      { key: 'tubeless', label: 'Compatibilidade sem câmara' },
    ],
  },
  {
    title: 'Capacidades e consumo',
    description: 'Combustível, autonomia e fluidos.',
    icon: <Fuel size={20} aria-hidden="true" />,
    fields: [
      { key: 'fuel', label: 'Combustível' },
      { key: 'tank', label: 'Capacidade do tanque' },
      { key: 'reserve', label: 'Reserva de combustível' },
      { key: 'cityConsumption', label: 'Consumo urbano' },
      { key: 'roadConsumption', label: 'Consumo rodoviário' },
      { key: 'engineOil', label: 'Especificação de óleo' },
      { key: 'oilCapacity', label: 'Capacidade de óleo' },
    ],
  },
  {
    title: 'Elétrica e tecnologia',
    description: 'Motorização elétrica e equipamentos.',
    icon: <Zap size={20} aria-hidden="true" />,
    fields: [
      { key: 'nominalPower', label: 'Potência nominal' },
      { key: 'battery', label: 'Capacidade da bateria' },
      { key: 'range', label: 'Autonomia declarada' },
      { key: 'chargeTime', label: 'Tempo de recarga' },
      { key: 'lighting', label: 'Iluminação' },
      { key: 'panel', label: 'Painel e instrumentação' },
      { key: 'equipment', label: 'Equipamentos' },
    ],
  },
] satisfies {
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: Field[];
}[];

const compactFields: Field[] = [
  { key: 'displacement', label: 'Cilindrada' },
  { key: 'power', label: 'Potência máxima' },
  { key: 'torque', label: 'Torque máximo' },
  { key: 'tank', label: 'Tanque' },
  { key: 'dryWeight', label: 'Peso seco' },
  { key: 'wetWeight', label: 'Peso em ordem de marcha' },
  { key: 'gears', label: 'Marchas' },
  { key: 'frontBrake', label: 'Freio dianteiro' },
];

function formatSpec(field?: Specification) {
  if (!field) return 'Não informado';

  const value =
    typeof field.value === 'number'
      ? field.value.toLocaleString('pt-BR', {
          maximumFractionDigits: 3,
        })
      : field.value;

  if (['text', 'count'].includes(field.unit)) {
    return String(value);
  }

  return `${value} ${field.unit}`;
}

function convertedValue(field: Specification) {
  if (typeof field.value !== 'number') {
    return null;
  }

  if (field.unit === 'kgf·m') {
    return `≈ ${torqueToNm(
      field.value,
      'kgf·m',
    ).toLocaleString('pt-BR', {
      maximumFractionDigits: 2,
    })} N·m`;
  }

  if (
    field.unit === 'cv' ||
    field.unit === 'hp'
  ) {
    return `≈ ${powerToKw(
      field.value,
      field.unit,
    ).toLocaleString('pt-BR', {
      maximumFractionDigits: 2,
    })} kW`;
  }

  return null;
}

function SpecGrid({
  fields,
  specifications,
  showConversions,
  sourcePrefix,
  compact,
}: {
  fields: Field[];
  specifications: CatalogVariant['specifications'];
  showConversions: boolean;
  sourcePrefix: string;
  compact: boolean;
}) {
  return (
    <dl className="garage-spec-grid catalog-technical-grid">
      {fields
        .filter(
          (field) =>
            !compact ||
            Boolean(specifications[field.key]),
        )
        .map((field) => {
          const specification =
            specifications[field.key];

          const conversion =
            specification && showConversions
              ? convertedValue(specification)
              : null;

          return (
            <div
              className="panel garage-spec catalog-technical-field"
              key={field.key}
            >
              <dt>{field.label}</dt>

              <dd
                className={
                  specification
                    ? 'catalog-value-present'
                    : 'catalog-value-absent'
                }
              >
                {formatSpec(specification)}
              </dd>

              {conversion && (
                <small className="catalog-conversion">
                  {conversion}
                </small>
              )}

              {!compact &&
                specification &&
                Number.isInteger(
                  specification.source,
                ) && (
                  <a
                    href={`#${sourcePrefix}-${specification.source}`}
                  >
                    Consultar fonte{' '}
                    {specification.source + 1}
                  </a>
                )}
            </div>
          );
        })}
    </dl>
  );
}

export function CatalogSheet({
  id,
  revision,
  compact = false,
}: {
  id: string;
  revision?: number | undefined;
  compact?: boolean;
}) {
  const [showConversions, setShowConversions] =
    useState(false);

  const sourcePrefix = useId().replace(
    /[^a-zA-Z0-9_-]/g,
    '',
  );

  const key = `${id}:${revision ?? 'latest'}`;

  const [loaded, setData] = useState<{
    key: string;
    variant: CatalogVariant;
  } | null>(null);

  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    void catalogService
      .detail(id, revision)
      .then((result) => {
        if (!active) return;

        setData({
          key,
          variant: result.variant,
        });

        setError('');
      })
      .catch(() => {
        if (!active) return;

        setError(
          'Ficha indisponível. Seus dados pessoais foram preservados.',
        );
      });

    return () => {
      active = false;
    };
  }, [id, revision, retry, key]);

  const data =
    loaded?.key === key ? loaded.variant : null;

  if (error) {
    return (
      <section className="panel garage-section">
        <p role="alert">{error}</p>

        <Button
          onClick={() =>
            setRetry((value) => value + 1)
          }
        >
          Tentar novamente
        </Button>
      </section>
    );
  }

  if (!data) {
    return (
      <p role="status">
        Carregando ficha técnica…
      </p>
    );
  }

  const filledFields = new Set(
    Object.keys(data.specifications),
  ).size;

  return (
    <section
      className="garage-spec-sheet catalog-technical-sheet"
      aria-label="Ficha técnica da versão"
    >
      <div className="garage-section-heading">
        <h2>
          <BookOpen size={20} aria-hidden="true" />
          Ficha técnica
        </h2>

        {compact && (
          <ButtonLink
            size="sm"
            variant="ghost"
            to={`/garagem/catalogo/${id}?revision=${data.revision}`}
          >
            Ver ficha técnica
          </ButtonLink>
        )}
      </div>

      {!compact && (
        <header className="panel catalog-technical-hero">
          <span className="eyebrow">
            REFERÊNCIA DE FÁBRICA · BRASIL
          </span>

          <h2>
            {data.brand} {data.model}
          </h2>

          <p>
            Ano-modelo {data.model_year} ·{' '}
            {data.name}
          </p>

          <div className="catalog-technical-meta">
            <span>
              Revisão {data.revision}
            </span>
            <span>
              {filledFields} especificações documentadas
            </span>
          </div>

          <p className="catalog-technical-disclaimer">
            A ficha pode ser parcial. Campos não
            comprovados aparecem como “Não informado”.
            As especificações podem variar por versão,
            mercado e ano-modelo.
          </p>
        </header>
      )}

      {!compact && (
        <div className="catalog-technical-toolbar">
          <Button
            variant="outline"
            aria-pressed={showConversions}
            onClick={() =>
              setShowConversions((value) => !value)
            }
          >
            {showConversions
              ? 'Ocultar equivalências'
              : 'Mostrar equivalências em kW e N·m'}
          </Button>
        </div>
      )}

      {compact ? (
        <SpecGrid
          fields={compactFields}
          specifications={data.specifications}
          showConversions={false}
          sourcePrefix={sourcePrefix}
          compact
        />
      ) : (
        <div className="catalog-technical-groups">
          {groups
            .filter(
              (group) =>
                group.title !== 'Elétrica e tecnologia' ||
                data.propulsion === 'electric' ||
                group.fields.some((field) =>
                  Boolean(
                    data.specifications[field.key],
                  ),
                ),
            )
            .map((group) => {
              const documented = group.fields.filter(
                (field) =>
                  Boolean(
                    data.specifications[field.key],
                  ),
              ).length;

              return (
                <section
                  className="catalog-technical-group"
                  key={group.title}
                >
                  <div className="catalog-technical-group-heading">
                    <span className="catalog-technical-group-icon">
                      {group.icon}
                    </span>

                    <div>
                      <h3>{group.title}</h3>
                      <p>{group.description}</p>
                    </div>

                    <small>
                      {documented}/{group.fields.length}
                    </small>
                  </div>

                  <SpecGrid
                    fields={group.fields}
                    specifications={
                      data.specifications
                    }
                    showConversions={
                      showConversions
                    }
                    sourcePrefix={
                      sourcePrefix
                    }
                    compact={false}
                  />
                </section>
              );
            })}
        </div>
      )}

      {!compact && (
        <section className="panel garage-section catalog-technical-sources">
          <h2>Fontes e revisão</h2>

          <p className="catalog-technical-disclaimer">
            Consulte sempre o manual correspondente
            ao ano e à versão da sua motocicleta.
          </p>

          {data.sources.map((source, index) => (
            <article
              className="catalog-source"
              id={`${sourcePrefix}-${index}`}
              key={`${source.url}-${index}`}
            >
              <strong>
                Fonte {index + 1} ·{' '}
                {source.title}
              </strong>

              <p>{source.scope}</p>

              <p>
                Consulta: {source.consultedAt}
                {source.publishedAt
                  ? ` · Publicação: ${source.publishedAt}`
                  : ''}
              </p>

              <a
                className="text-link action-link"
                href={source.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                Abrir fonte
                <ExternalLink
                  size={16}
                  aria-hidden="true"
                />
              </a>
            </article>
          ))}

          <p>{data.change_note}</p>

          <p>
            A versão da ficha fica vinculada à
            revisão escolhida. Atualizações do
            catálogo não reescrevem seus dados
            nem seus Rides anteriores.
          </p>
        </section>
      )}
    </section>
  );
}

export function CatalogPage() {
  const { variantId } = useParams();
  const [params] = useSearchParams();

  const requestedRevision = Number(
    params.get('revision'),
  );

  const revision =
    Number.isInteger(requestedRevision) &&
    requestedRevision > 0
      ? requestedRevision
      : undefined;

  return (
    <div className="garage-page">
      <ButtonLink
        to="/garagem"
        variant="outline"
      >
        <ArrowLeft
          size={18}
          aria-hidden="true"
        />
        Voltar à Garagem
      </ButtonLink>

      <h1>Ficha técnica</h1>

      <CatalogSheet
        key={`${variantId}:${revision ?? 'latest'}`}
        id={variantId!}
        revision={revision}
      />
    </div>
  );
}
