import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { historyParams } from '../history/filters';
import { HistoryFilters } from '../history/HistoryFilters';
import { historyService } from '../history/service';
import type { HistoryOptions } from '../history/types';
import { useHistoryStats } from '../history/useHistoryStats';
import { formatDuration } from '../ride/format';
import '../styles/history.css';
import '../styles/ride-session.css';
export function RideStatisticsPage() {
  const [params, setParams] = useSearchParams(),
    [options, setOptions] = useState<HistoryOptions>({
      motorcycles: [],
      routes: [],
    });
  const serialized = params.toString();
  const [query, setQuery] = useState(() =>
    historyParams(new URLSearchParams(serialized)).toString(),
  );
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery(historyParams(new URLSearchParams(serialized)).toString()),
      200,
    );
    return () => clearTimeout(timer);
  }, [serialized]);
  const { data, error } = useHistoryStats(query);
  useEffect(() => {
    let live = true;
    void historyService
      .options()
      .then((r) => {
        if (live) setOptions(r);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  function change(key: string, value: string) {
    if (key === '*') {
      setParams({});
      return;
    }
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete('page');
    setParams(p);
  }
  return (
    <div className="history-page">
      <header className="history-heading">
        <h1>Estatísticas dos Rides</h1>
        <Link className="text-link action-link" to="/historico">
          Voltar ao histórico
        </Link>
      </header>
      <HistoryFilters
        stats
        params={params}
        options={options}
        onChange={change}
      />
      <p>
        Somente atividades salvas no servidor, da sua conta. Pendências locais
        não entram nestes totais. A média usa distância total dividida pelo
        tempo ativo total.
      </p>
      {error ? (
        <p className="panel history-panel" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p role="status">Carregando estatísticas…</p>
      ) : (
        <>
          <section className="panel history-panel">
            <dl className="session-summary-metrics">
              <div>
                <dt>Total de Rides</dt>
                <dd>{data.totals.total}</dd>
              </div>
              <div>
                <dt>Distância total</dt>
                <dd>
                  {(data.totals.distance_meters / 1000).toLocaleString(
                    'pt-BR',
                    { maximumFractionDigits: 2 },
                  )}{' '}
                  km
                </dd>
              </div>
              <div>
                <dt>Tempo ativo total</dt>
                <dd>{formatDuration(data.totals.active_ms)}</dd>
              </div>
              <div>
                <dt>Média ponderada</dt>
                <dd>
                  {data.totals.average_kmh === null
                    ? 'Indisponível'
                    : `${data.totals.average_kmh.toFixed(1)} km/h`}
                </dd>
              </div>
              <div>
                <dt>Motos utilizadas</dt>
                <dd>{data.totals.motorcycles}</dd>
              </div>
            </dl>
          </section>
          <section className="panel history-panel">
            <h2>Por modo</h2>
            <dl className="session-summary-metrics">
              {['passeio', 'pista', 'misto'].map((mode) => (
                <div key={mode}>
                  <dt>{mode}</dt>
                  <dd>
                    {data.modes.find((m) => m.mode === mode)?.total ?? 0} Rides
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel history-panel">
            <h2>Distância por motocicleta</h2>
            {!data.motorcycles.length ? (
              <p>Nenhuma atividade neste período.</p>
            ) : (
              <table className="history-stat-table">
                <thead>
                  <tr>
                    <th>Moto</th>
                    <th>Rides</th>
                    <th>km</th>
                  </tr>
                </thead>
                <tbody>
                  {data.motorcycles.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.motorcycle
                          ? `${b.motorcycle.brand} ${b.motorcycle.model}`
                          : 'Moto histórica'}
                      </td>
                      <td>{b.total}</td>
                      <td>{(b.distance_meters / 1000).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.limited.motorcycles && (
              <p>
                Até 120 motos nesta visualização. Filtre por moto para consultar
                as demais.
              </p>
            )}
          </section>
          <section className="panel history-panel">
            <h2>Evolução mensal</h2>
            <table className="history-stat-table">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Rides</th>
                  <th>km</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.total}</td>
                    <td>{(m.distance_meters / 1000).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.months.length && <p>Nenhuma atividade neste período.</p>}
            {data.limited.months && (
              <p>
                Até 120 meses recentes. Use o intervalo personalizado para
                consultar períodos anteriores.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
