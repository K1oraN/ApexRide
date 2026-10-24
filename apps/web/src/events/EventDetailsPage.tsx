import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { apiUrl } from '../services/auth';
import { useAuth } from '../auth/useAuth';
import { Composer } from '../social/Composer';
import { events } from './service';
import {
  eventDate,
  participationLabel,
  statusLabel,
  type EventMapData,
} from './types';
import { EventMap } from './EventMap';
import { EventForm } from './EventForm';
import { EventParticipants, EventInvites } from './EventParticipants';
import { useLiveLocation } from './live-context';
import '../styles/events.css';
export function EventCreatePage() {
  return (
    <div className="events-page">
      <Link className="text-link" to="/comunidade/eventos">
        Voltar aos eventos
      </Link>
      <EventForm />
    </div>
  );
}
export function EventDetailsPage() {
  const { id = '' } = useParams(),
    { user } = useAuth(),
    { controller: live, state } = useLiveLocation();
  const [data, setData] = useState<EventMapData | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [refresh, setRefresh] = useState(0),
    [edit, setEdit] = useState(false),
    [participants, setParticipants] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<'' | 'cancel' | 'finish'>(''),
    [publish, setPublish] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    const load = () => {
      if (!user) return;
      void events
        .map(id, abort.signal)
        .then((r) => {
          setData(r);
          setError('');
        })
        .catch((e) => {
          if (!abort.signal.aborted) {
            setError(e.message);
            setData(null);
          }
        });
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [id, user, refresh]);
  async function action(path: string, method = 'POST', body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      if (path === 'rsvp' && method === 'DELETE' && state.eventId === id)
        live.stop();
      await events.action(id, path, method, body);
      setMessage('Estado atualizado pelo servidor.');
      setConfirm('');
      setRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const e = data?.event;
  return (
    <div className="events-page">
      <Link className="text-link" to="/comunidade/eventos">
        Voltar aos eventos
      </Link>
      {error && <p role="alert">{error}</p>}
      {!user ? (
        <Link className="button" to="/entrar">
          Entrar para consultar evento
        </Link>
      ) : !data || !e ? (
        !error && <p role="status">Carregando evento…</p>
      ) : (
        <>
          {edit ? (
            <EventForm
              key={`${e.id}:${e.revision}`}
              event={e}
              onCancel={() => setEdit(false)}
              onSaved={() => {
                setEdit(false);
                setRefresh((x) => x + 1);
              }}
            />
          ) : (
            <>
              <section className="panel social-summary">
                <span className="eyebrow">
                  {e.event_type === 'ride' ? 'PASSEIO ORGANIZADO' : 'ENCONTRO'}{' '}
                  · {statusLabel[e.status]}
                </span>
                <h1>{e.title}</h1>
                {e.image_id && (
                  <img
                    className="event-cover"
                    src={apiUrl(`/social/media/${e.image_id}`)}
                    alt={`Imagem de ${e.title}`}
                  />
                )}
                <p>Organização: {e.organizer_name}</p>
                <p>
                  {eventDate(e)} até{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    timeZone: e.timezone,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(e.ends_at))}{' '}
                  · {e.timezone}
                </p>
                <p>
                  {e.city}, {e.state} ·{' '}
                  {e.visibility === 'public'
                    ? 'Público'
                    : e.visibility === 'group'
                      ? 'Exclusivo de grupo'
                      : 'Privado por convite'}
                </p>
                <p className="event-rules">{e.description}</p>
                <p>
                  {e.confirmed_count}
                  {e.capacity ? ` / ${e.capacity}` : ''} presenças confirmadas ·{' '}
                  {e.join_policy === 'approval'
                    ? 'Confirmação sujeita à aprovação'
                    : 'Confirmação imediata'}
                </p>
                <p role="status">
                  {e.participation_status
                    ? participationLabel[e.participation_status]
                    : 'Você ainda não confirmou presença.'}
                </p>
                <p>
                  Versão {e.revision} · Atualizado em{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    timeZone: e.timezone,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(e.updated_at))}
                  . Confira horário e ponto de encontro antes da saída.
                </p>
                <div className="event-actions">
                  {['scheduled', 'ongoing'].includes(e.status) && (
                    <>
                      <button
                        className="button button-primary"
                        disabled={
                          busy ||
                          [
                            'confirmed',
                            'pending',
                            'removed',
                            'rejected',
                          ].includes(e.participation_status ?? '') ||
                          (e.visibility === 'invite' &&
                            !e.participation_status &&
                            !e.can_manage)
                        }
                        onClick={() =>
                          void action('rsvp', 'POST', { status: 'confirmed' })
                        }
                      >
                        Confirmar presença
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void action('rsvp', 'POST', { status: 'interested' })
                        }
                      >
                        Marcar interesse
                      </button>
                      {e.participation_status &&
                        !['cancelled', 'removed', 'rejected'].includes(
                          e.participation_status,
                        ) && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => void action('rsvp', 'DELETE')}
                          >
                            Cancelar presença
                          </button>
                        )}
                    </>
                  )}
                  {(e.confirmed || e.can_manage) && (
                    <button
                      className="button"
                      onClick={() => setParticipants((x) => !x)}
                    >
                      Ver participantes
                    </button>
                  )}
                  {e.confirmed && e.status === 'ongoing' && (
                    <Link
                      className="button"
                      to={`/comunidade/eventos/${id}/mapa`}
                    >
                      Abrir mapa social
                    </Link>
                  )}
                  {e.event_type === 'ride' &&
                    e.confirmed &&
                    ['scheduled', 'ongoing'].includes(e.status) && (
                      <Link className="button" to={`/ride?evento=${id}`}>
                        Iniciar Ride neste passeio
                      </Link>
                    )}
                </div>
                <p>Confirmar presença ou iniciar Ride não ativa GPS social.</p>
              </section>
              <section className="panel social-summary">
                <h2>Ponto de encontro</h2>
                <p>
                  {e.meeting_point_label} · {e.meeting_reference}
                </p>
                <p>
                  {e.meeting_point.coordinates[1]},{' '}
                  {e.meeting_point.coordinates[0]}
                </p>
                <p>
                  Utilize locais apropriados e autorizados. O mapa não garante
                  acesso a áreas privadas ou interditadas.
                </p>
                <EventMap data={data} />
                {data.route && (
                  <p>
                    Rota:{' '}
                    <Link
                      className="text-link"
                      to={`/explorar/${data.route.plan.id}`}
                    >
                      {data.route.plan.name}
                    </Link>{' '}
                    · {(data.route.plan.distanceMeters / 1000).toFixed(1)} km ·
                    versão planejada {data.route.plan.version} ·{' '}
                    {data.route.availability === 'approved'
                      ? 'Disponível'
                      : 'Atualmente indisponível no catálogo; plano original preservado'}
                  </p>
                )}
              </section>
              <section className="panel social-summary">
                <h2>Regras do evento</h2>
                <p className="event-rules">
                  {e.rules || 'Nenhuma regra adicional informada.'}
                </p>
                {e.group_id && (
                  <Link
                    className="text-link"
                    to={`/comunidade/grupos/${e.group_id}`}
                  >
                    Consultar grupo organizador
                  </Link>
                )}
              </section>
              {participants && (e.confirmed || e.can_manage) && (
                <EventParticipants
                  event={e}
                  onChange={() => setRefresh((x) => x + 1)}
                />
              )}
              {e.can_manage && ['scheduled', 'ongoing'].includes(e.status) && (
                <>
                  <EventInvites event={e} />
                  <section className="panel social-summary">
                    <h2>Organizar evento</h2>
                    <div className="event-actions">
                      <button className="button" onClick={() => setEdit(true)}>
                        Editar evento
                      </button>
                      <button
                        className="button"
                        onClick={() => setConfirm('cancel')}
                      >
                        Cancelar evento
                      </button>
                      <button
                        className="button"
                        onClick={() => setConfirm('finish')}
                      >
                        Encerrar evento
                      </button>
                      {e.visibility === 'public' && (
                        <button
                          className="button"
                          onClick={() => setPublish(true)}
                        >
                          Divulgar no feed
                        </button>
                      )}
                    </div>
                    {confirm && (
                      <div className="event-consent">
                        <p>
                          {confirm === 'cancel' ? 'Cancelar' : 'Encerrar'} este
                          evento interromperá todos os compartilhamentos
                          associados.
                        </p>
                        <button
                          className="button button-primary"
                          disabled={busy}
                          onClick={() => void action(confirm)}
                        >
                          {confirm === 'cancel'
                            ? 'Confirmar cancelamento'
                            : 'Confirmar encerramento'}
                        </button>
                        <button
                          className="text-link"
                          onClick={() => setConfirm('')}
                        >
                          Voltar
                        </button>
                      </div>
                    )}
                  </section>
                </>
              )}
              {publish && e.visibility === 'public' && e.can_manage && (
                <Composer
                  initialText={`${e.title} · ${eventDate(e)} (${e.timezone}) · ${e.city}, ${e.state}\n${location.origin}/comunidade/eventos/${id}`}
                  onSaved={() => {
                    setPublish(false);
                    setMessage(
                      'Publicação enviada por sua confirmação explícita.',
                    );
                  }}
                  onCancel={() => setPublish(false)}
                />
              )}
              {e.visibility === 'public' && (
                <button
                  className="button"
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setMessage(
                        `Link do evento: ${location.origin}/comunidade/eventos/${id}`,
                      );
                      return;
                    }
                    void navigator.clipboard
                      .writeText(`${location.origin}/comunidade/eventos/${id}`)
                      .then(() => setMessage('Link copiado.'))
                      .catch(() =>
                        setMessage(
                          `Link do evento: ${location.origin}/comunidade/eventos/${id}`,
                        ),
                      );
                  }}
                >
                  Copiar link público do evento
                </button>
              )}
            </>
          )}
          {message && <p role="status">{message}</p>}
        </>
      )}
    </div>
  );
}
