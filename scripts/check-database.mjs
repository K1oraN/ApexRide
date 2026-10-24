const baseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

try {
  const response = await fetch(`${baseUrl}/api/health/db`, {
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 'ok' || result.postgis !== 'enabled') {
    throw new Error('unavailable');
  }
  console.log('PostgreSQL acessível e PostGIS habilitado através da API.');
} catch {
  console.error('Não foi possível validar PostgreSQL/PostGIS através da API.');
  process.exitCode = 1;
}
