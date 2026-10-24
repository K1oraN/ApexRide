import { createPool } from './database.js';
import { loadConfig } from './config/env.js';
import { processJobs } from './modules/gamification/engine.js';
const pool = createPool(loadConfig());
try {
  const args = process.argv.slice(2),
    enqueue = args.includes('--enqueue-all');
  if (args.some((v) => v !== '--enqueue-all'))
    throw new Error(
      'Use apenas --enqueue-all para programar reconciliação completa.',
    );
  if (enqueue)
    await pool.query(
      'INSERT INTO gamification_jobs(user_id) SELECT id FROM users ON CONFLICT(user_id) DO UPDATE SET available_at=now(),revision=gamification_jobs.revision+1',
    );
  let batches = 0,
    processed = 0;
  while (batches++ < 100) {
    const n = await processJobs(pool, 20);
    processed += n;
    if (!n) break;
  }
  const pending = Number(
    (await pool.query('SELECT count(*) AS n FROM gamification_jobs')).rows[0].n,
  );
  console.log(
    JSON.stringify({
      processed,
      pending,
      mode: 'reconciliation',
      note: 'Retome o comando se houver lotes pendentes.',
    }),
  );
} finally {
  await pool.end();
}
