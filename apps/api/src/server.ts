import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

try {
  const config = loadConfig();
  const app = await buildApp({ config });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      app.log.error('Tempo limite de encerramento excedido');
      process.exit(1);
    }, 10_000);
    deadline.unref();
    try {
      await app.close();
      clearTimeout(deadline);
    } catch {
      app.log.error({ event: 'shutdown_failed' }, 'Falha no encerramento');
      process.exitCode = 1;
    }
  }
  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch {
    await app.close();
    throw new Error('Não foi possível iniciar o servidor');
  }
} catch {
  // Não imprimir erros externos ou valores de variáveis para evitar vazamento de segredos.
  console.error(
    'Falha ao iniciar a API. Verifique o .env e a disponibilidade da porta.',
  );
  process.exitCode = 1;
}
