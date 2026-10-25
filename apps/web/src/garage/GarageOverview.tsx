import { useEffect, useState } from 'react';
import {
  CalendarClock,
  FileCheck2,
  NotebookPen,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { ButtonLink } from '../components/design-system';
import {
  garageRecords,
  type GarageRecord,
  type GarageRecordKind,
} from '../services/catalog';
import type { Motorcycle } from '../services/motorcycles';

type OverviewKind = Extract<
  GarageRecordKind,
  'maintenance' | 'insurance' | 'document' | 'note'
>;
type Overview = Partial<Record<OverviewKind, GarageRecord | null>>;
const items: {
  kind: OverviewKind;
  label: string;
  Icon: typeof Wrench;
  description: string;
}[] = [
  {
    kind: 'maintenance',
    label: 'Última manutenção',
    Icon: Wrench,
    description: 'Nenhuma manutenção registrada',
  },
  {
    kind: 'insurance',
    label: 'Seguro',
    Icon: ShieldCheck,
    description: 'Nenhum seguro cadastrado',
  },
  {
    kind: 'document',
    label: 'Documentos',
    Icon: FileCheck2,
    description: 'Nenhum documento registrado',
  },
  {
    kind: 'note',
    label: 'Minhas anotações',
    Icon: NotebookPen,
    description: 'Nenhuma anotação registrada',
  },
];
const keys = items.map((entry) => entry.kind);
const readableDate = (raw: string | number | undefined) => {
  const text = String(raw ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [y, m, d] = text.split('-');
  return `${d}/${m}/${y}`;
};
function summary(row: GarageRecord, kind: OverviewKind) {
  const data = row.data;
  if (kind === 'maintenance') {
    const date = readableDate(data.date);
    const next = readableDate(data.nextDate);
    return [date && `Realizada em ${date}`, next && `Próxima: ${next}`]
      .filter(Boolean)
      .join(' · ');
  }
  if (kind === 'insurance' || kind === 'document') {
    const end = readableDate(data.endDate);
    return end ? `Vigência registrada até ${end}` : 'Sem vencimento informado';
  }
  return String(data.description ?? '').slice(0, 135);
}
export function GarageOverview({ bike }: { bike: Motorcycle }) {
  const [rows, setRows] = useState<Overview>({});
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.allSettled(keys.map((kind) => garageRecords.list(bike.id, kind, 1)))
      .then((results) => {
        if (!active) return;
        const next: Overview = {};
        let failed = false;
        for (const [index, result] of results.entries()) {
          if (result.status === 'fulfilled')
            next[keys[index]!] = result.value.items[0] ?? null;
          else failed = true;
        }
        setRows(next);
        setError(failed);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [bike.id]);
  if (bike.archivedAt) return null;
  return (
    <section
      className="garage-stage06-overview"
      aria-labelledby="garage-stage06-overview-title"
    >
      <div className="garage-stage06-section-heading">
        <div>
          <span className="eyebrow">ORGANIZAÇÃO DA MOTO</span>
          <h2 id="garage-stage06-overview-title">Documentos e manutenção</h2>
        </div>
        <ButtonLink to={`/garagem/${bike.id}`} variant="ghost">
          Ver registros
        </ButtonLink>
      </div>
      {loading && (
        <p role="status" className="garage-stage06-note">
          Carregando registros privados…
        </p>
      )}
      {error && (
        <p role="status" className="garage-stage06-note">
          Alguns registros não estão disponíveis. Confira na página da moto.
        </p>
      )}
      <div className="garage-stage06-records">
        {items.map(({ kind, label, Icon, description }) => {
          const row = rows[kind];
          const detail = row ? summary(row, kind) : description;
          return (
            <article className="garage-stage06-record" key={kind}>
              <div className="garage-stage06-record-icon">
                <Icon size={24} aria-hidden="true" />
              </div>
              <div className="garage-stage06-record-content">
                <span className="garage-stage06-card-label">{label}</span>
                <strong>
                  {row
                    ? String(row.data.title ?? label)
                    : loading
                      ? 'Consultando…'
                      : description}
                </strong>
                {row && detail && <small>{detail}</small>}
                {!row && !loading && (
                  <small>Adicione ou consulte no gerenciamento da moto.</small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="garage-stage06-record-footer">
        <CalendarClock size={17} aria-hidden="true" /> Esses registros são
        privados e não representam certificados ou validade consultada em órgãos
        oficiais.
      </div>
    </section>
  );
}
