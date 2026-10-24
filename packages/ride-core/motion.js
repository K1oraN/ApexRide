export const MOTION_RULES = Object.freeze({
  gravity: 9.80665,
  sampleMs: 200,
  gapMs: 1500,
  maxSamples: 18000,
  maxGaps: 2000,
});

// As estatísticas usam exatamente a série selecionada, reproduzível no servidor.
// Inclinação dinâmica desabilitada em motion-1 até homologação física.
export function motionStats(samples) {
  const valid = samples.filter(
    (s) => s.quality === 'limited' && s.longitudinal !== null,
  );
  const max = (key) => {
    let result = null;
    for (const s of valid)
      if (s[key] !== null) result = Math.max(result ?? 0, s[key]);
    return result;
  };
  return {
    maxAccelerationG: max('accelerationG'),
    maxBrakingG: max('brakingG'),
    maxLeft: null,
    maxRight: null,
    meanLeft: null,
    meanRight: null,
    validSamples: valid.length,
  };
}
