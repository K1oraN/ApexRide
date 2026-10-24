import { ChoiceSelect } from '../components/design-system';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ComparisonResults } from '../comparison/ComparisonResults';
import { comparisonService } from '../comparison/service';
import type {
  CommunityStats,
  ComparisonResult,
  SelectionData,
} from '../comparison/types';
import { Button, Checkbox, Input, Select } from '../components/design-system';
import '../styles/comparison.css';
import '../styles/history.css';
import '../styles/ride-session.css';
import '../styles/routes.css';
export function ComparisonPage() {
  const { id } = useParams(),
    { user } = useAuth();
  return <Comparison key={`${user?.id}:${id}`} id={id!} />;
}
function Comparison({ id }: { id: string }) {
  const [params, setParams] = useSearchParams(),
    selected = [
      ...new Set((params.get('atividades') ?? '').split(',').filter(Boolean)),
    ].slice(0, 4);
  const [data, setData] = useState<SelectionData | null>(null),
    [result, setResult] = useState<ComparisonResult | null>(null),
    [stats, setStats] = useState<CommunityStats | null>(null),
    [error, setError] = useState(''),
    [candidateError, setCandidateError] = useState(''),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const query = new URLSearchParams(params);
  query.delete('atividades');
  query.delete('executar');
  const queryString = query.toString(),
    selectionKey = selected.join(','),
    run = params.get('executar') === '1';
  useEffect(() => {
    const abort = new AbortController();
    void comparisonService
      .candidates(id, new URLSearchParams(queryString), abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) {
          setData(r);
          setCandidateError('');
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setData(null);
          setCandidateError(
            navigator.onLine
              ? e.message
              : 'Sem conexão. A seleção foi preservada; esta comparação exige dados do servidor.',
          );
        }
      });
    return () => abort.abort();
  }, [id, queryString, attempt]);
  useEffect(() => {
    if (!run || selectionKey.split(',').filter(Boolean).length < 2) return;
    const abort = new AbortController();
    void comparisonService
      .compare(id, selectionKey.split(','), abort.signal)
      .then((r) => {
        if (!abort.signal.aborted) {
          setResult(r);
          setError('');
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setResult(null);
          setError(
            navigator.onLine
              ? e.message
              : 'Sem conexão. Seleção preservada; conecte-se e tente novamente.',
          );
        }
      });
    return () => abort.abort();
  }, [id, selectionKey, run, attempt]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.delete('executar');
    if (value) next.set(key, value);
    else next.delete(key);
    setResult(null);
    setStats(null);
    setParams(next, { replace: true });
  }
  function select(activity: string) {
    const next = new URLSearchParams(params),
      ids = selected.includes(activity)
        ? selected.filter((s) => s !== activity)
        : [...selected, activity];
    if (ids.length > (data?.maxActivities ?? 4)) return;
    next.set('atividades', ids.join(','));
    next.delete('executar');
    setResult(null);
    setParams(next, { replace: true });
  }
  async function community() {
    setBusy(true);
    setError('');
    setStats(null);
    const q = new URLSearchParams(queryString);
    q.delete('page');
    q.delete('limit');
    q.delete('scope');
    try {
      setStats(await comparisonService.stats(id, q));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function laps(numbers: number[]) {
    setBusy(true);
    setError('');
    try {
      setResult(await comparisonService.laps(id, selected, numbers));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="history-detail comparison-page">
      <div className="history-actions">
        <Link className="text-link action-link" to={`/explorar/${id}`}>
          Voltar à rota
        </Link>
        <Link className="text-link action-link" to="/historico">
          Voltar ao histórico
        </Link>
      </div>
      <header className="panel history-panel">
        <h1>Comparar atividades</h1>
        <h2>{data?.route.name ?? 'Mesma rota cadastrada'}</h2>
        {data && (
          <p>
            {data.route.city} / {data.route.state} ·{' '}
            {data.route.plan
              ? `${(data.route.plan.distanceMeters / 1000).toFixed(2)} km`
              : 'Geometria aprovada indisponível'}{' '}
            · {selected.length} atividade(s) selecionada(s)
          </p>
        )}
        <p>
          Análise por posição na rota, com validação de cobertura e qualidade.
          Selecione de 2 a {data?.maxActivities ?? 4} atividades.
        </p>
      </header>
      {(error || candidateError) && (
        <section className="panel history-panel">
          <p role="alert">{error || candidateError}</p>
          <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </Button>
        </section>
      )}
      <section className="panel history-panel">
        <h2>Filtros de comparação</h2>
        <div className="comparison-filters">
          <div>
            <span>Atividades</span>
            <ChoiceSelect
              aria-label="Origem das atividades"
              value={params.get('scope') ?? 'own'}
              onChange={(e) => filter('scope', e.target.value)}
            >
              <option value="own">Minhas atividades</option>
              {data?.technicalAvailable && (
                <option value="technical">
                  Terceiros autorizados · circuito verificado
                </option>
              )}
            </ChoiceSelect>
          </div>
          <label>
            Categoria da moto
            <Select
              aria-label="Categoria da moto"
              value={params.get('category') ?? ''}
              onChange={(e) => filter('category', e.target.value)}
            >
              <option value="">Todas</option>
              {data?.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label>
            Faixa de cilindrada
            <Select
              aria-label="Faixa de cilindrada"
              value={params.get('ccBand') ?? ''}
              onChange={(e) => filter('ccBand', e.target.value)}
            >
              <option value="">Todas</option>
              {data?.ccBands.map(([min, max], i) => (
                <option value={i} key={i}>
                  {i === 0
                    ? `Até ${max} cc`
                    : i === 4
                      ? `Acima de ${min! - 1} cc`
                      : `${min}–${max} cc`}
                </option>
              ))}
            </Select>
          </label>
          {(['brand', 'model', 'city', 'state'] as const).map((key, i) => (
            <label key={key}>
              {
                [
                  'Fabricante',
                  'Modelo',
                  'Município da rota',
                  'Estado da rota (UF)',
                ][i]
              }
              <Input
                maxLength={key === 'state' ? 2 : 120}
                value={params.get(key) ?? ''}
                onChange={(e) => filter(key, e.target.value)}
              />
            </label>
          ))}
          <label>
            Região da rota
            <Select
              aria-label="Região da rota"
              value={params.get('region') ?? ''}
              onChange={(e) => filter('region', e.target.value)}
            >
              <option value="">Brasil</option>
              {['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'].map(
                (r) => (
                  <option key={r}>{r}</option>
                ),
              )}
            </Select>
          </label>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setParams({ atividades: selectionKey }, { replace: true });
            setStats(null);
            setResult(null);
          }}
        >
          Limpar filtros
        </Button>
        <p>
          A localização é a do percurso. Motos sem classificação verificada
          permanecem Não classificadas.
        </p>
      </section>
      <section className="panel history-panel" aria-label="Atividades da rota">
        <h2>Selecionar atividades</h2>
        {!data && !error && <p role="status">Carregando atividades…</p>}
        {data?.candidates.length === 0 && (
          <p>Nenhuma atividade encontrada com estes filtros.</p>
        )}
        <div className="comparison-candidates">
          {data?.candidates.map((a) => (
            <article className="panel history-panel" key={a.id}>
              <label>
                <Checkbox
                  aria-label={`Selecionar atividade ${a.id}`}
                  checked={selected.includes(a.id)}
                  disabled={
                    a.pointCount < 3 ||
                    (!selected.includes(a.id) &&
                      selected.length >= data.maxActivities)
                  }
                  onChange={() => select(a.id)}
                />
                {a.day ?? 'Sessão de pista autorizada'} ·{' '}
                {a.own ? 'Própria' : 'Compartilhada'}
              </label>
              <p>
                {a.bike
                  ? `${a.bike.brand} ${a.bike.model} · ${a.bike.displacementCc} cc`
                  : 'Moto não identificada'}{' '}
                · {a.category}
              </p>
              <p>
                {a.mode} · {(a.distanceMeters / 1000).toFixed(2)} km ·{' '}
                {(a.activeMs / 1000).toFixed(0)} s ativos
              </p>
              <p>
                Conclusão: {a.completion ?? 'Indeterminada'} · versão{' '}
                {a.routeVersion} ·{' '}
                {a.sensors
                  ? 'Sensores registrados'
                  : 'GPS; sensores indisponíveis'}
              </p>
              <p>
                {a.pointCount < 3
                  ? 'GPS insuficiente para comparação.'
                  : 'Cobertura, sentido e continuidade serão verificados ao comparar.'}
              </p>
            </article>
          ))}
        </div>
        <div className="history-actions">
          <Button
            variant="secondary"
            disabled={!data || data.page <= 1}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('page', String(data!.page - 1));
              setParams(next, { replace: true });
            }}
          >
            Anteriores
          </Button>
          <Button
            variant="secondary"
            disabled={!data?.hasMore}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('page', String(data!.page + 1));
              setParams(next, { replace: true });
            }}
          >
            Próximas
          </Button>
        </div>
      </section>
      <section className="panel history-panel">
        <h2>Seleção · {selected.length} atividades</h2>
        {selected.map((s, i) => (
          <div className="history-actions" key={s}>
            <span>
              Atividade {i + 1}
              {data?.candidates.find((c) => c.id === s)?.day
                ? ' · ' + data.candidates.find((c) => c.id === s)!.day
                : ''}
            </span>
            <button className="text-link" onClick={() => select(s)}>
              Remover atividade {i + 1}
            </button>
          </div>
        ))}
        <Button
          variant="primary"
          disabled={
            selected.length < 2 ||
            selected.length > (data?.maxActivities ?? 4) ||
            busy
          }
          onClick={() => {
            setResult(null);
            const next = new URLSearchParams(params);
            next.set('executar', '1');
            setParams(next, { replace: true });
            setAttempt((n) => n + 1);
          }}
        >
          Comparar selecionadas
        </Button>
        {run && !result && !error && (
          <p role="status">Validando e alinhando os trechos…</p>
        )}
      </section>
      {result && (
        <ComparisonResults
          result={result}
          onLaps={(numbers) => void laps(numbers)}
          busy={busy}
        />
      )}
      <section className="panel history-panel">
        <h2>Comparação comunitária protegida</h2>
        <p>
          Escolha categoria e faixa de cilindrada. Somente grupos fixos com ao
          menos {data?.minParticipants ?? 10} contas distintas e participação
          autorizada exibem valores aproximados. Fabricante e modelo não se
          aplicam aos agregados.
        </p>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void community()}
        >
          Consultar estatísticas comunitárias
        </Button>
        {stats &&
          (stats.available && stats.summary ? (
            <p>
              Distância média ~{stats.summary.distanceKm} km · duração ativa
              média ~{stats.summary.activeMinutes} min · conclusão ~
              {stats.summary.completionPercent}% · frequência média ~
              {stats.summary.activitiesPerParticipant} atividades por
              participante.
            </p>
          ) : (
            <p role="status">{stats.message}</p>
          ))}
        <p>
          Atividade pública não autoriza telemetria de terceiros. Em vias
          comuns, trajetos, horários e séries de velocidade, G e inclinação
          permanecem protegidos.
        </p>
      </section>
    </div>
  );
}
