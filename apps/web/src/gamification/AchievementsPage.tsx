import { useState } from 'react';
import { Link } from 'react-router';
import {
  Award,
  LockKeyhole,
  Compass,
  UsersRound,
  Bike,
  Flag,
} from 'lucide-react';
import { Progress } from '../components/ui';
import { Composer } from '../social/Composer';
import { useGamification, changeGamification } from './useGamification';
import type { Achievement, Challenge } from './types';
import '../styles/gamification.css';
const icons: Record<string, typeof Award> = {
  Exploração: Compass,
  Comunidade: UsersRound,
  Garagem: Bike,
  Circuitos: Flag,
};
export function AchievementsPage() {
  const { data, error, reload } = useGamification<{ items: Achievement[] }>(
    '/gamification/me/achievements',
  );
  const [category, setCategory] = useState(''),
    [filter, setFilter] = useState(''),
    [share, setShare] = useState<Achievement | null>(null);
  return (
    <div className="gamification-page">
      <Link className="text-link" to="/perfil">
        Voltar ao perfil
      </Link>
      <header>
        <span className="eyebrow">MEU PROGRESSO</span>
        <h1>Conquistas e metas</h1>
        <p>
          Explore e participe no seu ritmo. Mais velocidade não significa mais
          experiência.
        </p>
      </header>
      {error && (
        <div role="alert">
          {error}
          <button className="button" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      )}
      <div className="gamification-filters">
        <label className="account-field">
          Categoria
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas</option>
            {Array.from(new Set(data?.items.map((a) => a.category))).map(
              (c) => (
                <option key={c}>{c}</option>
              ),
            )}
          </select>
        </label>
        <label className="account-field">
          Estado da conquista
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="unlocked">Desbloqueadas</option>
            <option value="locked">Bloqueadas</option>
            <option value="revoked">Reavaliadas</option>
            <option value="unavailable">Indisponíveis</option>
          </select>
        </label>
      </div>
      {share && (
        <Composer
          key={share.code}
          achievementCode={share.code}
          initialText={`Conquistei ${share.name} no Apex Ride.`}
          onSaved={() => setShare(null)}
          onCancel={() => setShare(null)}
        />
      )}
      <div className="gamification-grid">
        {data?.items
          .filter(
            (a) =>
              (!category || a.category === category) &&
              (!filter || a.status === filter),
          )
          .map((a) => {
            const Icon = icons[a.category] ?? Award;
            return (
              <article
                key={a.code}
                className={`panel gamification-card achievement-${a.status}`}
              >
                <Icon size={30} aria-hidden />
                <span className="eyebrow">{a.category}</span>
                <h2>{a.name}</h2>
                <p>{a.description}</p>
                <Progress
                  value={Math.min(a.current_value, a.target)}
                  max={a.target}
                  label={`Progresso: ${a.name}`}
                />
                <p>
                  {Math.min(a.current_value, a.target)} de {a.target} ·{' '}
                  {a.status === 'unlocked'
                    ? 'Desbloqueada'
                    : a.status === 'unavailable'
                      ? 'Indisponível'
                      : a.status === 'revoked'
                        ? 'Reavaliada'
                        : 'Bloqueada'}{' '}
                  {!a.enabled && ' · Desativada'}
                </p>
                {a.status === 'unlocked' && a.unlocked_at && (
                  <small>
                    Reconhecida em{' '}
                    {new Date(a.unlocked_at).toLocaleDateString('pt-BR')}
                  </small>
                )}
                {a.xp_reward > 0 && (
                  <small>Até {a.xp_reward} XP, conforme regras e limites</small>
                )}
                {a.status === 'unlocked' ? (
                  <button className="button" onClick={() => setShare(a)}>
                    Compartilhar conquista
                  </button>
                ) : (
                  <LockKeyhole size={16} aria-label="Conquista bloqueada" />
                )}
              </article>
            );
          })}
      </div>
      {!data && !error && <p>Consultando catálogo…</p>}
      <Challenges />
    </div>
  );
}
function Challenges() {
  const { data, error } = useGamification<{ items: Challenge[] }>(
      '/gamification/me/challenges',
    ),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function act(code: string, cancel = false) {
    setBusy(true);
    setMessage('');
    try {
      await changeGamification(
        `/gamification/me/challenges${cancel ? '/' + code : ''}`,
        cancel ? 'DELETE' : 'POST',
        cancel ? undefined : { code },
      );
      setMessage(
        cancel
          ? 'Meta cancelada. Seu XP foi preservado.'
          : 'Meta iniciada. Sem prazo ou obrigação diária.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel gamification-card">
      <h2>Metas pessoais opcionais</h2>
      <p>
        Sem prazo, penalidade ou XP adicional. Descanse sempre que precisar.
      </p>
      <div className="gamification-actions">
        {[
          ['first_ride', 'Uma atividade elegível'],
          ['first_route', 'Uma rota diferente'],
          ['first_event', 'Um evento verificado'],
        ].map(([code, name]) => (
          <button
            className="button"
            disabled={
              busy ||
              data?.items.some(
                (c) => c.code === code && c.status !== 'cancelled',
              )
            }
            key={code}
            onClick={() => void act(code!)}
          >
            {name}
          </button>
        ))}
      </div>
      {data?.items
        .filter((c) => c.status !== 'cancelled')
        .map((c) => (
          <article key={c.code}>
            <strong>{c.name}</strong>
            <p>
              {Math.max(0, Math.min(c.target, c.current_value - c.baseline))} de{' '}
              {c.target} ·{' '}
              {c.status === 'completed' ? 'Concluída' : 'Em andamento'}
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={() => void act(c.code, true)}
            >
              Cancelar meta
            </button>
          </article>
        ))}
      {(message || error) && <p role="status">{message || error}</p>}
    </section>
  );
}
