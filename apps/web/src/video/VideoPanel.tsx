import { useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { useRide } from '../ride/context';
import { formatDuration } from '../ride/format';
import { useRideVideo } from './context';
import {
  presets,
  videoLabels,
  type CameraFacing,
  type VideoQuality,
} from './types';
import '../styles/video.css';

export function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => {});
    return () => {
      element.srcObject = null;
    };
  }, [stream]);
  return (
    <video ref={ref} autoPlay muted playsInline aria-label="Prévia da câmera" />
  );
}
export function VideoStatus() {
  const { video, snapshot } = useRideVideo();
  return (
    <div className="video-status" aria-live="polite">
      <strong className={snapshot.state === 'recording' ? 'video-rec' : ''}>
        {videoLabels[snapshot.state]}
      </strong>
      <span>
        ~{formatDuration(snapshot.estimatedMs)} estimados ·{' '}
        {(snapshot.bytes / 1024 / 1024).toFixed(1)} MB confirmados
      </span>
      {snapshot.error && (
        <p>{snapshot.error} Você pode continuar somente com telemetria.</p>
      )}
      {snapshot.pendingBytes > 0 && (
        <div>
          <p>
            {(snapshot.pendingBytes / 1024 / 1024).toFixed(1)} MB ainda somente
            na memória. Fechar ou recarregar perde esses blocos.
          </p>
          <button
            className="button"
            disabled={snapshot.busy}
            onClick={() => void video.retryPending()}
          >
            Tentar persistir vídeo novamente
          </button>
          <button
            className="text-link"
            disabled={snapshot.busy}
            onClick={() => {
              if (
                window.confirm(
                  'Descartar somente os blocos de vídeo ainda não persistidos? Os trechos já salvos permanecem no aparelho.',
                )
              )
                video.discardPending();
            }}
          >
            Descartar blocos não persistidos
          </button>
        </div>
      )}
    </div>
  );
}
export function VideoPanel({ preparation = false }: { preparation?: boolean }) {
  const { user } = useAuth(),
    { snapshot: ride } = useRide(),
    { video, snapshot } = useRideVideo();
  const configurable = !ride.activity || ride.state === 'paused';
  const settings = snapshot.settings;
  useEffect(
    () => () => {
      if (!video.controller.getSnapshot().activity) void video.disable();
    },
    [video],
  );
  if (!preparation)
    return (
      <section
        className="camera-panel panel video-panel"
        aria-label="Vídeo do Ride"
      >
        <div className="camera-heading">
          <Camera size={21} /> CÂMERA · PRÉVIA
        </div>
        {snapshot.stream ? (
          <CameraPreview stream={snapshot.stream} />
        ) : (
          <div className="video-placeholder">Câmera desligada</div>
        )}
        <strong className={snapshot.state === 'recording' ? 'video-rec' : ''}>
          {videoLabels[snapshot.state]}
        </strong>
      </section>
    );
  return (
    <section
      className="ride-preparation panel video-preparation"
      aria-label="Configuração de vídeo"
    >
      <h2>Vídeo opcional · somente neste aparelho</h2>
      <VideoStatus />
      {configurable && (
        <div className="video-settings">
          <label>
            Câmera
            <select
              aria-label="Câmera do vídeo"
              disabled={snapshot.busy}
              value={settings.facing}
              onChange={(e) =>
                video.settings({
                  ...settings,
                  facing: e.target.value as CameraFacing,
                  deviceId: undefined,
                })
              }
            >
              <option value="environment">Traseira</option>
              <option value="user">Frontal</option>
            </select>
          </label>
          {snapshot.devices.length > 1 && (
            <label>
              Lente disponível
              <select
                aria-label="Lente disponível"
                disabled={snapshot.busy}
                value={settings.deviceId ?? ''}
                onChange={(e) =>
                  video.settings({
                    ...settings,
                    deviceId: e.target.value || undefined,
                  })
                }
              >
                <option value="">Preferência frontal/traseira</option>
                {snapshot.devices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Câmera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Qualidade
            <select
              aria-label="Qualidade do vídeo"
              disabled={snapshot.busy}
              value={settings.quality}
              onChange={(e) =>
                video.settings({
                  ...settings,
                  quality: e.target.value as VideoQuality,
                })
              }
            >
              {Object.entries(presets).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="video-audio">
            <input
              type="checkbox"
              checked={settings.audio}
              disabled={snapshot.busy}
              onChange={(e) =>
                video.settings({ ...settings, audio: e.target.checked })
              }
            />{' '}
            Gravar áudio (solicita microfone)
          </label>
          {settings.audio && (
            <p>
              O áudio pode registrar conversas e sons de terceiros. Se o
              microfone falhar, desative esta opção para tentar somente vídeo.
            </p>
          )}
          <button
            className="button"
            disabled={!user || snapshot.busy}
            onClick={() => void video.prepare()}
          >
            {snapshot.stream
              ? 'Preparar câmera novamente'
              : 'Ativar vídeo e abrir prévia'}
          </button>
        </div>
      )}
      {(snapshot.enabled || snapshot.stream || snapshot.busy) && (
        <button className="text-link" onClick={() => void video.disable()}>
          Continuar sem vídeo / encerrar câmera
        </button>
      )}
      {snapshot.applied && (
        <p>
          Captura obtida:{' '}
          {snapshot.applied.facingMode === 'user'
            ? 'frontal'
            : snapshot.applied.facingMode === 'environment'
              ? 'traseira'
              : 'orientação não informada'}{' '}
          · {snapshot.applied.width ?? '—'} × {snapshot.applied.height ?? '—'} ·{' '}
          {snapshot.applied.frameRate
            ? `${Math.round(snapshot.applied.frameRate)} fps`
            : 'fps não informado'}
          . Qualidade solicitada: {presets[settings.quality].label}.
        </p>
      )}
      <p>
        Configure ou troque a câmera com a moto parada, antes de iniciar ou
        durante uma pausa. A prévia não grava. O Ride inicia o vídeo quando a
        câmera estiver pronta.
      </p>
      <details>
        <summary>Armazenamento e privacidade</summary>
        <p>{snapshot.storage || 'Espaço será consultado antes da gravação.'}</p>
        <button className="text-link" onClick={() => void video.monitor(true)}>
          Solicitar persistência local
        </button>
        <p>
          Somente neste aparelho, sem upload. Filmagens podem envolver a
          privacidade de terceiros e estão sujeitas à legislação aplicável.
          Vídeo, GPS e sensores consomem bateria e podem aquecer o aparelho.
          Bloqueio de tela ou troca de aplicativo interrompem a captura; retome
          explicitamente durante uma pausa.
        </p>
      </details>
    </section>
  );
}
