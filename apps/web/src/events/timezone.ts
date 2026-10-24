// Resolve wall time using the event's IANA zone, independent of the device zone.
export function wallTime(utc: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utc));
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function toUtc(local: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error('Informe data e horário.');
  const target = Date.parse(local + ':00Z');
  let utc = target;
  for (let i = 0; i < 4; i++) {
    const rendered = Date.parse(
      wallTime(new Date(utc).toISOString(), timezone) + ':00Z',
    );
    const delta = target - rendered;
    if (delta === 0) return new Date(utc).toISOString();
    utc += delta;
  }
  throw new Error('Horário inexistente nesse fuso. Ajuste a data e o horário.');
}
