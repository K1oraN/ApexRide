import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Route } from 'lucide-react';
import { ButtonLink, EmptyState, Skeleton } from '../components/design-system';
import '../styles/history.css';
import { LastRide } from './LastRide';
import { RideHistoryCard } from './RideHistoryCard';
import { historyService } from './service';
import type { HistoryRide } from './types';
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
        <Link className="text-link action-link" to="/entrar">
          Entrar para ver atividades
        </Link>
      </div>
    );
  return (
    <div>
      {error ? (
        <p role="status">
          Histórico indisponível.{' '}
          <Link className="text-link action-link" to="/historico">
            Abrir histórico
          </Link>
        </p>
      ) : rides === null ? (
        <Skeleton label="Carregando atividades…" />
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
        <EmptyState
          icon={<Route size={26} />}
          title="Seu primeiro Ride começa aqui."
          children="Prepare sua moto e registre uma atividade para acompanhar seu histórico."
          action={
            <ButtonLink variant="secondary" to="/ride">
              Preparar Ride
            </ButtonLink>
          }
        />
      )}
      <Link className="text-link action-link" to="/historico">
        Ver todas as atividades
      </Link>
    </div>
  );
}
