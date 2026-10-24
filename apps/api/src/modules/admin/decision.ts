import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
export async function decision(
  c: PoolClient,
  actor: string,
  type: string,
  target: string,
  action: string,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  const key = randomUUID();
  await c.query(
    "INSERT INTO moderation_cases(id,target_type,target_id,priority,status,assigned_to,closed_at) VALUES($1,$2,$3,'normal','resolved',$4,now())",
    [key, type, target, actor],
  );
  await c.query(
    "INSERT INTO moderation_decisions(id,case_id,reviewer_id,action,reason_code,explanation,operation_id,metadata,created_at) VALUES($1,$2,$3,$4,'platform_policy',$5,$6,$7,clock_timestamp())",
    [
      randomUUID(),
      key,
      actor,
      action,
      reason,
      randomUUID(),
      JSON.stringify(metadata),
    ],
  );
  return key;
}
