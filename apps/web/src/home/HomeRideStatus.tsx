import { ChevronRight, Cloud, Navigation, Radio, Video } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useAuth } from '../auth/useAuth';
import { RideIcon } from '../components/Brand';
import { Badge, ButtonLink, Card } from '../components/design-system';
import { useRide } from '../ride/context';
import { formatDuration } from '../ride/format';
import { useRideVideo } from '../video/context';
import type { HomeOffline } from './useHomeOffline';

export function HomeQuickRide({ local }: { local: HomeOffline }) {
  const { user } = useAuth();
  const { snapshot } = useRide();
  const activity =
    snapshot.activity?.ownerId === user?.id ? snapshot.activity : null;
  const ongoing = activity && !['saved', 'discarded'].includes(snapshot.state);
  const recovery = local.sessions.find(
    (row) =>
      !row.confirmation &&
      row.decision === 'review' &&
      row.payload.clientId !== activity?.payload.clientId,
  );
  const title = ongoing
    ? snapshot.state === 'running'
      ? 'Ride em andamento'
      : snapshot.state === 'paused'
        ? 'Ride pausado'
        : snapshot.state === 'waiting-gps'
          ? 'Ride aguardando GPS'
          : 'Ride aguardando conclusão'
    : recovery
      ? 'Ride aguardando revisão'
      : 'Vamos pilotar?';
  // The controller's intervals are authoritative; paused time is never added.
  const elapsed = activity
    ? activity.payload.intervals.reduce(
        (sum, item) => sum + Math.max(0, item.end - item.start),
        0,
      ) +
      (snapshot.state === 'running' && activity.activeStart !== null
        ? Math.max(0, snapshot.now - activity.activeStart)
        : 0)
    : null;
  return (
    <Card className="home-quick-ride" aria-label="Acesso rápido ao Ride">
      <span className="home-quick-icon" aria-hidden>
        <RideIcon size={30} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>
          {ongoing && elapsed !== null
            ? `${formatDuration(elapsed)} de tempo ativo`
            : recovery
              ? 'Confira a atividade salva neste aparelho.'
              : 'Prepare sua moto e escolha como quer pilotar.'}
        </p>
      </div>
      <ButtonLink
        to={
          ongoing
            ? '/ride'
            : recovery
              ? `/historico/local/${recovery.payload.clientId}`
              : '/ride'
        }
        variant="secondary"
      >
        {ongoing
          ? 'Voltar ao Ride'
          : recovery
            ? 'Revisar Ride'
            : 'Preparar Ride'}
        <ChevronRight size={18} aria-hidden />
      </ButtonLink>
    </Card>
  );
}

export function HomeSystemStatus({ local }: { local: HomeOffline }) {
  const { snapshot, controller } = useRide();
  const motion = useSyncExternalStore(
    controller.motion.subscribe,
    controller.motion.getSnapshot,
  );
  const { snapshot: video } = useRideVideo();
  const gps = snapshot.gps;
  const gpsText =
    gps.status === 'available' && gps.active && gps.reading
      ? snapshot.state === 'running'
        ? 'Capturando'
        : 'Disponível'
      : gps.status === 'idle'
        ? 'Não iniciado'
        : gps.status === 'waiting'
          ? 'Aguardando sinal'
          : gps.status === 'denied'
            ? 'Permissão negada'
            : ['reduced', 'stale', 'suspended'].includes(gps.status)
              ? 'Sinal insuficiente'
              : 'Indisponível';
  const sensorText =
    motion.sensor.status === 'working' && motion.sensor.active
      ? motion.calibration
        ? 'Ativos'
        : 'Calibrar'
      : motion.sensor.status === 'idle'
        ? 'Não configurados'
        : motion.sensor.status === 'requesting'
          ? 'Aguardando permissão'
          : motion.sensor.status === 'denied'
            ? 'Permissão negada'
            : motion.sensor.active
              ? 'Aguardando leitura'
              : 'Indisponíveis';
  const videoText =
    video.state === 'recording'
      ? 'Gravando'
      : video.state === 'paused'
        ? 'Pausado'
        : video.state === 'disabled'
          ? 'Não iniciado'
          : video.state === 'permission'
            ? 'Permissão necessária'
            : video.state === 'preview' && video.stream
              ? 'Prévia disponível'
              : ['error', 'storage-full', 'interrupted'].includes(video.state)
                ? 'Indisponível'
                : 'Preparando';
  const pending = local.queue.filter((item) => item.state !== 'confirmed');
  const syncError =
    local.error ||
    pending.some((item) =>
      ['temporary', 'permanent', 'auth'].includes(item.state),
    );
  const connection =
    local.connection === 'offline'
      ? 'Sem conexão'
      : syncError
        ? 'Erro ao sincronizar'
        : pending.length
          ? `${pending.length} pendente${pending.length > 1 ? 's' : ''}`
          : local.connection === 'online'
            ? 'Conectado'
            : local.connection === 'checking'
              ? 'Verificando'
              : 'Conexão limitada';
  const items = [
    {
      label: 'GPS',
      text: gpsText,
      icon: Navigation,
      positive: gpsText === 'Capturando' || gpsText === 'Disponível',
    },
    {
      label: 'Sensores',
      text: sensorText,
      icon: Radio,
      positive: sensorText === 'Ativos',
    },
    {
      label: 'Vídeo',
      text: videoText,
      icon: Video,
      positive: video.state === 'recording',
    },
    {
      label: 'Conexão',
      text: connection,
      icon: Cloud,
      positive: local.connection === 'online' && !pending.length && !syncError,
    },
  ];
  return (
    <Card className="home-status" aria-label="Status do sistema">
      <div className="home-section-title">
        <h2>Status do sistema</h2>
        <span>
          {local.connection === 'offline'
            ? 'Dados no aparelho preservados'
            : 'Pronto para a próxima rota?'}
        </span>
      </div>
      <div className="home-status-grid">
        {items.map(({ label, text, icon: Icon, positive }) => (
          <div className="home-status-item" key={label}>
            <Icon size={26} aria-hidden />
            <div>
              <h3>{label}</h3>
              <Badge tone={positive ? 'positive' : 'neutral'}>{text}</Badge>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
