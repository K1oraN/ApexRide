import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  MapPin,
  Medal,
  ShieldCheck,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { StateField } from '../components/AccountFields';
import { Button, Checkbox, Input, Select } from '../components/design-system';
import { Avatar } from '../components/ui';
import type { Preferences, Ranking, RankingEntry, Season } from './types';
import { changeGamification, useGamification } from './useGamification';
import '../styles/gamification.css';
import '../styles/rankings-stage-08.css';

type Scope = 'br' | 'state' | 'city';
type RankingKind = 'xp' | 'community' | 'exploration';

const kinds: Record<RankingKind, string> = {
  xp: 'XP',
  community: 'pts',
  exploration: 'pts',
};

function scoreLabel(score: number, kind: RankingKind) {
  return `${score.toLocaleString('pt-BR')} ${kinds[kind]}`;
}

function RegionLabel({ entry }: { entry: RankingEntry }) {
  const location = [entry.city, entry.state].filter(Boolean).join(' / ');
  return (
    <span className="apex-rank-location">
      <MapPin size={13} aria-hidden="true" />
      {location || 'Região não divulgada'}
    </span>
  );
}

function Podium({ entries, kind }: { entries: RankingEntry[]; kind: RankingKind }) {
  const ordered = [...entries].sort(
    (a, b) => [2, 1, 3].indexOf(a.position) - [2, 1, 3].indexOf(b.position),
  );
  return (
    <section className="apex-rank-podium-section" aria-label="Pódio do ranking">
      <div className="apex-rank-section-heading">
        <span className="eyebrow">DESTAQUES DA CLASSIFICAÇÃO</span>
        <h3>O pódio</h3>
      </div>
      <ol className="apex-rank-podium">
        {ordered.map((entry) => (
          <li
            key={entry.user_id}
            className={`apex-rank-podium-card apex-rank-podium-${entry.position}`}
          >
            <span className="apex-rank-podium-position">
              {entry.position === 1 ? <Crown size={19} aria-hidden="true" /> : <Medal size={18} aria-hidden="true" />}
              {entry.position}º LUGAR
            </span>
            <div className="apex-rank-podium-avatar">
              <Avatar name={entry.display_name} placeholder />
            </div>
            <Link className="apex-rank-rider-link" to={`/comunidade/u/${encodeURIComponent(entry.username)}`}>
              {entry.display_name}
            </Link>
            <RegionLabel entry={entry} />
            <strong className="apex-rank-score">{scoreLabel(entry.score, kind)}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RankingQuickControl() {
  const { user } = useAuth();
  const { data, error, reload } = useGamification<{ preferences: Preferences }>(
    '/gamification/me/ranking-preferences',
  );
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const p = data?.preferences;

  async function setParticipation(optedIn: boolean) {
    if (!p || (optedIn && !confirmed) || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await changeGamification('/gamification/me/ranking-preferences', 'PATCH', {
        optedIn,
        showProgress: p.show_progress,
        showAchievements: p.show_achievements,
        circuitOptIn: p.circuit_opt_in,
        state: p.state,
        city: p.city,
        consentVersion: 'gamification-v1',
      });
      setConfirmed(false);
      setMessage(optedIn ? 'Participação ativada.' : 'Participação pública desativada. Seu XP foi preservado.');
      reload();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível alterar a participação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="panel apex-rank-participation" aria-label="Participação nos rankings">
      <div className="apex-rank-participation-heading">
        <ShieldCheck size={21} aria-hidden="true" />
        <div>
          <strong>Sua participação</strong>
          <small>{p?.opted_in ? 'Ativada' : p ? 'Desativada' : 'Consultando preferência…'}</small>
        </div>
      </div>
      <p>
        Rankings são voluntários. Ao participar, seu nome público, pontuação e região escolhida
        podem aparecer. Seu trajeto de GPS não é exibido.
      </p>
      {user?.privacy.profileVisibility === 'private' && (
        <p className="apex-rank-hint">Seu perfil está privado e não aparece na classificação pública.</p>
      )}
      {error && (
        <div role="alert" className="apex-rank-control-feedback">
          {error} <Button type="button" variant="secondary" size="sm" onClick={reload}>Tentar novamente</Button>
        </div>
      )}
      {p && !p.opted_in && (
        <label className="apex-rank-consent">
          <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          Autorizo a exibição das informações descritas nos rankings públicos.
        </label>
      )}
      <div className="apex-rank-control-actions">
        {p && (
          <Button
            type="button"
            variant={p.opted_in ? 'secondary' : 'primary'}
            disabled={busy || (!p.opted_in && !confirmed)}
            onClick={() => void setParticipation(!p.opted_in)}
          >
            {busy ? 'Salvando…' : p.opted_in ? 'Sair dos rankings' : 'Participar dos rankings'}
          </Button>
        )}
        <Link className="text-link action-link" to="/configuracoes">
          Preferências avançadas
        </Link>
      </div>
      {message && <p role="status" className="apex-rank-control-feedback">{message}</p>}
    </aside>
  );
}

export function RankingsPage() {
  const [season, setSeason] = useState('');
  const [kind, setKind] = useState<RankingKind>('xp');
  const [scope, setScope] = useState<Scope>('br');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [band, setBand] = useState('');
  const [page, setPage] = useState(1);

  const seasons = useGamification<{ items: Season[] }>('/gamification/seasons');
  const regionIsReady =
    scope === 'br' || (Boolean(state) && (scope !== 'city' || Boolean(city.trim())));
  const query = new URLSearchParams({
    page: String(page),
    state: scope !== 'br' ? state : '',
    city: scope === 'city' ? city.trim() : '',
    region: '',
    category,
    ccBand: band,
    ...(season ? { season } : {}),
  });
  const { data, error, reload } = useGamification<Ranking>(
    regionIsReady ? `/gamification/leaderboards/${kind}?${query}` : null,
  );
  const podium =
    page === 1 && data && !data.unavailable
      ? data.items
          .filter((entry) => entry.position >= 1 && entry.position <= 3)
          .sort((a, b) => a.position - b.position)
          .slice(0, 3)
      : [];
  const podiumIds = new Set(podium.map((entry) => entry.user_id));
  const remaining = data?.items.filter((entry) => !podiumIds.has(entry.user_id)) ?? [];
  const resetPage = () => setPage(1);

  return (
    <div className="gamification-page apex-ranking-page apex-ranking-stage-08">
      <Link className="text-link action-link" to="/comunidade">
        <ChevronLeft size={17} aria-hidden="true" /> Voltar à Comunidade
      </Link>

      <header className="apex-rank-hero panel">
        <div>
          <span className="eyebrow">APEX RIDE / COMUNIDADE</span>
          <h1>RANKINGS <em>DOS RIDERS</em></h1>
          <p>
            Compare evolução, exploração e participação. Valorize sua jornada,
            não a velocidade nas ruas.
          </p>
        </div>
        <div className="apex-rank-hero-mark" aria-hidden="true"><Trophy size={103} strokeWidth={1.2} /></div>
      </header>

      <nav className="apex-rank-navigation" aria-label="Seções da comunidade">
        <Link to="/comunidade"><UsersRound size={19} aria-hidden="true" /> Publicações</Link>
        <Link className="is-current" to="/comunidade/rankings" aria-current="page"><Trophy size={19} aria-hidden="true" /> Rankings</Link>
        <Link to="/comunidade/eventos"><CalendarDays size={19} aria-hidden="true" /> Eventos</Link>
      </nav>

      <section className="panel gamification-card apex-ranking-filters" aria-label="Filtros dos rankings">
        <div className="apex-rank-filters-heading">
          <div><span className="eyebrow">ESCOLHA SUA CLASSIFICAÇÃO</span><h2>Explorar rankings</h2></div>
          <small>Somente dados autorizados e validados</small>
        </div>
        <div className="apex-ranking-scope" role="group" aria-label="Abrangência do ranking">
          {([['br', 'Brasil'], ['state', 'Estados'], ['city', 'Cidades']] as const).map(([value, name]) => (
            <Button
              key={value}
              type="button"
              variant={scope === value ? 'primary' : 'secondary'}
              aria-pressed={scope === value}
              onClick={() => { setScope(value); resetPage(); }}
            >
              {name}
            </Button>
          ))}
        </div>
        <div className="gamification-filters apex-ranking-grid">
          <label className="account-field">
            Temporada
            <Select value={season} onChange={(event) => { setSeason(event.target.value); resetPage(); }}>
              <option value="">Temporada ativa</option>
              {seasons.data?.items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </label>
          <label className="account-field">
            Classificação
            <Select value={kind} onChange={(event) => { setKind(event.target.value as RankingKind); resetPage(); }}>
              <option value="xp">XP da temporada</option>
              <option value="community">Participação comunitária</option>
              <option value="exploration">Exploração</option>
            </Select>
          </label>
          {scope !== 'br' && (
            <StateField value={state} onChange={(value) => { setState(value); setCity(''); resetPage(); }} />
          )}
          {scope === 'city' && (
            <label className="account-field">
              Cidade
              <Input
                value={city}
                disabled={!state}
                maxLength={80}
                placeholder="Ex.: Maceió"
                onChange={(event) => { setCity(event.target.value); resetPage(); }}
              />
            </label>
          )}
          <label className="account-field">
            Categoria / estilo da moto
            <Select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }}>
              <option value="">Todas as categorias</option>
              {BIKE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </label>
          <label className="account-field">
            Cilindrada
            <Select value={band} onChange={(event) => { setBand(event.target.value); resetPage(); }}>
              <option value="">Todas as cilindradas</option>
              <option value="up-to-300">Até 300 cc</option>
              <option value="301-600">301–600 cc</option>
              <option value="601-1000">601–1000 cc</option>
              <option value="over-1000">Acima de 1000 cc</option>
              <option value="unknown">Não informada</option>
            </Select>
          </label>
        </div>
      </section>

      {!regionIsReady ? (
        <div className="panel gamification-card" role="status">
          {scope === 'city'
            ? 'Selecione o estado e informe a cidade para consultar o ranking municipal.'
            : 'Selecione um estado para consultar o ranking estadual.'}
        </div>
      ) : error ? (
        <div className="panel gamification-card" role="alert">
          <p>{error}</p>
          <Button type="button" variant="secondary" onClick={reload}>Tentar novamente</Button>
        </div>
      ) : data ? (
        <section className="apex-rank-results" aria-label="Resultado do ranking">
          <div className="apex-rank-results-title">
            <div>
              <span className="eyebrow">
                {scope === 'br' ? 'BRASIL' : scope === 'state' ? `ESTADO / ${state}` : `CIDADE / ${city.trim()}`}
              </span>
              <h2>{data.season?.name ?? 'Temporada'}</h2>
            </div>
            <span className="apex-rank-results-indicator"><Trophy size={16} aria-hidden="true" /> {kind === 'xp' ? 'XP sazonal' : kind === 'community' ? 'Comunidade' : 'Exploração'}</span>
          </div>
          {data.unavailable ? (
            <div className="panel gamification-card" role="status">{data.unavailable}</div>
          ) : data.items.length === 0 ? (
            <div className="panel gamification-card" role="status">Nenhum participante disponível para os filtros escolhidos.</div>
          ) : (
            <>
              {podium.length > 0 && <Podium entries={podium} kind={kind} />}
              {remaining.length > 0 && (
                <section className="panel apex-rank-table-panel" aria-label="Lista de participantes">
                  <div className="apex-rank-section-heading"><span className="eyebrow">CLASSIFICAÇÃO COMPLETA</span><h3>Posições</h3></div>
                  <div className="apex-rank-table" role="table" aria-label="Ranking de participantes">
                    <div className="apex-rank-table-head" role="row">
                      <span role="columnheader">Posição</span><span role="columnheader">Rider</span><span role="columnheader">Pontuação</span>
                    </div>
                    {remaining.map((entry) => (
                      <div className="apex-rank-table-row" role="row" key={entry.user_id}>
                        <span className="apex-rank-table-position" role="cell">#{entry.position}</span>
                        <div className="apex-rank-table-rider" role="cell">
                          <Avatar name={entry.display_name} placeholder />
                          <div>
                            <Link to={`/comunidade/u/${encodeURIComponent(entry.username)}`}>{entry.display_name}</Link>
                            <RegionLabel entry={entry} />
                          </div>
                        </div>
                        <strong className="apex-rank-table-score" role="cell">{scoreLabel(entry.score, kind)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <div className="apex-rank-footer">
                <div className="apex-rank-pagination" aria-label="Paginação dos rankings">
                  <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                    <ChevronLeft size={16} aria-hidden="true" /> Anterior
                  </Button>
                  <span>Página {page}</span>
                  <Button type="button" variant="secondary" disabled={!data.hasMore} onClick={() => setPage((value) => value + 1)}>
                    Próxima <ChevronRight size={16} aria-hidden="true" />
                  </Button>
                </div>
                {data.me && <p className="apex-rank-me">Minha posição: <strong>#{data.me.position}</strong> · {scoreLabel(data.me.score, kind)}</p>}
              </div>
            </>
          )}
        </section>
      ) : <div className="panel gamification-card" role="status">Consultando classificação…</div>}

      <RankingQuickControl />
      <p className="apex-rank-safety-note"><ShieldCheck size={17} aria-hidden="true" /> Não existem rankings de velocidade máxima, aceleração ou frenagem em vias públicas. Regiões com poucos participantes podem ter classificações indisponíveis.</p>
    </div>
  );
}
