import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config/env.js';
import { createPool } from './database.js';
import { verifyPassword } from './modules/auth/security.js';
import { transaction } from './modules/groups/store.js';
import { audit } from './modules/admin/policy.js';
import { id } from './modules/admin/validation.js';
// Local trusted operator only. Password is read hidden from the TTY, never arguments/env/logs.
async function hidden(prompt: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Terminal interativo obrigatório.');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const listener = (data: Buffer) => {
      for (const ch of data.toString()) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', listener);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdin.off('data', listener);
          stdin.setRawMode(false);
          stdin.pause();
          reject(new Error('Cancelado.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', listener);
  });
}
const config = loadConfig(),
  pool = createPool(config);
try {
  const command = process.argv[2];
  if (command !== 'bootstrap')
    throw new Error(
      'Uso: admin:bootstrap bootstrap <UUID da conta verificada>',
    );
  const user = id(process.argv[3]);
  if (!config.adminMfaKey)
    throw new Error('Configure ADMIN_MFA_KEY antes do provisionamento.');
  const password = await hidden('Senha atual da conta (entrada oculta): ');
  const m = (
    await pool.query(
      'SELECT * FROM admin_mfa WHERE user_id=$1 AND confirmed_at IS NOT NULL',
      [user],
    )
  ).rows[0];
  const u = (
    await pool.query(
      "SELECT password_hash FROM users WHERE id=$1 AND account_status='active' AND email_verified_at IS NOT NULL",
      [user],
    )
  ).rows[0];
  if (!u || !(await verifyPassword(password, u.password_hash)))
    throw new Error('Identidade não confirmada.');
  // Bootstrap is deliberately pending until the holder confirms TOTP on /admin.
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    'Confirme PROVISIONAR para iniciar acesso pendente de MFA: ',
  );
  rl.close();
  if (answer !== 'PROVISIONAR') throw new Error('Cancelado.');
  await transaction(pool, [user], async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(220001)');
    if (
      (await c.query('SELECT 1 FROM admin_bootstrap')).rowCount ||
      (await c.query('SELECT 1 FROM admin_user_roles')).rowCount
    )
      throw new Error('Bootstrap já executado; utilize gestão de operadores.');
    await c.query('INSERT INTO admin_bootstrap(user_id) VALUES($1)', [user]);
    await c.query(
      "INSERT INTO admin_user_roles(id,user_id,role_code,granted_by) VALUES($1,$2,'superadmin',$2)",
      [randomUUID(), user],
    );
    await audit(
      c,
      user,
      'bootstrap_pending_mfa',
      'operator',
      user,
      'admin.roles.manage',
      randomUUID(),
    );
  });
  stdout.write(
    m
      ? 'Provisionado. Reautentique com MFA em /admin.\n'
      : 'Provisionamento pendente. Cadastre e confirme MFA em /admin; nenhuma API operacional abre antes disso.\n',
  );
} catch {
  process.stderr.write(
    'Provisionamento recusado. Confira identidade, configuração e se o bootstrap já foi executado.\n',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
