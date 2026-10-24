import {
  Camera,
  Flag,
  Gauge,
  History,
  SlidersHorizontal,
  Video,
} from 'lucide-react';
import { NavLink } from 'react-router';
import '../styles/ride-workspace.css';

const sections = [
  ['/ride', 'Painel', Gauge],
  ['/ride/sessoes', 'Sessões', History],
  ['/ride/circuitos', 'Circuitos', Flag],
  ['/ride/telemetria', 'Telemetria', SlidersHorizontal],
  ['/ride/videos', 'Vídeos', Camera],
  ['/ride/estudio', 'Estúdio', Video],
] as const;

export function RideSectionNav() {
  return (
    <nav className="ride-section-nav" aria-label="Área Ride">
      {sections.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end>
          <Icon size={18} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
