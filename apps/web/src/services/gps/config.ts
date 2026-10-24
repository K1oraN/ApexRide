// Critérios conservadores da prévia, em metros e milissegundos. Não há cadência
// garantida: o navegador decide quando chamar watchPosition.
export const GPS_CONFIG = {
  positionOptions: {
    enableHighAccuracy: true,
    maximumAge: 2_000,
    timeout: 12_000,
  } satisfies PositionOptions,
  staleAfterMs: 15_000,
  futureToleranceMs: 5_000,
  goodAccuracyMeters: 50,
  segmentGapMs: 15_000,
  maxTravelMetersPerSecond: 100,
  maxPreviewPoints: 2_000,
  healthIntervalMs: 1_000,
} as const;
