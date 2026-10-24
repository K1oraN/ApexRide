export function periodDates(
  period: string,
  from: string,
  to: string,
  now = new Date(),
) {
  const end = new Date(now);
  let start: Date | null = null;
  if (['7', '30', '90'].includes(period)) {
    start = new Date(now);
    start.setDate(start.getDate() - Number(period));
  }
  if (period === 'year') start = new Date(now.getFullYear(), 0, 1);
  if (period === 'custom') {
    const a = from ? new Date(from + 'T00:00:00') : null,
      b = to ? new Date(to + 'T00:00:00') : null;
    if (
      (a && !Number.isFinite(a.getTime())) ||
      (b && !Number.isFinite(b.getTime()))
    )
      return { from: 'invalid', to: '' };
    if (b) b.setDate(b.getDate() + 1);
    return { from: a?.toISOString() ?? '', to: b?.toISOString() ?? '' };
  }
  return {
    from: start?.toISOString() ?? '',
    to: start ? end.toISOString() : '',
  };
}
export function historyParams(params: URLSearchParams) {
  const result = new URLSearchParams(params);
  const dates = periodDates(
    params.get('period') ?? '',
    params.get('start') ?? '',
    params.get('end') ?? '',
  );
  for (const key of ['period', 'start', 'end', 'sync', 'localPage'])
    result.delete(key);
  if (dates.from) result.set('from', dates.from);
  if (dates.to) result.set('to', dates.to);
  result.set('limit', '12');
  return result;
}
