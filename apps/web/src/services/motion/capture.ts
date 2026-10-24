import { MOTION_RULES } from '@apex-ride/ride-core/motion';
import { eventTimeValid, finite, vector } from './normalize';
import type { Orientation, RawMotion, SensorSnapshot } from './types';

type PermissionConstructor = {
  requestPermission?: () => Promise<PermissionState>;
};
export class MotionCapture {
  private snapshot: SensorSnapshot = {
    policyWarning: null,
    status: 'idle',
    active: false,
    message: 'Sensores não iniciados. GPS pode ser utilizado sozinho.',
    capabilities: { motion: false, orientation: false },
  };
  private stateListeners = new Set<() => void>();
  private dataListeners = new Set<(sample: RawMotion) => void>();
  private gapListeners = new Set<(reason: 'signal' | 'hidden') => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private last = -Infinity;
  private eventTime = -Infinity;
  private orientationTime = -Infinity;
  private sequence = 0;
  private orientation: Orientation | null = null;
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  };
  onSample(fn: (s: RawMotion) => void) {
    this.dataListeners.add(fn);
    return () => {
      this.dataListeners.delete(fn);
    };
  }
  onGap(fn: (reason: 'signal' | 'hidden') => void) {
    this.gapListeners.add(fn);
    return () => {
      this.gapListeners.delete(fn);
    };
  }
  private publish(patch: Partial<SensorSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.stateListeners.forEach((f) => f());
  }
  detect = () => {
    const capabilities = {
      motion: typeof window.DeviceMotionEvent !== 'undefined',
      orientation: typeof window.DeviceOrientationEvent !== 'undefined',
    };
    this.publish({ capabilities });
    return capabilities;
  };
  // Os dois pedidos começam sincronicamente no clique, antes de qualquer await.
  activate = async () => {
    if (
      this.snapshot.active ||
      this.snapshot.status === 'requesting' ||
      this.snapshot.status === 'denied'
    )
      return;
    const capabilities = this.detect();
    const policy = document as Document & {
      permissionsPolicy?: { allowsFeature(name: string): boolean };
      featurePolicy?: { allowsFeature(name: string): boolean };
    };
    const permissions = policy.permissionsPolicy ?? policy.featurePolicy;
    this.publish({
      policyWarning:
        permissions?.allowsFeature('gyroscope') === false
          ? 'Giroscópio bloqueado pela Permissions-Policy: calibração e força G indisponíveis. GPS básico permanece disponível.'
          : null,
    });
    if (
      !window.isSecureContext ||
      !capabilities.motion ||
      permissions?.allowsFeature('accelerometer') === false
    ) {
      this.publish({
        status: 'unavailable',
        message:
          'Movimento indisponível. Use HTTPS e confira a Permissions-Policy de acelerômetro. GPS básico permanece disponível.',
      });
      return;
    }
    const generation = ++this.generation;
    this.publish({
      status: 'requesting',
      message: 'Aguardando autorização dos sensores.',
    });
    const request = (api: PermissionConstructor | undefined) => {
      try {
        return (
          api?.requestPermission?.() ?? Promise.resolve('granted' as const)
        );
      } catch {
        return Promise.resolve('denied' as const);
      }
    };
    const motion = request(window.DeviceMotionEvent as PermissionConstructor);
    const orientation = capabilities.orientation
      ? request(window.DeviceOrientationEvent as PermissionConstructor)
      : Promise.resolve('denied');
    const [m, o] = await Promise.allSettled([motion, orientation]);
    if (generation !== this.generation) return;
    if (m.status !== 'fulfilled' || m.value !== 'granted') {
      this.publish({
        status: 'denied',
        message:
          'Permissão de movimento negada. GPS básico permanece disponível.',
      });
      return;
    }
    this.publish({ status: 'authorized', message: 'Sensores autorizados.' });
    this.last = performance.now();
    this.eventTime = this.orientationTime = -Infinity;
    window.addEventListener('devicemotion', this.motion);
    if (o.status === 'fulfilled' && o.value === 'granted')
      window.addEventListener('deviceorientation', this.orient);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.pagehide);
    this.timer = setInterval(this.check, 500);
    this.publish({
      active: true,
      status: 'waiting',
      message: 'Aguardando leituras reais dos sensores.',
    });
  };
  private orient = (e: DeviceOrientationEvent) => {
    if (
      !eventTimeValid(e.timeStamp) ||
      e.timeStamp <= this.orientationTime ||
      document.hidden
    )
      return;
    this.orientationTime = e.timeStamp;
    this.orientation = {
      alpha: finite(e.alpha) ? e.alpha : null,
      beta: finite(e.beta) ? e.beta : null,
      gamma: finite(e.gamma) ? e.gamma : null,
      absolute: e.absolute,
      monotonicMs: performance.now(),
    };
  };
  private motion = (e: DeviceMotionEvent) => {
    if (
      document.hidden ||
      !eventTimeValid(e.timeStamp) ||
      e.timeStamp <= this.eventTime
    )
      return;
    const now = performance.now();
    if (now - this.last >= MOTION_RULES.gapMs) this.interrupt('signal');
    this.eventTime = e.timeStamp;
    const angle =
      window.screen.orientation?.angle ??
      (window as Window & { orientation?: number }).orientation;
    const sample: RawMotion = {
      sequence: ++this.sequence,
      timestamp: Date.now(),
      monotonicMs: now,
      eventTimestamp: e.timeStamp,
      acceleration: vector(e.acceleration),
      gravity: vector(e.accelerationIncludingGravity),
      angular:
        e.rotationRate &&
        finite(e.rotationRate.beta) &&
        finite(e.rotationRate.gamma) &&
        finite(e.rotationRate.alpha)
          ? [e.rotationRate.beta, e.rotationRate.gamma, e.rotationRate.alpha]
          : null,
      orientation:
        this.orientation &&
        now - this.orientation.monotonicMs < MOTION_RULES.gapMs
          ? this.orientation
          : null,
      interval: finite(e.interval) && e.interval > 0 ? e.interval : null,
      screenAngle: finite(angle) ? ((angle % 360) + 360) % 360 : null,
    };
    if (!sample.acceleration && !sample.gravity && !sample.angular) {
      if (this.snapshot.status !== 'insufficient')
        this.publish({
          status: 'insufficient',
          message:
            'Eventos recebidos sem valores utilizáveis. Força G e inclinação indisponíveis.',
        });
      return;
    }
    this.last = now;
    if (this.snapshot.status !== 'working')
      this.publish({
        status: 'working',
        message:
          'Sensores funcionando. Calibre parado para estimar força G. Inclinação dinâmica indisponível até homologação.',
      });
    this.dataListeners.forEach((f) => f(sample));
  };
  private interrupt(reason: 'signal' | 'hidden') {
    if (this.snapshot.status === 'interrupted') return;
    this.orientation = null;
    this.gapListeners.forEach((f) => f(reason));
    this.publish({
      status: 'interrupted',
      message:
        'Sinal interrompido. Força G indisponível; recalibre somente após parar. GPS permanece independente.',
    });
  }
  private check = () => {
    if (performance.now() - this.last >= MOTION_RULES.gapMs)
      this.interrupt('signal');
  };
  private visibility = () => {
    if (document.hidden) this.interrupt('hidden');
  };
  private pagehide = () => {
    this.interrupt('hidden');
    this.stop();
  };
  stop = () => {
    ++this.generation;
    window.removeEventListener('devicemotion', this.motion);
    window.removeEventListener('deviceorientation', this.orient);
    window.removeEventListener('pagehide', this.pagehide);
    document.removeEventListener('visibilitychange', this.visibility);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.orientation = null;
    this.publish({
      active: false,
      ...(this.snapshot.status === 'denied'
        ? {}
        : {
            status: 'idle' as const,
            message: 'Coleta de sensores encerrada.',
          }),
    });
  };
}
