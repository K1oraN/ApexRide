import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { AuthError } from '../auth/validation.js';
import { motorcycleId } from './validation.js';

type MotorcycleRow = {
  id: string;
  photo_ref: string | null;
  is_primary: boolean;
};
/**
 * Exclusão efetiva (não arquiva) somente quando não há atividades vinculadas.
 * Mantém a integridade histórica: não apaga Rides automaticamente.
 * Uma única transação remove registros privados e versões dos registros.
 */
export function registerPermanentMotorcycleDeletion(
  app: FastifyInstance,
  context: {
    identify: (request: FastifyRequest) => Promise<void>;
    owner: (request: FastifyRequest) => string;
    own: (
      client: Pool | PoolClient,
      bikeId: string,
      userId: string,
      includeArchived?: boolean,
    ) => Promise<MotorcycleRow>;
    transaction: <T>(
      userId: string,
      action: (client: PoolClient) => Promise<T>,
    ) => Promise<T>;
    queue: (client: PoolClient, key: string | null) => Promise<void>;
    clean: () => Promise<void>;
  },
) {
  const { identify, owner, own, transaction, queue, clean } = context;
  app.delete(
    '/motorcycles/:id/permanent',
    { onRequest: identify },
    async (request) => {
      const userId = owner(request);
      const bikeId = motorcycleId((request.params as { id: string }).id);
      await transaction(userId, async (client) => {
        const bike = await own(client, bikeId, userId, true);
        // RESTRICT original de rides.motorcycle_id. Não removemos os históricos.
        const hasRides = await client.query(
          'SELECT id FROM rides WHERE motorcycle_id=$1 LIMIT 1',
          [bikeId],
        );
        if (hasRides.rowCount) {
          throw new AuthError(
            409,
            'Esta moto possui atividades Ride vinculadas. Para preservar o histórico, ela pode ser arquivada, mas não excluída definitivamente enquanto houver atividades.',
          );
        }
        await client.query(
          'DELETE FROM motorcycle_record_revisions WHERE record_id IN (SELECT id FROM motorcycle_records WHERE motorcycle_id=$1)',
          [bikeId],
        );
        await client.query(
          'DELETE FROM motorcycle_records WHERE motorcycle_id=$1',
          [bikeId],
        );
        await client.query(
          'DELETE FROM motorcycle_identity_history WHERE motorcycle_id=$1',
          [bikeId],
        );
        // social_posts.motorcycle_id já tem ON DELETE SET NULL; posts permanecem.
        const removed = await client.query(
          'DELETE FROM motorcycles WHERE id=$1 AND owner_id=$2 RETURNING id',
          [bikeId, userId],
        );
        if (!removed.rowCount) throw new AuthError(404, 'Moto não encontrada.');
        await queue(client, bike.photo_ref);
        if (bike.is_primary) {
          await client.query(
            `UPDATE motorcycles SET is_primary=true,updated_at=now() WHERE id=(SELECT id FROM motorcycles WHERE owner_id=$1 AND archived_at IS NULL ORDER BY created_at,id LIMIT 1)`,
            [userId],
          );
        }
      });
      await clean();
      return { status: 'ok', deleted: true };
    },
  );
}
