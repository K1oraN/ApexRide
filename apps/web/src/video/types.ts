export type CameraFacing = 'user' | 'environment';
export type VideoQuality = 'economy' | 'standard' | 'high';
export interface VideoSettings {
  facing: CameraFacing;
  quality: VideoQuality;
  audio: boolean;
  deviceId?: string | undefined;
}
export const defaultVideoSettings: VideoSettings = {
  facing: 'environment',
  quality: 'standard',
  audio: false,
};
export const presets = {
  economy: {
    label: 'Econômico · ~480p',
    width: 854,
    height: 480,
    fps: 24,
    bitrate: 1_000_000,
  },
  standard: {
    label: 'Padrão · ~720p',
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 2_500_000,
  },
  high: {
    label: 'Alta · ~1080p',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 5_000_000,
  },
};
export type VideoState =
  | 'disabled'
  | 'permission'
  | 'camera'
  | 'preview'
  | 'preparing'
  | 'recording'
  | 'paused'
  | 'switching'
  | 'stopping'
  | 'persisting'
  | 'finished'
  | 'interrupted'
  | 'error'
  | 'storage-full';
export const videoLabels: Record<VideoState, string> = {
  disabled: 'Vídeo desativado',
  permission: 'Aguardando permissão',
  camera: 'Preparando câmera',
  preview: 'Prévia disponível',
  preparing: 'Preparando gravação',
  recording: 'REC · Gravando',
  paused: 'Vídeo pausado',
  switching: 'Trocando câmera',
  stopping: 'Finalizando vídeo',
  persisting: 'Persistindo dados',
  finished: 'Vídeo finalizado no aparelho',
  interrupted: 'Vídeo interrompido',
  error: 'Vídeo indisponível',
  'storage-full': 'Armazenamento insuficiente',
};
export interface VideoAnchor {
  wallMs: number;
  monotonicMs: number;
  rideElapsedMs: number;
  rideActiveMs: number;
  mediaEstimatedMs: number;
}
export interface VideoSegment {
  id: string;
  version: 1;
  ownerId: string;
  clientId: string;
  serverId?: string;
  order: number;
  writer: string;
  leaseUntil: number;
  state: 'writing' | 'complete' | 'incomplete';
  requested: VideoSettings;
  applied: MediaTrackSettings;
  audio: boolean;
  mimeType: string;
  start: VideoAnchor | null;
  end: VideoAnchor | null;
  createdAt: number;
  lastReceivedAt: number | null;
  chunks: number;
  bytes: number;
  reason: string | null;
  durationEstimatedMs: number | null;
  mediaDurationMs: number | null;
}
export interface VideoChunk {
  segmentId: string;
  order: number;
  receivedAt: number;
  blob: Blob;
}
