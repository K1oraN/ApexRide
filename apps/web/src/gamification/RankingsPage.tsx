import { useState } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../components/ui';
import { StateField } from '../components/AccountFields';
import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import { useGamification } from './useGamification';
import type { Ranking, Season, Preferences } from './types';
import { RankingPreferences } from './RankingPreferences';
import '../styles/gamification.css';
export function RankingsPage() {
  const [season, setSeason] = useState(''),
    [kind, setKind] = useState('xp'),
    [state, setState] = useState(''),
    [city, setCity] = useState(''),
    [region, setRegion] = useState(''),
    [category, setCategory] = useState(''),
    [band, setBand] = useState(''),
    [page, setPage] = useState(1);
  const seasons = useGamification<{ items: Season[] }>('/gamification/seasons'),
    prefs = useGamification<{ preferences: Preferences }>(
      '/gamification/me/ranking-preferences',
    );
  const q = new URLSearchParams({
    page: String(page),
    state,
    city,
    region,
    category,
    ccBand: band,
    ...(season ? { season } : {}),
  });
  const { data, error, reload } = useGamification<Ranking>(
    `/gamification/leaderboards/${kind}?${q}`,
  );
  const change = (set: (v: string) => void) => (v: string) => {
    set(v);
    setPage(1);
  };
  return (
    <div className="gamification-page">
      <Link className="text-link" to="/comunidade">
        Voltar à Comunidade
      </Link>
      <header>
        <span className="eyebrow">PARTICIPAÇÃO VOLUNTÁRIA</span>
        <h1>Rankings</h1>
        <p>
          Participação, exploração e comunidade. Sem classificação de velocidade
          em vias públicas.
        </p>
      </header>
      <div className="panel gamification-card">
        <div className="gamification-filters">
          <label className="account-field">
            Temporada
            <select
              value={season}
              onChange={(e) => change(setSeason)(e.target.value)}
            >
              <option value="">Temporada ativa</option>
              {seasons.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ·{' '}
                  {s.status === 'active'
                    ? 'Ativa'
                    : s.status === 'scheduled'
                      ? 'Agendada'
                      : 'Encerrada'}
                </option>
              ))}
            </select>
          </label>
          <label className="account-field">
            Classificação
            <select
              value={kind}
              onChange={(e) => change(setKind)(e.target.value)}
            >
              <option value="xp">XP da temporada</option>
              <option value="community">Participação comunitária</option>
              <option value="exploration">Exploração</option>
            </select>
          </label>
          <StateField
            value={state}
            onChange={(v) => {
              change(setState)(v);
              setCity('');
            }}
          />
          <label className="account-field">
            Município (opcional)
            <input
              value={city}
              disabled={!state}
              maxLength={80}
              onChange={(e) => change(setCity)(e.target.value)}
            />
          </label>
          <label className="account-field">
            Região
            <select
              value={region}
              onChange={(e) => change(setRegion)(e.target.value)}
            >
              <option value="">Todas</option>
              {['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map(
                (r) => (
                  <option key={r}>{r}</option>
                ),
              )}
            </select>
          </label>
          <label className="account-field">
            Categoria da moto
            <select
              value={category}
              onChange={(e) => change(setCategory)(e.target.value)}
            >
              <option value="">Todas</option>
              {BIKE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="account-field">
            Cilindrada
            <select
              value={band}
              onChange={(e) => change(setBand)(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="up-to-300">Até 300 cc</option>
              <option value="301-600">301–600 cc</option>
              <option value="601-1000">601–1000 cc</option>
              <option value="over-1000">Acima de 1000 cc</option>
              <option value="unknown">Não informada</option>
            </select>
          </label>
        </div>
        <small>
          Região escolhida por cada participante. Grupos regionais exigem pelo
          menos cinco pessoas elegíveis. Categoria baseada na moto da atividade;
          modelos sem mapeamento ficam não classificados.
        </small>
      </div>
      {error && (
        <div className="panel gamification-card" role="alert">
          <p>{error}</p>
          <p>Sem conexão, a classificação remota fica indisponível.</p>
          <button className="button" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      )}
      {data && (
        <section className="panel gamification-card">
          <h2>{data.season?.name ?? 'Temporada indisponível'}</h2>
          {data.season && (
            <p>
              {data.season.status === 'active'
                ? 'Ativa'
                : data.season.status === 'scheduled'
                  ? 'Agendada'
                  : 'Encerrada'}{' '}
              · Revisão {data.season.revision}
            </p>
          )}
          {data.unavailable ? (
            <p role="status">{data.unavailable}</p>
          ) : (
            <>
              <p>
                Empates compartilham a posição. Ordenação estável entre pessoas
                empatadas.
              </p>
              <ol className="ranking-list">
                {data.items.map((e) => (
                  <li key={e.user_id}>
                    <strong>{e.position}º</strong>
                    <Avatar name={e.display_name} placeholder />
                    <div>
                      <Link to={`/comunidade/u/${e.username}`}>
                        {e.display_name}
                      </Link>
                      <small>
                        {[e.city, e.state].filter(Boolean).join(', ') ||
                          'Região não divulgada'}
                      </small>
                    </div>
                    <strong>{e.score} XP</strong>
                  </li>
                ))}
              </ol>
              {data.items.length === 0 && (
                <p>Nenhum participante elegível nesta seleção.</p>
              )}
              <div className="gamification-actions">
                <button
                  className="button"
                  disabled={page <= 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Anterior
                </button>
                <span>Página {page}</span>
                <button
                  className="button"
                  disabled={!data.hasMore}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          )}
          {data.me && (
            <p>
              Meu posicionamento: {data.me.position}º · {data.me.score} XP nesta
              classificação.
            </p>
          )}
          {prefs.data && !prefs.data.preferences.opted_in && (
            <p>
              Participação desativada. Seu progresso pessoal continua disponível
              no Perfil.
            </p>
          )}
        </section>
      )}
      {!data && !error && <p>Consultando classificação…</p>}
      <RankingPreferences />
    </div>
  );
}
