import { useEffect, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Camera,
  ChevronRight,
  Fuel,
  Gauge,
  Plus,
  Settings,
  Star,
  Wrench,
  FileText,
  NotebookPen,
} from 'lucide-react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  PageHeader,
  SearchInput,
} from '../components/design-system';
import {
  motorcycleEngine,
  motorcycleService,
  type Motorcycle,
} from '../services/motorcycles';
import { MotorcyclePhoto } from './MotorcycleCard';
import { useGarage } from './context';
import { CatalogSheet } from './CatalogSheet';
import { GarageOverview } from './GarageOverview';
import '../styles/garage-premium.css';
import '../styles/apex-stage-06.css';

export function GarageHero({
  bike,
  manage = true,
}: {
  bike: Motorcycle;
  manage?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const Heading = manage ? 'h2' : 'h1';
  const words = bike.model.trim().split(/\s+/);
  const last = words.pop() ?? bike.model;
  return (
    <>
      <section
        className={`garage-hero ${bike.photoUrl ? 'has-photo' : 'no-photo'}`}
        aria-label={`Moto em destaque: ${bike.brand} ${bike.model}`}
      >
        <MotorcyclePhoto bike={bike} />
        <div className="garage-hero-copy">
          <span className="eyebrow">{bike.brand}</span>
          <Heading>
            {words.join(' ')} <em>{last}</em>
          </Heading>
          <p>
            {bike.year} · {motorcycleEngine(bike)}
          </p>
          {bike.versionName && (
            <p className="garage-stage06-version">{bike.versionName}</p>
          )}
          {manage && (
            <ButtonLink
              to={`/garagem/${bike.id}${bike.archivedAt ? '?archived=true' : ''}`}
              variant="secondary"
            >
              <Settings size={18} /> Gerenciar moto <ChevronRight size={18} />
            </ButtonLink>
          )}
        </div>
        <span
          className={`garage-hero-badge ${bike.isPrimary ? 'primary' : ''}`}
        >
          <Star size={14} />
          {bike.archivedAt
            ? 'Arquivada'
            : bike.isPrimary
              ? 'Moto principal'
              : 'Moto selecionada'}
        </span>
        {bike.photoUrl && (
          <Button
            size="sm"
            variant="outline"
            className="garage-zoom"
            onClick={() => setZoom(true)}
          >
            <Camera size={16} /> Ampliar foto
          </Button>
        )}
      </section>
      <Dialog
        open={zoom}
        onClose={() => setZoom(false)}
        title={`${bike.brand} ${bike.model} · sua fotografia`}
      >
        <MotorcyclePhoto bike={bike} />
      </Dialog>
    </>
  );
}

function GarageFacts({ bike }: { bike: Motorcycle }) {
  const facts = [
    { key: 'marca', label: 'Marca', value: bike.brand, Icon: Star },
    { key: 'modelo', label: 'Modelo', value: bike.model, Icon: Gauge },
    { key: 'ano', label: 'Ano', value: String(bike.year), Icon: CalendarDays },
    {
      key: 'cilindrada',
      label: 'Motorização',
      value: motorcycleEngine(bike),
      Icon: Fuel,
    },
  ];
  return (
    <section
      aria-label="Identificação da motocicleta"
      className="garage-stage06-identity"
    >
      {facts.map(({ key, label, value, Icon }) => (
        <div key={key} className="garage-stage06-fact">
          <Icon aria-hidden="true" size={25} />
          <span>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        </div>
      ))}
    </section>
  );
}

export function GaragePremium() {
  const { user } = useAuth();
  const garage = useGarage();
  const location = useLocation();
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [archived, setArchived] = useState(false);
  const [archive, setArchive] = useState<{
    owner: string;
    items: Motorcycle[];
  } | null>(null);
  const [archiveError, setArchiveError] = useState('');
  useEffect(() => {
    let active = true;
    const owner = user?.id;
    if (archived && owner)
      motorcycleService
        .list(true)
        .then((r) => {
          if (active) {
            setArchive({ owner, items: r.motorcycles });
            setArchiveError('');
          }
        })
        .catch(() => {
          if (active)
            setArchiveError('Não foi possível consultar motos arquivadas.');
        });
    return () => {
      active = false;
    };
  }, [archived, user?.id]);
  const all = archived
    ? archive?.owner === user?.id
      ? (archive?.items ?? [])
      : []
    : garage.motorcycles;
  const normalizedQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const matches = all.filter((b) =>
    `${b.brand} ${b.model} ${b.year} ${b.versionName ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const bike =
    matches.find((b) => b.id === selected) ??
    matches.find((b) => b.isPrimary) ??
    matches[0];
  return (
    <div className="garage-page garage-premium garage-stage06">
      <PageHeader
        title="MINHA"
        accent="GARAGEM"
        description="Suas motos, sempre prontas para a próxima aventura."
        action={
          <ButtonLink variant="primary" to="/garagem/nova">
            <Plus /> Adicionar moto
          </ButtonLink>
        }
      />
      <div className="garage-toolbar">
        <SearchInput
          label="Buscar na minha garagem"
          placeholder="Buscar marca, modelo ou ano…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          variant={archived ? 'selected' : 'outline'}
          aria-pressed={archived}
          onClick={() => {
            setArchived((v) => !v);
            setSelected('');
          }}
        >
          <Archive size={18} />
          {archived ? 'Ver ativas' : 'Arquivadas'}
        </Button>
      </div>
      {location.state?.message && (
        <p role="status" className="garage-stage06-note">
          {location.state.message}
        </p>
      )}
      {garage.offline && (
        <p role="status" className="garage-stage06-note">
          Cópia deste aparelho · sem fotografias ou registros privados.{' '}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void garage.refresh()}
          >
            Tentar novamente
          </Button>
        </p>
      )}
      {archiveError && <p role="alert">{archiveError}</p>}
      {garage.loading ? (
        <p role="status">Carregando garagem…</p>
      ) : garage.error && !garage.offline ? (
        <section className="panel garage-empty">
          <p role="alert">{garage.error}</p>
          <Button onClick={() => void garage.refresh()}>
            Tentar novamente
          </Button>
        </section>
      ) : !all.length ? (
        <EmptyState
          title={
            archived ? 'Nenhuma moto arquivada.' : 'Sua garagem começa aqui.'
          }
          action={
            !archived && (
              <ButtonLink to="/garagem/nova" variant="primary">
                Adicionar minha primeira moto
              </ButtonLink>
            )
          }
        >
          Cadastre uma moto para acompanhar sua história.
        </EmptyState>
      ) : !bike ? (
        <EmptyState title="Nenhuma moto encontrada." />
      ) : (
        <>
          <div className="garage-stage06-section-heading">
            <div>
              <span className="eyebrow">ESCOLHA SUA COMPANHEIRA</span>
              <h2>{archived ? 'Motos arquivadas' : 'Minhas motocicletas'}</h2>
            </div>
            <small>
              {matches.length} {matches.length === 1 ? 'moto' : 'motos'}
            </small>
          </div>
          <div
            className="garage-bike-strip"
            role="group"
            aria-label="Selecionar motocicleta"
          >
            {matches.map((b) => (
              <button
                key={b.id}
                className={`garage-bike-tile motorcycle-card ${b.id === bike.id ? 'selected' : ''}`}
                aria-pressed={b.id === bike.id}
                onClick={() => setSelected(b.id)}
              >
                <MotorcyclePhoto bike={b} />
                <span>
                  <strong>
                    {b.brand} {b.model}
                  </strong>
                  <small>
                    {b.year}
                    {b.isPrimary ? ' · Principal' : ''}
                  </small>
                </span>
              </button>
            ))}
            {!archived && (
              <ButtonLink
                className="garage-add-tile"
                variant="outline"
                to="/garagem/nova"
              >
                <Plus />
                Adicionar moto
              </ButtonLink>
            )}
          </div>
          <GarageHero key={bike.id} bike={bike} />
          <GarageFacts bike={bike} />
          <div className="garage-stage06-section-heading">
            <div>
              <span className="eyebrow">ESPECIFICAÇÕES</span>
              <h2>Ficha técnica</h2>
            </div>
            <ButtonLink
              size="sm"
              variant="ghost"
              to={`/garagem/${bike.id}${archived ? '?archived=true' : ''}`}
            >
              Ver ficha completa <ChevronRight size={16} />
            </ButtonLink>
          </div>
          {bike.catalogVariantId && bike.catalogRevision ? (
            <CatalogSheet
              key={`${bike.id}:${bike.catalogRevision}`}
              id={bike.catalogVariantId}
              revision={bike.catalogRevision}
              compact
            />
          ) : (
            <section className="panel garage-section garage-stage06-empty-sheet">
              <h3>Ficha técnica em preparação</h3>
              <p>
                Sem especificações verificadas para esta versão. O cadastro da
                moto está disponível normalmente.
              </p>
              {!archived && (
                <ButtonLink
                  to={`/garagem/${bike.id}/editar`}
                  variant="secondary"
                >
                  Vincular versão do catálogo <ChevronRight size={16} />
                </ButtonLink>
              )}
            </section>
          )}
          {!archived && <GarageOverview key={bike.id} bike={bike} />}
          <section
            className="garage-stage06-actions"
            aria-label="Ações da minha moto"
          >
            <ButtonLink
              to={`/garagem/${bike.id}${archived ? '?archived=true' : ''}#manutencao`}
              variant="secondary"
            >
              <Wrench size={19} /> Manutenção <ChevronRight size={17} />
            </ButtonLink>
            <ButtonLink
              to={`/garagem/${bike.id}${archived ? '?archived=true' : ''}`}
              variant="secondary"
            >
              <FileText size={19} /> Documentos e seguro{' '}
              <ChevronRight size={17} />
            </ButtonLink>
            <ButtonLink
              to={`/garagem/${bike.id}${archived ? '?archived=true' : ''}`}
              variant="secondary"
            >
              <NotebookPen size={19} /> Anotações <ChevronRight size={17} />
            </ButtonLink>
            <ButtonLink
              to={`/historico?motorcycleId=${bike.id}`}
              variant="outline"
            >
              <Gauge size={19} /> Histórico de Rides <ChevronRight size={17} />
            </ButtonLink>
          </section>
        </>
      )}
    </div>
  );
}
