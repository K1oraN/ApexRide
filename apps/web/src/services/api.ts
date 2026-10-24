export interface ApiHealth {
  status: 'ok';
  service: 'apex-ride-api';
}

export async function getApiHealth(signal: AbortSignal): Promise<ApiHealth> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(
    /\/$/,
    '',
  );
  const response = await fetch(`${baseUrl}/health`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('API indisponível');
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('status' in data) ||
    data.status !== 'ok' ||
    !('service' in data) ||
    data.service !== 'apex-ride-api'
  ) {
    throw new Error('Resposta inválida da API');
  }
  return { status: data.status, service: data.service };
}
