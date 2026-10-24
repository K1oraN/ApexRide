import { useState } from 'react';
import type { Mount } from '@apex-ride/ride-core/motion';
import { useRide } from './context';
import { useMotion } from './useMotion';
export function MotionPreparation() {
  const { controller, snapshot: ride } = useRide();
  const s = useMotion();
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
      <p role="status">{s.sensor.message}</p>
      {s.sensor.policyWarning && <p>{s.sensor.policyWarning}</p>}
      <p>{s.message}</p>
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
          <p>
            Fixe o celular em suporte estável, sem folgas, com a tela voltada
            para cima (até 45° da horizontal). Não use na mão. Calibre somente
            com a moto parada e vertical. Não altere a montagem após calibrar.
          </p>
          <p>
            APIs detectadas: movimento{' '}
            {s.sensor.capabilities.motion ? 'presente' : 'ausente'} · orientação{' '}
            {s.sensor.capabilities.orientation ? 'presente' : 'ausente'}. O
            recebimento de leituras será verificado após ativar.
          </p>
          <button
            className="button"
            disabled={
              s.sensor.active ||
              s.sensor.status === 'requesting' ||
              s.sensor.status === 'denied'
            }
            onClick={() => void controller.motion.activate()}
          >
            Ativar Sensores
          </button>
          <label className="account-field">
            Montagem do celular
            <select
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
            </select>
          </label>
          <label className="motion-confirm">
            <input
              type="checkbox"
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
            <input
              type="checkbox"
              checked={upright}
              disabled={s.calibrating}
              onChange={(e) => {
                setUpright(e.target.checked);
                if (!e.target.checked) controller.motion.clear();
              }}
            />
            Confirmo que a moto está parada e vertical
          </label>
          <p>
            Estabilidade dos sensores não comprova que a moto está vertical. Sua
            confirmação define essa referência. A força G é uma estimativa
            limitada; a inclinação dinâmica está indisponível até validação
            física.
          </p>
          <button
            className="button"
            disabled={
              !fixed ||
              !upright ||
              s.calibrating ||
              s.sensor.status !== 'working'
            }
            onClick={() =>
              controller.motion.calibrate(
                mount,
                fixed,
                upright,
                ride.gps.speedKmh,
              )
            }
          >
            {s.calibrating
              ? 'Avaliando estabilidade…'
              : s.calibration?.valid
                ? 'Recalibrar sensores'
                : 'Calibrar sensores'}
          </button>
          <p>Opcional: você pode iniciar o Ride apenas com GPS.</p>
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
