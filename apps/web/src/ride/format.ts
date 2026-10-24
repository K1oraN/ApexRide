export function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}
