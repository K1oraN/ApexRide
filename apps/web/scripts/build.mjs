// O .env compartilhado define NODE_ENV para a API local. O bundle web deve
// sempre usar o runtime React de produção, independentemente desse valor.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
const { writeServiceWorker } = await import('./service-worker.mjs');
await writeServiceWorker();
