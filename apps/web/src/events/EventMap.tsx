import { RouteMap, type MapPoint } from '../components/maps/RouteMap';
import type { EventMapData, LivePosition } from './types';
import type { LocationReading } from '../services/gps/readings';
export function EventMap({
  data,
  positions = [],
  own = null,
}: {
  data: EventMapData;
  positions?: LivePosition[];
  own?: LocationReading | null;
}) {
  const points: MapPoint[] = [
    {
      id: data.event.id,
      coordinate: data.event.meeting_point.coordinates,
      label: `Encontro · ${data.event.meeting_point_label}`,
    },
  ];
  for (const p of positions)
    points.push({
      id: p.id,
      coordinate: [p.longitude, p.latitude],
      label: `${p.display_name} · ${p.precision_mode === 'approximate' ? 'aproximada' : 'GPS'}${p.freshness === 'stale' ? ' · desatualizada' : ''}`,
      radiusMeters: Math.max(p.accuracy, 10),
      color: '#f2a65a',
      stale: p.freshness === 'stale',
    });
  if (own)
    points.push({
      id: 'me',
      coordinate: [own.longitude, own.latitude],
      label: 'Minha localização · apenas neste aparelho',
      radiusMeters: own.accuracy,
      color: '#59c8ff',
    });
  return (
    <RouteMap
      caption={`${data.event.city} · ${data.event.state}`}
      description="Vermelho: encontro · azul: minha localização · âmbar: participantes autorizados. Círculos representam a precisão, sem prever movimentos."
      routes={
        data.route
          ? [
              {
                id: data.route.plan.id,
                geometry: data.route.plan.geometry,
                name: data.route.plan.name,
              },
            ]
          : []
      }
      selected={data.route?.plan.id}
      points={points}
    />
  );
}
