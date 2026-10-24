const basic = { gps: true, map: true, assistedSpeed: true, pureSpeed: true };
export const RIDE_MODES = Object.freeze({
  passeio: Object.freeze({
    ...basic,
    advanced: false,
    passiveEvents: false,
    charts: false,
    lapPreparation: false,
    competitive: false,
  }),
  pista: Object.freeze({
    ...basic,
    advanced: true,
    passiveEvents: true,
    charts: true,
    lapPreparation: true,
    competitive: false,
  }),
  misto: Object.freeze({
    ...basic,
    advanced: true,
    passiveEvents: true,
    charts: true,
    lapPreparation: false,
    competitive: false,
  }),
});
