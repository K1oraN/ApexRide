export type RideMode = 'passeio' | 'pista' | 'misto';
export interface ModeFeatures {
  readonly gps: true;
  readonly map: true;
  readonly assistedSpeed: true;
  readonly pureSpeed: true;
  readonly advanced: boolean;
  readonly passiveEvents: boolean;
  readonly charts: boolean;
  readonly lapPreparation: boolean;
  readonly competitive: false;
}
export const RIDE_MODES: Readonly<Record<RideMode, ModeFeatures>>;
