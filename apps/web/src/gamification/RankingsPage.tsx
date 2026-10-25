import { BIKE_CATEGORIES } from '@apex-ride/ride-core/comparison';
import { useState } from 'react';
import { Link } from 'react-router';
import { StateField } from '../components/AccountFields';
import { Button, Input, Select } from '../components/design-system';
import { Avatar } from '../components/ui';
import { useGamification } from './useGamification';
import type { Ranking, Season } from './types';
import '../styles/gamification.css';

type Scope = 'br' | 'state' | 'city';

export function RankingsPage() {
  const [season, setSeason] = useState('');
  const [kind, setKind] = useState('xp');
  const [scope, setScope] = useState<Scope>('br');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [band, setBand] = useState('');
  const [page, setPage] = useState(1);

  const seasons = useGamification<{ items: Season[] }>('/gamification/seasons');
  const q = new URLSearchParams({
    page: String(page),
    state: scope !== 'br' ? state : '',
    city: scope === 'city' ? city.trim() : '',
    region: '',
    category,
    ccBand: band,
    ...(season ? { season } : {}),
  });
  const { data, error, reload } = useGamification<Ranking>(
    `/gamification/leaderboards/${kind}?${q}`,
  );
  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const regionIsReady = scope === 'br' || Boolean(state) && (scope !== 'city' || Boolean(city.trim()));

  return (
    <div className="gamification-page apex-ranking-page">
      <Link className="text-link action-link" to="/comunidade">
        Voltar à Comunidade
      </Link>
      <header>
        <span className="eyebrow">APEX RIDE / CLASSIFICAÇÕES</span>
        <h1>Rankings dos riders</h1>
        <p>Explore os destaques do Brasil, do seu estado e da sua cidade. Sem classificação por velocidade em vias públicas.</p>
      </header>
      <section className="panel gamification-card apex-ranking-filters" aria-label="Filtros dos rankings">
        <div className="apex-ranking-scope" role="group" aria-label="Abrangência do ranking">
          {([
            ['br', 'Brasil'],
            ['state', 'Estados'],
            ['city', 'Cidades'],
          ] as const).map(([value, name]) => (
            <Button
              key={value}
              type="button"
              variant={scope === value ? 'primary' : 'secondary'}
              aria-pressed={scope === value}
              onClick={() => { setScope(value); setPage(1); }}
            >
              {name}
            </Button>
          ))}
        </div>
        <div className="gamification-filters apex-ranking-grid">
          <label className="account-field">
            Temporada
            <Select value={season} onChange={(e) => change(setSeason)(e.target.value)}>
              <option value="">Temporada ativa</option>
              {seasons.data?.items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </label>
          <label className="account-field">
            Classificação
            <Select value={kind} onChange={(e) => change(setKind)(e.target.value)}>
              <option value="xp">XP da temporada</option>
              <option value="community">Participação comunitária</option>
              <option value="exploration">Exploração</option>
            </Select>
          </label>
          {scope !== 'br' && (
            <StateField
              value={state}
              onChange={(value) => {
                setState(value);
                setCity('');
                setPage(1);
              }}
            />
          )}
          {scope === 'city' && (
            <label className="account-field">
              Cidade
              <Input
                value={city}
                disabled={!state}
                maxLength={80}
                placeholder="Ex.: Maceió"
                onChange={(e) => change(setCity)(e.target.value)}
              />
            </label>
          )}
          <label className="account-field">
            Categoria / estilo da moto
            <Select value={category} onChange={(e) => change(setCategory)(e.target.value)}>
              <option value="">Todas as categorias</option>
              {BIKE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </Select>
          </label>
          <label className="account-field">
            Cilindrada
            <Select value={band} onChange={(e) => change(setBand)(e.target.value)}>
              <option value="">Todas as cilindradas</option>
              <option value="up-to-300">Até 300 cc</option>
              <option value="301-600">301–600 cc</option>
              <option value="601-1000">601–1000 cc</option>
              <option value="over-1000">Acima de 1000 cc</option>
              <option value="unknown">Não informada</option>
            </Select>
          </label>
        </div>
        <small>Os filtros respeitam as regiões declaradas e os consentimentos existentes; dados privados não são expostos automaticamente.</small>
      </section>
      {!regionIsReady ? (
        <div className="panel gamification-card" role="status">
          {scope === 'city' ? 'Selecione o estado e informe a cidade para consultar o ranking municipal.' : 'Selecione um estado para consultar o ranking estadual.'}
        </div>
      ) : error ? (
        <div className="panel gamification-card" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={reload}>Tentar novamente</Button>
        </div>
      ) : data ? (
        <section className="panel gamification-card apex-ranking-results">
          <div className="apex-ranking-results-heading">
            <div>
              <span className="eyebrow">{scope === 'br' ? 'GERAL / BRASIL' : scope === 'state' ? `ESTADO / ${state}` : `CIDADE / ${city}`}</span>
              <h2>{data.season?.name ?? 'Temporada'}</h2>
            </div>
          </div>
          {data.unavailable ? (
            <p role="status">{data.unavailable}</p>
          ) : (
            <>
              <ol className="ranking-list">
                {data.items.map((entry) => (
                  <li key={entry.user_id}>
                    <strong>{entry.position}º</strong>
                    <Avatar name={entry.display_name} placeholder />
                    <div>
                      <Link to={`/comunidade/u/${entry.username}`}>
                        {entry.display_name}
                      </Link>
                      <small>{[entry.city, entry.state].filter(Boolean).join(', ') || 'Região não divulgada'}</small>
                    </div>
                    <strong>{entry.score} {kind === 'xp' ? 'XP' : 'pts'}</strong>
                  </li>
                ))}
              </ol>
              {data.items.length === 0 && <p>Nenhum participante disponível para os filtros escolhidos.</p>}
              <div className="page-pagination">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
                <span>Página {page}</span>
                <Button variant="secondary" disabled={!data.hasMore} onClick={() => setPage((value) => value + 1)}>Próxima</Button>
              </div>
            </>
          )}
          {data.me && <p>Meu posicionamento: {data.me.position}º · {data.me.score} {kind === 'xp' ? 'XP' : 'pts'}.</p>}
        </section>
      ) : <p role="status">Consultando classificação…</p>}
    </div>
  );
}
