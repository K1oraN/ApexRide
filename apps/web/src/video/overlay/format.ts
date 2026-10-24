import { formatDuration } from '../../ride/format';
export function overlayTime(ms: number) {
  const formatted = formatDuration(ms);
  return ms < 3600000 ? formatted.slice(3) : formatted;
}
