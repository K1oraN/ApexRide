import { GPS_CONFIG } from './config';
import { GeolocationWatch } from './geolocation';
import {
  normalizePosition,
  speedKmh,
  validateReading,
  type LocationReading,
} from './readings';
import { PreviewTrack, type PreviewSegments } from './track';

export type GpsStatus =
  | 'idle'
  | 'waiting'
  | 'available'
  | 'reduced'
  | 'stale'
  | 'unavailable'
  | 'denied'
  | 'unsupported'
  | 'insecure'
  | 'suspended';
export interface GpsSnapshot {
  overview?: boolean;
  status: GpsStatus;
  active: boolean;
  message: string;
  reading: LocationReading | null;
  speedKmh: number | null;
  segments: PreviewSegments;
}

const initial = (): GpsSnapshot => ({
  status: 'idle',
  active: false,
  message: 'Ative o GPS para visualizar sua posição e velocidade nesta prévia.',
  reading: null,
  speedKmh: null,
  segments: [],
});

export class GpsPreview {
  private snapshot = initial();
  private listeners = new Set<() => void>();
  private watch: GeolocationWatch | null = null;
  private track = new PreviewTrack();
  private lastGood: LocationReading | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private permission: PermissionStatus | null = null;
  private generation = 0;
  private startedAt = 0;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(patch: Partial<GpsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  start = () => {
    if (this.snapshot.active) return;
    if (!window.isSecureContext) {
      this.publish({
        status: 'insecure',
        message:
          'O GPS precisa de HTTPS ou de um endereço local seguro permitido pelo navegador.',
      });
      return;
    }
    if (!navigator.geolocation) {
      this.publish({
        status: 'unsupported',
        message:
          'Este navegador não oferece localização. Tente um navegador compatível.',
      });
      return;
    }
    this.cleanup();
    this.track.clear();
    this.lastGood = null;
    this.startedAt = Date.now();
    this.publish({
      ...initial(),
      active: true,
      status: 'waiting',
      message: 'Aguardando autorização e um sinal GPS utilizável.',
    });
    this.watch = new GeolocationWatch(navigator.geolocation);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    window.addEventListener('pagehide', this.stop);
    this.timer = setInterval(this.checkFreshness, GPS_CONFIG.healthIntervalMs);
    this.beginWatch();
    // Consultar permissão não solicita localização. Safari sem Permissions API
    // continua protegido pelo callback de erro do próprio watchPosition.
    const generation = this.generation;
    try {
      void navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((permission) => {
          if (generation !== this.generation || !this.snapshot.active) return;
          this.permission = permission;
          permission.addEventListener('change', this.permissionChanged);
          this.permissionChanged();
        })
        .catch(() => {});
    } catch {
      /* API opcional; watchPosition permanece a fonte de verdade. */
    }
  };

  private beginWatch() {
    if (document.visibilityState === 'hidden') {
      this.visibilityChanged();
      return;
    }
    try {
      this.watch?.start(this.receive, this.failure);
    } catch {
      this.cleanup();
      this.publish({
        active: false,
        status: 'unavailable',
        speedKmh: null,
        message:
          'Não foi possível acessar a localização. Confira as permissões e tente novamente.',
      });
    }
  }

  private receive = (position: GeolocationPosition) => {
    const reading = normalizePosition(position);
    const quality = validateReading(reading, this.snapshot.reading, Date.now());
    if (quality === 'duplicate') {
      this.checkFreshness();
      return;
    }
    if (quality !== 'good' && quality !== 'reduced') {
      this.track.breakSegment();
      this.publish({
        status: quality === 'stale' ? 'stale' : 'reduced',
        speedKmh: null,
        message:
          quality === 'stale'
            ? 'Leitura antiga. Aguardando uma posição atual.'
            : 'Leitura inconsistente descartada. Aguardando um sinal melhor.',
      });
      return;
    }
    // Comparar também ao último ponto preciso impede que um ponto impreciso
    // intermediário legitime um salto no traçado.
    const trackQuality = validateReading(reading, this.lastGood, Date.now());
    if (quality === 'reduced' || trackQuality === 'jump') {
      this.track.breakSegment();
      this.publish({
        reading,
        speedKmh: null,
        status: 'reduced',
        message:
          'Precisão reduzida. Velocidade e traçado aguardam leituras confiáveis.',
      });
      return;
    }
    this.lastGood = reading;
    this.publish({
      reading,
      speedKmh: speedKmh(reading.speed),
      segments: this.track.append(reading),
      status: 'available',
      message:
        reading.speed === null
          ? 'GPS disponível. Este aparelho não informou a velocidade.'
          : 'GPS disponível · velocidade fornecida pelo dispositivo.',
    });
  };

  private failure = (error: GeolocationPositionError) => {
    this.track.breakSegment();
    if (error.code === 1) {
      this.cleanup();
      this.track.clear();
      this.lastGood = null;
      this.publish({
        ...initial(),
        status: 'denied',
        message:
          'Localização não autorizada. Revise a permissão deste site nas configurações do navegador e ative o GPS novamente.',
      });
      return;
    }
    this.publish({
      status: 'unavailable',
      speedKmh: null,
      message:
        error.code === 3
          ? 'Tempo esgotado ao buscar o sinal. Aguardando atualização; você pode tentar novamente.'
          : 'Localização indisponível no momento. Confira o GPS do aparelho e tente novamente.',
    });
  };

  private permissionChanged = () => {
    if (this.permission?.state === 'denied')
      this.failure({ code: 1 } as GeolocationPositionError);
  };

  private checkFreshness = () => {
    if (!this.snapshot.active || this.snapshot.status === 'suspended') return;
    if (
      Date.now() - (this.snapshot.reading?.timestamp ?? this.startedAt) >=
        GPS_CONFIG.staleAfterMs &&
      (this.snapshot.status === 'waiting' ||
        this.snapshot.status === 'available' ||
        this.snapshot.status === 'reduced')
    ) {
      this.track.breakSegment();
      this.publish({
        status: 'stale',
        speedKmh: null,
        message:
          'Sinal desatualizado. Aguardando uma nova posição; pode haver uma lacuna no percurso.',
      });
    }
  };

  private visibilityChanged = () => {
    if (!this.snapshot.active) return;
    this.track.breakSegment();
    if (document.visibilityState === 'hidden') {
      this.watch?.stop();
      this.publish({
        status: 'suspended',
        speedKmh: null,
        message:
          'Prévia interrompida enquanto a página está oculta. O GPS não é garantido com a tela bloqueada.',
      });
    } else {
      this.startedAt = Date.now();
      this.publish({
        status: 'waiting',
        speedKmh: null,
        message: 'Página retomada. Aguardando uma nova leitura GPS.',
      });
      this.beginWatch();
    }
  };

  private cleanup() {
    this.generation++;
    this.watch?.stop();
    this.watch = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.permission?.removeEventListener('change', this.permissionChanged);
    this.permission = null;
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    window.removeEventListener('pagehide', this.stop);
  }

  stop = () => {
    this.cleanup();
    this.track.clear();
    this.lastGood = null;
    this.publish(initial());
  };

  retry = () => {
    this.stop();
    this.start();
  };
}
