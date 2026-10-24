import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { authRequest } from '../services/auth';
import '../styles/history.css';
interface Summary {
  title: string;
  rider: string;
  day: string;
  mode: string;
  distance_km: number;
  active_minutes: number;
  locationPolicy: 'summary-only-v1';
}
export function PublicRidePage() {
  const { id } = useParams(),
    [data, setData] = useState<Summary | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => {
      void authRequest<{ summary: Summary }>(
        `/public/rides/${encodeURIComponent(id!)}`,
      )
        .then((r) => {
          if (live) {
            setData(r.summary);
            setError('');
          }
        })
        .catch(() => {
          if (live) {
            setData(null);
            setError(
              'Resumo público indisponível. A atividade pode ser privada ou ter sido excluída.',
            );
          }
        });
    };
    load();
    const timer = setInterval(load, 30000);
    window.addEventListener('focus', load);
    const visible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', visible);
    const prior = document.title;
    document.title = 'Apex Ride · resumo de atividade';
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !robots;
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    const previous = robots.content;
    robots.content = 'noindex, noarchive';
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', visible);
      document.title = prior;
      if (created) robots.remove();
      else robots.content = previous;
    };
  }, [id]);
  return (
    <section className="account-card panel history-detail">
      <span className="eyebrow">APEX RIDE · RESUMO PÚBLICO</span>
      {data ? (
        <>
          <h1>{data.title}</h1>
          <p>
            {data.rider} · {data.mode} · {data.day}
          </p>
          <dl className="session-summary-metrics">
            <div>
              <dt>Distância aproximada</dt>
              <dd>{data.distance_km.toLocaleString('pt-BR')} km</dd>
            </div>
            <div>
              <dt>Tempo ativo aproximado</dt>
              <dd>{data.active_minutes} min</dd>
            </div>
          </dl>
          <p>
            Resumo sem mapa. Coordenadas, início/fim exatos, rota planejada,
            descrição e telemetria pessoal não são compartilhados.
          </p>
        </>
      ) : error ? (
        <>
          <h1>Resumo indisponível</h1>
          <p role="status">{error}</p>
        </>
      ) : (
        <>
          <h1>Resumo de Ride</h1>
          <p role="status">Carregando resumo público…</p>
        </>
      )}
      <Link className="text-link" to="/">
        Conhecer o Apex Ride
      </Link>
    </section>
  );
}
