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
  const gaugeId = compact
    ? 'apex-compact-gauge-gradient'
    : 'apex-ride-gauge-gradient';
  return (
    <div className={`speedometer ${compact ? 'speedometer-compact' : ''}`}>
      <svg
        viewBox="0 0 300 285"
        role="img"
        aria-label={
          safeValue === null
            ? 'Velocidade indisponível'
            : `Velocidade ${source === 'assisted' ? 'assistida estimada' : source === 'gps' ? 'GPS' : 'ilustrativa'}: ${Math.round(safeValue)} quilômetros por hora; escala de 0 a ${safeMax}`
        }
      >
        <defs>
          <linearGradient id={gaugeId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a7001a" />
            <stop offset="50%" stopColor="#ff1733" />
            <stop offset="100%" stopColor="#ff6a73" />
          </linearGradient>
        </defs>
        <circle
          className="apex-speed-dial-background"
          cx="150"
          cy="150"
          r="111"
        />
        <path
          d={arc(135, 405, 132)}
          stroke="#26313a"
          strokeWidth="18"
          strokeLinecap="round"
          fill="none"
        />
        {gaugeValue > 0 && (
          <path
            d={arc(135, end, 132)}
            stroke={`url(#${gaugeId})`}
            strokeWidth="18"
            strokeLinecap="round"
            fill="none"
            className="gauge-glow apex-speed-dial-progress"
          />
        )}
        {Array.from({ length: 61 }, (_, i) => {
          const angle = 135 + (270 * i) / 60;
          const a = point(angle, 122);
          const b = point(angle, i % 10 === 0 ? 112 : 135);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={i / 60 <= gaugeValue / safeMax ? '#ff848b' : '#4a555e'}
              strokeWidth={i % 10 === 0 ? 1.6 : 0.65}
            />
          );
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const p = point(135 + (270 * i) / 6, 95);
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
        <text
          x="150"
          y="123"
          textAnchor="middle"
          className="apex-speed-dial-eyebrow"
        >
          VELOCIDADE ATUAL
        </text>
        <text x="150" y="181" textAnchor="middle" className="gauge-value">
          {safeValue === null ? '—' : Math.round(safeValue)}
        </text>
        <text x="150" y="214" textAnchor="middle" className="gauge-unit">
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
