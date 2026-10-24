import { GPS_CONFIG } from './config';

export interface LocationReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  timestamp: number;
}

const optionalNumber = (value: number | null): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function normalizePosition(
  position: GeolocationPosition,
): LocationReading {
  const c = position.coords;
  const speed = optionalNumber(c.speed);
  const heading = optionalNumber(c.heading);
  const altitudeAccuracy = optionalNumber(c.altitudeAccuracy);
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracy: c.accuracy,
    speed: speed !== null && speed >= 0 ? speed : null,
    heading: heading !== null && heading >= 0 && heading < 360 ? heading : null,
    altitude: optionalNumber(c.altitude),
    altitudeAccuracy:
      altitudeAccuracy !== null && altitudeAccuracy >= 0
        ? altitudeAccuracy
        : null,
    timestamp: position.timestamp,
  };
}

export function speedKmh(speed: number | null): number | null {
  return speed !== null && Number.isFinite(speed) && speed >= 0
    ? speed * 3.6
    : null;
}

export function distanceMeters(a: LocationReading, b: LocationReading): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat = radians(b.latitude - a.latitude);
  const lng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(lng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export type ReadingValidation =
  | 'good'
  | 'reduced'
  | 'invalid'
  | 'stale'
  | 'duplicate'
  | 'out-of-order'
  | 'jump';

export function validateReading(
  reading: LocationReading,
  previous: LocationReading | null,
  now: number,
): ReadingValidation {
  if (
    !Number.isFinite(reading.latitude) ||
    Math.abs(reading.latitude) > 90 ||
    !Number.isFinite(reading.longitude) ||
    Math.abs(reading.longitude) > 180 ||
    !Number.isFinite(reading.accuracy) ||
    reading.accuracy < 0 ||
    !Number.isFinite(reading.timestamp) ||
    reading.timestamp <= 0 ||
    reading.timestamp > now + GPS_CONFIG.futureToleranceMs
  )
    return 'invalid';
  if (now - reading.timestamp >= GPS_CONFIG.staleAfterMs) return 'stale';
  if (previous) {
    if (reading.timestamp === previous.timestamp) return 'duplicate';
    if (reading.timestamp < previous.timestamp) return 'out-of-order';
    const seconds = (reading.timestamp - previous.timestamp) / 1_000;
    // Subtrair as incertezas evita rejeitar ruído normal de posicionamento.
    if (
      distanceMeters(previous, reading) - previous.accuracy - reading.accuracy >
      seconds * GPS_CONFIG.maxTravelMetersPerSecond
    )
      return 'jump';
  }
  return reading.accuracy <= GPS_CONFIG.goodAccuracyMeters ? 'good' : 'reduced';
}
