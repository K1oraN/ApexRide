import type { SpeedState } from '@apex-ride/ride-core/speed';
import { useSyncExternalStore } from 'react';
import { Speedometer } from '../components/telemetry/Speedometer';
import { useRide } from './context';

const speedLabels: Record<SpeedState, string> = {
  assisted: 'GPS Assistido ativo · estimativa',
  'pure-selected': 'GPS Puro selecionado',
  'pure-auto': 'GPS Puro automático',
  waiting: 'GPS aguardando',
  stale: 'Dados desatualizados',
  'sensor-error': 'Erro de sensores · GPS Puro',
};
const reasonLabels = {
  selected: 'Modo escolhido nas configurações.',
  sensors: 'Aguardando aceleração longitudinal confiável.',
  calibration: 'Calibração indisponível. Calibre somente com a moto parada.',
  interruption: 'Leituras interrompidas. Aguardando novas referências.',
  'gps-invalid': 'Aguardando uma velocidade GPS válida.',
  drift: 'Diferença excessiva entre GPS e sensores. Assistência suspensa.',
  'gps-missing': 'Aguardando referência GPS recente.',
  horizon: 'Aguardando nova leitura GPS para retomar a assistência.',
};
export function SpeedDisplay() {
  const { controller } = useRide();
  const speed = useSyncExternalStore(
    controller.speed.subscribe,
    controller.speed.getSnapshot,
  );
  return (
    <Speedometer
      value={speed.speedMps === null ? null : speed.speedMps * 3.6}
      source={speed.source === 'assisted' ? 'assisted' : 'gps'}
      status={`${speedLabels[speed.state]}${speed.stationary ? ' · parada validada' : ''}${controller.speed.historyIncomplete ? ' · histórico incompleto' : ''}`}
      detail={speed.reason ? reasonLabels[speed.reason] : undefined}
    />
  );
}
