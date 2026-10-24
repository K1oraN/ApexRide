import { ArrowRight, Clock3, Route } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Skeleton,
} from '../components/design-system';
import { LastRide } from '../history/LastRide';
import {
  localHistory,
  syncLabels,
  type Receipt,
} from '../history/local-history';
import { historyService } from '../history/service';
import type { HistoryRide } from '../history/types';
import { formatDuration } from '../ride/format';
import type { HomeOffline } from './useHomeOffline';
import '../styles/home-recent-refinement.css';

export function HomeRecentRides({ local }: { local: HomeOffline }) {
  const { user } = useAuth();

  const [result, setResult] = useState<{
    owner: string;
    rides: HistoryRide[];
    receipts: Receipt[];
    reconciled: boolean;
  } | null>(null);

  const [failure, setFailure] = useState<{
    owner: string;
    message: string;
  } | null>(null);

  const [revision, setRevision] = useState(0);

  const signature = local.sessions
    .filter((row) => row.payload.endedAt)
    .map((row) => row.payload.clientId)
    .sort()
    .join(',');

  const confirmed = local.sessions
    .filter((row) => row.confirmation)
    .map((row) => row.confirmation!.id)
    .sort()
    .join(',');

  useEffect(() => {
    let live = true;

    if (!user || local.connection === 'offline') {
      return;
    }

    const owner = user.id;

    void (async () => {
      const response = await historyService.list(
        new URLSearchParams({ limit: '2' }),
      );

      const receipts: Receipt[] = [];
      let reconciled = true;

      try {
        const ids = signature ? signature.split(',') : [];

        for (let i = 0; i < ids.length; i += 100) {
          receipts.push(
            ...(await historyService.receipts(ids.slice(i, i + 100))).receipts,
          );
        }
      } catch {
        reconciled = false;
      }

      if (live) {
        setResult({
          owner,
          rides: response.rides,
          receipts,
          reconciled,
        });
        setFailure(null);
      }
    })().catch((error: Error) => {
      if (live) {
        setFailure({
          owner,
          message: error.message,
        });
      }
    });

    return () => {
      live = false;
    };
  }, [user, local.connection, signature, revision, confirmed]);

  const current = result?.owner === user?.id ? result : null;

  const error = failure && failure.owner === user?.id ? failure.message : '';

  const offline = local.connection === 'offline';

  const available = !offline && !error && current !== null;

  const remote = available ? current.rides : [];

  const rows = user
    ? localHistory(
        local.sessions,
        local.queue,
        user.id,
        new URLSearchParams(),
        remote,
        available,
        current?.receipts ?? [],
      )
    : [];

  // Recibos desconhecidos não comprovam que uma
  // atividade local está ausente no servidor.
  const localRows = available && !current.reconciled ? [] : rows;

  const recent = [
    ...remote.map((ride) => ({
      time: Date.parse(ride.started_at),
      key: ride.client_id,
      ride,
    })),
    ...localRows.map((row) => ({
      time: row.payload.startedAt,
      key: row.payload.clientId,
      row,
    })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, 2);

  return (
    <section className="home-recent" aria-label="Atividades recentes">
      <div className="home-section-title home-recent-heading">
        <h2>Atividades recentes</h2>

        <ButtonLink
          className="home-recent-all-link"
          variant="outline"
          to="/historico"
          aria-label="Ver todas as atividades"
        >
          Ver todas
          <ArrowRight size={16} aria-hidden="true" />
        </ButtonLink>
      </div>

      {(offline || error) && (
        <p className="home-data-note" role="status">
          {offline
            ? 'Sem conexão. Mostrando somente cópias desta conta no aparelho.'
            : 'Histórico remoto indisponível.'}

          {!offline && (
            <Button
              variant="ghost"
              onClick={() => setRevision((value) => value + 1)}
            >
              Tentar novamente
            </Button>
          )}
        </p>
      )}

      {!offline && !error && !current ? (
        <Skeleton label="Carregando atividades…" lines={2} />
      ) : recent.length ? (
        <div className="home-recent-list">
          {recent.map((item) =>
            'ride' in item && item.ride ? (
              <LastRide key={item.key} ride={item.ride} compact />
            ) : 'row' in item && item.row ? (
              <Link
                className="home-recent-card panel"
                key={item.key}
                to={`/historico/local/${item.key}`}
              >
                <span className="home-recent-icon" aria-hidden>
                  <Route size={26} />
                </span>

                <div>
                  <h3>
                    {item.row.bike.brand} {item.row.bike.model}
                  </h3>

                  <p>
                    {new Date(item.time).toLocaleDateString('pt-BR')} ·{' '}
                    {item.row.payload.mode}
                  </p>

                  <Badge>
                    {item.row.confirmation
                      ? 'Cópia sincronizada no aparelho'
                      : item.row.decision === 'review'
                        ? 'Aguardando revisão'
                        : syncLabels[
                            local.queue.find(
                              (queue) => queue.id === item.row.id,
                            )?.state ?? 'pending'
                          ]}
                  </Badge>

                  <p>
                    {item.row.history
                      ? `${(
                          item.row.history.metrics.distanceMeters / 1000
                        ).toLocaleString('pt-BR', {
                          maximumFractionDigits: 1,
                        })} km · ${formatDuration(
                          item.row.history.metrics.activeMs,
                        )}`
                      : 'Confira o resumo local'}
                  </p>
                </div>
              </Link>
            ) : null,
          )}
        </div>
      ) : !error && !offline ? (
        <Card className="home-inline-empty home-recent-empty">
          <div className="home-recent-empty-main">
            <span className="home-recent-empty-icon" aria-hidden="true">
              <Clock3 size={25} />
            </span>

            <div className="home-recent-empty-copy">
              <h3>Você ainda não registrou um Ride.</h3>

              <p>Suas próximas histórias vão aparecer aqui.</p>
            </div>
          </div>

          <div className="home-recent-empty-actions">
            <ButtonLink variant="primary" to="/ride">
              Preparar primeiro Ride
              <ArrowRight size={17} aria-hidden="true" />
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <p className="home-data-note">
          {offline
            ? 'Nenhuma atividade local disponível.'
            : 'Tente novamente para consultar suas atividades.'}
        </p>
      )}

      {available && !current.reconciled && rows.length > 0 && (
        <p className="home-data-note">
          Há atividades no aparelho aguardando conferência.{' '}
          <Link className="text-link action-link" to="/historico">
            Abrir histórico local
          </Link>
        </p>
      )}
    </section>
  );
}
