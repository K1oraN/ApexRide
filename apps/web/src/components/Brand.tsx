import { Mountain } from 'lucide-react';
import type { RideMode } from '../data/demo';

export function RacingFlagIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M11 3 4 33" />
      <g transform="translate(11 3) rotate(13)">
        <path d="M0 0h20v16H0Z" />
        {Array.from({ length: 20 }, (_, i) => {
          const x = i % 5;
          const y = Math.floor(i / 5);
          return (x + y) % 2 === 0 ? (
            <rect
              key={i}
              x={x * 4}
              y={y * 4}
              width="4"
              height="4"
              fill="currentColor"
              stroke="none"
            />
          ) : null;
        })}
      </g>
    </svg>
  );
}

export function WindingRoadIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 42"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 3c-9 6 13 9 5 18-5 6-18 3-16 9 1 4 11 1 10 7-1 7-22-2-17-12 4-8 17-7 16-14-1-4-5-4 2-8Z" />
      <path d="m18 5 3-3 4 3" />
    </svg>
  );
}

export function ModeIcon({
  mode,
  size = 28,
}: {
  mode: RideMode;
  size?: number;
}) {
  return mode === 'passeio' ? (
    <WindingRoadIcon size={size} />
  ) : mode === 'pista' ? (
    <RacingFlagIcon size={size} />
  ) : (
    <Mountain size={size} />
  );
}

export function RideIcon({
  size = 28,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="10" cy="28" r="7" />
      <circle cx="38" cy="28" r="7" />
      <path d="m10 28 11-13 8 13H10l8-8h14M24 10h8l6 18M30 10l3-4h5M17 13h7M7 16l9 2" />
    </svg>
  );
}

export function HelmetIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M34 19C32 8 17 4 9 13 3 19 4 31 10 33h15v-7H14l-2-9 21 5h3v-3ZM16 12l11 4-3 3-10-2" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="brand" aria-label="Apex Ride — Pilote mais longe">
      <span className="brand-main">
        <svg viewBox="0 0 70 54" aria-hidden>
          <path
            fill="currentColor"
            d="M35 0 70 54H48L35 31 20 54H0Zm0 20L15 50h12l8-12 8 12h12Z"
          />
          <path fill="currentColor" d="M22 43h24l7 11H15Z" />
        </svg>
        <span className="brand-words">
          <span>APEX</span>
          <span>RIDE</span>
        </span>
      </span>
      <span className="brand-tagline">PILOTE MAIS LONGE</span>
    </span>
  );
}
