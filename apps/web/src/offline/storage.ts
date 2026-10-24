export async function storageStatus(requestPersistence = false) {
  if (!navigator.storage)
    return {
      warning: 'Este navegador não informa quota ou persistência local.',
      persisted: false,
    };
  try {
    const estimate = await navigator.storage.estimate?.();
    const persisted = requestPersistence
      ? await navigator.storage.persist?.()
      : await navigator.storage.persisted?.();
    const nearLimit =
      !!estimate?.quota && (estimate.usage ?? 0) / estimate.quota >= 0.85;
    return {
      persisted: !!persisted,
      warning: nearLimit
        ? 'Armazenamento próximo do limite. Preserve as atividades pendentes e libere espaço.'
        : persisted
          ? null
          : 'Persistência protegida não concedida. O navegador pode remover dados locais; sincronize quando possível.',
    };
  } catch {
    return {
      persisted: false,
      warning: 'Não foi possível consultar o armazenamento local.',
    };
  }
}
export function storageError(error: unknown) {
  return error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'QuotaExceededError'
    ? 'Armazenamento insuficiente. A gravação local falhou; os dados em memória foram preservados. Libere espaço e tente novamente.'
    : `Falha no armazenamento local. ${error instanceof Error ? error.message : 'Tente novamente.'}`;
}
