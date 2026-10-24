import { ChoiceSelect } from '../components/design-system';
import type { Coordinate } from '@apex-ride/ride-core/routes';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Button,
  ButtonLink,
  Checkbox,
  Input,
  Select,
  Textarea,
} from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import type { Group } from '../groups/types';
import { authRequest } from '../services/auth';
import { routeService, type RouteRecord } from '../services/routes';
import { uploadPhoto } from '../social/service';
import { events } from './service';
import { toUtc, wallTime } from './timezone';
import type { SocialEvent } from './types';
export function EventForm({
  event,
  onCancel,
  onSaved,
}: {
  event?: SocialEvent;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const navigate = useNavigate(),
    creation = useRef(crypto.randomUUID());
  const [form, setForm] = useState({
    title: event?.title ?? '',
    description: event?.description ?? '',
    rules: event?.rules ?? '',
    eventType: event?.event_type ?? 'meetup',
    visibility: event?.visibility ?? 'public',
    joinPolicy: event?.join_policy ?? 'immediate',
    city: event?.city ?? '',
    state: event?.state ?? 'AL',
    meetingPointLabel: event?.meeting_point_label ?? '',
    meetingReference: event?.meeting_reference ?? '',
    timezone: event?.timezone ?? 'America/Maceio',
    startsAt: event ? wallTime(event.starts_at, event.timezone) : '',
    endsAt: event ? wallTime(event.ends_at, event.timezone) : '',
    capacity: event?.capacity?.toString() ?? '',
    groupId: event?.group_id ?? '',
    routeId: event?.route_id ?? '',
  });
  const [point, setPoint] = useState<Coordinate | null>(
      event?.meeting_point.coordinates ?? null,
    ),
    [confirmed, setConfirmed] = useState(false),
    [disclosure, setDisclosure] = useState(false);
  const [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [routes, setRoutes] = useState<RouteRecord[]>([]),
    [groups, setGroups] = useState<Group[]>([]),
    [query, setQuery] = useState(''),
    [photo, setPhoto] = useState<File | null>(null),
    [saved, setSaved] = useState<SocialEvent | null>(null);
  const uploaded = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    void authRequest<{ items: Group[] }>('/groups/mine?filter=admin&limit=50')
      .then((r) => {
        if (live) setGroups(r.items);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        void routeService
          .list(new URLSearchParams({ q: query, limit: '50', kind: 'route' }))
          .then((r) => {
            if (live)
              setRoutes(r.routes.filter((r) => r.status === 'approved'));
          })
          .catch((e) => {
            if (live) setError(e.message);
          }),
      250,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  function change(key: keyof typeof form, value: string) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === 'groupId' ? { visibility: value ? 'group' : 'public' } : {}),
      ...(key === 'eventType' && value === 'meetup' ? { routeId: '' } : {}),
    }));
    setPreview(false);
  }
  function data() {
    if (!point)
      throw new Error(
        'Escolha o ponto de encontro no mapa ou informe as coordenadas.',
      );
    return {
      ...form,
      startsAt: toUtc(form.startsAt, form.timezone),
      endsAt: toUtc(form.endsAt, form.timezone),
      capacity: form.capacity ? Number(form.capacity) : null,
      groupId: form.groupId || null,
      routeId: form.eventType === 'ride' ? form.routeId || null : null,
      meetingPoint: point,
      confirmPoint: confirmed,
      creationKey: creation.current,
      ...(event
        ? { revision: event.revision, confirmDisclosure: disclosure }
        : {}),
    };
  }
  async function submit() {
    setError('');
    try {
      const body = data();
      if (!preview) {
        if (!confirmed) throw new Error('Confirme o ponto de encontro.');
        setPreview(true);
        return;
      }
      setBusy(true);
      const result = saved ?? (await events.save(body, event?.id)).event;
      setSaved(result);
      if (photo) {
        uploaded.current ??= (await uploadPhoto(photo)).media.id;
        await events.action(result.id, 'image', 'PATCH', {
          mediaId: uploaded.current,
        });
      }
      onSaved?.();
      navigate(`/comunidade/eventos/${result.id}`, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const route = routes.find((r) => r.id === form.routeId);
  return (
    <section className="panel social-summary">
      <h1>{event ? 'Editar evento' : 'Criar evento'}</h1>
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset className="account-form" disabled={busy || !!saved}>
          <label className="account-field">
            Nome do evento
            <Input
              required
              minLength={3}
              maxLength={120}
              value={form.title}
              onChange={(e) => change('title', e.target.value)}
            />
          </label>
          <label className="account-field">
            Descrição
            <Textarea
              maxLength={4000}
              value={form.description}
              onChange={(e) => change('description', e.target.value)}
            />
          </label>
          <div className="event-filters">
            <div className="account-field">
              <span>Tipo de evento</span>
              <ChoiceSelect
                aria-label="Tipo de evento"
                value={form.eventType}
                onChange={(e) => change('eventType', e.target.value)}
              >
                <option value="meetup">Encontro</option>
                <option value="ride">Passeio organizado</option>
              </ChoiceSelect>
            </div>
            <label className="account-field">
              Grupo organizador
              <Select
                disabled={!!event}
                value={form.groupId}
                onChange={(e) => change('groupId', e.target.value)}
              >
                <option value="">Sem grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                {event?.group_id &&
                  !groups.some((g) => g.id === event.group_id) && (
                    <option value={event.group_id}>Grupo do evento</option>
                  )}
              </Select>
            </label>
            <div className="account-field">
              <span>Visibilidade</span>
              <ChoiceSelect
                aria-label="Visibilidade"
                disabled={!!form.groupId}
                value={form.visibility}
                onChange={(e) => change('visibility', e.target.value)}
              >
                {form.groupId ? (
                  <option value="group">Exclusivo de grupo</option>
                ) : (
                  <>
                    <option value="public">Público</option>
                    <option value="invite">Privado por convite</option>
                  </>
                )}
              </ChoiceSelect>
            </div>
            <div className="account-field">
              <span>Confirmação de presença</span>
              <ChoiceSelect
                aria-label="Confirmação de presença"
                value={form.joinPolicy}
                onChange={(e) => change('joinPolicy', e.target.value)}
              >
                <option value="immediate">Imediata</option>
                <option value="approval">Exige aprovação</option>
              </ChoiceSelect>
            </div>
          </div>
          {event && form.visibility !== event.visibility && (
            <label className="check-field">
              <Checkbox
                required

                checked={disclosure}
                onChange={(e) => setDisclosure(e.target.checked)}
              />
              Autorizo a mudança do público deste evento e das informações do
              encontro.
            </label>
          )}
          <div className="event-filters">
            <label className="account-field">
              Data e hora de início
              <Input
                required
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => change('startsAt', e.target.value)}
              />
            </label>
            <label className="account-field">
              Encerramento previsto
              <Input
                required
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => change('endsAt', e.target.value)}
              />
            </label>
            <label className="account-field">
              Fuso horário
              <Input
                required
                list="event-timezones"
                value={form.timezone}
                onChange={(e) => change('timezone', e.target.value)}
              />
              <datalist id="event-timezones">
                {[
                  'America/Maceio',
                  'America/Sao_Paulo',
                  'America/Manaus',
                  'America/Rio_Branco',
                  'America/Noronha',
                  'America/Cuiaba',
                  'America/Belem',
                  'America/Bahia',
                  'America/Recife',
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
            </label>
          </div>
          <p>
            Os horários acima são do fuso escolhido para o evento,
            independentemente do fuso do seu aparelho.
          </p>
          <div className="event-filters">
            <label className="account-field">
              Cidade
              <Input
                required
                maxLength={100}
                value={form.city}
                onChange={(e) => change('city', e.target.value)}
              />
            </label>
            <label className="account-field">
              Estado
              <Select
                value={form.state}
                onChange={(e) => change('state', e.target.value)}
              >
                {'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'
                  .split(' ')
                  .map((s) => (
                    <option key={s}>{s}</option>
                  ))}
              </Select>
            </label>
            <label className="account-field">
              Máximo de participantes (opcional)
              <Input
                type="number"
                min={1}
                max={100000}
                value={form.capacity}
                onChange={(e) => change('capacity', e.target.value)}
              />
            </label>
          </div>
          <label className="account-field">
            Nome do ponto de encontro
            <Input
              required
              maxLength={200}
              value={form.meetingPointLabel}
              onChange={(e) => change('meetingPointLabel', e.target.value)}
            />
          </label>
          <RouteMap
            routes={route ? [{ id: route.id, geometry: route.geometry }] : []}
            selected={route?.id}
            caption="PONTO DE ENCONTRO"
            onPoint={(p) => {
              setPoint(p);
              setConfirmed(false);
              setPreview(false);
            }}
            points={
              point
                ? [
                    {
                      id: 'meeting',
                      coordinate: point,
                      label: form.meetingPointLabel || 'Ponto escolhido',
                    },
                  ]
                : []
            }
          />
          <div className="event-filters">
            <label className="account-field">
              Latitude
              <Input
                required
                type="number"
                step="any"
                min={-85}
                max={85}
                value={point?.[1] ?? ''}
                onChange={(e) => {
                  setPoint([point?.[0] ?? 0, Number(e.target.value)]);
                  setConfirmed(false);
                  setPreview(false);
                }}
              />
            </label>
            <label className="account-field">
              Longitude
              <Input
                required
                type="number"
                step="any"
                min={-180}
                max={180}
                value={point?.[0] ?? ''}
                onChange={(e) => {
                  setPoint([Number(e.target.value), point?.[1] ?? 0]);
                  setConfirmed(false);
                  setPreview(false);
                }}
              />
            </label>
          </div>
          <label className="account-field">
            Referência do local
            <Textarea
              maxLength={500}
              value={form.meetingReference}
              onChange={(e) => change('meetingReference', e.target.value)}
            />
          </label>
          <label className="check-field">
            <Checkbox
              required
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setPreview(false);
              }}
            />
            Confirmo que este ponto será divulgado ao público escolhido. Escolhi
            um local apropriado, acessível e autorizado.
          </label>
          {form.eventType === 'ride' && (
            <>
              <label className="account-field">
                Pesquisar rota cadastrada
                <Input
                  maxLength={100}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="account-field">
                Rota opcional
                <Select
                  value={form.routeId}
                  onChange={(e) => change('routeId', e.target.value)}
                >
                  <option value="">Sem rota</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {(r.distanceMeters / 1000).toFixed(1)} km
                    </option>
                  ))}
                  {event?.route_id &&
                    !routes.some((r) => r.id === event.route_id) && (
                      <option value={event.route_id}>
                        Rota atual · versão {event.route_version}
                      </option>
                    )}
                </Select>
              </label>
              {route && (
                <p>
                  {route.name} · {(route.distanceMeters / 1000).toFixed(1)} km ·{' '}
                  {route.city}, {route.state}
                </p>
              )}
              <Link className="text-link action-link" to="/explorar/novo">
                Criar percurso no editor de Rotas
              </Link>
            </>
          )}
          <label className="account-field">
            Regras
            <Textarea
              maxLength={4000}
              value={form.rules}
              onChange={(e) => change('rules', e.target.value)}
            />
          </label>
          <label className="account-field">
            Imagem opcional
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                setPhoto(e.target.files?.[0] ?? null);
                uploaded.current = null;
              }}
            />
          </label>
        </fieldset>
        {preview && (
          <section className="event-review" aria-label="Revisão do evento">
            <h2>Revisar informações</h2>
            <p>
              {form.title} ·{' '}
              {form.eventType === 'ride' ? 'Passeio' : 'Encontro'}
            </p>
            <p>
              {form.startsAt.replace('T', ' ')} até{' '}
              {form.endsAt.replace('T', ' ')} · {form.timezone}
            </p>
            <p>
              {form.city}, {form.state} · {form.meetingPointLabel} ·{' '}
              {point?.join(', ')}
            </p>
            <p>
              {form.visibility === 'public'
                ? 'Público'
                : form.visibility === 'group'
                  ? 'Somente membros do grupo'
                  : 'Privado por convite'}{' '}
              · {form.capacity || 'Sem limite de'} participantes
            </p>
            <p>
              Criar evento e confirmar presença não ativam localização ao vivo.
            </p>
          </section>
        )}
        {error && (
          <p role="alert">
            {error}
            {saved
              ? ' O evento já foi salvo; tente enviar a imagem novamente.'
              : ''}
          </p>
        )}
        <div className="event-actions">
          <Button variant="primary" disabled={busy} type="submit">
            {busy
              ? 'Salvando…'
              : preview
                ? event
                  ? 'Confirmar alterações'
                  : 'Confirmar criação'
                : 'Revisar informações'}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar edição
            </Button>
          ) : (
            <ButtonLink variant="outline" to="/comunidade/eventos">
              Cancelar
            </ButtonLink>
          )}
        </div>
      </form>
    </section>
  );
}
