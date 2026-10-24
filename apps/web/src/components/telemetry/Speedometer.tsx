function point(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: 150 + Math.cos(radians) * radius,
    y: 150 + Math.sin(radians) * radius,
  };
}

function arc(start: number, end: number, radius: number) {
  const a = point(start, radius);
  const b = point(end, radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function Speedometer({
  value,
  max = 300,
  compact = false,
  source = 'demo',
  status,
  detail,
}: {
  value: number | null;
  status?: string;
  detail?: string | undefined;
  max?: number;
  compact?: boolean;
  source?: 'demo' | 'gps' | 'assisted';
}) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 300;
  const safeValue =
    value !== null && Number.isFinite(value) && value >= 0 ? value : null;
  const gaugeValue = Math.min(safeValue ?? 0, safeMax);
  const end = 135 + (270 * gaugeValue) / safeMax;
  return (
    <div className={`speedometer ${compact ? 'speedometer-compact' : ''}`}>
      <svg
        viewBox="0 0 300 285"
        role="img"
        aria-label={
          safeValue === null
            ? 'Velocidade GPS indisponível'
            : `Velocidade ${source === 'assisted' ? 'assistida estimada' : source === 'gps' ? 'GPS' : 'ilustrativa'}: ${Math.round(safeValue)} quilômetros por hora; escala de 0 a ${safeMax}`
        }
      >
        <path
          d={arc(135, 405, 132)}
          stroke="#20272c"
          strokeWidth="18"
          fill="none"
        />
        <path
          d={arc(135, end, 132)}
          stroke="#ff202b"
          strokeWidth="18"
          fill="none"
          className="gauge-glow"
        />
        {Array.from({ length: 61 }, (_, i) => {
          const angle = 135 + (270 * i) / 60;
          const a = point(angle, 122);
          const b = point(angle, i % 10 === 0 ? 111 : 135);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={i / 60 <= gaugeValue / safeMax ? '#ff777c' : '#414b51'}
              strokeWidth={i % 10 === 0 ? 1.5 : 0.5}
            />
          );
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const p = point(135 + (270 * i) / 6, 97);
          return (
            <text
              key={i}
              x={p.x}
              y={p.y + 5}
              textAnchor="middle"
              className="gauge-label"
            >
              {Math.round((safeMax * i) / 6)}
            </text>
          );
        })}
        <text x="150" y="177" textAnchor="middle" className="gauge-value">
          {safeValue === null ? '—' : Math.round(safeValue)}
        </text>
        <text x="150" y="211" textAnchor="middle" className="gauge-unit">
          km/h
        </text>
      </svg>
      {status && (
        <p className="speed-source" role="status" title={detail}>
          {status}
        </p>
      )}
    </div>
  );
}
