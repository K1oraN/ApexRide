export function abortable<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(signal.reason ?? new DOMException('Cancelado', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', cancel);
        reject(error);
      },
    );
    if (signal.aborted) cancel();
  });
}
export function mediaEvent(
  video: HTMLVideoElement,
  event: string,
  signal: AbortSignal,
  timeout = 15000,
) {
  return new Promise<void>((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', cancel);
    };
    const done = () => {
      clean();
      resolve();
    };
    const fail = () => {
      clean();
      reject(new Error('Arquivo não reproduzível ou codec incompatível.'));
    };
    const cancel = () => {
      clean();
      reject(signal.reason ?? new DOMException('Cancelado', 'AbortError'));
    };
    const timer = setTimeout(() => {
      clean();
      reject(new Error('Tempo limite ao processar mídia.'));
    }, timeout);
    video.addEventListener(event, done, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
export async function loadMedia(
  video: HTMLVideoElement,
  url: string,
  signal: AbortSignal,
) {
  const loaded = mediaEvent(video, 'loadeddata', signal);
  video.src = url;
  video.load();
  await loaded;
  // Live MediaRecorder WebM often reports Infinity until a seek discovers its end.
  if (!Number.isFinite(video.duration)) {
    const seek = mediaEvent(video, 'seeked', signal);
    video.currentTime = 1e10;
    await seek;
  }
  if (
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    !video.videoWidth ||
    !video.videoHeight
  )
    throw new Error('Duração ou resolução real da mídia indisponível.');
  if (video.currentTime !== 0) {
    const seek = mediaEvent(video, 'seeked', signal);
    video.currentTime = 0;
    await seek;
  }
}
export function releaseMedia(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
}
