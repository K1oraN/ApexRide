import { ChoiceSelect } from '../components/design-system';
import { Camera, SwitchCamera } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/useAuth';
import {
  Button,
  Checkbox,
  SegmentedControl,
  Select,
} from '../components/design-system';
import { useRide } from '../ride/context';
import { formatDuration } from '../ride/format';
import '../styles/video.css';
import { useRideVideo } from './context';
import {
  presets,
  videoLabels,
  type CameraFacing,
  type VideoQuality,
} from './types';

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
      {snapshot.state !== 'disabled' && snapshot.state !== 'preview' && (
        <span>
          ~{formatDuration(snapshot.estimatedMs)} estimados ·{' '}
          {(snapshot.bytes / 1024 / 1024).toFixed(1)} MB confirmados
        </span>
      )}
      {snapshot.error && (
        <p>{snapshot.error} Você pode continuar somente com telemetria.</p>
      )}
      {snapshot.pendingBytes > 0 && (
        <div>
          <p>
            {(snapshot.pendingBytes / 1024 / 1024).toFixed(1)} MB ainda somente
            na memória. Fechar ou recarregar perde esses blocos.
          </p>
          <Button
            variant="secondary"
            disabled={snapshot.busy}
            onClick={() => void video.retryPending()}
          >
            Tentar persistir vídeo novamente
          </Button>
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
export function ActiveVideoPanel() {
  const { video, snapshot } = useRideVideo();
  return (
    <section
      className="panel ride-video-running"
      aria-label="Configuração de vídeo"
    >
      <h2>Vídeo do Ride</h2>
      <VideoStatus />
      {(snapshot.enabled || snapshot.stream || snapshot.busy) && (
        <Button variant="secondary" onClick={() => void video.disable()}>
          Continuar sem vídeo / encerrar câmera
        </Button>
      )}
      {snapshot.stream && (
        <details>
          <summary>Prévia da câmera</summary>
          <CameraPreview stream={snapshot.stream} />
        </details>
      )}
    </section>
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
      const ride = video.controller.getSnapshot();
      if (!ride.activity && ride.state !== 'waiting-gps') void video.disable();
    },
    [video],
  );
  if (!preparation && !snapshot.stream) return null;
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
      <div className="settings-caption">
        <h2>Configurar câmera</h2>
      </div>
      <VideoStatus />
      {configurable && (
        <div className="video-settings">
          <div className="camera-choices">
            <span>Câmera</span>
            <SegmentedControl
              label="Câmera do vídeo"
              value={settings.facing}
              onChange={(value) =>
                video.settings({
                  ...settings,
                  facing: value as CameraFacing,
                  deviceId: undefined,
                })
              }
              options={[
                {
                  value: 'environment',
                  label: 'Traseira',
                  icon: <Camera size={19} aria-hidden />,
                  disabled: snapshot.busy,
                },
                {
                  value: 'user',
                  label: 'Frontal',
                  icon: <SwitchCamera size={19} aria-hidden />,
                  disabled: snapshot.busy,
                },
              ]}
            />
          </div>
          {snapshot.devices.length > 1 && (
            <label>
              Lente disponível
              <Select
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
              </Select>
            </label>
          )}
          <div className="video-quality-choice">
            <span>Qualidade</span>
            <ChoiceSelect
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
            </ChoiceSelect>
          </div>
          <label className="video-audio">
            <Checkbox
              checked={settings.audio}
              disabled={snapshot.busy}
              onChange={(e) =>
                video.settings({ ...settings, audio: e.target.checked })
              }
            />{' '}
            Gravar áudio (solicita microfone)
          </label>

          <Button
            variant="primary"
            disabled={!user || snapshot.busy}
            onClick={() => void video.prepare()}
          >
            {snapshot.stream
              ? 'Preparar câmera novamente'
              : 'Ativar vídeo e abrir prévia'}
          </Button>
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

      <details>
        <summary>Espaço no aparelho</summary>
        <p>{snapshot.storage || 'Espaço será consultado antes da gravação.'}</p>
        <button className="text-link" onClick={() => void video.monitor(true)}>
          Solicitar persistência local
        </button>
      </details>
    </section>
  );
}
