import { abortable, loadMedia, mediaEvent, releaseMedia } from './media';
import { extension } from './capabilities';
export function validateDuration(actual: number, expected: number) {
  if (
    !Number.isFinite(actual) ||
    actual <= 0 ||
    Math.abs(actual - expected) > Math.max(0.5, expected * 0.05)
  )
    throw new Error(
      'Duração exportada difere da fonte; o arquivo não foi aprovado.',
    );
}
export async function validateContainer(blob: Blob, mime: string) {
  const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const format = extension(mime);
  const valid =
    format === 'webm'
      ? bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      : String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  if (!valid)
    throw new Error(
      'Conteúdo do arquivo não corresponde ao contêiner solicitado.',
    );
}
type AudioVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  audioTracks?: { length: number };
};
export async function validateExport(
  blob: Blob,
  expected: number,
  mime: string,
  audio: boolean,
  signal: AbortSignal,
) {
  await validateContainer(blob, mime);
  signal.throwIfAborted();
  const video = document.createElement('video') as AudioVideo,
    url = URL.createObjectURL(blob);
  video.muted = true;
  video.playsInline = true;
  let stream: MediaStream | undefined;
  try {
    await loadMedia(video, url, signal);
    validateDuration(video.duration, expected);
    await abortable(video.play(), signal);
    if (audio) {
      if (video.captureStream) {
        stream = video.captureStream();
        if (!stream.getAudioTracks().length)
          throw new Error('Trilha de áudio exportada não confirmada.');
      } else if (!video.audioTracks?.length)
        throw new Error(
          'Este navegador não permite confirmar o áudio exportado. Tente sem áudio.',
        );
    }
    video.pause();
    // Decode early, middle and late output frames, not just metadata/Blob existence.
    for (const fraction of [0.1, 0.5, 0.9]) {
      const seeked = mediaEvent(video, 'seeked', signal);
      video.currentTime = video.duration * fraction;
      await seeked;
      if (video.readyState < 2)
        throw new Error('Frame exportado não pôde ser decodificado.');
    }
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    releaseMedia(video);
    URL.revokeObjectURL(url);
  }
}
