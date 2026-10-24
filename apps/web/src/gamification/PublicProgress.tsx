import { useGamification } from './useGamification';
export function PublicProgress({ id }: { id: string }) {
  const { data } = useGamification<{
    progress: { level: number; totalXp: number } | null;
    achievements: { code: string; name: string }[];
  }>(`/gamification/users/${id}`);
  if (!data || (!data.progress && !data.achievements.length)) return null;
  return (
    <section
      className="panel gamification-card"
      aria-label="Progressão autorizada"
    >
      <h2>Progressão autorizada</h2>
      {data.progress && (
        <p>
          Nível {data.progress.level} · {data.progress.totalXp} XP
        </p>
      )}
      {data.achievements.map((a) => (
        <span className="chip" key={a.code}>
          {a.name}
        </span>
      ))}
    </section>
  );
}
