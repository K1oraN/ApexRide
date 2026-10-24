import { presets, type VideoSettings } from './types';

export function cameraError(error: unknown) {
  const name =
    error instanceof Error ||
    (error && typeof error === 'object' && 'name' in error)
      ? String(error.name)
      : '';
  return (
    (
      {
        NotAllowedError:
          'Permissão negada. Libere a câmera (e o microfone, se escolhido) nas configurações do navegador ou continue sem vídeo.',
        NotFoundError:
          'Câmera ou microfone não encontrado. Confira o dispositivo; você pode desativar o áudio e tentar novamente.',
        NotReadableError:
          'A câmera ou o microfone está ocupado ou indisponível. Feche outros aplicativos e tente novamente.',
        OverconstrainedError:
          'Esta câmera não oferece a configuração solicitada. Escolha outra câmera ou qualidade.',
        AbortError: 'Preparação da câmera cancelada.',
        SecurityError:
          'O navegador bloqueou a câmera. Verifique as permissões deste site.',
        NotSupportedError:
          'O navegador não oferece este formato ou configuração de vídeo. Continue com telemetria.',
        QuotaExceededError:
          'Armazenamento insuficiente. Libere espaço e tente persistir os blocos pendentes novamente.',
        UnknownError:
          'O armazenamento local não confirmou a operação. Preserve os dados e tente novamente.',
      } as Record<string, string>
    )[name] ??
    (error instanceof Error
      ? error.message
      : 'Não foi possível utilizar a câmera. Continue o Ride sem vídeo.')
  );
}
export class CameraService {
  stream: MediaStream | null = null;
  private generation = 0;
  constructor(
    private readonly devices = () => navigator.mediaDevices,
    private readonly secure = () => window.isSecureContext,
  ) {}
  support() {
    if (!this.secure())
      throw new Error(
        'A câmera exige HTTPS ou localhost. O Ride pode continuar sem vídeo.',
      );
    if (!this.devices()?.getUserMedia)
      throw new Error(
        'Este navegador não oferece acesso à câmera. Continue sem vídeo.',
      );
  }
  close() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
  async open(settings: VideoSettings) {
    this.support();
    this.close();
    const generation = this.generation;
    const qualities = (['economy', 'standard', 'high'] as const)
      .slice(0, ['economy', 'standard', 'high'].indexOf(settings.quality) + 1)
      .reverse();
    for (const quality of qualities) {
      const preset = presets[quality];
      try {
        const stream = await this.devices().getUserMedia({
          audio: settings.audio,
          video: {
            ...(settings.deviceId
              ? { deviceId: { exact: settings.deviceId } }
              : { facingMode: { ideal: settings.facing } }),
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            frameRate: { ideal: preset.fps, max: 30 },
          },
        });
        if (generation !== this.generation) {
          stream.getTracks().forEach((track) => track.stop());
          throw new DOMException('Cancelado', 'AbortError');
        }
        const track = stream.getVideoTracks()[0];
        if (!track || track.readyState !== 'live') {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('A câmera não forneceu imagem ativa.');
        }
        this.stream = stream;
        const applied = track.getSettings();
        const devices =
          (await this.devices()
            .enumerateDevices?.()
            .catch(() => [])) ?? [];
        return {
          stream,
          applied,
          quality,
          devices: devices.filter((d) => d.kind === 'videoinput'),
        };
      } catch (error) {
        if (
          (error as Error).name !== 'OverconstrainedError' ||
          quality === 'economy' ||
          generation !== this.generation
        )
          throw error;
      }
    }
    throw new Error('Nenhuma qualidade de captura disponível.');
  }
}
