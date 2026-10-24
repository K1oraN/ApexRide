import { overlayTime } from './format';
import type { OverlayConfig } from './config';
import type { OverlayFrame } from './resolver';

const number = (value: number | null | undefined, digits = 1) =>
  value !== null && value !== undefined && Number.isFinite(value)
    ? value.toFixed(digits)
    : '—';
export function overlayLabels(data: OverlayFrame, config: OverlayConfig) {
  const f = data?.frame;
  const values = {
    force: [
      'ACEL / FREIO · G EST.',
      `${number(f?.accelerationG, 2)} / ${number(f?.brakingG, 2)} g`,
    ],
    lean: [
      'INCLINAÇÃO ESTIMADA',
      f?.lean === null || f?.lean === undefined
        ? '—'
        : `${number(Math.abs(f.lean))}° ${f.lean < 0 ? 'E' : 'D'}`,
    ],
    distance: [
      'DISTÂNCIA GPS',
      data?.distanceMeters === null || !data
        ? '—'
        : `${number(data.distanceMeters / 1000, 2)} km`,
    ],
    time: [
      config.time === 'active' ? 'TEMPO ATIVO' : 'TEMPO DECORRIDO',
      data
        ? overlayTime(
            config.time === 'active' ? data.activeMs : data.mapped.elapsed,
          )
        : '—',
    ],
    mode: ['MODO', data?.mode.toUpperCase() ?? '—'],
    bike: ['MOTO', data?.bike ?? '—'],
    track: [
      'CIRCUITO · VOLTA ESTIMADA',
      data?.circuit
        ? `${data.circuit} · ${f?.lap && ['valid', 'estimated'].includes(f.lap.status) ? f.lap.label : '—'}`
        : '—',
    ],
    event: [
      'EVENTO ESTIMADO',
      f?.event?.status === 'estimated' ? f.event.label : '—',
    ],
  };
  return config.metrics
    .filter((m): m is keyof typeof values => m !== 'speed')
    .map((m) => ({ metric: m, label: values[m][0]!, value: values[m][1]! }));
}

/** Shared by preview and encoded frames. Coordinates are relative to the decoded video. */
export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: OverlayFrame,
  config: OverlayConfig,
) {
  ctx.save();
  const scale = Math.min(width / 480, height / 270);
  ctx.scale(scale, scale);
  const w = width / scale,
    h = height / scale;
  const cards = overlayLabels(data, config),
    speed = config.metrics.includes('speed');
  const columns = 2,
    cardWidth = 140,
    cardHeight = 52;
  const panelWidth = speed
    ? cards.length <= 1
      ? 312
      : 448
    : cards.length <= 1
      ? 172
      : 312;
  const panelHeight = Math.max(
    speed ? 136 : 0,
    Math.ceil(cards.length / columns) * cardHeight + 16,
    32,
  );
  const x = config.position === 'right' ? w - panelWidth - 16 : 16,
    y = h - panelHeight - 16;
  ctx.fillStyle = 'rgba(8,11,13,0.84)';
  ctx.beginPath();
  ctx.roundRect(x, y, panelWidth, panelHeight, 12);
  ctx.fill();
  ctx.fillStyle = '#ff202d';
  ctx.fillRect(x + 12, y + 10, 3, panelHeight - 20);
  if (speed) {
    const cx = x + 74,
      cy = y + panelHeight / 2;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#283036';
    ctx.beginPath();
    ctx.arc(cx, cy, 47, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    const kmh = data?.frame?.speedKmh;
    if (kmh !== null && kmh !== undefined) {
      ctx.strokeStyle = '#ff202d';
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        47,
        Math.PI * 0.8,
        Math.PI * (0.8 + 1.4 * Math.min(1, kmh / 300)),
      );
      ctx.stroke();
    }
    ctx.fillStyle = '#f7f8f8';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Roboto Condensed", sans-serif';
    ctx.fillText(number(kmh, 0), cx, cy + 5);
    ctx.font = '12px "Roboto Condensed", sans-serif';
    ctx.fillText(
      data?.frame?.speedSource === 'assisted'
        ? 'km/h · ESTIMADA'
        : 'km/h · GPS',
      cx,
      cy + 26,
    );
  }
  ctx.textAlign = 'left';
  cards.forEach((card, i) => {
    const a = x + (speed ? 152 : 24) + (i % columns) * cardWidth;
    const b = y + 24 + Math.floor(i / columns) * cardHeight;
    ctx.fillStyle = '#aeb7c3';
    ctx.font = '13px "Roboto Condensed", sans-serif';
    ctx.fillText(card.label, a, b, cardWidth - 12);
    ctx.fillStyle = '#f7f8f8';
    ctx.font = 'bold 22px "Roboto Condensed", sans-serif';
    ctx.fillText(card.value, a, b + 25, cardWidth - 12);
  });
  if (!data || !data.frame) {
    ctx.fillStyle = '#f7f8f8';
    ctx.font = '12px "Roboto Condensed", sans-serif';
    ctx.fillText(
      data
        ? 'PAUSA DA SESSÃO · SENSORES INDISPONÍVEIS'
        : 'SINCRONIZAÇÃO INDISPONÍVEL',
      x + 20,
      y - 8,
    );
  }
  ctx.restore();
}
export function composeFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  data: OverlayFrame,
  config: OverlayConfig,
  overlay = true,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
  if (overlay && config.metrics.length)
    renderOverlay(ctx, ctx.canvas.width, ctx.canvas.height, data, config);
}
