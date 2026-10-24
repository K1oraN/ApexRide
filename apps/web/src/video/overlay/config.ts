import type { VideoQuality } from '../types';
export const metricLabels = {
  speed: 'Velocidade',
  force: 'Força G estimada',
  lean: 'Inclinação estimada',
  distance: 'Distância',
  time: 'Tempo',
  mode: 'Modo',
  bike: 'Moto',
  track: 'Circuito / volta',
  event: 'Eventos registrados',
};
export type Metric = keyof typeof metricLabels;
export type Layout = 'compact' | 'full' | 'track';
export interface OverlayConfig {
  version: 1;
  renderer: 'racing-1';
  segmentId: string;
  metrics: Metric[];
  layout: Layout;
  position: 'left' | 'right';
  time: 'active' | 'elapsed';
  offsetMs: number;
  quality: VideoQuality;
  audio: boolean;
}
export function layoutMetrics(layout: Layout): Metric[] {
  return layout === 'compact'
    ? ['speed', 'time']
    : layout === 'track'
      ? ['speed', 'force', 'lean', 'time', 'track']
      : ['speed', 'force', 'lean', 'distance', 'time'];
}
export function defaultOverlay(segmentId: string): OverlayConfig {
  return {
    version: 1,
    renderer: 'racing-1',
    segmentId,
    metrics: layoutMetrics('full'),
    layout: 'full',
    position: 'left',
    time: 'active',
    offsetMs: 0,
    quality: 'standard',
    audio: false,
  };
}
export function validConfig(value: unknown): value is OverlayConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as OverlayConfig;
  return (
    c.version === 1 &&
    c.renderer === 'racing-1' &&
    typeof c.segmentId === 'string' &&
    ['compact', 'full', 'track'].includes(c.layout) &&
    ['left', 'right'].includes(c.position) &&
    ['active', 'elapsed'].includes(c.time) &&
    ['economy', 'standard', 'high'].includes(c.quality) &&
    typeof c.audio === 'boolean' &&
    Number.isFinite(c.offsetMs) &&
    Math.abs(c.offsetMs) <= 60000 &&
    Array.isArray(c.metrics) &&
    c.metrics.every((m) => Object.hasOwn(metricLabels, m))
  );
}
