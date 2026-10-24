import { useState } from 'react';
import { Button } from '../components/design-system';
import { useGamification } from './useGamification';
export function CircuitResults({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { data, error } = useGamification<{
    items: {
      ride_id: string;
      lap_number: number;
      route_version: number;
      estimated_seconds: number;
      technically_eligible: boolean;
    }[];
    hasMore: boolean;
    reason: string;
  }>(`/circuits/${id}/leaderboard?page=${page}`);
  return (
    <section className="panel gamification-card">
      <h2>Meus resultados de pista</h2>
      <p>{data?.reason ?? error ?? 'Consultando resultados…'}</p>
      {data?.items.map((l) => (
        <p key={`${l.ride_id}:${l.lap_number}`}>
          Volta {l.lap_number} · ~{l.estimated_seconds.toFixed(1)} s · Versão{' '}
          {l.route_version} ·{' '}
          {l.technically_eligible
            ? 'Qualidade técnica elegível'
            : 'Somente análise pessoal'}
        </p>
      ))}
      {data?.items.length === 0 && (
        <p>Nenhuma volta registrada neste circuito.</p>
      )}
      <div className="gamification-actions">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => setPage((n) => n - 1)}
        >
          Resultados anteriores
        </Button>
        <Button
          variant="secondary"
          disabled={!data?.hasMore}
          onClick={() => setPage((n) => n + 1)}
        >
          Mais resultados
        </Button>
      </div>
    </section>
  );
}
