import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { ChoiceSelect } from '../components/design-system';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button, ButtonLink, Input, Select } from '../components/design-system';
import { RouteMap } from '../components/maps/RouteMap';
import { SectionTitle } from '../components/ui';
import { authRequest } from '../services/auth';
import '../styles/events.css';
import { events } from './service';
import {
  eventDate,
  statusLabel,
  type EventInvitation,
  type SocialEvent,
} from './types';
const states =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(
    ' ',
  );
export function EventsPage() {
  const { user } = useAuth(),
    [params, setParams] = useSearchParams();
  const [items, setItems] = useState<SocialEvent[]>([]),
    [invitations, setInvitations] = useState<EventInvitation[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [refresh, setRefresh] = useState(0);
  const page = Number(params.get('page') ?? 1);
  useEffect(() => {
    const abort = new AbortController();
    if (!user) return;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      void events
        .list(params, abort.signal)
        .then((r) => {
          setItems(r.items);
          setMore(r.hasMore);
        })
        .catch((e) => {
          if (!abort.signal.aborted) {
            setError(e.message);
            setItems([]);
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
      void events
        .invitations()
        .then((r) => {
          if (!abort.signal.aborted) setInvitations(r.items);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [params, user, refresh]);
  const filter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  async function respond(id: string, action: 'accept' | 'reject') {
    try {
      await authRequest(`/events/invitations/${id}/${action}`, 'POST', {});
      setRefresh((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="events-page">
      <SectionTitle
        aside={
          <ButtonLink variant="primary" to="/comunidade/eventos/novo">
            <CalendarDays size={18} aria-hidden /> Criar evento
          </ButtonLink>
        }
      >
        EVENTOS E ENCONTROS
      </SectionTitle>
      <p>
        Encontros e passeios por todo o Brasil. Destaque para Alagoas quando
        houver eventos cadastrados.
      </p>
      {!user ? (
        <section className="panel social-summary">
          <p>Entre para descobrir eventos e convites autorizados.</p>
          <ButtonLink variant="secondary" to="/entrar">
            Entrar na conta
          </ButtonLink>
        </section>
      ) : (
        <>
          <section
            className="panel social-summary event-filter-panel"
            aria-label="Filtros de eventos"
          >
            <header className="filter-panel-heading">
              <h2>
                <SlidersHorizontal size={19} aria-hidden />
                Filtros de eventos
              </h2>
              <Button size="sm" variant="ghost" onClick={() => setParams({})}>
                <RotateCcw size={16} aria-hidden />
                Limpar filtros
              </Button>
            </header>
            <div className="event-filters">
              <label className="account-field">
                <span>
                  <Search size={16} aria-hidden />
                  Pesquisar eventos
                </span>
                <Input
                  placeholder="Nome do evento…"
                  type="search"
                  maxLength={100}
                  value={params.get('q') ?? ''}
                  onChange={(e) => filter('q', e.target.value)}
                />
              </label>
              <label className="account-field">
                Cidade
                <Input
                  maxLength={100}
                  value={params.get('city') ?? ''}
                  onChange={(e) => filter('city', e.target.value)}
                />
              </label>
              <label className="account-field">
                Estado
                <Select
                  value={params.get('state') ?? ''}
                  onChange={(e) => filter('state', e.target.value)}
                >
                  <option value="">Brasil</option>
                  {states.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </label>
              <div className="account-field">
                <span>Tipo</span>
                <ChoiceSelect
                  aria-label="Tipo"
                  value={params.get('type') ?? ''}
                  onChange={(e) => filter('type', e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="meetup">Encontros</option>
                  <option value="ride">Passeios</option>
                </ChoiceSelect>
              </div>
              <label className="account-field">
                Exibir
                <Select
                  value={params.get('filter') ?? 'upcoming'}
                  onChange={(e) => filter('filter', e.target.value)}
                >
                  <option value="upcoming">Próximos eventos</option>
                  <option value="mine">Minha participação</option>
                  <option value="groups">Meus grupos</option>
                  <option value="public">Públicos</option>
                  <option value="invited">Por convite</option>
                  <option value="all">Todos autorizados</option>
                </Select>
              </label>
              <label className="account-field">
                A partir de
                <Input
                  type="date"
                  value={params.get('from')?.slice(0, 10) ?? ''}
                  onChange={(e) =>
                    filter(
                      'from',
                      e.target.value ? `${e.target.value}T00:00:00.000Z` : '',
                    )
                  }
                />
              </label>
              <label className="account-field">
                Até
                <Input
                  type="date"
                  value={params.get('to')?.slice(0, 10) ?? ''}
                  onChange={(e) =>
                    filter(
                      'to',
                      e.target.value ? `${e.target.value}T23:59:59.999Z` : '',
                    )
                  }
                />
              </label>
            </div>
          </section>
          {error && (
            <p role="alert">
              {error}{' '}
              <button
                className="text-link action-link"
                onClick={() => setRefresh((x) => x + 1)}
              >
                Tentar novamente
              </button>
            </p>
          )}
          {invitations.length > 0 && (
            <section className="panel social-summary">
              <h2>Convites recebidos</h2>
              {invitations.map((i) => (
                <article className="event-invitation" key={i.id}>
                  <Link to={`/comunidade/eventos/${i.event_id}`}>
                    {i.title}
                  </Link>
                  <span>{eventDate(i)}</span>
                  <div className="social-controls">
                    <Button
                      variant="secondary"
                      onClick={() => void respond(i.id, 'accept')}
                    >
                      Aceitar convite
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => void respond(i.id, 'reject')}
                    >
                      Recusar convite
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          )}
          <RouteMap
            routes={[]}
            caption="EVENTOS AUTORIZADOS"
            description="Somente pontos de encontro. A localização pessoal aparece exclusivamente no mapa social autorizado de cada evento."
            points={items.map((e) => ({
              id: e.id,
              coordinate: e.meeting_point.coordinates,
              label: e.title,
            }))}
            onBounds={(bounds) => filter('bbox', bounds)}
          />
          {loading ? (
            <p role="status">Carregando eventos…</p>
          ) : items.length === 0 && !error ? (
            <section className="panel empty-state">
              <h2>Nenhum evento encontrado</h2>
              <p>Experimente outra cidade ou crie um encontro.</p>
            </section>
          ) : (
            <div className="event-grid">
              {items.map((e) => (
                <article key={e.id} className="panel social-summary event-card">
                  <span className="eyebrow">
                    {e.event_type === 'ride'
                      ? 'PASSEIO ORGANIZADO'
                      : 'ENCONTRO'}{' '}
                    · {statusLabel[e.status]}
                  </span>
                  <h2>
                    <Link to={`/comunidade/eventos/${e.id}`}>{e.title}</Link>
                  </h2>
                  <p>
                    {eventDate(e)} · {e.timezone}
                  </p>
                  <p>
                    {e.city}, {e.state}
                  </p>
                  <p>
                    {e.confirmed_count}
                    {e.capacity ? ` / ${e.capacity}` : ''} presenças ·{' '}
                    {e.visibility === 'public'
                      ? 'Público'
                      : e.visibility === 'group'
                        ? 'Exclusivo de grupo'
                        : 'Por convite'}
                  </p>
                  <Link
                    className="text-link action-link"
                    to={`/comunidade/eventos/${e.id}`}
                  >
                    Ver detalhes
                  </Link>
                </article>
              ))}
            </div>
          )}
          <nav className="page-pagination" aria-label="Páginas de eventos">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page - 1));
                setParams(next);
              }}
            >
              <ChevronLeft aria-hidden /> Anterior
            </Button>
            <span aria-live="polite">Página {page}</span>
            <Button
              variant="secondary"
              disabled={!more}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(page + 1));
                setParams(next);
              }}
            >
              Próxima <ChevronRight aria-hidden />
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}
