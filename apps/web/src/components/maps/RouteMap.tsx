import type { Coordinate, Line } from '@apex-ride/ride-core/routes';
import { LocateFixed, Map as MapIcon, Minus, Plus } from 'lucide-react';
import {
  AttributionControl,
  Map,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import '../../styles/gps.css';
import { Button, Select } from '../design-system';
import { MAP_CONFIG } from './mapConfig';
setWorkerUrl(workerUrl);
interface Shape {
  id: string;
  geometry: Line;
  name?: string;
  color?: string;
  width?: number;
}
export interface MapPoint {
  id: string;
  coordinate: Coordinate;
  label: string;
  color?: string;
  radiusMeters?: number;
  stale?: boolean;
}
export function RouteMap({
  routes,
  selected,
  onSelect,
  onPoint,
  waypoints = [],
  gateLine = null,
  onBounds,
  caption = 'EXPLORE O BRASIL',
  description = 'Explore percursos cadastrados.',
  points = [],
  centerPoint,
  follow = false,
}: {
  routes: Shape[];
  selected?: string | undefined;
  onSelect?: (id: string) => void;
  onPoint?: ((p: Coordinate) => void) | undefined;
  waypoints?: Coordinate[];
  gateLine?: Line | null;
  onBounds?: (bounds: string) => void;
  caption?: string;
  description?: string | undefined;
  points?: MapPoint[];
  centerPoint?: Coordinate | undefined;
  follow?: boolean;
}) {
  const canvas = useRef<HTMLDivElement>(null),
    map = useRef<Map | null>(null),
    markers = useRef<Marker[]>([]);
  const callbacks = useRef({ onSelect, onPoint, onBounds });
  const view = useRef({ routes, selected });
  useEffect(() => {
    view.current = { routes, selected };
  }, [routes, selected]);
  const centered = useRef('');
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    callbacks.current = { onSelect, onPoint, onBounds };
  }, [onSelect, onPoint, onBounds]);
  useEffect(() => {
    let instance: Map;
    try {
      instance = new Map({
        container: canvas.current!,
        style: MAP_CONFIG.styleUrl,
        center: [-47, -14],
        zoom: 3.5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxTileCacheSize: 100,
        refreshExpiredTiles: false,
      });
    } catch {
      const timer = setTimeout(() => setError(true), 0);
      return () => clearTimeout(timer);
    }
    map.current = instance;
    instance.addControl(
      new AttributionControl({ compact: false }),
      'bottom-left',
    );
    const timer = setTimeout(() => setError(true), 15000);
    const sizeObserver = new ResizeObserver(() => {
      instance.resize();
      const route = view.current.routes.find(
        (r) => r.id === view.current.selected,
      );
      if (route) {
        const xs = route.geometry.coordinates.map((p) => p[0]),
          ys = route.geometry.coordinates.map((p) => p[1]);
        instance.fitBounds(
          [
            [Math.min(...xs), Math.min(...ys)],
            [Math.max(...xs), Math.max(...ys)],
          ],
          { padding: 45, maxZoom: 16, duration: 0 },
        );
      }
    });
    sizeObserver.observe(canvas.current!);
    instance.on('load', () => {
      instance.resize();
      clearTimeout(timer);
      setError(false);
      instance.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      instance.addLayer({
        id: 'routes',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'id'], selected ?? routes[0]?.id ?? ''],
            '#ff202b',
            '#f2a65a',
          ],
          'line-width': ['coalesce', ['get', 'width'], 4],
        },
      });
      instance.addSource('event-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      instance.addLayer({
        id: 'event-points',
        type: 'circle',
        source: 'event-points',
        paint: {
          'circle-radius': [
            'interpolate',
            ['exponential', 2],
            ['zoom'],
            0,
            ['max', 8, ['/', ['get', 'radius'], 156543.03]],
            20,
            ['max', 8, ['*', ['/', ['get', 'radius'], 156543.03], 1048576]],
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['get', 'stale'], 0.18, 0.3],
          'circle-stroke-width': 2,
          'circle-stroke-color': ['get', 'color'],
        },
      });
      const fontLayer = instance
        .getStyle()
        .layers.find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-font'],
        );
      const font =
        fontLayer?.type === 'symbol'
          ? fontLayer.layout?.['text-font']
          : undefined;
      if (instance.getStyle().glyphs)
        instance.addLayer({
          id: 'event-labels',
          type: 'symbol',
          source: 'event-points',
          layout: {
            'text-font': font ?? ['Noto Sans Regular'],
            'text-field': ['get', 'label'],
            'text-size': 12,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#fff',
            'text-halo-color': '#080a0d',
            'text-halo-width': 2,
          },
        });
      setReady(true);
    });
    instance.on('error', () => setError(true));
    instance.on('idle', () => {
      if (instance.isStyleLoaded()) setError(false);
    });
    instance.on('click', (e) => {
      if (callbacks.current.onPoint) {
        callbacks.current.onPoint([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      if (!instance.getLayer('routes')) return;
      const hit = instance.queryRenderedFeatures(e.point, {
        layers: ['routes'],
      })[0];
      if (hit?.properties?.id)
        callbacks.current.onSelect?.(String(hit.properties.id));
    });
    return () => {
      sizeObserver.disconnect();
      clearTimeout(timer);
      markers.current.forEach((m) => m.remove());
      instance.remove();
      map.current = null;
    };
    // The map lives until unmount or an explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current?.getSource('routes')) return;
    void (map.current.getSource('routes') as GeoJSONSource)
      .setData({
        type: 'FeatureCollection',
        features: routes.map((r) => ({
          type: 'Feature',
          properties: { id: r.id, color: r.color, width: r.width },
          geometry: r.geometry,
        })),
      })
      .catch(() => setError(true));
    map.current.setPaintProperty('routes', 'line-color', [
      'coalesce',
      ['get', 'color'],
      [
        'case',
        ['==', ['get', 'id'], selected ?? routes[0]?.id ?? ''],
        '#ff202b',
        '#f2a65a',
      ],
    ]);
  }, [routes, selected, ready]);
  useEffect(() => {
    if (!ready || !map.current?.getSource('event-points')) return;
    void (map.current.getSource('event-points') as GeoJSONSource)
      .setData({
        type: 'FeatureCollection',
        features: points.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.coordinate },
          properties: {
            label: p.label,
            color: p.color ?? '#ff202b',
            radius:
              (p.radiusMeters ?? 0) /
              Math.cos((p.coordinate[1] * Math.PI) / 180),
            stale: p.stale ?? false,
          },
        })),
      })
      .catch(() => setError(true));
  }, [points, ready]);
  useEffect(() => {
    if (ready && centerPoint)
      map.current?.jumpTo({
        center: centerPoint,
        ...(follow ? { zoom: 16 } : { zoom: 12 }),
      });
  }, [centerPoint, follow, ready]);
  useEffect(() => {
    if (
      ready &&
      !routes.length &&
      points[0] &&
      centered.current !== `${attempt}:points`
    ) {
      centered.current = `${attempt}:points`;
      map.current?.jumpTo({ center: points[0].coordinate, zoom: 12 });
    }
  }, [points, ready, routes.length, attempt]);
  useEffect(() => {
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!ready || !map.current) return;
    for (const [i, p] of waypoints.entries()) {
      const el = document.createElement('div');
      el.className = 'gps-endpoint';
      el.textContent =
        i === 0 ? 'I' : i === waypoints.length - 1 ? 'F' : String(i);
      markers.current.push(
        new Marker({ element: el }).setLngLat(p).addTo(map.current),
      );
    }
    for (const [i, p] of (gateLine?.coordinates ?? []).entries()) {
      const el = document.createElement('div');
      el.className = 'gps-endpoint';
      el.textContent = i === 0 ? 'A' : 'B';
      el.setAttribute('aria-label', `Linha de largada · ${el.textContent}`);
      markers.current.push(
        new Marker({ element: el }).setLngLat(p).addTo(map.current),
      );
    }
  }, [waypoints, gateLine, ready]);
  function center() {
    const r = routes.find((r) => r.id === selected) ?? routes[0];
    if (!r) {
      map.current?.jumpTo({
        center: points[0]?.coordinate ?? [-47, -14],
        zoom: points.length ? 12 : 3.5,
      });
      return;
    }
    const xs = r.geometry.coordinates.map((p) => p[0]),
      ys = r.geometry.coordinates.map((p) => p[1]);
    map.current?.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 45, maxZoom: 16, duration: 0 },
    );
  }
  useEffect(() => {
    if (ready && selected && centered.current !== `${attempt}:${selected}`) {
      const r = routes.find((r) => r.id === selected);
      if (r) {
        centered.current = `${attempt}:${selected}`;
        const xs = r.geometry.coordinates.map((p) => p[0]),
          ys = r.geometry.coordinates.map((p) => p[1]);
        map.current?.fitBounds(
          [
            [Math.min(...xs), Math.min(...ys)],
            [Math.max(...xs), Math.max(...ys)],
          ],
          { padding: 45, maxZoom: 16, duration: 0 },
        );
      }
    }
  }, [selected, ready, routes, attempt]);
  useEffect(() => {
    if (!ready || selected || centerPoint || !routes.length) return;
    const key = `${attempt}:results:${routes.map((route) => route.id).join(',')}`;
    if (centered.current === key) return;
    centered.current = key;
    const coordinates = routes.flatMap((route) => route.geometry.coordinates);
    if (!coordinates.length) return;
    const bounds = coordinates.reduce(
      (box, point) => {
        box[0] = Math.min(box[0]!, point[0]);
        box[1] = Math.min(box[1]!, point[1]);
        box[2] = Math.max(box[2]!, point[0]);
        box[3] = Math.max(box[3]!, point[1]);
        return box;
      },
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    map.current?.fitBounds(
      [
        [bounds[0]!, bounds[1]!],
        [bounds[2]!, bounds[3]!],
      ],
      { padding: 45, maxZoom: 14, duration: 0 },
    );
  }, [routes, ready, selected, centerPoint, attempt]);
  return (
    <div
      className="illustrative-map map-explore gps-map"
      role="region"
      aria-label="Mapa de percursos cadastrados"
    >
      <div ref={canvas} className="gps-map-canvas" />
      <div className="map-caption">
        <MapIcon size={28} />
        <div>
          <strong>{caption}</strong>
          <p>
            {onPoint ? 'Toque no mapa para adicionar um ponto.' : description}
          </p>
        </div>
      </div>
      <div className="map-controls">
        <button
          className="icon-button"
          aria-label="Centralizar percurso"
          onClick={center}
        >
          <LocateFixed />
        </button>
        <button
          className="icon-button"
          aria-label="Ampliar mapa"
          disabled={!ready}
          onClick={() => map.current?.zoomIn()}
        >
          <Plus />
        </button>
        <button
          className="icon-button"
          aria-label="Reduzir mapa"
          disabled={!ready}
          onClick={() => map.current?.zoomOut()}
        >
          <Minus />
        </button>
      </div>
      <label className="map-style">
        <span className="sr-only">Estilo do mapa</span>
        <Select aria-label="Estilo do mapa" disabled value="dark">
          <option value="dark">Mapa escuro</option>
        </Select>
      </label>
      {onBounds && (
        <Button
          variant="secondary"
          className="route-map-search"
          onClick={() => {
            const b = map.current?.getBounds();
            if (b)
              onBounds(
                [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(
                  ',',
                ),
              );
          }}
        >
          Buscar nesta região
        </Button>
      )}
      {(!ready || error) && (
        <div className="gps-map-notice" role="status">
          {error ? (
            <>
              Mapa indisponível.{' '}
              <button
                className="text-link"
                onClick={() => {
                  setReady(false);
                  setError(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Tentar novamente
              </button>
            </>
          ) : (
            'Carregando mapa…'
          )}
        </div>
      )}
    </div>
  );
}
