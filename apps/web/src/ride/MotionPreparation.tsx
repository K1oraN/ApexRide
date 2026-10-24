import { ChoiceSelect } from '../components/design-system';
import type { Mount } from '@apex-ride/ride-core/motion';
import { useState } from 'react';
import { Button, Checkbox } from '../components/design-system';
import { useRide } from './context';
import { useMotion } from './useMotion';
import { SensorDiagnostics } from './SensorDiagnostics';
export function MotionPreparation() {
  const { controller, snapshot: ride } = useRide();
  const s = useMotion();
  const [attempted, setAttempted] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [upright, setUpright] = useState(false);
  const [mount, setMount] = useState<Mount>('top-forward');
  const preparing = !ride.activity && ride.state !== 'waiting-gps';
  return (
    <section
      className="ride-preparation panel motion-preparation"
      aria-label="Sensores de movimento"
    >
      <h2>Sensores de movimento</h2>
      <div className="settings-caption">
        <p role="status">
          {s.sensor.status === 'idle'
            ? 'Sensores desligados'
            : s.sensor.status === 'working'
              ? 'Sensores funcionando · leituras recebidas'
              : s.sensor.message}
        </p>
      </div>
      {s.sensor.policyWarning && <p>{s.sensor.policyWarning}</p>}
      {attempted && <p role="status">{s.message}</p>}
      <SensorDiagnostics />
      {!preparing && (
        <p>
          Força G:{' '}
          {s.current?.quality === 'limited'
            ? 'estimativa limitada'
            : s.calibration?.valid
              ? 'dados insuficientes ou sessão pausada'
              : 'sem calibração válida'}
          . Inclinação dinâmica indisponível.
        </p>
      )}
      {preparing && (
        <>
          <Button
            variant="secondary"
            disabled={
              s.sensor.active ||
              s.sensor.status === 'requesting' ||
              s.sensor.status === 'denied'
            }
            onClick={() => void controller.motion.activate()}
          >
            Ativar Sensores
          </Button>
          <details className="ride-calibration" data-ride-setting="calibration">
            <summary>Calibração opcional</summary>
            <div className="account-field">
              <span>Montagem do celular</span>
              <ChoiceSelect
                aria-label="Montagem do celular"
                value={mount}
                disabled={s.calibrating}
                onChange={(e) => {
                  setMount(e.target.value as Mount);
                  controller.motion.clear();
                }}
              >
                <option value="top-forward">
                  Topo apontado para a frente da moto
                </option>
                <option value="right-forward">
                  Borda direita apontada para a frente da moto
                </option>
              </ChoiceSelect>
            </div>
            <label className="motion-confirm">
              <Checkbox
                checked={fixed}
                disabled={s.calibrating}
                onChange={(e) => {
                  setFixed(e.target.checked);
                  if (!e.target.checked) controller.motion.clear();
                }}
              />
              Celular firmemente fixado no suporte indicado
            </label>
            <label className="motion-confirm">
              <Checkbox
                checked={upright}
                disabled={s.calibrating}
                onChange={(e) => {
                  setUpright(e.target.checked);
                  if (!e.target.checked) controller.motion.clear();
                }}
              />
              Confirmo que a moto está parada e vertical
            </label>
            <Button
              variant="secondary"
              disabled={
                !fixed ||
                !upright ||
                s.calibrating ||
                s.sensor.status !== 'working'
              }
              onClick={() => {
                setAttempted(true);
                controller.motion.calibrate(
                  mount,
                  fixed,
                  upright,
                  ride.gps.speedKmh,
                );
              }}
            >
              {s.calibrating
                ? 'Avaliando estabilidade…'
                : s.calibration?.valid
                  ? 'Recalibrar sensores'
                  : 'Calibrar sensores'}
            </Button>
          </details>
        </>
      )}
      {s.truncated && (
        <p role="alert">
          Histórico de sensores incompleto. O limite de memória foi atingido; as
          métricas cobrem somente o trecho registrado.
        </p>
      )}
    </section>
  );
}
