import { useEffect, useState } from 'react';
import {
  Archive,
  Camera,
  ChevronRight,
  Plus,
  Settings,
  Star,
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
import '../styles/garage-premium.css';
export function GarageHero({
  bike,
  manage = true,
}: {
  bike: Motorcycle;
  manage?: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const Heading = manage ? 'h2' : 'h1';
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
            {bike.model.split(' ').slice(0, -1).join(' ')}{' '}
            <em>{bike.model.split(' ').at(-1)}</em>
          </Heading>
          <p>
            {bike.year} · {motorcycleEngine(bike)}
          </p>
          {bike.versionName && <p>{bike.versionName}</p>}
          {manage && (
            <ButtonLink
              to={`/garagem/${bike.id}${bike.archivedAt ? '?archived=true' : ''}`}
              variant="secondary"
            >
              <Settings size={18} />
              Gerenciar moto
              <ChevronRight size={18} />
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
            <Camera size={16} />
            Ampliar foto
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
export function GaragePremium() {
  const { user } = useAuth();
  const garage = useGarage(),
    location = useLocation();
  const [selected, setSelected] = useState(''),
    [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false),
    [archive, setArchive] = useState<{
      owner: string;
      items: Motorcycle[];
    } | null>(null),
    [archiveError, setArchiveError] = useState('');
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
  const matches = all.filter((b) =>
    `${b.brand} ${b.model} ${b.year} ${b.versionName ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(
        query
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      ),
  );
  const bike =
    matches.find((b) => b.id === selected) ??
    matches.find((b) => b.isPrimary) ??
    matches[0];
  return (
    <div className="garage-page garage-premium">
      <PageHeader
        title="MINHA"
        accent="GARAGEM"
        description="Suas motos, prontas para a próxima aventura."
        action={
          <ButtonLink variant="primary" to="/garagem/nova">
            <Plus />
            Adicionar Moto
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
      {location.state?.message && <p role="status">{location.state.message}</p>}
      {garage.offline && (
        <p role="status">
          Cópia deste aparelho · sem fotografias ou registros privados.
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
          <div
            className="garage-bike-strip"
            role="group"
            aria-label="Selecionar motocicleta"
          >
            {matches.map((b) => (
              <button
                className={`garage-bike-tile motorcycle-card ${b.id === bike.id ? 'selected' : ''}`}
                aria-pressed={b.id === bike.id}
                onClick={() => setSelected(b.id)}
                key={b.id}
              >
                <MotorcyclePhoto bike={b} />
                <span>
                  <strong>
                    {b.brand} {b.model}
                  </strong>
                  <small>
                    {b.year}
                    {b.isPrimary ? ' · Moto principal' : ''}
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
          {bike.catalogVariantId && bike.catalogRevision ? (
            <CatalogSheet
              key={`${bike.id}:${bike.catalogRevision}`}
              id={bike.catalogVariantId}
              revision={bike.catalogRevision}
              compact
            />
          ) : (
            <section className="panel garage-section">
              <div className="garage-section-heading">
                <h2>Ficha técnica</h2>
                <ButtonLink
                  variant="ghost"
                  size="sm"
                  to={`/garagem/${bike.id}${archived ? '?archived=true' : ''}`}
                >
                  Ver detalhes
                </ButtonLink>
              </div>
              <p>Informação técnica ainda não disponível.</p>
              <p className="garage-muted">
                Cadastre a versão correspondente para consultar dados do
                fabricante.
              </p>
            </section>
          )}
          <div className="garage-quick-actions">
            <ButtonLink
              to={`/garagem/${bike.id}${archived ? '?archived=true' : ''}#manutencao`}
              variant="secondary"
            >
              Manutenção
              <ChevronRight size={18} />
            </ButtonLink>
            <ButtonLink
              to={`/historico?motorcycleId=${bike.id}`}
              variant="outline"
            >
              Histórico de Rides
              <ChevronRight size={18} />
            </ButtonLink>
          </div>
        </>
      )}
    </div>
  );
}
