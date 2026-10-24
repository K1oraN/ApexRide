import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  History,
  Plus,
  Shield,
  StickyNote,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  ButtonLink,
  Checkbox,
  Dialog,
  Input,
  SearchInput,
  Select,
  Textarea,
} from '../components/design-system';
import {
  garageRecords,
  type GarageRecord,
  type GarageRecordKind,
} from '../services/catalog';
import type { Motorcycle } from '../services/motorcycles';
import { useHistoryStats } from '../history/useHistoryStats';
import { formatDuration } from '../ride/format';
import { CatalogSheet } from './CatalogSheet';
const kinds: Record<GarageRecordKind, string> = {
  maintenance: 'Manutenção',
  odometer: 'Odômetro',
  note: 'Anotações',
  insurance: 'Seguro',
  document: 'Documentação',
  reminder: 'Lembretes',
  modification: 'Modificações e acessórios',
};
const tabs = [
  ['visao', 'Visão geral', Gauge],
  ['ficha', 'Ficha técnica', FileText],
  ['atividades', 'Atividades', History],
  ['manutencao', 'Manutenção', Wrench],
  ['registros', 'Registros pessoais', StickyNote],
] as const;
export function GarageDetails({ bike }: { bike: Motorcycle }) {
  const { hash } = useLocation();
  const [tab, setTab] = useState(
    hash === '#manutencao' ? 'manutencao' : 'visao',
  );
  const stats = useHistoryStats(`motorcycleId=${bike.id}`);
  return (
    <div className="garage-details">
      <nav className="garage-detail-tabs" aria-label="Detalhes da motocicleta">
        {tabs.map(([id, label, Icon]) => (
          <Button
            variant={tab === id ? 'selected' : 'secondary'}
            key={id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={18} />
            {label}
          </Button>
        ))}
      </nav>
      {tab === 'visao' && (
        <>
          <section className="panel garage-section">
            <h2>História desta moto</h2>
            <div className="garage-stats">
              <div>
                <strong>{stats.data?.totals.total ?? '—'}</strong>
                <span>Rides salvos</span>
              </div>
              <div>
                <strong>
                  {stats.data
                    ? (stats.data.totals.distance_meters / 1000).toLocaleString(
                        'pt-BR',
                        { maximumFractionDigits: 1 },
                      )
                    : '—'}{' '}
                  km
                </strong>
                <span>Registrados no Apex Ride</span>
              </div>
              <div>
                <strong>
                  {stats.data
                    ? formatDuration(stats.data.totals.active_ms)
                    : '—'}
                </strong>
                <span>Tempo de pilotagem</span>
              </div>
            </div>
            {stats.error && <p role="alert">Estatísticas indisponíveis.</p>}
            <p className="garage-muted">
              Distância de atividades · não é o odômetro.
            </p>
          </section>
          <PrivateRecords bike={bike} fixedKind="odometer" />
          <PrivateRecords bike={bike} fixedKind="reminder" />
        </>
      )}
      {tab === 'ficha' &&
        (bike.catalogVariantId && bike.catalogRevision ? (
          <CatalogSheet
            id={bike.catalogVariantId}
            revision={bike.catalogRevision}
          />
        ) : (
          <section className="panel garage-section">
            <h2>Informação técnica ainda não disponível.</h2>
            {!bike.archivedAt && (
              <ButtonLink to={`/garagem/${bike.id}/editar`} variant="outline">
                Vincular versão do catálogo
              </ButtonLink>
            )}
          </section>
        ))}
      {tab === 'atividades' && (
        <section className="panel garage-section">
          <h2>Rides desta motocicleta</h2>
          {stats.data?.totals.total === 0 ? (
            <p>Esta moto ainda não possui Rides registrados no Apex Ride.</p>
          ) : (
            <p>{stats.data?.totals.total ?? '—'} sessões salvas na conta.</p>
          )}
          <ButtonLink
            variant="primary"
            to={`/historico?motorcycleId=${bike.id}`}
          >
            Abrir atividades e Replay
          </ButtonLink>
        </section>
      )}
      {tab === 'manutencao' && (
        <PrivateRecords bike={bike} fixedKind="maintenance" />
      )}
      {tab === 'registros' && <PrivateRecords bike={bike} />}
    </div>
  );
}
export function PrivateRecords({
  bike,
  fixedKind,
}: {
  bike: Motorcycle;
  fixedKind?: GarageRecordKind;
}) {
  const { user } = useAuth();
  const [kind, setKind] = useState<GarageRecordKind>(fixedKind ?? 'note'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [loaded, setLoaded] = useState<{
      owner: string;
      kind: string;
      items: GarageRecord[];
      more: boolean;
      latest: GarageRecord | null;
    } | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState<GarageRecord | null>(null),
    [form, setForm] = useState(false);
  useEffect(() => {
    let active = true;
    const owner = user?.id;
    if (owner)
      garageRecords
        .list(bike.id, kind, page, query)
        .then((r) => {
          if (active) {
            setLoaded({
              owner,
              kind,
              items: r.items,
              more: r.hasMore,
              latest: r.latest,
            });
            setError('');
          }
        })
        .catch(() => {
          if (active)
            setError('Não foi possível carregar os registros privados.');
        });
    return () => {
      active = false;
    };
  }, [bike.id, kind, page, revision, user?.id, query]);
  const current =
      loaded?.owner === user?.id && loaded?.kind === kind ? loaded : null,
    rows = current?.items ?? [];
  async function remove(row: GarageRecord) {
    if (!window.confirm(`Excluir “${row.data.title}”?`)) return;
    try {
      await garageRecords.remove(bike.id, row);
      setRevision((n) => n + 1);
    } catch {
      setError('Não foi possível excluir. Recarregue e tente novamente.');
    }
  }
  return (
    <section
      className="panel garage-section private-records"
      aria-label={kinds[kind]}
    >
      <header className="garage-section-heading">
        <h2>
          {kind === 'maintenance' ? (
            <Wrench size={21} />
          ) : kind === 'insurance' ? (
            <Shield size={21} />
          ) : kind === 'odometer' ? (
            <Gauge size={21} />
          ) : (
            <StickyNote size={21} />
          )}{' '}
          {kinds[kind]}
        </h2>
        {!bike.archivedAt && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setEditing(null);
              setForm(true);
            }}
          >
            <Plus size={17} />
            Adicionar registro
          </Button>
        )}
      </header>
      {!fixedKind && (
        <label className="account-field">
          Tipo de registro
          <Select
            aria-label="Tipo de registro"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as GarageRecordKind);
              setPage(1);
              setQuery('');
            }}
          >
            {Object.entries(kinds)
              .filter(([k]) => k !== 'maintenance')
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </Select>
        </label>
      )}
      {(rows.length > 0 || query) && (
        <SearchInput
          label={`Pesquisar ${kinds[kind]}`}
          placeholder="Buscar registros…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      )}
      {error ? (
        <p role="alert">
          {error}
          <Button variant="ghost" onClick={() => setRevision((n) => n + 1)}>
            Tentar novamente
          </Button>
        </p>
      ) : !current ? (
        <p role="status">Carregando registros…</p>
      ) : !rows.length ? (
        <p>
          {kind === 'maintenance'
            ? 'Nenhuma manutenção registrada.'
            : `Nenhum registro de ${kinds[kind].toLocaleLowerCase('pt-BR')}.`}
        </p>
      ) : (
        rows.map((row) => (
          <article className="garage-record" key={row.id}>
            <div className="garage-record-title">
              <h3>{row.data.title}</h3>
              <span>Privado</span>
            </div>
            <dl>
              {Object.entries(row.data)
                .filter(
                  ([k]) =>
                    !['title', 'description', 'correctionOf'].includes(k),
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{fieldLabels[k] ?? k}</dt>
                    <dd>
                      {k === 'costCents'
                        ? (Number(v) / 100).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })
                        : k.toLowerCase().includes('odometer')
                          ? `${Number(v).toLocaleString('pt-BR')} km`
                          : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
            {row.data.description && (
              <p className="garage-record-text">{row.data.description}</p>
            )}
            {row.data.correctionOf && (
              <small>Correção registrada · leitura anterior preservada.</small>
            )}
            {!bike.archivedAt && kind !== 'odometer' && (
              <div className="garage-actions">
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(row);
                    setForm(true);
                  }}
                >
                  Editar registro
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void remove(row)}
                >
                  Excluir registro
                </Button>
              </div>
            )}
          </article>
        ))
      )}
      {(page > 1 || current?.more) && (
        <nav
          className="page-pagination"
          aria-label={`Páginas de ${kinds[kind]}`}
        >
          <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft />
            Anterior
          </Button>
          <span>Página {page}</span>
          <Button
            disabled={!current?.more}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
            <ChevronRight />
          </Button>
        </nav>
      )}
      <Dialog
        open={form}
        onClose={() => setForm(false)}
        title={`${editing ? 'Editar' : 'Adicionar'} · ${kinds[kind]}`}
      >
        <RecordForm
          key={`${editing?.id ?? 'new'}:${kind}:${form}`}
          kind={kind}
          row={editing}
          latest={current?.latest ?? undefined}
          bikeId={bike.id}
          done={() => {
            setForm(false);
            setRevision((n) => n + 1);
          }}
        />
      </Dialog>
    </section>
  );
}
const fieldLabels: Record<string, string> = {
  date: 'Data',
  endDate: 'Fim da vigência / vencimento',
  odometerKm: 'Odômetro informado',
  nextDate: 'Próxima data planejada',
  nextOdometerKm: 'Próximo odômetro planejado',
  costCents: 'Custo',
  workshop: 'Oficina',
  provider: 'Seguradora informada',
  coverage: 'Cobertura declarada',
  status: 'Situação declarada',
  origin: 'Origem da leitura',
};
const formFields: Record<GarageRecordKind, string[]> = {
  maintenance: [
    'date',
    'odometerKm',
    'costCents',
    'workshop',
    'nextDate',
    'nextOdometerKm',
  ],
  odometer: ['date', 'odometerKm', 'origin'],
  note: [],
  insurance: ['date', 'endDate', 'provider', 'coverage'],
  document: ['endDate', 'status'],
  reminder: ['nextDate', 'nextOdometerKm'],
  modification: ['date'],
};
function RecordForm({
  kind,
  row,
  latest,
  bikeId,
  done,
}: {
  kind: GarageRecordKind;
  row: GarageRecord | null;
  latest: GarageRecord | undefined;
  bikeId: string;
  done: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        Object.entries(
          row?.data ?? {
            title: '',
            description: '',
            date: new Date().toISOString().slice(0, 10),
          },
        ).map(([k, v]) => [
          k,
          k === 'costCents' ? String(Number(v) / 100) : String(v),
        ]),
      ),
    ),
    [correction, setCorrection] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data: Record<string, string | number> = {
        title: values.title ?? '',
      };
      for (const key of ['description', ...formFields[kind]]) {
        const v = values[key];
        if (!v) continue;
        data[key] =
          key === 'costCents'
            ? Math.round(Number(v) * 100)
            : ['odometerKm', 'nextOdometerKm'].includes(key)
              ? Number(v)
              : v;
      }
      if (correction && latest) data.correctionOf = latest.id;
      if (row) await garageRecords.update(bikeId, row, data);
      else await garageRecords.create(bikeId, kind, data);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar registro.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="garage-record-form" onSubmit={(e) => void save(e)}>
      <fieldset disabled={busy}>
        <label className="account-field">
          Título
          <Input
            aria-label="Título do registro"
            required
            maxLength={100}
            value={values.title ?? ''}
            onChange={(e) => setValues({ ...values, title: e.target.value })}
          />
        </label>
        <div className="garage-record-fields">
          {formFields[kind].map((key) => (
            <label className="account-field" key={key}>
              {key === 'costCents' ? 'Custo (R$)' : fieldLabels[key]}
              <Input
                aria-label={
                  key === 'costCents' ? 'Custo (R$)' : fieldLabels[key]
                }
                type={
                  key.toLowerCase().includes('date')
                    ? 'date'
                    : ['odometerKm', 'nextOdometerKm', 'costCents'].includes(
                          key,
                        )
                      ? 'number'
                      : 'text'
                }
                min={
                  ['odometerKm', 'nextOdometerKm', 'costCents'].includes(key)
                    ? 0
                    : undefined
                }
                step={
                  ['odometerKm', 'nextOdometerKm', 'costCents'].includes(key)
                    ? 0.01
                    : undefined
                }
                maxLength={300}
                required={
                  (key === 'date' &&
                    ['maintenance', 'odometer', 'insurance'].includes(kind)) ||
                  (kind === 'odometer' &&
                    ['odometerKm', 'origin'].includes(key))
                }
                value={values[key] ?? ''}
                onChange={(e) =>
                  setValues({ ...values, [key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <label className="account-field">
          {kind === 'odometer'
            ? 'Observações / motivo da correção'
            : 'Anotações'}
          <Textarea
            aria-label="Anotações do registro"
            rows={3}
            maxLength={3000}
            required={correction}
            value={values.description ?? ''}
            onChange={(e) =>
              setValues({ ...values, description: e.target.value })
            }
          />
        </label>
        {kind === 'odometer' && latest && (
          <label className="check-field">
            <Checkbox
              checked={correction}
              onChange={(e) => setCorrection(e.target.checked)}
            />
            Corrigir a última leitura, preservando seu histórico
          </label>
        )}
        <Button type="submit" variant="primary" loading={busy}>
          Salvar registro
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
