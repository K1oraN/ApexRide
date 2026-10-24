import { BIKE_CATEGORIES, CC_BANDS } from '@apex-ride/ride-core/comparison';
import { useEffect, useState } from 'react';
import { Button, Combobox, SelectField } from '../components/design-system';
import { similarityService } from './service';
export function CommunityDiscovery() {
  const [open, setOpen] = useState(false),
    [regions, setRegions] = useState<
      { id: string; city: string; state: string }[]
    >([]),
    [region, setRegion] = useState(''),
    [category, setCategory] = useState('Não classificada'),
    [band, setBand] = useState('0'),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void similarityService
      .regions()
      .then((r) => {
        if (live) setRegions(r.regions);
      })
      .catch(() => {
        if (live) setMessage('Descoberta indisponível sem conexão.');
      });
    return () => {
      live = false;
    };
  }, [open]);
  async function search() {
    setBusy(true);
    try {
      const r = await similarityService.community(
        new URLSearchParams({ regionId: region, category, ccBand: band }),
      );
      setMessage(
        r.message +
          (r.available
            ? ` Cerca de ${r.summary!.approximateKm} km compartilhados.`
            : ''),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel history-panel">
      <details onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Descobertas de trajetos semelhantes</summary>
        <p>
          Agregados regionais de atividades com autorização específica. Trajetos
          detectados não criam rotas cadastradas. Não são publicados mapas,
          identidades, horários ou telemetria individual.
        </p>
        {open && (
          <>
            <div className="comparison-filters">
              <Combobox
                label="Região administrativa"
                value={region}
                onChange={setRegion}
                placeholder="Busque uma região disponível"
                options={regions.map((r) => ({
                  value: r.id,
                  label: `${r.city} / ${r.state}`,
                }))}
                disabled={!regions.length}
                hint="Somente regiões com dados disponíveis."
              />
              <SelectField
                label="Categoria"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {BIKE_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </SelectField>
              <SelectField
                label="Cilindrada"
                value={band}
                onChange={(e) => setBand(e.target.value)}
              >
                {CC_BANDS.map(([a, b], i) => (
                  <option value={i} key={i}>
                    {i === 4 ? 'Acima de 1000 cc' : `${a}–${b} cc`}
                  </option>
                ))}
              </SelectField>
            </div>
            {!regions.length && (
              <p>
                Nenhuma região administrativa está disponível para descoberta
                comunitária.
              </p>
            )}
            <Button
              variant="secondary"
              loading={busy}
              disabled={busy || !region}
              onClick={() => void search()}
            >
              Consultar agregados autorizados
            </Button>
            {message && <p role="status">{message}</p>}
          </>
        )}
      </details>
    </section>
  );
}
