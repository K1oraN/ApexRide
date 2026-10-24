import type { Pool } from 'pg';
import { transaction } from '../groups/store.js';
import { reconcileUser } from './engine.js';
// Serviço interno. A Parte 22 deverá impor RBAC antes de invocar esta função.
// Nenhuma rota HTTP recebe este comando ou um valor arbitrário de XP.
export async function decideRide(
  pool: Pool,
  ride: string,
  eligible: boolean,
  actor: string,
  reason: string,
) {
  if (!actor.trim() || !reason.trim())
    throw new Error('Responsável e motivo são obrigatórios.');
  const owner = (
    await pool.query('SELECT owner_id FROM rides WHERE id=$1', [ride])
  ).rows[0]?.owner_id as string | undefined;
  if (!owner) throw new Error('Atividade inexistente.');
  return transaction(pool, [owner], async (c) => {
    await c.query(
      `INSERT INTO gamification_ride_decisions(ride_id,eligible,actor,reason) VALUES($1,$2,$3,$4) ON CONFLICT(ride_id) DO UPDATE SET eligible=$2,actor=$3,reason=$4,created_at=now()`,
      [ride, eligible, actor, reason],
    );
    await c.query(
      `INSERT INTO gamification_audit(user_id,actor,action,source_id,reason) VALUES($1,$2,$3,$4,$5)`,
      [
        owner,
        actor,
        eligible ? 'ride_validated' : 'ride_invalidated',
        ride,
        reason,
      ],
    );
    await c.query(
      "UPDATE gamification_ride_facts SET evaluated_at='epoch' WHERE ride_id=$1",
      [ride],
    );
    await c.query(
      'INSERT INTO gamification_jobs(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET available_at=now()',
      [owner],
    );
    await c.query(
      "UPDATE gamification_reviews SET status='resolved',actor=$2,resolved_at=now() WHERE user_id=$1 AND source_id=$3 AND status='pending'",
      [owner, actor, ride],
    );
    return reconcileUser(c, owner, 100, actor);
  });
}
