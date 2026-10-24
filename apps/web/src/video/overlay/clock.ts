/** One clock for every metric. No elapsed wall-time counter. */
export function observeVideoFrames(
  video: HTMLVideoElement,
  draw: (seconds: number) => void,
) {
  let stopped = false,
    handle = 0;
  const native = typeof video.requestVideoFrameCallback === 'function';
  const schedule = () => {
    if (stopped) return;
    if (native)
      handle = video.requestVideoFrameCallback((_now, meta) => {
        if (stopped) return;
        draw(meta.mediaTime);
        schedule();
      });
    else
      handle = requestAnimationFrame(() => {
        if (stopped) return;
        if (!video.paused && !video.seeking && video.readyState >= 2)
          draw(video.currentTime);
        schedule();
      });
  };
  const update = (event?: Event) => {
    if (native && event?.type === 'timeupdate' && !video.paused) return;
    if (!stopped && video.readyState >= 2) draw(video.currentTime);
  };
  const events = [
    'loadeddata',
    'seeked',
    'pause',
    'ended',
    'timeupdate',
    'ratechange',
  ];
  events.forEach((e) => video.addEventListener(e, update));
  schedule();
  update();
  return () => {
    stopped = true;
    if (native) video.cancelVideoFrameCallback(handle);
    else cancelAnimationFrame(handle);
    events.forEach((e) => video.removeEventListener(e, update));
  };
}
