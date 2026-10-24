import { powerToKw, torqueToNm } from './units';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import { Button, ButtonLink } from '../components/design-system';
import { catalogService, type CatalogVariant } from '../services/catalog';
const labels: Record<string, string> = {
  engine: 'Motor',
  cylinders: 'Cilindros',
  displacement: 'Cilindrada',
  power: 'Potência máxima',
  powerRpm: 'Rotação da potência',
  torque: 'Torque máximo',
  torqueRpm: 'Rotação do torque',
  transmission: 'Transmissão',
  gears: 'Marchas',
  clutch: 'Embreagem',
  finalDrive: 'Transmissão final',
  fuel: 'Combustível',
  cooling: 'Arrefecimento',
  injection: 'Alimentação',
  length: 'Comprimento',
  width: 'Largura',
  height: 'Altura',
  wheelbase: 'Entre-eixos',
  seatHeight: 'Altura do assento',
  groundClearance: 'Vão livre',
  dryWeight: 'Peso seco',
  wetWeight: 'Peso em ordem de marcha',
  frontSuspension: 'Suspensão dianteira',
  rearSuspension: 'Suspensão traseira',
  frontBrake: 'Freio dianteiro',
  rearBrake: 'Freio traseiro',
  frontTyre: 'Pneu dianteiro',
  rearTyre: 'Pneu traseiro',
  tank: 'Tanque',
  reserve: 'Reserva',
  lighting: 'Iluminação',
  panel: 'Painel',
  equipment: 'Equipamentos',
  nominalPower: 'Potência nominal',
  battery: 'Bateria',
  range: 'Autonomia homologada',
  chargeTime: 'Recarga',
};
export function CatalogSheet({
  id,
  revision,
  compact = false,
}: {
  id: string;
  revision?: number | undefined;
  compact?: boolean;
}) {
  const [si, setSi] = useState(false);
  const key = `${id}:${revision ?? 'latest'}`;
  const [loaded, setData] = useState<{
      key: string;
      variant: CatalogVariant;
    } | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    catalogService
      .detail(id, revision)
      .then((r) => {
        if (active) {
          setData({ key, variant: r.variant });
          setError('');
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Ficha indisponível. Seus dados pessoais foram preservados.',
          );
      });
    return () => {
      active = false;
    };
  }, [id, revision, retry, key]);
  const data = loaded?.key === key ? loaded.variant : null;
  if (error)
    return (
      <section className="panel garage-section">
        <p role="alert">{error}</p>
        <Button onClick={() => setRetry((v) => v + 1)}>Tentar novamente</Button>
      </section>
    );
  if (!data) return <p role="status">Carregando ficha técnica…</p>;
  const keys = compact
    ? [
        'displacement',
        'power',
        'torque',
        'tank',
        'dryWeight',
        'wetWeight',
        'gears',
        'frontBrake',
      ]
    : Object.keys(labels);
  return (
    <section className="garage-spec-sheet" aria-label="Ficha técnica da versão">
      <div className="garage-section-heading">
        <h2>
          <BookOpen size={20} aria-hidden />
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
        <header className="panel garage-section">
          <span className="eyebrow">REFERÊNCIA DE FÁBRICA · BRASIL</span>
          <h2>
            {data.brand} {data.model}
          </h2>
          <p>
            {data.model_year} · {data.name} · revisão {data.revision}
          </p>
          <p>Ficha parcial · campos ausentes não foram estimados.</p>
        </header>
      )}
      {!compact && (
        <Button
          variant="outline"
          aria-pressed={si}
          onClick={() => setSi((v) => !v)}
        >
          Equivalências em kW e N·m
        </Button>
      )}
      <dl className="garage-spec-grid">
        {keys
          .filter((k) => !compact || data.specifications[k])
          .map((k) => {
            const f = data.specifications[k];
            return (
              <div className="panel garage-spec" key={k}>
                <dt>{labels[k]}</dt>
                <dd>
                  {f
                    ? `${typeof f.value === 'number' ? f.value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : f.value}${['text', 'count'].includes(f.unit) ? '' : ' ' + f.unit}`
                    : 'Não informado'}
                </dd>
                {si &&
                  f &&
                  typeof f.value === 'number' &&
                  (['cv', 'hp'].includes(f.unit) || f.unit === 'kgf·m') && (
                    <small>
                      ≈{' '}
                      {(f.unit === 'kgf·m'
                        ? torqueToNm(f.value, 'kgf·m')
                        : powerToKw(f.value, f.unit as 'cv' | 'hp')
                      ).toLocaleString('pt-BR', {
                        maximumFractionDigits: 2,
                      })}{' '}
                      {f.unit === 'kgf·m' ? 'N·m' : 'kW'}
                    </small>
                  )}
                {!compact && f && (
                  <a href={`#source-${f.source}`}>Fonte {f.source + 1}</a>
                )}
              </div>
            );
          })}
      </dl>
      {!compact && (
        <section className="panel garage-section">
          <h2>Fontes e revisão</h2>
          {data.sources.map((s, i) => (
            <article className="catalog-source" id={`source-${i}`} key={s.url}>
              <strong>
                Fonte {i + 1} · {s.title}
              </strong>
              <p>{s.scope}</p>
              <p>
                Consulta: {s.consultedAt}
                {s.publishedAt ? ` · Publicação: ${s.publishedAt}` : ''}
              </p>
              <a
                className="text-link action-link"
                href={s.url}
                rel="noreferrer"
                target="_blank"
              >
                Abrir fabricante
                <ExternalLink size={16} />
              </a>
            </article>
          ))}
          <p>{data.change_note}</p>
          <p>
            A referência fica vinculada à revisão escolhida. Uma atualização não
            reescreve sua moto ou seus Rides anteriores.
          </p>
        </section>
      )}
    </section>
  );
}
export function CatalogPage() {
  const { variantId } = useParams(),
    [params] = useSearchParams();
  const r = Number(params.get('revision'));
  return (
    <div className="garage-page">
      <ButtonLink to="/garagem" variant="outline">
        <ArrowLeft size={18} />
        Voltar à Garagem
      </ButtonLink>
      <h1>Ficha técnica</h1>
      <CatalogSheet
        key={`${variantId}:${r}`}
        id={variantId!}
        revision={r > 0 ? r : undefined}
      />
    </div>
  );
}
