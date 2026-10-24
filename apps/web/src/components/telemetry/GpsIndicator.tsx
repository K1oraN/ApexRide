import { LocateFixed } from 'lucide-react';
import type { GpsStatus } from '../../services/gps/preview';

const labels: Record<GpsStatus, string> = {
  idle: 'GPS desligado',
  waiting: 'Aguardando sinal',
  available: 'GPS disponível',
  reduced: 'Precisão reduzida',
  stale: 'Sinal desatualizado',
  unavailable: 'GPS indisponível',
  denied: 'Permissão negada',
  unsupported: 'GPS não suportado',
  insecure: 'Requer HTTPS',
  suspended: 'GPS interrompido',
};

export function GpsIndicator({ status }: { status: GpsStatus }) {
  return (
    <span className={`gps-state gps-${status}`}>
      <LocateFixed size={27} aria-hidden />
      {labels[status]}
    </span>
  );
}
