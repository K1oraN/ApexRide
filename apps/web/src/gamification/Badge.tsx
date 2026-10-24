import {
  Award,
  Mountain,
  Route,
  UsersRound,
  Bike,
  Flag,
  LockKeyhole,
} from 'lucide-react';
const icons: Record<string, typeof Award> = {
  Exploração: Mountain,
  Atividades: Route,
  Comunidade: UsersRound,
  Garagem: Bike,
  Circuitos: Flag,
};
// Mesmo medalhão Racing Tech previsto no Perfil aprovado.
export function AchievementMedal({
  category,
  locked = false,
}: {
  category: string;
  locked?: boolean;
}) {
  const Icon = locked ? LockKeyhole : (icons[category] ?? Award);
  return (
    <div className="medal" aria-hidden>
      <svg viewBox="0 0 100 110">
        <path d="M50 3 95 28v54l-45 25L5 82V28Z" />
        <path d="M50 10 88 32v46l-38 22-38-22V32Z" />
      </svg>
      <Icon />
    </div>
  );
}
