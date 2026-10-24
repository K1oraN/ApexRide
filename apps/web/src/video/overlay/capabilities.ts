import { presets, type VideoQuality } from '../types';
const videoCodecs = [
  'video/mp4;codecs=avc1.42E01E',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
];
const audioCodecs = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
];
export function exportCapabilities(audio = false) {
  const canvas =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';
  const recorder =
    typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function';
  const webAudio = typeof AudioContext !== 'undefined';
  const formats =
    canvas && recorder && (!audio || webAudio)
      ? (audio ? audioCodecs : videoCodecs).filter((m) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        })
      : [];
  return {
    formats,
    canvas,
    recorder,
    webAudio,
    reason: formats.length
      ? ''
      : 'Exportação composta indisponível para esta configuração. A prévia e o original continuam disponíveis.',
  };
}
export function exportSize(
  width: number,
  height: number,
  quality: VideoQuality,
  sourceFps?: number,
) {
  const p = presets[quality];
  const scale = Math.min(
    1,
    p.width / Math.max(width, height),
    p.height / Math.min(width, height),
  );
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  return {
    width: even(width * scale),
    height: even(height * scale),
    bitrate: p.bitrate,
    fps: Math.max(
      1,
      Math.min(
        p.fps,
        sourceFps && Number.isFinite(sourceFps) ? sourceFps : p.fps,
      ),
    ),
  };
}
export function extension(mime: string) {
  if (mime.split(';')[0] === 'video/mp4') return 'mp4';
  if (mime.split(';')[0] === 'video/webm') return 'webm';
  throw new Error('Contêiner de exportação desconhecido.');
}
