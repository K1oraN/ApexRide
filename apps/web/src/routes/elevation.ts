import type { Coordinate } from '@apex-ride/ride-core/routes';
import { distanceMeters } from '@apex-ride/ride-core';
export function elevationProfile(
  coordinates: Coordinate[],
  raw: (number | null)[],
) {
  let distance = 0;
  const points = coordinates.map((coordinate, index) => {
    const previous = coordinates[index - 1];
    const delta = previous
      ? distanceMeters(
          { longitude: previous[0], latitude: previous[1] },
          { longitude: coordinate[0], latitude: coordinate[1] },
        )
      : 0;
    distance += delta;
    const value = raw[index];
    return {
      coordinate,
      distance,
      altitude:
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= -500 &&
        value <= 9000 &&
        delta <= 1000
          ? value
          : null,
      delta,
    };
  });
  const filtered = points.map((point, index) => {
    if (point.altitude === null) return point;
    const before = points[index - 1]?.altitude,
      after = points[index + 1]?.altitude;
    const median =
      before != null && after != null
        ? [before, point.altitude, after].sort((a, b) => a - b)[1]!
        : point.altitude;
    return { ...point, altitude: median };
  });
  let ascent = 0,
    descent = 0,
    anchor: number | null = null;
  for (const point of filtered) {
    if (point.altitude === null) {
      anchor = null;
      continue;
    }
    if (anchor !== null) {
      const delta = point.altitude - anchor;
      if (Math.abs(delta) > Math.max(50, point.delta * 0.6)) {
        point.altitude = null;
        anchor = null;
        continue;
      }
      if (Math.abs(delta) >= 3) {
        if (delta > 0) ascent += delta;
        else descent -= delta;
        anchor = point.altitude;
      }
    } else anchor = point.altitude;
  }
  const heights = filtered.flatMap((point) =>
    point.altitude === null ? [] : [point.altitude],
  );
  return {
    version: 'elevation-1' as const,
    points: filtered,
    distance,
    ascent,
    descent,
    min: heights.length ? Math.min(...heights) : null,
    max: heights.length ? Math.max(...heights) : null,
    sufficient: heights.length >= 5,
  };
}
