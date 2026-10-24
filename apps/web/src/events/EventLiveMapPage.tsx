import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useRide } from '../ride/context';
import { useAuth } from '../auth/useAuth';
import { authRequest } from '../services/auth';
import { useLiveLocation } from './live-context';
import { events } from './service';
import { EventMap } from './EventMap';
import type { EventMapData, LivePosition } from './types';
import '../styles/events.css';
export function EventLiveMapPage() {
  const { id = '' } = useParams(),
    { user } = useAuth(),
    { controller: ride, snapshot } = useRide(),
    { controller, state } = useLiveLocation();
  const [data, setData] = useState<EventMapData | null>(null),
    [positions, setPositions] = useState<LivePosition[]>([]),
    [error, setError] = useState(''),
    [connection, setConnection] = useState('Aguardando conexão…'),
    [audience, setAudience] = useState('organizers'),
    [precision, setPrecision] = useState('approximate'),
    [duration, setDuration] = useState(30),
    [confirm, setConfirm] = useState(false),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined,
      working = false,
      failures = 0,
      cached: EventMapData | null = null;
    const load = async () => {
      if (working || abort.signal.aborted) return;
      if (!navigator.onLine || document.visibilityState === 'hidden') {
        setPositions([]);
        setConnection('Sem atualização: página suspensa ou sem internet.');
        timer = setTimeout(() => void load(), 5000);
        return;
      }
      working = true;
      try {
        const detail = await events.detail(id, abort.signal);
        const r =
          cached?.event.revision === detail.event.revision
            ? { ...cached, event: detail.event }
            : await events.map(id, abort.signal);
        cached = r;
        if (!r.event.confirmed || r.event.status !== 'ongoing')
          throw new Error(
            'Mapa social disponível somente durante o evento, para participantes confirmados.',
          );
        const result = await authRequest<{
          items: LivePosition[];
          serverTime: string;
        }>(
          `/events/${id}/live-location/participants`,
          'GET',
          undefined,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        const offset = Date.now() - Date.parse(result.serverTime);
        setData(r);
        setPositions(
          result.items.map((p) => ({
            ...p,
            expires_at: new Date(
              Date.parse(p.expires_at) + offset,
            ).toISOString(),
            received_at: new Date(
              Date.parse(p.received_at) + offset,
            ).toISOString(),
          })),
        );
        setConnection('Conectado · atualizações a cada 5 segundos');
        setError('');
        failures = 0;
      } catch (e) {
        if (!abort.signal.aborted) {
          setPositions([]);
          setData(null);
          setError((e as Error).message);
          setConnection(
            'Conexão não confirmada. Nenhuma posição atual disponível.',
          );
          failures++;
        }
      } finally {
        working = false;
        if (!abort.signal.aborted)
          timer = setTimeout(
            () => void load(),
            Math.min(30000, 5000 * 2 ** Math.min(failures, 3)),
          );
      }
    };
    void load();
    const clear = () => {
      if (!navigator.onLine || document.visibilityState === 'hidden')
        setPositions([]);
    };
    document.addEventListener('visibilitychange', clear);
    window.addEventListener('offline', clear);
    return () => {
      abort.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', clear);
      window.removeEventListener('offline', clear);
    };
  }, [id, user]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => () => ride.stopPreview(), [ride]);
  const current = positions
    .filter(
      (p) =>
        Date.parse(p.expires_at) > now &&
        (p.user_id !== user?.id || p.id === state.session?.id),
    )
    .map((p) => ({
      ...p,
      freshness: (now - Date.parse(p.received_at) > 15000
        ? 'stale'
        : p.freshness) as 'stale' | 'fresh',
    }));
  const session = state.eventId === id ? state.session : null;
  async function start() {
    setError('');
    try {
      await controller.start(id, data!.event.title, {
        consent: confirm,
        consentVersion: 'live-v1',
        audience,
        precision,
        durationMinutes: duration,
      });
      setConfirm(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="events-page">
      <Link className="text-link" to={`/comunidade/eventos/${id}`}>
        Voltar ao evento
      </Link>
      <h1>Mapa social do encontro</h1>
      <p role="status">{connection}</p>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <EventMap
            data={data}
            positions={current}
            own={
              snapshot.gps.reading &&
              now - snapshot.gps.reading.timestamp < 15000
                ? snapshot.gps.reading
                : null
            }
          />
          <section className="panel social-summary">
            <h2>Minha localização</h2>
            <p>
              O marcador azul permanece neste aparelho. Isso não autoriza o
              envio a outras pessoas.
            </p>
            <button className="button" onClick={() => ride.activateGps()}>
              Mostrar minha localização neste aparelho
            </button>
            <p>{snapshot.gps.message}</p>
            {snapshot.gps.active && !snapshot.activity && !session && (
              <button className="button" onClick={() => ride.stopPreview()}>
                Encerrar GPS local
              </button>
            )}
          </section>
          <section className="panel social-summary">
            <h2>Localização temporária</h2>
            <p role="status">
              {session ? state.message : 'Localização não compartilhada.'}
            </p>
            {session ? (
              <div className="event-consent">
                <p>
                  {session.audience_scope === 'organizers'
                    ? 'Somente organizadores'
                    : 'Participantes confirmados'}{' '}
                  ·{' '}
                  {session.precision_mode === 'approximate'
                    ? 'Aproximada'
                    : 'Mais precisa'}{' '}
                  · expira em{' '}
                  {Math.max(
                    0,
                    Math.ceil((Date.parse(session.expires_at) - now) / 60000),
                  )}{' '}
                  min
                </p>
                <p>
                  {state.lastAck
                    ? `Última confirmação do servidor: ${Math.floor((now - state.lastAck) / 1000)} s atrás`
                    : 'Aguardando nova leitura GPS após seu consentimento.'}
                </p>
                <button
                  className="button button-primary"
                  onClick={() => controller.stop()}
                >
                  Parar compartilhamento
                </button>
                <p>
                  Para alterar o público ou prorrogar, pare e autorize uma nova
                  sessão.
                </p>
              </div>
            ) : (
              <fieldset className="account-form" disabled={state.starting}>
                <label className="account-field">
                  Quem pode ver minha localização
                  <select
                    value={audience}
                    onChange={(e) => {
                      setAudience(e.target.value);
                      setConfirm(false);
                    }}
                  >
                    <option value="organizers">Somente organizadores</option>
                    <option value="confirmed">Participantes confirmados</option>
                  </select>
                </label>
                <label className="account-field">
                  Duração do compartilhamento
                  <select
                    value={duration}
                    onChange={(e) => {
                      setDuration(Number(e.target.value));
                      setConfirm(false);
                    }}
                  >
                    {[15, 30, 60, 120, 240].map((n) => (
                      <option key={n} value={n}>
                        {n} minutos
                      </option>
                    ))}
                  </select>
                </label>
                <label className="account-field">
                  Precisão da localização
                  <select
                    value={precision}
                    onChange={(e) => {
                      setPrecision(e.target.value);
                      setConfirm(false);
                    }}
                  >
                    <option value="approximate">
                      Aproximada · área de cerca de 1,6 km
                    </option>
                    <option value="precise">
                      Mais precisa · precisão informada pelo GPS
                    </option>
                  </select>
                </label>
                <p>
                  Os destinatários autorizados poderão ver sua localização
                  durante o prazo escolhido, limitado ao encerramento do evento.
                  Participar não ativa o GPS. Você pode parar a qualquer
                  momento. Não há promessa de anonimato.
                </p>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  Autorizo compartilhar minha localização neste evento com o
                  público, prazo e precisão acima.
                </label>
                <button
                  className="button button-primary"
                  disabled={!confirm}
                  onClick={() => void start()}
                >
                  {state.starting
                    ? 'Autorizando…'
                    : 'Ativar localização ao vivo'}
                </button>
              </fieldset>
            )}
            <p>
              Perda de rede, troca de aplicativo ou tela bloqueada interrompem
              esta sessão. Para retomar, autorize novamente. Não há envio de
              posições acumuladas.
            </p>
            <p>
              Configure antes de sair e use o mapa com a moto parada. O recurso
              não é um serviço de emergência.
            </p>
          </section>
          <section className="panel social-summary">
            <h2>Posições autorizadas ({current.length})</h2>
            {current.length === 0 ? (
              <p>
                Nenhum participante está compartilhando uma posição recente com
                você.
              </p>
            ) : (
              current.map((p) => (
                <p key={p.id}>
                  {p.display_name} ·{' '}
                  {p.precision_mode === 'approximate' ? 'Aproximada' : 'GPS'} ·
                  precisão de {Math.round(p.accuracy)} m ·{' '}
                  {p.freshness === 'stale' ? 'Desatualizada' : 'Atualizada'} ·
                  há{' '}
                  {Math.max(
                    0,
                    Math.floor((now - Date.parse(p.received_at)) / 1000),
                  )}{' '}
                  s
                </p>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
