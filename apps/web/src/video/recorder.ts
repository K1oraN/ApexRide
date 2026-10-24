export const RECORDER_TIMEOUT_MS = 8000;
export function recorderMime(Recorder = MediaRecorder) {
  const mime = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ].find((type) => Recorder.isTypeSupported(type));
  if (!mime)
    throw new Error(
      'Nenhum formato de gravação compatível. Continue o Ride sem vídeo.',
    );
  return mime;
}
export interface RecorderResult {
  complete: boolean;
  captureComplete: boolean;
  reason: string;
  mimeType: string;
}
export class VideoRecorderService {
  private recorder: MediaRecorder;
  private writes = Promise.resolve();
  private pendingBytes = 0;
  private sequence = 0;
  private accepting = true;
  private failed = '';
  private captureFailed = false;
  private stopping = false;
  private settled = false;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private finishResolve!: (result: RecorderResult) => void;
  private result: Promise<RecorderResult>;
  private startReject: ((e: Error) => void) | null = null;
  private confirmed = false;
  private reason = 'Finalização solicitada';
  constructor(
    stream: MediaStream,
    bitrate: number,
    private readonly callbacks: {
      started: (mimeType: string) => Promise<void>;
      chunk: (blob: Blob, order: number, receivedAt: number) => Promise<void>;
      fault: (reason: string, error?: unknown) => void;
      ended: () => void;
    },
    Recorder = MediaRecorder,
  ) {
    if (
      !stream.active ||
      !stream.getVideoTracks().some((t) => t.readyState === 'live')
    )
      throw new Error('A câmera não está ativa.');
    this.recorder = new Recorder(stream, {
      mimeType: recorderMime(Recorder),
      videoBitsPerSecond: bitrate,
    });
    this.result = new Promise((resolve) => {
      this.finishResolve = resolve;
    });
    this.recorder.ondataavailable = ({ data }) => {
      if (!this.accepting || !data.size) return;
      const order = this.sequence++,
        receivedAt = Date.now();
      this.pendingBytes += data.size;
      // Stops growth from a slow disk; never retains a whole ride in an array.
      if (this.pendingBytes > 32 * 1024 * 1024)
        this.fault(
          'Armazenamento lento; vídeo interrompido para proteger a memória.',
        );
      this.writes = this.writes.then(async () => {
        try {
          await callbacks.chunk(data, order, receivedAt);
        } catch (error) {
          this.fault(
            'Falha ao persistir vídeo. Dados anteriores foram preservados.',
            error,
            false,
          );
        } finally {
          this.pendingBytes -= data.size;
        }
      });
    };
    this.recorder.onerror = () =>
      this.fault('Falha de codificação; o segmento pode estar incompleto.');
    this.recorder.onstop = () => {
      if (!this.stopping) this.fault('Gravador encerrou inesperadamente.');
      void this.complete(true);
    };
  }
  get mimeType() {
    return this.recorder.mimeType;
  }
  private fault(reason: string, error?: unknown, captureFailure = true) {
    this.captureFailed ||= captureFailure;
    if (!this.failed) {
      this.failed = reason;
      this.callbacks.fault(reason, error);
    }
    void this.stop(reason);
  }
  start() {
    return new Promise<void>((resolve, reject) => {
      if (this.recorder.state !== 'inactive' || this.stopping) {
        reject(new Error('Gravador já utilizado.'));
        return;
      }
      this.startReject = reject;
      this.recorder.onstart = () => {
        clearTimeout(this.startTimer);
        if (this.stopping) {
          reject(new Error('Início cancelado.'));
          return;
        }
        this.confirmed = true;
        const started = this.writes.then(() =>
          this.callbacks.started(this.mimeType),
        );
        this.writes = started.catch((error) => {
          this.fault('Não foi possível confirmar o início local.', error);
        });
        void started.then(resolve, reject);
      };
      this.startTimer = setTimeout(() => {
        this.fault('O navegador não confirmou o início da gravação.');
        reject(new Error(this.failed));
      }, RECORDER_TIMEOUT_MS);
      try {
        this.recorder.start(2000);
      } catch (error) {
        this.fault('Não foi possível iniciar o gravador.', error);
        reject(error);
      }
    });
  }
  stop(reason = 'Finalização solicitada') {
    if (this.stopping) return this.result;
    this.stopping = true;
    this.reason = reason;
    clearTimeout(this.startTimer);
    if (!this.confirmed)
      this.startReject?.(new Error('Início não confirmado.'));
    this.stopTimer = setTimeout(() => {
      this.failed ||=
        'O navegador não confirmou o encerramento; arquivo incompleto.';
      void this.complete(false);
    }, RECORDER_TIMEOUT_MS);
    try {
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      else void this.complete(false);
    } catch {
      void this.complete(false);
    }
    return this.result;
  }
  private async complete(stopped: boolean) {
    if (this.settled) return;
    this.settled = true;
    this.accepting = false;
    clearTimeout(this.startTimer);
    clearTimeout(this.stopTimer);
    // stop follows the final dataavailable event; drain all confirmed writes.
    await this.writes.catch(() => {
      this.failed ||= 'Persistência incompleta.';
    });
    this.finishResolve({
      complete: stopped && this.confirmed && !this.failed,
      captureComplete: stopped && this.confirmed && !this.captureFailed,
      reason: this.failed || this.reason,
      mimeType: this.mimeType,
    });
    this.callbacks.ended();
  }
}
