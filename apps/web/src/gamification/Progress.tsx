import { Link } from 'react-router';
import { LockKeyhole } from 'lucide-react';
import { AchievementMedal } from './Badge';
import { Progress } from '../components/ui';
import { useAuth } from '../auth/useAuth';
import { useGamification } from './useGamification';
import type { ProgressData, Achievement } from './types';
import '../styles/gamification.css';
export function ProgressSummary({ data }: { data: ProgressData | null }) {
  return (
    <div className="gamification-progress">
      <div className="xp-label">
        <strong>
          {data
            ? `Nível ${data.level} · ${data.totalXp.toLocaleString('pt-BR')} XP`
            : 'Progresso aguardando confirmação'}
        </strong>
      </div>
      <Progress
        value={data?.percent ?? 0}
        label="Progresso para o próximo nível"
      />
      {data && (
        <small>
          {data.remainingXp.toLocaleString('pt-BR')} XP para o nível{' '}
          {data.level + 1} · {data.validRides} atividade(s) elegível(is)
          {data.pending ? ' · Atualização pendente' : ''}
        </small>
      )}
    </div>
  );
}
export function AchievementPreview() {
  const { user } = useAuth(),
    { data, error } = useGamification<{ items: Achievement[] }>(
      '/gamification/me/achievements',
    );
  if (!user) return <p>Entre para consultar suas conquistas.</p>;
  return (
    <div className="achievements panel">
      {error && <p role="status">{error}</p>}
      {data?.items
        .filter((a) => a.status === 'unlocked')
        .sort(
          (a, b) =>
            Date.parse(b.unlocked_at ?? '') - Date.parse(a.unlocked_at ?? ''),
        )
        .slice(0, 3)
        .map((a) => (
          <div className="achievement achievement-red" key={a.code}>
            <AchievementMedal category={a.category} />
            <strong>{a.name}</strong>
            <p>Desbloqueada</p>
          </div>
        ))}
      {data && !data.items.some((a) => a.status === 'unlocked') && (
        <p>
          <LockKeyhole size={18} aria-hidden /> Suas primeiras conquistas
          aparecerão aqui.
        </p>
      )}
      {!data && !error && <p>Consultando conquistas…</p>}
      <Link className="text-link" to="/perfil/conquistas">
        Ver conquistas e metas
      </Link>
    </div>
  );
}
export function RideXp({ id }: { id: string }) {
  const { data, error, reload } = useGamification<{
    xp: number;
    fact: { state: string; reason: string };
  }>(`/gamification/me/rides/${id}`);
  return (
    <section
      className="panel gamification-card"
      aria-label="Experiência da atividade"
    >
      <h2>Experiência</h2>
      {data ? (
        <>
          <strong>{data.xp} XP confirmados nesta atividade</strong>
          <p>{data.fact.reason}</p>
          {data.fact.state === 'eligible' && data.xp === 0 && (
            <p>
              O limite de pontuação pode ter sido atingido. A atividade
              permanece no seu histórico.
            </p>
          )}
        </>
      ) : (
        <p>{error || 'Consultando validação…'}</p>
      )}
      {(error || data?.fact.state === 'pending') && (
        <button className="button" onClick={reload}>
          Atualizar validação
        </button>
      )}
      <Link className="text-link" to={`/perfil/xp?rideId=${id}`}>
        Histórico de XP e solicitações de revisão
      </Link>
    </section>
  );
}
