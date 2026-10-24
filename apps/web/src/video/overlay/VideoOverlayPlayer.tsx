import { ChoiceSelect } from '../../components/design-system';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Select } from '../../components/design-system';
import { offlineRepository } from '../../offline/repository';
import { loadServerReplay, localReplay } from '../../replay/load';
import type { ReplayInput } from '../../replay/timeline';
import { videoRepository } from '../repository';
import { presets, type VideoSegment } from '../types';
import { observeVideoFrames } from './clock';
import {
  defaultOverlay,
  layoutMetrics,
  metricLabels,
  type Layout,
  type Metric,
  type OverlayConfig,
} from './config';
import { overlayTime } from './format';
import { loadMedia } from './media';
import { composeFrame } from './renderer';
import { overlayRepository } from './repository';
import { prepareVideoTelemetry } from './resolver';
import { VideoExportPanel } from './VideoExportPanel';

export function VideoOverlayEntry({
  owner,
  segment,
  serverId,
  historicalBike,
}: {
  owner: string;
  segment: VideoSegment;
  serverId?: string | undefined;
  historicalBike?: string | undefined;
}) {
  const [data, setData] = useState<{
    input: ReplayInput;
    bike: string | null;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      const local = await offlineRepository
        .read(owner, segment.clientId)
        .catch(() => null);
      let input: ReplayInput,
        bike: string | null = historicalBike ?? null;
      if (local?.activity.payload.endedAt) {
        input = localReplay(local.activity.payload);
        bike = `${local.activity.bike.brand} ${local.activity.bike.model}`;
      } else if (serverId)
        input = await loadServerReplay(serverId, abort.signal, () => {});
      else
        throw new Error(
          'Telemetria local indisponível. Abra a atividade salva no Histórico quando disponível. O vídeo original permanece acessível.',
        );
      if (input.payload.clientId !== segment.clientId)
        throw new Error('Telemetria pertence a outra atividade.');
      if (!abort.signal.aborted) setData({ input, bike });
    })().catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    return () => abort.abort();
  }, [owner, segment.clientId, serverId, historicalBike]);
  return error ? (
    <p role="alert">{error}</p>
  ) : data ? (
    <VideoOverlayPlayer
      owner={owner}
      segment={segment}
      input={data.input}
      bike={data.bike}
    />
  ) : (
    <p role="status">Carregando telemetria histórica…</p>
  );
}

export function VideoOverlayPlayer({
  owner,
  segment,
  input,
  bike,
}: {
  owner: string;
  segment: VideoSegment;
  input: ReplayInput;
  bike: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null);
  const [config, setConfig] = useState<OverlayConfig>(() => ({
    ...defaultOverlay(segment.id),
    layout: 'compact',
    metrics: ['speed', 'distance', 'time'],
  }));
  const [url, setUrl] = useState(''),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [duration, setDuration] = useState(0),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [enabled, setEnabled] = useState(true),
    [message, setMessage] = useState('');
  const [status, setStatus] = useState('Preparando prévia');
  const [source, setSource] = useState<Blob | null>(null),
    [exporting, setExporting] = useState(false);
  const resolve = useMemo(
    () => prepareVideoTelemetry(input, bike),
    [input, bike],
  );
  useEffect(() => {
    let live = true;
    void overlayRepository
      .config(owner, segment.id)
      .then((c) => {
        if (live && c) setConfig(c);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      });
    return () => {
      live = false;
    };
  }, [owner, segment.id]);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl = '';
    void (async () => {
      const blob = await videoRepository.blob(
        owner,
        segment.id,
        segment.state === 'incomplete',
      );
      if (abort.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setSource(blob);
      const video = videoRef.current!;
      await loadMedia(video, objectUrl, abort.signal);
      if (abort.signal.aborted) return;
      setDuration(video.duration);
      setReady(true);
      setStatus('Pausado');
      const canvas = canvasRef.current!;
      const scale = Math.min(
        1,
        1280 / Math.max(video.videoWidth, video.videoHeight),
      );
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
    })().catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    const element = videoRef.current;
    return () => {
      abort.abort();
      if (element) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [owner, segment.id, segment.state]);
  useEffect(() => {
    const video = videoRef.current,
      ctx = canvasRef.current?.getContext('2d');
    if (!ready || !video || !ctx) return;
    return observeVideoFrames(video, (seconds) =>
      composeFrame(
        ctx,
        video,
        resolve(segment, seconds, config.offsetMs),
        config,
        enabled,
      ),
    );
  }, [ready, resolve, segment, config, enabled]);
  const change = (patch: Partial<OverlayConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));
  const current = resolve(segment, time, config.offsetMs);
  return (
    <section
      className="video-overlay"
      aria-label={`Telemetria do segmento ${segment.order + 1}`}
    >
      <h3>Assistir com telemetria · Segmento {segment.order + 1}</h3>
      <p>
        Prévia local · sincronização aproximada pelas referências da gravação.
        Inclinação e força G são estimativas. “—” indica medição indisponível.
      </p>
      {segment.state === 'incomplete' && (
        <p role="alert">
          Trecho recuperável de gravação incompleta. Reprodução não confirma
          integridade; exportação composta desativada.
        </p>
      )}
      <video
        ref={videoRef}
        className="overlay-source"
        playsInline
        preload="auto"
        aria-hidden="true"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => {
          setPlaying(true);
          setStatus('Reproduzindo');
        }}
        onPause={(e) => {
          setTime(e.currentTarget.currentTime);
          setPlaying(false);
          setStatus('Pausado');
        }}
        onWaiting={() => setStatus('Carregando frame…')}
        onPlaying={() => setStatus('Reproduzindo')}
        onEnded={() => {
          setPlaying(false);
          setStatus('Finalizado');
        }}
      />
      <canvas
        ref={canvasRef}
        className="overlay-preview"
        aria-label="Prévia de vídeo com indicadores incorporados"
      />
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={exporting} className="overlay-controls">
        <legend>Reprodução e configuração</legend>
        <div className="history-actions">
          <Button
            variant="secondary"
            disabled={!ready}
            onClick={() => {
              const v = videoRef.current!;
              if (v.paused) void v.play().catch((e) => setError(e.message));
              else v.pause();
            }}
          >
            {playing ? 'Pausar vídeo' : 'Reproduzir vídeo'}
          </Button>
          <label>
            <Checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Mostrar overlay
          </label>
        </div>
        <label className="overlay-seek">
          Linha do tempo do vídeo · {overlayTime(time * 1000)} /{' '}
          {overlayTime(duration * 1000)}
          <input
            aria-label="Posição do vídeo"
            type="range"
            min="0"
            max={duration || 1}
            step="0.01"
            value={time}
            disabled={!ready}
            onChange={(e) => {
              const t = Number(e.target.value);
              videoRef.current!.currentTime = t;
              setTime(t);
            }}
          />
        </label>
        <p role="status">
          {status} ·{' '}
          {current
            ? `Ride: ${(current.mapped.elapsed / 1000).toFixed(1)} s · sincronização ${current.mapped.quality === 'manual' ? 'ajustada' : 'aproximada'}`
            : 'Sincronização indisponível'}
        </p>
        <details>
          <summary>Configurar overlay</summary>
          <div className="video-settings">
            <label>
              Velocidade de reprodução
              <Select
                aria-label="Velocidade de reprodução"
                defaultValue="1"
                onChange={(e) => {
                  videoRef.current!.playbackRate = Number(e.target.value);
                }}
              >
                {[0.5, 1, 2, 4].map((v) => (
                  <option key={v} value={v}>
                    {v}×
                  </option>
                ))}
              </Select>
            </label>
            <div>
              <span>Layout</span>
              <ChoiceSelect
                aria-label="Layout"
                value={config.layout}
                onChange={(e) => {
                  const layout = e.target.value as Layout;
                  change({ layout, metrics: layoutMetrics(layout) });
                }}
              >
                <option value="compact">Compacto</option>
                <option value="full">Completo</option>
                <option value="track">Pista</option>
              </ChoiceSelect>
            </div>
            <div>
              <span>Posição dos indicadores</span>
              <ChoiceSelect
                aria-label="Posição dos indicadores"
                value={config.position}
                onChange={(e) =>
                  change({
                    position: e.target.value as OverlayConfig['position'],
                  })
                }
              >
                <option value="left">Inferior esquerdo</option>
                <option value="right">Inferior direito</option>
              </ChoiceSelect>
            </div>
            <div>
              <span>Referência de tempo</span>
              <ChoiceSelect
                aria-label="Referência de tempo"
                value={config.time}
                onChange={(e) =>
                  change({ time: e.target.value as OverlayConfig['time'] })
                }
              >
                <option value="active">Tempo ativo</option>
                <option value="elapsed">Tempo decorrido</option>
              </ChoiceSelect>
            </div>
          </div>
          <fieldset className="overlay-metrics">
            <legend>Indicadores</legend>
            {Object.entries(metricLabels).map(([key, label]) => (
              <label key={key}>
                <Checkbox
                  checked={config.metrics.includes(key as Metric)}
                  onChange={(e) =>
                    change({
                      metrics: e.target.checked
                        ? [...config.metrics, key as Metric]
                        : config.metrics.filter((m) => m !== key),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Ajustar sincronização</legend>
            <p>
              {(config.offsetMs / 1000).toFixed(1)} s · positivo consulta
              telemetria posterior; negativo consulta anterior.
            </p>
            <div className="history-actions">
              <Button
                variant="secondary"
                disabled={config.offsetMs <= -60000}
                onClick={() => change({ offsetMs: config.offsetMs - 100 })}
              >
                −0,1 s
              </Button>
              <Button
                variant="secondary"
                disabled={config.offsetMs >= 60000}
                onClick={() => change({ offsetMs: config.offsetMs + 100 })}
              >
                +0,1 s
              </Button>
              <Button
                variant="secondary"
                onClick={() => change({ offsetMs: 0 })}
              >
                Restaurar sincronização original
              </Button>
            </div>
          </fieldset>
          <div className="history-actions">
            <Button
              variant="secondary"
              onClick={() =>
                void overlayRepository
                  .saveConfig(owner, config)
                  .then(() => setMessage('Configuração salva neste aparelho.'))
                  .catch((e) => setMessage(e.message))
              }
            >
              Salvar configuração local
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void overlayRepository
                  .preference(owner)
                  .then((c) => {
                    if (c)
                      setConfig({
                        ...c,
                        segmentId: segment.id,
                        offsetMs: config.offsetMs,
                        audio: false,
                      });
                    setMessage(
                      c
                        ? 'Preferência de layout aplicada.'
                        : 'Nenhuma preferência salva.',
                    );
                  })
                  .catch((e) => setMessage(e.message))
              }
            >
              Aplicar meu layout salvo
            </Button>
          </div>
        </details>
        <div className="video-settings">
          <label>
            Qualidade de exportação
            <Select
              value={config.quality}
              onChange={(e) =>
                change({ quality: e.target.value as OverlayConfig['quality'] })
              }
            >
              {Object.entries(presets).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </fieldset>
      {source && ready && (
        <VideoExportPanel
          owner={owner}
          segment={segment}
          source={source}
          config={config}
          change={change}
          resolve={resolve}
          onBusy={(value) => {
            if (value) videoRef.current?.pause();
            setExporting(value);
          }}
        />
      )}
      {url && (
        <a
          className="text-link"
          href={url}
          download={`apexride_${segment.state === 'incomplete' ? 'recuperavel' : 'original'}_segmento-${segment.order + 1}.${segment.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`}
        >
          {segment.state === 'incomplete'
            ? 'Salvar trecho recuperável (incompleto)'
            : 'Salvar original sem overlay'}
        </a>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
