import type { VideoSegment } from '../types';
import type { OverlayConfig } from './config';
import { exportCapabilities, exportSize } from './capabilities';
import {
  overlayRepository,
  MAX_EXPORT_BYTES,
  type ExportRecord,
  type OverlayRepository,
} from './repository';
import { abortable, loadMedia, releaseMedia } from './media';
import { observeVideoFrames } from './clock';
import { composeFrame } from './renderer';
import type { VideoTelemetryResolver } from './resolver';
import { validateExport } from './validation';

export interface ExportProgress {
  stage: string;
  percent?: number;
}
let running = false;
export async function exportVideo(options: {
  owner: string;
  segment: VideoSegment;
  source: Blob;
  config: OverlayConfig;
  mime: string;
  resolve: VideoTelemetryResolver;
  signal: AbortSignal;
  progress: (value: ExportProgress) => void;
  repository?: OverlayRepository;
}) {
  if (running) throw new Error('Já existe uma exportação em andamento.');
  const { owner, segment, source, config, mime, resolve, signal, progress } =
    options;
  if (
    segment.ownerId !== owner ||
    segment.state !== 'complete' ||
    config.segmentId !== segment.id
  )
    throw new Error('Segmento não está disponível para exportação íntegra.');
  if (!config.metrics.length)
    throw new Error(
      'Selecione pelo menos um indicador para exportar com telemetria.',
    );
  const audio = config.audio && segment.audio;
  if (!exportCapabilities(audio).formats.includes(mime))
    throw new Error('Formato de codificação indisponível.');
  if (document.visibilityState === 'hidden')
    throw new Error('Mantenha o aplicativo visível durante a exportação.');
  running = true;
  const repo = options.repository ?? overlayRepository;
  const id = crypto.randomUUID(),
    abort = new AbortController();
  const combined = AbortSignal.any([signal, abort.signal]);
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = !audio;
  video.className = 'overlay-source';
  video.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.append(video);
  let url = '',
    stream: MediaStream | null = null,
    recorder: MediaRecorder | null = null;
  let context: AudioContext | null = null,
    sourceNode: MediaElementAudioSourceNode | null = null;
  let destination: MediaStreamAudioDestinationNode | null = null;
  let stopDraw: (() => void) | undefined,
    created = false,
    completed = false;
  let writeQueue = Promise.resolve(),
    pending = 0,
    writeError: unknown;
  let lastMedia = 0,
    lastAdvance = performance.now(),
    drew = 0,
    lastDrawMedia = 0;
  let monitor: ReturnType<typeof setInterval> | undefined;
  const hidden = () => {
    if (document.visibilityState === 'hidden')
      abort.abort(
        new Error(
          'Exportação interrompida ao ocultar o aplicativo. Original preservado.',
        ),
      );
  };
  document.addEventListener('visibilitychange', hidden);
  try {
    progress({ stage: 'Preparando' });
    combined.throwIfAborted();
    // Resume in the initiating user gesture, before asynchronous media/storage work.
    if (audio) {
      context = new AudioContext();
      sourceNode = context.createMediaElementSource(video);
      destination = context.createMediaStreamDestination();
      sourceNode.connect(destination);
      await context.resume();
      if (context.state !== 'running')
        throw new Error(
          'Áudio indisponível. Escolha explicitamente exportar sem áudio.',
        );
    }
    url = URL.createObjectURL(source);
    await loadMedia(video, url, combined);
    if (!resolve(segment, 0, config.offsetMs) && !segment.start)
      throw new Error('Referência de sincronização indisponível.');
    const size = exportSize(
      video.videoWidth,
      video.videoHeight,
      config.quality,
      segment.applied.frameRate,
    );
    const estimatedBytes =
      (((size.bitrate + (audio ? 128000 : 0)) * video.duration) / 8) * 1.25;
    if (estimatedBytes > MAX_EXPORT_BYTES)
      throw new Error(
        'Resultado estimado excede 128 MiB. Escolha qualidade menor ou um segmento menor.',
      );
    const estimate = await navigator.storage?.estimate?.();
    if (
      estimate?.quota !== undefined &&
      estimate.quota - (estimate.usage ?? 0) < estimatedBytes + 8 * 1024 * 1024
    )
      throw new Error(
        'Espaço local insuficiente para exportar. O original foi preservado.',
      );
    combined.throwIfAborted();
    progress({ stage: 'Verificando formato' });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    composeFrame(ctx, video, resolve(segment, 0, config.offsetMs), config);
    stream = canvas.captureStream(size.fps);
    if (destination)
      destination.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    if (audio && !stream.getAudioTracks().length)
      throw new Error('Trilha original não pôde ser encaminhada.');
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: size.bitrate,
      ...(audio ? { audioBitsPerSecond: 128000 } : {}),
    });
    if (recorder.mimeType.split(';')[0] !== mime.split(';')[0])
      throw new Error('Codificador retornou formato diferente do solicitado.');
    const record: ExportRecord = {
      id,
      ownerId: owner,
      clientId: segment.clientId,
      segmentId: segment.id,
      config: structuredClone(config),
      createdAt: Date.now(),
      mimeType: recorder.mimeType,
      width: size.width,
      height: size.height,
      duration: video.duration,
      audio,
      bytes: 0,
      chunks: 0,
      state: 'encoding',
      leaseUntil: Date.now() + 60000,
    };
    await repo.begin(record);
    created = true;
    const localRecorder = recorder;
    // Catch stop immediately, including stop-on-error; do not lose final dataavailable.
    const stopped = new Promise<void>((res) => {
      localRecorder.onstop = () => res();
    });
    recorder.onerror = () =>
      abort.abort(
        new Error(
          'Falha no codificador. Tente qualidade menor ou outro formato.',
        ),
      );
    recorder.ondataavailable = (e) => {
      if (!e.data.size || writeError) return;
      pending += e.data.size;
      if (pending > 16 * 1024 * 1024) {
        abort.abort(new Error('Armazenamento não acompanha o codificador.'));
        return;
      }
      writeQueue = writeQueue
        .then(() => repo.append(owner, id, e.data))
        .catch((error) => {
          writeError = error;
          abort.abort(
            new Error(
              'Falha ao salvar exportação local: ' + (error as Error).message,
            ),
          );
        })
        .finally(() => {
          pending -= e.data.size;
        });
    };
    stopDraw = observeVideoFrames(video, (seconds) => {
      if (combined.aborted) return;
      composeFrame(
        ctx,
        video,
        resolve(segment, seconds, config.offsetMs),
        config,
      );
      drew++;
      lastDrawMedia = seconds;
    });
    const finished = new Promise<void>((res, rej) => {
      const finish = () => {
        clean();
        res();
      };
      const cancel = () => {
        clean();
        rej(combined.reason);
      };
      const fail = () => {
        clean();
        rej(new Error('Decodificação da fonte interrompida.'));
      };
      const wait = () => {
        if (localRecorder.state === 'recording') localRecorder.pause();
      };
      const resume = () => {
        if (localRecorder.state === 'paused') localRecorder.resume();
      };
      const clean = () => {
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', fail);
        video.removeEventListener('waiting', wait);
        video.removeEventListener('playing', resume);
        combined.removeEventListener('abort', cancel);
      };
      video.addEventListener('ended', finish, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.addEventListener('waiting', wait);
      video.addEventListener('playing', resume);
      combined.addEventListener('abort', cancel, { once: true });
      if (combined.aborted) cancel();
    });
    // Attach rejection before awaiting play (which itself can reject).
    void finished.catch(() => {});
    recorder.start(1000);
    progress({ stage: 'Processando frames / codificando', percent: 0 });
    const began = performance.now();
    monitor = setInterval(() => {
      const now = performance.now();
      if (video.currentTime > lastMedia + 0.01) {
        lastMedia = video.currentTime;
        lastAdvance = now;
      }
      if (
        now - lastAdvance > 15000 ||
        now - began > video.duration * 1750 + 30000 ||
        (video.currentTime - lastDrawMedia > 2 && !video.seeking) ||
        (context && context.state !== 'running')
      )
        abort.abort(
          new Error(
            'Exportação suspensa ou atrasada; arquivo parcial descartado.',
          ),
        );
      progress({
        stage: 'Processando frames / codificando',
        percent: Math.min(100, (100 * video.currentTime) / video.duration),
      });
    }, 250);
    await abortable(video.play(), combined);
    await finished;
    clearInterval(monitor);
    monitor = undefined;
    combined.throwIfAborted();
    if (
      !drew ||
      lastDrawMedia < video.duration - Math.max(0.5, video.duration * 0.05)
    )
      throw new Error('Frames finais não confirmados.');
    progress({ stage: 'Finalizando arquivo' });
    if (recorder.state !== 'inactive') recorder.stop();
    await abortable(
      Promise.race([
        stopped,
        new Promise<never>((_, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Codificador não finalizou.')),
            10000,
          );
          void stopped.finally(() => clearTimeout(timeout));
        }),
      ]),
      combined,
    );
    await writeQueue;
    combined.throwIfAborted();
    if (writeError) throw writeError;
    progress({ stage: 'Validando' });
    const blob = await repo.blob(owner, id);
    const verified = await validateExport(
      blob,
      video.duration,
      record.mimeType,
      audio,
      combined,
    );
    if (verified.width !== size.width || verified.height !== size.height)
      throw new Error('Resolução exportada difere da solicitada.');
    combined.throwIfAborted();
    const completedRecord = await repo.complete(owner, id, verified);
    completed = true;
    progress({ stage: 'Concluído', percent: 100 });
    return { ...completedRecord, blob };
  } finally {
    abort.abort();
    if (monitor) clearInterval(monitor);
    document.removeEventListener('visibilitychange', hidden);
    stopDraw?.();
    video.pause();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (recorder) recorder.ondataavailable = null;
    stream?.getTracks().forEach((t) => t.stop());
    sourceNode?.disconnect();
    destination?.disconnect();
    if (context) await context.close().catch(() => {});
    releaseMedia(video);
    if (url) URL.revokeObjectURL(url);
    await writeQueue;
    if (created && !completed) await repo.remove(owner, id).catch(() => {});
    running = false;
  }
}
