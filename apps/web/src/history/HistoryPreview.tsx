import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { historyService } from './service';
import { RideHistoryCard } from './RideHistoryCard';
import type { HistoryRide } from './types';
import '../styles/history.css';
import { LastRide } from './LastRide';
export function HistoryPreview({ profile = false }: { profile?: boolean }) {
  const { user } = useAuth(),
    [response, setResponse] = useState<{
      owner: string;
      rides: HistoryRide[];
    } | null>(null),
    [error, setError] = useState('');
  const rides = response?.owner === user?.id ? (response?.rides ?? null) : null;
  useEffect(() => {
    let live = true;
    if (user)
      void historyService
        .list(new URLSearchParams({ limit: profile ? '3' : '1' }))
        .then((r) => {
          if (live) {
            setResponse({ owner: user.id, rides: r.rides });
            setError('');
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [user?.id, user, profile]);
  if (!user)
    return (
      <div className="last-ride panel history-panel">
        <p>Entre para consultar seus Rides.</p>
        <Link className="text-link" to="/entrar">
          Entrar para ver atividades
        </Link>
      </div>
    );
  return (
    <div>
      {error ? (
        <p role="status">
          Histórico indisponível.{' '}
          <Link className="text-link" to="/historico">
            Abrir histórico
          </Link>
        </p>
      ) : rides === null ? (
        <p>Carregando atividades…</p>
      ) : rides.length ? (
        !profile ? (
          <LastRide ride={rides[0]!} />
        ) : (
          <div className="history-grid">
            {rides.map((r) => (
              <RideHistoryCard key={r.id} ride={r} />
            ))}
          </div>
        )
      ) : (
        <div className="last-ride panel history-panel">
          <p>Seu primeiro Ride começa aqui.</p>
          <Link className="text-link" to="/ride">
            Preparar Ride
          </Link>
        </div>
      )}
      <Link className="text-link" to="/historico">
        Ver todas as atividades
      </Link>
    </div>
  );
}
