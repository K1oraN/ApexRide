import { ChoiceSelect } from '../components/design-system';
import { RIDE_MODES } from '@apex-ride/ride-core/modes';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/design-system';
import { RideMap } from '../components/maps/RideMap';
import { RideXp } from '../gamification/Progress';
import { VideoLibrary } from '../video/VideoLibrary';
import { VideoStatus } from '../video/VideoPanel';
import { AdvancedResults } from './AdvancedResults';
import { useRide } from './context';
import { rideGps, rideMetrics } from './controller';
import { formatDuration } from './format';
export function RideSummary() {
  const { controller, snapshot } = useRide();
  const { user } = useAuth();
  const a = snapshot.activity;
  if (!a) return null;
  const m = rideMetrics(snapshot);
  const saved = snapshot.state === 'saved';
  const saving = snapshot.state === 'saving';
  const motion = a.payload.motion;
  return (
    <section className="session-summary panel" aria-label="Resumo da atividade">
      <span className="eyebrow">
        {saved ? 'ATIVIDADE SALVA' : 'RESUMO · ANTES DE SALVAR'}
      </span>
      <h2>
        {a.bike.brand} {a.bike.model}
      </h2>
      {a.payload.route && (
        <p>
          Rota: {a.payload.route.plan.name} ·{' '}
          {a.payload.route.abandoned
            ? 'Acompanhamento abandonado'
            : snapshot.routeProgress?.completed
              ? 'Rota concluída'
              : snapshot.routeProgress?.covered
                ? 'Rota parcialmente realizada'
                : 'Progresso indeterminado'}
        </p>
      )}
      {a.payload.mode === 'pista' &&
        a.payload.route?.plan.verification === 'verified' && (
          <section className="panel route-progress">
            <h3>Voltas GPS estimadas · {snapshot.laps.length}</h3>
            <p>Estimativa pessoal; precisão profissional não homologada.</p>
            {snapshot.laps.length > 0 && (
              <p>
                Melhor volta estimada:{' '}
                {(
                  Math.min(...snapshot.laps.map((l) => l.durationMs)) / 1000
                ).toFixed(1)}{' '}
                s
              </p>
            )}
            <ol>
              {snapshot.laps.map((l) => (
                <li key={l.number}>
                  Volta {l.number}: ~{(l.durationMs / 1000).toFixed(1)} s
                </li>
              ))}
            </ol>
            <p>
              Voltas interrompidas/inconclusivas: {snapshot.inconclusiveLaps}. O
              trecho após o último cruzamento permanece incompleto.
            </p>
          </section>
        )}
      <p>
        {a.bike.year} · {a.bike.displacementCc} cc · Modo {a.payload.mode}
      </p>
      <p>
        Início: {new Date(a.payload.startedAt).toLocaleString('pt-BR')} · Fim:{' '}
        {new Date(a.payload.endedAt).toLocaleString('pt-BR')}
      </p>
      <p>
        Estado:{' '}
        {saved
          ? snapshot.savedLocally
            ? 'Salvo no aparelho · aguardando sincronização'
            : 'Salva e confirmada pelo servidor'
          : saving
            ? 'Salvando…'
            : 'Finalizada'}
      </p>
      {saved &&
        (snapshot.savedId ? (
          <RideXp id={snapshot.savedId} />
        ) : (
          <p>
            Atividade salva no aparelho. XP será avaliado após sincronização.
          </p>
        ))}
      <dl className="session-summary-metrics">
        <div>
          <dt>Distância estimada</dt>
          <dd>{(m.distanceMeters / 1000).toFixed(2)} km</dd>
        </div>
        <div>
          <dt>Tempo ativo</dt>
          <dd>{formatDuration(m.activeMs)}</dd>
        </div>
        <div>
          <dt>Tempo total</dt>
          <dd>{formatDuration(m.elapsedMs)}</dd>
        </div>
        <div>
          <dt>Tempo pausado</dt>
          <dd>{formatDuration(m.pausedMs)}</dd>
        </div>
        <div>
          <dt>Velocidade média</dt>
          <dd>{m.averageKmh?.toFixed(1) ?? '—'} km/h</dd>
        </div>
        <div>
          <dt>Velocidade máxima</dt>
          <dd>{m.maximumKmh?.toFixed(1) ?? '—'} km/h</dd>
        </div>
        {RIDE_MODES[a.payload.mode].advanced && (
          <>
            <div>
              <dt>Aceleração máxima estimada</dt>
              <dd>{motion?.stats.maxAccelerationG?.toFixed(2) ?? '—'} G</dd>
            </div>
            <div>
              <dt>Frenagem máxima estimada</dt>
              <dd>{motion?.stats.maxBrakingG?.toFixed(2) ?? '—'} G</dd>
            </div>
            <div>
              <dt>Inclinação máxima E / D</dt>
              <dd>— / — °</dd>
            </div>
            <div>
              <dt>Inclinação média E / D</dt>
              <dd>— / — °</dd>
            </div>
          </>
        )}
      </dl>
      {RIDE_MODES[a.payload.mode].advanced && (
        <>
          <p>
            Calibração:{' '}
            {motion?.calibration
              ? motion.calibration.valid
                ? 'referência preservada'
                : 'referência perdida'
              : 'ausente'}
            . Força G:{' '}
            {motion?.stats.validSamples
              ? 'estimativa limitada para análise pessoal'
              : 'indisponível'}
            . Inclinação dinâmica indisponível até homologação física.
          </p>
          {motion && (
            <p>
              {motion.samples.length} amostras selecionadas (até 5 Hz) ·{' '}
              {motion.gaps.length} lacunas · processamento {motion.version}.
              {motion.truncated &&
                ' Histórico incompleto: limite de sensores atingido. Métricas limitadas ao trecho registrado.'}
            </p>
          )}
        </>
      )}
      <AdvancedResults summary />
      <VideoStatus />
      <VideoLibrary clientId={a.payload.clientId} />
      {saved && (
        <Link
          className="text-link action-link"
          to={
            snapshot.savedId
              ? `/historico/${snapshot.savedId}`
              : `/historico/local/${a.payload.clientId}`
          }
        >
          Abrir atividade no histórico
        </Link>
      )}
      {a.payload.speedProcessing?.truncated && (
        <p>
          Histórico de velocidade incompleto: limite atingido ou amostras sem
          referência temporal válida. Os pontos GPS foram preservados.
        </p>
      )}
      <RideMap
        gps={{ ...rideGps(snapshot), overview: true }}
        plan={a.payload.route?.plan ?? null}
      />
      <p>
        {a.payload.points.length} pontos GPS aceitos ·{' '}
        {new Set(a.payload.points.map((p) => p.segment)).size} segmentos.
        Marcadores I/F indicam início e fim.
      </p>
      <div className="account-field">
        <span>Visibilidade da atividade</span>
        <ChoiceSelect
          aria-label="Visibilidade da atividade"
          value={a.payload.visibility}
          disabled={snapshot.state !== 'finished'}
          onChange={(e) =>
            controller.setVisibility(e.target.value as 'public' | 'private')
          }
        >
          <option value="public">Público</option>
          <option value="private">Privado</option>
        </ChoiceSelect>
      </div>
      <p>
        Os pontos completos e os eventos de desempenho permanecem acessíveis
        somente à sua conta nesta etapa, inclusive em atividades públicas.
      </p>
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      {saved ? (
        <>
          <p role="status">
            {snapshot.savedLocally
              ? 'Atividade salva no aparelho. Acompanhe a confirmação na seção de sincronização.'
              : 'Atividade salva com sucesso.'}
          </p>
          <Button variant="primary" onClick={controller.reset}>
            Preparar novo Ride
          </Button>
        </>
      ) : (
        <div className="session-summary-actions">
          <Button
            variant="primary"
            disabled={saving || user?.id !== a.ownerId}
            onClick={() => void controller.save(user?.id ?? '')}
          >
            {saving
              ? 'Salvando…'
              : snapshot.state === 'error'
                ? 'Tentar salvar novamente'
                : 'Salvar atividade'}
          </Button>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={async () => {
              if (
                window.confirm(
                  'Descartar esta atividade e seus vídeos locais? Os dados temporários serão apagados e não serão salvos. Se uma tentativa de envio ficou sem resposta, ela pode já ter sido recebida pelo servidor.',
                )
              ) {
                await controller.discard();
                controller.reset();
              }
            }}
          >
            Descartar atividade
          </Button>
        </div>
      )}
      {!saved && user?.id !== a.ownerId && (
        <p>Entre na conta que iniciou o Ride para salvar esta atividade.</p>
      )}
    </section>
  );
}
