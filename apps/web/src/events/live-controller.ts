import type { GpsPreview } from '../services/gps/preview';
import { authRequest, ApiError } from '../services/auth';
import type { LiveSession } from './types';
type Request = typeof authRequest;
export interface LiveState {
  eventId: string | null;
  eventTitle: string;
  session: LiveSession | null;
  starting: boolean;
  message: string;
  lastAck: number | null;
  now: number;
}
interface Revocation {
  owner: string;
  event: string;
  session: string;
}
const queueKey = 'apex:live-revocations:v1';
// Only revocation identifiers are persisted. No GPS, consent resume or offline queue.
function queueRead(): Revocation[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(queueKey) ?? '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (x): x is Revocation =>
              !!x &&
              typeof x === 'object' &&
              typeof x.owner === 'string' &&
              typeof x.event === 'string' &&
              typeof x.session === 'string',
          )
          .slice(-100)
      : [];
  } catch {
    return [];
  }
}
function queueWrite(items: Revocation[]) {
  try {
    localStorage.setItem(queueKey, JSON.stringify(items.slice(-100)));
  } catch {
    /* Server position still expires after 30 seconds. */
  }
}
export class LiveLocationController {
  private state: LiveState = {
    eventId: null,
    eventTitle: '',
    session: null,
    starting: false,
    message: 'Localização não compartilhada.',
    lastAck: null,
    now: Date.now(),
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private sending = false;
  private lastSent = 0;
  private ownerId: string | null = null;
  private ownsGps = false;
  private boundRide: string | null = null;
  private gpsOff: (() => void) | null = null;
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  constructor(
    private gps: GpsPreview,
    private request: Request = authRequest,
    private rideId: () => string | null = () => null,
    private rideActive: () => boolean = () => false,
  ) {}
  private publish(patch: Partial<LiveState>) {
    this.state = { ...this.state, ...patch, now: Date.now() };
    this.listeners.forEach((fn) => fn());
  }
  owner = (owner: string | null) => {
    if (owner !== this.ownerId) {
      this.stop('Localização não compartilhada.');
      this.ownerId = owner;
    }
    if (owner) void this.flush();
  };
  async flush() {
    const owner = this.ownerId;
    if (!owner || !navigator.onLine) return;
    for (const rev of queueRead().filter((x) => x.owner === owner)) {
      try {
        await this.request(`/events/${rev.event}/live-location/stop`, 'POST', {
          sessionId: rev.session,
        });
        queueWrite(queueRead().filter((x) => x.session !== rev.session));
      } catch {
        return;
      }
    }
  }
  private revoke(event: string, session: string, owner: string) {
    const list = queueRead();
    if (!list.some((x) => x.session === session))
      queueWrite([...list, { owner, event, session }]);
    if (this.ownerId === owner) void this.flush();
  }
  start = async (eventId: string, eventTitle: string, body: unknown) => {
    if (
      !this.ownerId ||
      !navigator.onLine ||
      document.visibilityState === 'hidden'
    )
      throw new Error(
        'Entre na conta e mantenha esta página aberta com internet.',
      );
    this.stop();
    const generation = ++this.generation,
      owner = this.ownerId;
    this.publish({
      starting: true,
      eventId,
      eventTitle,
      message: 'Registrando sua autorização…',
    });
    try {
      const { session } = await this.request<{ session: LiveSession }>(
        `/events/${eventId}/live-location/start`,
        'POST',
        body,
      );
      if (generation !== this.generation || owner !== this.ownerId) {
        this.revoke(eventId, session.id, owner);
        return;
      }
      this.boundRide = this.rideId();
      this.lastSent = 0;
      this.publish({
        session,
        starting: false,
        message: 'Consentimento ativo. Aguardando uma nova posição GPS.',
        lastAck: null,
      });
      this.ownsGps = !this.gps.getSnapshot().active;
      this.gps.start();
      this.gpsOff = this.gps.subscribe(() => {
        const s = this.gps.getSnapshot();
        if (
          ['denied', 'unsupported', 'insecure', 'unavailable'].includes(
            s.status,
          )
        )
          this.stop(s.message);
      });
      const gps = this.gps.getSnapshot();
      if (
        ['denied', 'unsupported', 'insecure', 'unavailable'].includes(
          gps.status,
        )
      )
        this.stop(gps.message);
    } catch (error) {
      if (generation === this.generation)
        this.publish({
          starting: false,
          session: null,
          message: (error as Error).message,
        });
      throw error;
    }
  };
  stop = (
    message = 'Compartilhamento interrompido. Localização não compartilhada.',
  ) => {
    ++this.generation;
    const { eventId, session } = this.state;
    this.gpsOff?.();
    this.gpsOff = null;
    this.publish({ session: null, starting: false, lastAck: null, message });
    if (this.ownsGps && !this.rideActive()) this.gps.stop();
    this.ownsGps = false;
    if (eventId && session && this.ownerId)
      this.revoke(eventId, session.id, this.ownerId);
  };
  rideChanged = () => {
    if (!this.state.session) return;
    const current = this.rideId();
    if (this.boundRide && current !== this.boundRide)
      this.stop('Ride finalizado. Localização não compartilhada.');
    else if (current) this.boundRide = current;
  };
  tick = async () => {
    const { session, eventId } = this.state;
    this.publish({});
    if (!session || !eventId || this.sending) return;
    if (Date.now() >= Date.parse(session.expires_at)) {
      this.stop('Sessão expirada. Autorize novamente para compartilhar.');
      return;
    }
    if (!navigator.onLine || document.visibilityState === 'hidden') {
      this.stop(
        'Compartilhamento interrompido por conexão ou página suspensa.',
      );
      return;
    }
    if (this.boundRide && this.rideId() !== this.boundRide) {
      this.stop('Ride finalizado. Localização não compartilhada.');
      return;
    }
    this.sending = true;
    const generation = this.generation;
    try {
      // Revalidate even while GPS has no new fix, so revocation is reflected.
      const me = await this.request<{ session: LiveSession | null }>(
        `/events/${eventId}/live-location/me`,
      );
      if (generation !== this.generation) return;
      if (me.session?.id !== session.id) {
        this.stop('Compartilhamento encerrado pelo servidor.');
        return;
      }
      const reading = this.gps.getSnapshot().reading;
      if (
        !reading ||
        reading.timestamp <= Date.parse(session.started_at) ||
        Date.now() - reading.timestamp > 10000 ||
        reading.timestamp <= this.lastSent ||
        reading.accuracy > 200
      )
        return;
      await this.request(`/events/${eventId}/live-location/position`, 'POST', {
        sessionId: session.id,
        longitude: reading.longitude,
        latitude: reading.latitude,
        accuracy: reading.accuracy,
        timestamp: reading.timestamp,
      });
      if (generation === this.generation) {
        this.lastSent = reading.timestamp;
        this.publish({
          lastAck: Date.now(),
          message: 'Posição recebida pelo servidor.',
        });
      }
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof ApiError && [400, 429].includes(error.status)) {
        this.publish({ message: error.message });
        return;
      }
      this.stop((error as Error).message);
    } finally {
      this.sending = false;
    }
  };
}
