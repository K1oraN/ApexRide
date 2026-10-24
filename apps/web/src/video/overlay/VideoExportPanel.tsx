import { useEffect, useRef, useState } from 'react';
import type { VideoSegment } from '../types';
import type { OverlayConfig } from './config';
import { exportCapabilities, extension } from './capabilities';
import { overlayRepository, type ExportRecord } from './repository';
import type { VideoTelemetryResolver } from './resolver';
import { exportVideo, type ExportProgress } from './export-service';

function fileName(job: ExportRecord) {
  return `apexride_${job.clientId.replace(/[^a-zA-Z0-9_-]/g, '_')}_segmento-${job.segmentId.replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension(job.mimeType)}`;
}
export function VideoExportPanel({
  owner,
  segment,
  source,
  config,
  change,
  resolve,
  onBusy,
}: {
  owner: string;
  segment: VideoSegment;
  source: Blob;
  config: OverlayConfig;
  change: (patch: Partial<OverlayConfig>) => void;
  resolve: VideoTelemetryResolver;
  onBusy: (value: boolean) => void;
}) {
  const [format, setFormat] = useState(''),
    [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({
    stage: 'Aguardando',
  });
  const [error, setError] = useState(''),
    [jobs, setJobs] = useState<ExportRecord[]>([]);
  const [output, setOutput] = useState<{
    job: ExportRecord;
    blob: Blob;
    url: string;
  } | null>(null);
  const objectUrl = useRef('');
  const url = output?.url ?? '';
  function display(job: ExportRecord, blob: Blob) {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob);
    setOutput({ job, blob, url: objectUrl.current });
  }
  const controller = useRef<AbortController | null>(null),
    live = useRef(true);
  const caps = exportCapabilities(config.audio && segment.audio);
  const mime = caps.formats.includes(format) ? format : (caps.formats[0] ?? '');
  useEffect(() => {
    live.current = true;
    void overlayRepository
      .list(owner, segment.clientId)
      .then((rows) => {
        if (live.current)
          setJobs(rows.filter((j) => j.segmentId === segment.id));
      })
      .catch((e) => {
        if (live.current) setError(e.message);
      });
    return () => {
      live.current = false;
      controller.current?.abort();
    };
  }, [owner, segment.id, segment.clientId]);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );
  async function start() {
    if (busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusy(true);
    setError('');
    setOutput(null);
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
    }
    try {
      const result = await exportVideo({
        owner,
        segment,
        source,
        config,
        mime,
        resolve,
        signal: abort.signal,
        progress: (p) => {
          if (live.current) setProgress(p);
        },
      });
      if (live.current) {
        const { blob, ...job } = result;
        display(job, blob);
        setJobs((j) => [...j, job]);
      }
    } catch (e) {
      if (live.current) {
        setProgress({ stage: abort.signal.aborted ? 'Cancelado' : 'Erro' });
        setError(
          abort.signal.aborted
            ? 'Exportação cancelada. O vídeo original permanece intacto.'
            : (e as Error).message,
        );
      }
    } finally {
      if (live.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  return (
    <section aria-label="Exportação com telemetria">
      <h3>Exportar com telemetria</h3>
      <p>
        Um arquivo por segmento. Mantenha o aplicativo aberto e a tela ativa; a
        composição ocorre em tempo real. O formato será confirmado ao finalizar.
        Limite do resultado: 128 MiB.
      </p>
      {segment.audio && (
        <label className="overlay-seek">
          Áudio da exportação
          <select
            value={config.audio ? 'original' : 'off'}
            disabled={busy}
            onChange={(e) => change({ audio: e.target.value === 'original' })}
          >
            <option value="off">Sem áudio (escolha explícita)</option>
            <option
              value="original"
              disabled={!exportCapabilities(true).formats.length}
            >
              Preservar áudio original quando validável
            </option>
          </select>
        </label>
      )}
      {segment.audio && !config.audio && (
        <p>
          O arquivo será produzido sem áudio. Para mantê-lo, selecione
          “Preservar áudio original”.
        </p>
      )}
      {!caps.formats.length && <p role="status">{caps.reason}</p>}
      {caps.formats.length > 0 && (
        <label className="overlay-seek">
          Formato de exportação
          <select
            aria-label="Formato de exportação"
            value={mime}
            disabled={busy}
            onChange={(e) => setFormat(e.target.value)}
          >
            {caps.formats.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="history-actions">
        <button
          className="button button-primary"
          disabled={
            busy ||
            !mime ||
            segment.state !== 'complete' ||
            !config.metrics.length
          }
          onClick={() => void start()}
        >
          {segment.audio && !config.audio
            ? 'Exportar vídeo com telemetria sem áudio'
            : 'Exportar vídeo com telemetria'}
        </button>
        {busy && (
          <button
            className="button"
            onClick={() => controller.current?.abort()}
          >
            Cancelar exportação
          </button>
        )}
      </div>
      <p role="status">
        Exportação: {progress.stage}
        {progress.percent !== undefined
          ? ` · ${Math.round(progress.percent)}%`
          : ''}
      </p>
      {busy && progress.percent !== undefined && (
        <progress
          max="100"
          value={progress.percent}
          aria-label="Progresso da exportação"
        />
      )}
      {error && <p role="alert">{error}</p>}
      {output && url && (
        <div>
          <p>
            Arquivo composto validado · {output.job.mimeType} ·{' '}
            {output.job.width} × {output.job.height} ·{' '}
            {output.job.duration.toFixed(1)} s ·{' '}
            {(output.blob.size / 1024 / 1024).toFixed(1)} MB ·{' '}
            {output.job.audio ? 'Com trilha original' : 'Sem áudio'}
          </p>
          <video
            src={url}
            playsInline
            controls
            aria-label="Arquivo exportado com telemetria"
          />
          <a className="button" href={url} download={fileName(output.job)}>
            Salvar vídeo com telemetria
          </a>
          {typeof navigator.share === 'function' && (
            <button
              className="button"
              onClick={() => {
                const file = new File([output.blob], fileName(output.job), {
                  type: output.job.mimeType,
                });
                if (!navigator.canShare?.({ files: [file] })) {
                  setError(
                    'Compartilhamento de arquivo indisponível; utilize Salvar.',
                  );
                  return;
                }
                if (
                  !window.confirm(
                    'O vídeo pode conter pessoas, placas, conversas e telemetria privada. Compartilhar este arquivo?',
                  )
                )
                  return;
                void navigator.share({ files: [file] }).catch((e) => {
                  if (e.name !== 'AbortError') setError(e.message);
                });
              }}
            >
              Compartilhar arquivo local
            </button>
          )}
        </div>
      )}
      {jobs.length > 0 && (
        <details>
          <summary>Exportações salvas neste aparelho ({jobs.length})</summary>
          {jobs.map((job) => (
            <div key={job.id} className="history-actions">
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  void overlayRepository
                    .blob(owner, job.id)
                    .then((blob) => {
                      if (live.current) display(job, blob);
                    })
                    .catch((e) => setError(e.message))
                }
              >
                Abrir {job.width} × {job.height} ·{' '}
                {new Date(job.createdAt).toLocaleString('pt-BR')} ·{' '}
                {job.audio ? 'Com áudio' : 'Sem áudio'}
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Excluir somente este arquivo exportado? O original será preservado.',
                    )
                  )
                    return;
                  void overlayRepository
                    .remove(owner, job.id)
                    .then(() => {
                      setJobs((rows) => rows.filter((j) => j.id !== job.id));
                      if (output?.job.id === job.id) {
                        setOutput(null);
                        if (objectUrl.current) {
                          URL.revokeObjectURL(objectUrl.current);
                          objectUrl.current = '';
                        }
                      }
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                Excluir exportação
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
