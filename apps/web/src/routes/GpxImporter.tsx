import { useEffect, useRef, useState } from 'react';
import { Button, Select } from '../components/design-system';
import type { GpxImport, GpxPoint } from './gpx';
export function GpxImporter({
  onImport,
  disabled,
}: {
  onImport: (points: GpxPoint[], name: string) => void;
  disabled: boolean;
}) {
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, setResult] = useState<GpxImport | null>(null),
    [segment, setSegment] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
  }
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  async function load(file: File | undefined) {
    if (!file) return;
    stop();
    setResult(null);
    setError('');
    if (!/\.gpx$/i.test(file.name) || file.size > 2_000_000 || !file.size) {
      setError('Selecione um arquivo .gpx válido com até 2 MB.');
      return;
    }
    setBusy(true);
    try {
      const xml = await file.text();
      const current = new Worker(new URL('./gpx.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = current;
      current.onmessage = (
        event: MessageEvent<{ result?: GpxImport; error?: string }>,
      ) => {
        stop();
        setBusy(false);
        if (event.data.error) setError(event.data.error);
        else {
          setResult(event.data.result!);
          setSegment(0);
        }
      };
      current.onerror = () => {
        stop();
        setBusy(false);
        setError('Não foi possível processar o GPX.');
      };
      timer.current = setTimeout(() => {
        stop();
        setBusy(false);
        setError('O processamento excedeu o tempo permitido.');
      }, 10000);
      current.postMessage(xml);
    } catch {
      stop();
      setBusy(false);
      setError('Não foi possível ler o arquivo.');
    }
  }
  return (
    <details className="gpx-import">
      <summary>Importar GPX como planejamento</summary>
      <p>
        Até 2 MB e 10.000 pontos. Segmentos e lacunas são separados. A
        importação cria somente um plano privado, sem Ride, XP ou conquistas.
      </p>
      <label>
        Arquivo GPX
        <input
          type="file"
          accept=".gpx,application/gpx+xml"
          disabled={disabled || busy}
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </label>
      {busy && <p role="status">Analisando GPX…</p>}
      {error && <p role="alert">{error}</p>}
      {result && (
        <div>
          <p>
            {result.segments.length} segmento(s) contínuo(s) ·{' '}
            {result.duplicates} duplicata(s) removida(s).{' '}
            {result.timed &&
              'Horários serão descartados: esta importação não é um registro de atividade.'}
          </p>
          <label>
            Segmento a revisar
            <Select
              value={segment}
              onChange={(e) => setSegment(Number(e.target.value))}
            >
              {result.segments.map((s, i) => (
                <option key={i} value={i}>
                  Segmento {i + 1} · {s.length} pontos
                </option>
              ))}
            </Select>
          </label>
          <div className="route-tools">
            <Button
              disabled={disabled}
              onClick={() => {
                onImport(result.segments[segment]!, result.name);
                setResult(null);
              }}
            >
              Usar segmento no rascunho
            </Button>
            <Button variant="ghost" onClick={() => setResult(null)}>
              Cancelar importação
            </Button>
          </div>
        </div>
      )}
    </details>
  );
}
