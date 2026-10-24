import { presets, type VideoQuality } from './types';
export async function videoStorageStatus(
  quality: VideoQuality,
  persist = false,
) {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const protectedStorage = persist
      ? await navigator.storage?.persist?.()
      : await navigator.storage?.persisted?.();
    const remaining =
      estimate?.quota === undefined
        ? null
        : Math.max(0, estimate.quota - (estimate.usage ?? 0));
    // Reserve roughly one minute at the requested bitrate, with a 16 MiB floor.
    const low =
      remaining !== null &&
      remaining <
        Math.max(16 * 1024 * 1024, (presets[quality].bitrate * 60) / 8);
    return {
      remaining,
      low,
      message: `${remaining === null ? 'Espaço não informado pelo navegador' : `~${Math.floor(remaining / 1024 / 1024)} MB disponíveis no navegador`}. ${protectedStorage ? 'Persistência concedida; ainda pode haver remoção pelo usuário.' : 'O navegador pode remover arquivos locais. Guarde uma cópia dos segmentos importantes.'}`,
    };
  } catch {
    return {
      remaining: null,
      low: false,
      message:
        'Não foi possível estimar espaço. Falhas de escrita encerrarão somente o vídeo.',
    };
  }
}
