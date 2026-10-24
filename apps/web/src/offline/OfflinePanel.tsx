import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { useRide } from '../ride/context';
import { useOffline } from './context';
const connections = {
  online: 'Online',
  offline: 'Offline',
  limited: 'Conexão limitada',
  checking: 'Verificando conexão',
  unavailable: 'Servidor indisponível',
};
const states = {
  pending: 'Aguardando sincronização',
  sending: 'Sincronizando',
  partial: 'Parcialmente enviado',
  auth: 'Entre novamente para sincronizar',
  temporary: 'Erro temporário de sincronização',
  permanent: 'Erro permanente ou conflito',
  confirmed: 'Sincronizado',
};
export function OfflinePanel() {
  const offline = useOffline();
  const { snapshot } = useRide();
  const { user } = useAuth();
  const state = useSyncExternalStore(offline.subscribe, offline.getSnapshot);
  const connection = useSyncExternalStore(
    offline.connectivity.subscribe,
    offline.connectivity.getSnapshot,
  );
  const pending = state.queue.filter((q) => q.state !== 'confirmed');
  const interrupted = state.sessions.filter(
    (row) =>
      row.decision === 'review' &&
      row.payload.clientId !== snapshot.activity?.payload.clientId,
  );
  const current = state.queue.find(
    (q) => q.id === `${user?.id}:${snapshot.activity?.payload.clientId}`,
  );
  return (
    <section
      className="ride-preparation panel offline-panel"
      aria-label="Armazenamento e sincronização"
    >
      <p aria-live="polite">
        {connections[connection]}
        {snapshot.activity
          ? ` · ${current ? states[current.state] : state.local}`
          : ''}
        {connection !== 'online' && snapshot.state === 'running'
          ? ' · Registro local continua; sinal GPS é independente da internet.'
          : ''}
      </p>
      {state.error && (
        <p role="alert">
          {state.error}{' '}
          <button
            className="text-link"
            onClick={() => void offline.flush().catch(() => {})}
          >
            Tentar gravar novamente
          </button>
        </p>
      )}
      {state.storage && (
        <p className="offline-storage">
          {state.storage}{' '}
          <button
            className="text-link"
            onClick={() => void offline.monitor(true)}
          >
            Proteger armazenamento
          </button>
        </p>
      )}
      {interrupted.length > 0 && (
        <p>
          Há {interrupted.length} atividade(s) aguardando revisão neste
          aparelho. Abra Atividades no aparelho para recuperar o resumo.
        </p>
      )}
      {state.queue.some((q) => q.state === 'auth') && (
        <p>
          <Link className="text-link" to="/entrar">
            Entrar novamente para sincronizar
          </Link>
        </p>
      )}
      {user && (
        <details>
          <summary>Atividades no aparelho · {pending.length} pendentes</summary>
          <p>
            Envio somente após salvar e confirmar sua conta no servidor. A cópia
            deste aparelho não é um login offline.
          </p>
          <button
            className="button"
            onClick={() => void offline.sync.run(true).catch(() => {})}
          >
            Sincronizar agora
          </button>
          {connection !== 'online' && (
            <p>Sem acesso confirmado à API. Os dados locais serão mantidos.</p>
          )}
          {state.sessions.length === 0 && (
            <p>Nenhuma atividade local nesta conta.</p>
          )}
          {state.sessions.map((row) => {
            const queued = state.queue.find((q) => q.id === row.id);
            return (
              <article key={row.id} className="offline-item">
                <p>
                  {row.bike.brand} {row.bike.model} ·{' '}
                  {new Date(row.payload.startedAt).toLocaleString('pt-BR')} ·{' '}
                  {row.counts[0]} pontos
                </p>
                <p>
                  {queued
                    ? states[queued.state]
                    : row.payload.endedAt
                      ? 'Finalizada · aguardando decisão'
                      : 'Sessão interrompida ou aberta em outra aba'}
                  {queued?.received.length
                    ? ` · ${queued.received.length} lotes confirmados`
                    : ''}
                </p>
                {queued?.error && <p>{queued.error}</p>}
                <button
                  className="text-link"
                  disabled={Boolean(snapshot.activity)}
                  onClick={() => void offline.recover(row.payload.clientId)}
                >
                  Revisar resumo local
                </button>
                {queued?.state === 'confirmed' && (
                  <button
                    className="text-link"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remover somente a cópia local já confirmada pelo servidor?',
                        )
                      )
                        void offline.cleanup(row.payload.clientId);
                    }}
                  >
                    Limpar cópia sincronizada
                  </button>
                )}
              </article>
            );
          })}
        </details>
      )}
    </section>
  );
}
