import type { FeatureCollection, MultiLineString, Polygon } from 'geojson';
import type { LocationReading } from '../../services/gps/readings';
import type { PreviewSegments } from '../../services/gps/track';

export function routeGeometry(
  segments: PreviewSegments,
): FeatureCollection<MultiLineString> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiLineString',
          coordinates: segments
            .filter((s) => s.length >= 2)
            .map((segment) => segment.map((p) => [p.longitude, p.latitude])),
        },
      },
    ],
  };
}

export function accuracyGeometry(
  reading: LocationReading | null,
): FeatureCollection<Polygon> {
  if (!reading || reading.accuracy > 10_000)
    return { type: 'FeatureCollection', features: [] };
  const lat = (reading.latitude * Math.PI) / 180;
  const lng = (reading.longitude * Math.PI) / 180;
  const radius = reading.accuracy / 6_371_000;
  const coordinates = Array.from({ length: 49 }, (_, i) => {
    const bearing = (2 * Math.PI * i) / 48;
    const y = Math.asin(
      Math.sin(lat) * Math.cos(radius) +
        Math.cos(lat) * Math.sin(radius) * Math.cos(bearing),
    );
    const x =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(radius) * Math.cos(lat),
        Math.cos(radius) - Math.sin(lat) * Math.sin(y),
      );
    return [(x * 180) / Math.PI, (y * 180) / Math.PI];
  });
  coordinates[48] = coordinates[0]!;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coordinates] },
      },
    ],
  };
}
