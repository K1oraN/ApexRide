import { Award, Clock3, Route, Trophy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, Card, Select, StatCard } from '../components/design-system';
import { ProgressSummary } from '../gamification/Progress';
import type {
  Achievement,
  Challenge,
  ProgressData,
} from '../gamification/types';
import { useGamification } from '../gamification/useGamification';
import { periodDates } from '../history/filters';
import { useHistoryStats } from '../history/useHistoryStats';
import { formatDuration } from '../ride/format';
import type { HomeOffline } from './useHomeOffline';

function dashboardPeriod(period: string, now = new Date()) {
  const dates =
    period === 'month'
      ? {
          from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          to: now.toISOString(),
        }
      : periodDates(period === 'total' ? '' : period, '', '', now);
  const query = new URLSearchParams();
  if (dates.from) query.set('from', dates.from);
  if (dates.to) query.set('to', dates.to);
  return query.toString();
}
export function HomePerformance({
  local,
  children,
}: {
  local: HomeOffline;
  children: ReactNode;
}) {
  const [period, setPeriod] = useState('month');
  const [query, setQuery] = useState(() => dashboardPeriod('month'));
  const confirmed = local.queue
    .filter((item) => item.state === 'confirmed')
    .map((item) => item.serverId ?? item.id)
    .sort()
    .join(',');
  const stats = useHistoryStats(query, confirmed);
  const progress = useGamification<{ progress: ProgressData }>(
    '/gamification/me',
  );
  const achievements = useGamification<{ items: Achievement[] }>(
    '/gamification/me/achievements',
  );
  const missions = useGamification<{ items: Challenge[] }>(
    '/gamification/me/challenges',
  );
  const activeMissions = missions.data?.items.filter(
    (item) => item.status === 'active',
  ).length;
  const offline = local.connection === 'offline';
  const totals = offline ? null : stats.data?.totals;
  const data = offline ? null : progress.data?.progress;
  const unlocked = offline
    ? null
    : achievements.data?.items.filter((item) => item.status === 'unlocked')
        .length;
  const pending = local.queue.filter(
    (item) => item.state !== 'confirmed',
  ).length;
  return (
    <>
      <Card className="home-performance" aria-label="Meu desempenho">
        <div className="home-section-title">
          <h2>Meu desempenho</h2>
          <label className="home-period">
            <span className="sr-only">Período do desempenho</span>
            <Select
              value={period}
              onChange={(event) => {
                setPeriod(event.target.value);
                setQuery(dashboardPeriod(event.target.value));
              }}
            >
              <option value="month">Este mês</option>
              <option value="30">Últimos 30 dias</option>
              <option value="year">Este ano</option>
              <option value="total">Total</option>
            </Select>
          </label>
        </div>
        <div
          className="home-performance-grid"
          aria-busy={!offline && !stats.data && !stats.error}
        >
          <StatCard
            icon={<Route />}
            value={
              totals
                ? (totals.distance_meters / 1000).toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })
                : '—'
            }
            unit="km"
            label="Distância total"
          />
          <StatCard
            icon={<Clock3 />}
            value={totals ? formatDuration(totals.active_ms) : '—'}
            label="Tempo de pilotagem"
          />
          <Link to="/perfil/conquistas#missoes">
            <StatCard
              icon={<Trophy />}
              value={offline ? '—' : (activeMissions ?? '—')}
              label="Missões ativas"
            />
          </Link>
          <Link to="/perfil/conquistas">
            <StatCard
              icon={<Award />}
              value={unlocked ?? '—'}
              label="Conquistas · total"
            />
          </Link>
        </div>
        <div className="home-data-note" aria-live="polite">
          {offline ? (
            <p>
              Sem conexão. O desempenho completo depende do servidor; as
              atividades locais estão preservadas.
            </p>
          ) : stats.error ? (
            <p>
              Desempenho indisponível.{' '}
              <Button variant="ghost" onClick={stats.reload}>
                Tentar novamente
              </Button>
            </p>
          ) : !stats.data ? (
            <p>Consultando atividades…</p>
          ) : (
            <p>{totals?.total} sessões no período selecionado.</p>
          )}
          {pending > 0 && (
            <p>
              {pending} atividade(s) aguardando sincronização; fora dos totais
              confirmados.
            </p>
          )}
          {!offline &&
            (progress.error || achievements.error || missions.error) && (
              <p>
                Parte da evolução está indisponível.{' '}
                <Button
                  variant="ghost"
                  onClick={() => {
                    progress.reload();
                    achievements.reload();
                    missions.reload();
                  }}
                >
                  Atualizar evolução
                </Button>
              </p>
            )}
        </div>
      </Card>
      {children}
      <Card className="home-progress" aria-label="Minha evolução">
        <div className="home-section-title">
          <h2>Minha evolução</h2>
          <Link className="text-link action-link" to="/perfil/conquistas">
            Ver conquistas
          </Link>
        </div>
        <ProgressSummary data={data ?? null} />
        <Link className="text-link action-link" to="/perfil/xp">
          Ver meu progresso
        </Link>
      </Card>
    </>
  );
}
