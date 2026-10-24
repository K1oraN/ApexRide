import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { Button, Input, Select } from '../components/design-system';
import { authRequest } from '../services/auth';
import { social } from '../social/service';
import { events } from './service';
import {
  participationLabel,
  type EventParticipant,
  type SocialEvent,
} from './types';
interface Person {
  id: string;
  displayName: string;
  username: string;
}
export function EventParticipants({
  event,
  onChange,
}: {
  event: SocialEvent;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<EventParticipant[]>([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void authRequest<{ items: EventParticipant[]; hasMore: boolean }>(
      `/events/${event.id}/participants?page=${page}`,
      'GET',
      undefined,
      abort.signal,
    )
      .then((r) => {
        setItems(r.items);
        setMore(r.hasMore);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setItems([]);
          setError(e.message);
        }
      });
    return () => abort.abort();
  }, [event.id, event.revision, page, refresh]);
  async function act(path: string, method: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    try {
      await events.action(event.id, path, method, body);
      setRefresh((x) => x + 1);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel social-summary">
      <h2>Participantes autorizados</h2>
      <p>
        A lista está disponível para confirmados e organização. Convites não são
        exibidos aos demais participantes.
      </p>
      {error && <p role="alert">{error}</p>}
      {items.map((p) => (
        <article key={p.user_id} className="event-participant">
          <strong>
            {p.display_name}
            {p.organizer ? ' · Organização' : ''}
          </strong>
          <span>
            {participationLabel[p.participation_status] ??
              p.participation_status}
          </span>
          {event.can_manage &&
            event.status === 'finished' &&
            p.user_id !== user?.id &&
            p.participation_status === 'confirmed' && (
              <AttendanceControl
                event={event.id}
                person={p}
                onChange={() => {
                  setRefresh((x) => x + 1);
                  onChange();
                }}
              />
            )}
          {event.can_manage && p.user_id !== event.organizer_id && (
            <fieldset disabled={busy} className="event-actions">
              {p.participation_status === 'pending' && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void act(`participants/${p.user_id}`, 'PATCH', {
                        status: 'confirmed',
                      })
                    }
                  >
                    Aprovar presença
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void act(`participants/${p.user_id}`, 'PATCH', {
                        status: 'rejected',
                      })
                    }
                  >
                    Recusar solicitação
                  </Button>
                </>
              )}
              {!['removed', 'rejected'].includes(p.participation_status) && (
                <Button
                  variant="destructive"
                  onClick={() =>
                    void act(`participants/${p.user_id}`, 'PATCH', {
                      status: 'removed',
                    })
                  }
                >
                  Remover participante
                </Button>
              )}
              {p.participation_status === 'confirmed' && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void act(
                      `organizers/${p.user_id}`,
                      p.organizer ? 'DELETE' : 'POST',
                    )
                  }
                >
                  {p.organizer
                    ? 'Revogar coorganizador'
                    : 'Designar coorganizador'}
                </Button>
              )}
            </fieldset>
          )}
        </article>
      ))}
      <div className="event-actions">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => setPage((x) => x - 1)}
        >
          Participantes anteriores
        </Button>
        <Button
          variant="secondary"
          disabled={!more}
          onClick={() => setPage((x) => x + 1)}
        >
          Mais participantes
        </Button>
      </div>
    </section>
  );
}
function AttendanceControl({
  event,
  person,
  onChange,
}: {
  event: string;
  person: EventParticipant;
  onChange: () => void;
}) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      await events.action(event, `attendance/${person.user_id}`, 'PATCH', {
        verified: !person.attendance_verified,
        reason,
      });
      setReason('');
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>
        {person.attendance_verified
          ? 'Presença verificada · revisar'
          : 'Verificar participação efetiva'}
      </summary>
      <p>
        Verifique apenas participação efetiva, após o evento. RSVP e GPS social
        não comprovam presença. Esta decisão será auditada.
      </p>
      <label className="account-field">
        Motivo da verificação ou revogação
        <Input
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        variant="secondary"
        disabled={busy || !reason.trim()}
        onClick={() => void save()}
      >
        {person.attendance_verified
          ? 'Revogar presença verificada'
          : 'Confirmar participação efetiva'}
      </Button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export function EventInvites({ event }: { event: SocialEvent }) {
  const [query, setQuery] = useState(''),
    [people, setPeople] = useState<Person[]>([]),
    [target, setTarget] = useState(''),
    [days, setDays] = useState(7),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [groupCursor, setGroupCursor] = useState<string | null>(null),
    [peopleCursor, setPeopleCursor] = useState<string | null>(null),
    [invitePage, setInvitePage] = useState(1),
    [inviteMore, setInviteMore] = useState(false),
    [inviteRefresh, setInviteRefresh] = useState(0),
    [sent, setSent] = useState<
      { id: string; display_name: string; status: string; expires_at: string }[]
    >([]);
  useEffect(() => {
    const abort = new AbortController();
    void authRequest<{ items: typeof sent; hasMore: boolean }>(
      `/events/${event.id}/invitations?page=${invitePage}`,
      'GET',
      undefined,
      abort.signal,
    )
      .then((r) => {
        setSent(r.items);
        setInviteMore(r.hasMore);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [event.id, invitePage, inviteRefresh]);
  async function search(group = false, cursor: string | null = null) {
    setError('');
    setBusy(true);
    try {
      const r = await social<{
        items: (Person & { status?: string; suspended?: boolean })[];
        nextCursor?: string | null;
      }>(
        group
          ? `/groups/${event.group_id}/members?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
          : `/users/search?q=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      setPeople(
        r.items.filter(
          (p) => !group || (p.status === 'active' && !p.suspended),
        ),
      );
      setTarget('');
      if (group) {
        setGroupCursor(r.nextCursor ?? null);
        setPeopleCursor(null);
      } else {
        setPeopleCursor(r.nextCursor ?? null);
        setGroupCursor(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function invite() {
    setBusy(true);
    setError('');
    try {
      await events.action(event.id, 'invitations', 'POST', {
        userId: target,
        expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
      });
      setMessage(
        'Convite disponível na conta destinatária. Nenhuma presença ou localização foi ativada.',
      );
      setInviteRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel social-summary">
      <h2>Convidar motociclista</h2>
      <fieldset className="account-form" disabled={busy}>
        <label className="account-field">
          Buscar motociclista
          <Input
            maxLength={80}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="event-actions">
          <Button
            variant="secondary"
            disabled={!query.trim()}
            onClick={() => void search()}
          >
            Buscar pessoa
          </Button>
          {event.group_id && (
            <Button variant="secondary" onClick={() => void search(true)}>
              Selecionar integrante do grupo
            </Button>
          )}
        </div>
        <label className="account-field">
          Destinatário
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Selecione uma pessoa</option>
            {people.map((p) => (
              <option value={p.id} key={p.id}>
                {p.displayName} · @{p.username}
              </option>
            ))}
          </Select>
        </label>
        {groupCursor && (
          <Button
            variant="secondary"
            onClick={() => void search(true, groupCursor)}
          >
            Mais integrantes
          </Button>
        )}
        {peopleCursor && (
          <Button
            variant="secondary"
            onClick={() => void search(false, peopleCursor)}
          >
            Mais motociclistas
          </Button>
        )}
        <label className="account-field">
          Validade do convite (dias)
          <Input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </label>
        <Button
          variant="secondary"
          disabled={!target}
          onClick={() => void invite()}
        >
          Enviar convite
        </Button>
      </fieldset>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <h3>Convites enviados</h3>
      {sent.map((i) => (
        <article key={i.id} className="event-invitation">
          <strong>{i.display_name}</strong>
          <span>
            {i.status === 'pending'
              ? 'Pendente'
              : i.status === 'expired'
                ? 'Expirado'
                : i.status === 'accepted'
                  ? 'Aceito'
                  : i.status === 'rejected'
                    ? 'Recusado'
                    : 'Revogado'}
          </span>
          {i.status === 'pending' && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void events
                  .action(event.id, `invitations/${i.id}`, 'DELETE')
                  .then(() => setInviteRefresh((x) => x + 1))
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Revogar convite
            </Button>
          )}
        </article>
      ))}
      <div className="event-actions">
        <Button
          variant="secondary"
          disabled={invitePage <= 1}
          onClick={() => setInvitePage((x) => x - 1)}
        >
          Convites anteriores
        </Button>
        <Button
          variant="secondary"
          disabled={!inviteMore}
          onClick={() => setInvitePage((x) => x + 1)}
        >
          Mais convites
        </Button>
      </div>
    </section>
  );
}
