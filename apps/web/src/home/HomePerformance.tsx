import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Clock3,
  Minus,
  Route,
  Trophy,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Button,
  ButtonLink,
  Card,
  Select,
  StatCard,
} from '../components/design-system';
import { ProgressSummary } from '../gamification/Progress';
import type {
  Achievement,
  Challenge,
  ProgressData,
} from '../gamification/types';
import { useGamification } from '../gamification/useGamification';
import { useHistoryStats } from '../history/useHistoryStats';
import { formatDuration } from '../ride/format';
import type { HomeOffline } from './useHomeOffline';
import '../styles/home-performance-refinement.css';

type Period = 'month' | '30' | 'year' | 'total';

type PeriodSelection = {
  period: Period;
  now: Date;
};

type CycleChangeProps = {
  current: number | null;
  previous: number | null;
  period: Period;
  unavailable?: string | undefined;
};

function periodQuery(from: Date, to: Date) {
  return new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  }).toString();
}

function dashboardCycles(period: Period, now: Date) {
  if (period === 'total') {
    return {
      currentQuery: '',
      previousQuery: '',
      currentStart: null as Date | null,
    };
  }

  let currentStart: Date;
  let previousStart: Date;

  if (period === 'month') {
    currentStart = new Date(now.getFullYear(), now.getMonth(), 1);

    previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  } else if (period === 'year') {
    currentStart = new Date(now.getFullYear(), 0, 1);

    previousStart = new Date(now.getFullYear() - 1, 0, 1);
  } else {
    currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - 30);

    previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - 30);
  }

  const elapsed = now.getTime() - currentStart.getTime();

  const previousEnd = new Date(
    Math.min(currentStart.getTime(), previousStart.getTime() + elapsed),
  );

  return {
    currentQuery: periodQuery(currentStart, now),
    previousQuery: periodQuery(previousStart, previousEnd),
    currentStart,
  };
}

function CycleChange({
  current,
  previous,
  period,
  unavailable,
}: CycleChangeProps) {
  if (period === 'total') {
    return (
      <div className="home-cycle-change is-neutral">
        <Minus size={16} aria-hidden="true" />
        <strong>—</strong>
        <span>Acumulado sem ciclo anterior</span>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="home-cycle-change is-neutral">
        <Minus size={16} aria-hidden="true" />
        <strong>—</strong>
        <span>{unavailable}</span>
      </div>
    );
  }

  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return (
      <div className="home-cycle-change is-neutral">
        <Minus size={16} aria-hidden="true" />
        <strong>—</strong>
        <span>Aguardando comparação</span>
      </div>
    );
  }

  if (previous === 0) {
    return (
      <div className="home-cycle-change is-neutral">
        {current > 0 ? (
          <ArrowUpRight size={16} aria-hidden="true" />
        ) : (
          <Minus size={16} aria-hidden="true" />
        )}
        <strong>{current > 0 ? 'Novo' : '—'}</strong>
        <span>
          {current > 0
            ? 'Sem base percentual anterior'
            : 'Sem atividade nos dois ciclos'}
        </span>
      </div>
    );
  }

  const difference = ((current - previous) / previous) * 100;

  const tone =
    difference > 0
      ? 'is-positive'
      : difference < 0
        ? 'is-negative'
        : 'is-neutral';

  const text =
    Math.abs(difference).toLocaleString('pt-BR', {
      maximumFractionDigits: 1,
    }) + '%';

  return (
    <div className={`home-cycle-change ${tone}`}>
      {difference > 0 ? (
        <ArrowUpRight size={16} aria-hidden="true" />
      ) : difference < 0 ? (
        <ArrowDownRight size={16} aria-hidden="true" />
      ) : (
        <Minus size={16} aria-hidden="true" />
      )}

      <strong>
        {difference > 0 ? '+' : difference < 0 ? '-' : ''}
        {text}
      </strong>

      <span>vs. ciclo anterior</span>
    </div>
  );
}

export function HomePerformance({
  local,
  children,
}: {
  local: HomeOffline;
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<PeriodSelection>(() => ({
    period: 'month',
    now: new Date(),
  }));

  const { period } = selection;

  const cycles = dashboardCycles(period, selection.now);

  const confirmed = local.queue
    .filter((item) => item.state === 'confirmed')
    .map((item) => item.serverId ?? item.id)
    .sort()
    .join(',');

  const stats = useHistoryStats(cycles.currentQuery, confirmed);

  const previousStats = useHistoryStats(cycles.previousQuery, confirmed);

  const progress = useGamification<{
    progress: ProgressData;
  }>('/gamification/me');

  const achievements = useGamification<{
    items: Achievement[];
  }>('/gamification/me/achievements');

  const missions = useGamification<{
    items: Challenge[];
  }>('/gamification/me/challenges');

  const offline = local.connection === 'offline';

  const totals = offline ? null : (stats.data?.totals ?? null);

  const previousTotals =
    offline || period === 'total' ? null : (previousStats.data?.totals ?? null);

  const data = offline ? null : (progress.data?.progress ?? null);

  const activeMissions = offline
    ? null
    : (missions.data?.items.filter((item) => item.status === 'active').length ??
      null);

  const unlockedAchievements = offline
    ? null
    : (achievements.data?.items.filter((item) => item.status === 'unlocked') ??
      null);

  const unlocked = unlockedAchievements?.length ?? null;

  const previousUnlocked =
    period !== 'total' &&
    cycles.currentStart &&
    unlockedAchievements &&
    unlockedAchievements.every(
      (item) =>
        item.unlocked_at !== null &&
        Number.isFinite(Date.parse(item.unlocked_at)),
    )
      ? unlockedAchievements.filter(
          (item) =>
            Date.parse(item.unlocked_at!) < cycles.currentStart!.getTime(),
        ).length
      : null;

  const pending = local.queue.filter(
    (item) => item.state !== 'confirmed',
  ).length;

  const comparisonUnavailable = offline
    ? 'Sem conexão'
    : stats.error || previousStats.error
      ? 'Comparação indisponível'
      : undefined;

  return (
    <>
      <Card className="home-performance" aria-label="Meu desempenho">
        <div className="home-section-title">
          <h2>Meu desempenho</h2>

          <label className="home-period">
            <span className="sr-only">Período do desempenho</span>

            <Select
              value={period}
              onChange={(event) =>
                setSelection({
                  period: event.target.value as Period,
                  now: new Date(),
                })
              }
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
          aria-busy={
            !offline &&
            (!stats.data ||
              (period !== 'total' &&
                !previousStats.data &&
                !previousStats.error))
          }
        >
          <div className="home-performance-item">
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

            <CycleChange
              current={totals?.distance_meters ?? null}
              previous={previousTotals?.distance_meters ?? null}
              period={period}
              unavailable={comparisonUnavailable}
            />
          </div>

          <div className="home-performance-item">
            <StatCard
              icon={<Clock3 />}
              value={totals ? formatDuration(totals.active_ms) : '—'}
              label="Tempo de pilotagem"
            />

            <CycleChange
              current={totals?.active_ms ?? null}
              previous={previousTotals?.active_ms ?? null}
              period={period}
              unavailable={comparisonUnavailable}
            />
          </div>

          <Link
            className="home-performance-item home-performance-item-link"
            to="/perfil/conquistas#missoes"
          >
            <StatCard
              icon={<Trophy />}
              value={activeMissions ?? '—'}
              label="Missões ativas"
            />

            <CycleChange
              current={null}
              previous={null}
              period={period}
              unavailable={offline ? 'Sem conexão' : 'Sem histórico por ciclo'}
            />
          </Link>

          <Link
            className="home-performance-item home-performance-item-link"
            to="/perfil/conquistas"
          >
            <StatCard
              icon={<Award />}
              value={unlocked ?? '—'}
              label="Conquistas · total"
            />

            <CycleChange
              current={unlocked}
              previous={previousUnlocked}
              period={period}
              unavailable={
                offline
                  ? 'Sem conexão'
                  : achievements.error
                    ? 'Conquistas indisponíveis'
                    : undefined
              }
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
              <Button
                variant="ghost"
                onClick={() => {
                  stats.reload();
                  previousStats.reload();
                }}
              >
                Tentar novamente
              </Button>
            </p>
          ) : !stats.data ? (
            <p>Consultando atividades…</p>
          ) : (
            <p>{totals?.total} sessões no período selecionado.</p>
          )}

          {!offline && period !== 'total' && previousStats.error && (
            <p>
              Não foi possível comparar o ciclo anterior.{' '}
              <Button variant="ghost" onClick={previousStats.reload}>
                Atualizar comparação
              </Button>
            </p>
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
          <span>Jornada do motociclista</span>
        </div>

        <ProgressSummary data={data} />

        <div className="home-evolution-actions">
          <ButtonLink variant="primary" to="/perfil/xp">
            Ver meu progresso
            <ArrowRight size={17} aria-hidden="true" />
          </ButtonLink>

          <ButtonLink variant="secondary" to="/perfil/conquistas">
            <Award size={18} aria-hidden="true" />
            Ver conquistas
          </ButtonLink>
        </div>
      </Card>
    </>
  );
}
