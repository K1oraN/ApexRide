import {
  AttributionControl,
  Map,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMovementEvent,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GpsSnapshot } from '../../services/gps/preview';
import { MAP_CONFIG } from './mapConfig';
import { accuracyGeometry, routeGeometry } from './previewGeometry';
import type { RoutePlan } from '@apex-ride/ride-core/routes';
import { floorIndex, type ReplayTimeline } from '../../replay/timeline';

setWorkerUrl(workerUrl);
export type MapState = 'loading' | 'ready' | 'error';

/** Mantém uma instância do mapa; só fontes, marcador e câmera mudam por leitura. */
export class RideMapController {
  private replay: ReplayTimeline | null = null;
  private replayDrawn = false;
  private replayTime = 0;
  private replayEdges: {
    time: number;
    start: number;
    a: [number, number];
    b: [number, number];
  }[] = [];
  private replayPassed = -1;
  private replayOverviewMode = true;
  private replayStarted = false;
  private replayPartialAt = -Infinity;
  private reducedMotion = false;
  configureReplay(timeline: ReplayTimeline, reducedMotion = false) {
    this.replay = timeline;
    this.reducedMotion = reducedMotion;
    this.data = {
      overview: true,
      active: false,
      status: 'available',
      message: 'Replay privado',
      speedKmh: null,
      reading: null,
      segments: timeline.groups.map((g) =>
        g.map((s) => ({ ...s.value, altitudeAccuracy: null })),
      ),
    };
    this.updateReplay(0);
  }
  updateReplay(time: number, playing = false, exact = true) {
    if (!this.replay || !this.data) return;
    if (playing && !this.replayStarted) {
      this.replayStarted = true;
      this.replayOverviewMode = false;
    }
    this.replayTime = time;
    if (exact) this.replayPartialAt = -Infinity;
    const frame = this.replay.frame(time);
    this.data = {
      ...this.data,
      overview: this.replayOverviewMode,
      reading: frame.position
        ? { ...frame.position, timestamp: time, altitudeAccuracy: null }
        : null,
    };
    this.draw();
  }
  replayOverview() {
    if (!this.data) return;
    this.replayOverviewMode = true;
    this.data = { ...this.data, overview: true };
    this.recenter();
  }
  replayFollow() {
    if (!this.data) return;
    this.replayOverviewMode = false;
    this.data = { ...this.data, overview: false };
    this.recenter();
  }
  private drawReplayTrack() {
    if (!this.map || !this.replay) return;
    if (!this.replayDrawn) {
      this.replayEdges = this.replay.groups.flatMap((g) =>
        g.slice(1).map((s, i) => ({
          time: s.time,
          start: g[i]!.time,
          a: [g[i]!.value.longitude, g[i]!.value.latitude] as [number, number],
          b: [s.value.longitude, s.value.latitude] as [number, number],
        })),
      );
      this.map.setPaintProperty('gps-route', 'line-color', '#687079');
      this.map.addSource('replay-edges', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: this.replayEdges.map((e, id) => ({
            type: 'Feature',
            id,
            properties: {},
            geometry: { type: 'LineString', coordinates: [e.a, e.b] },
          })),
        },
      });
      this.map.addLayer({
        id: 'replay-edges',
        type: 'line',
        source: 'replay-edges',
        paint: {
          'line-color': '#ff202b',
          'line-width': 4,
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'passed'], false],
            1,
            0,
          ],
        },
      });
      this.map.addSource('replay-partial', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer({
        id: 'replay-partial',
        type: 'line',
        source: 'replay-partial',
        paint: { 'line-color': '#ff202b', 'line-width': 4 },
      });
      void (this.map.getSource('gps-route') as GeoJSONSource)
        .setData(routeGeometry(this.data!.segments))
        .catch(this.failed);
      this.replayDrawn = true;
    }
    const passed = floorIndex(this.replayEdges, this.replayTime);
    for (
      let i = Math.min(passed, this.replayPassed) + 1;
      i <= Math.max(passed, this.replayPassed);
      i++
    )
      this.map.setFeatureState(
        { source: 'replay-edges', id: i },
        { passed: i <= passed },
      );
    this.replayPassed = passed;
    // Only a two-coordinate visual fragment changes; the full path stays static.
    if (
      Math.abs(this.replayTime - this.replayPartialAt) >= 100 ||
      this.replayTime === 0
    ) {
      this.replayPartialAt = this.replayTime;
      const edge = this.replayEdges[passed + 1],
        p = this.data!.reading;
      void (this.map.getSource('replay-partial') as GeoJSONSource)
        .setData({
          type: 'FeatureCollection',
          features:
            edge && p && this.replayTime >= edge.start
              ? [
                  {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: [edge.a, [p.longitude, p.latitude]],
                    },
                  },
                ]
              : [],
        })
        .catch(this.failed);
    }
  }
  private plan: RoutePlan | null = null;
  private plannedMarkers: Marker[] = [];
  setPlan(plan: RoutePlan | null) {
    this.plan = plan;
    this.drawPlan();
  }
  private drawPlan() {
    if (!this.map || !this.ready) return;
    const source = this.map.getSource('planned-route') as
      GeoJSONSource | undefined;
    if (!source) return;
    void source
      .setData({
        type: 'FeatureCollection',
        features: this.plan
          ? [{ type: 'Feature', properties: {}, geometry: this.plan.geometry }]
          : [],
      })
      .catch(this.failed);
    this.plannedMarkers.forEach((m) => m.remove());
    this.plannedMarkers = [];
    if (this.plan) {
      const coords = this.plan.geometry.coordinates;
      const stops = this.plan.waypoints?.length
        ? this.plan.waypoints
        : [coords[0]!, coords.at(-1)!];
      for (const [i, p] of stops.entries()) {
        const label = i === 0 ? 'I' : i === stops.length - 1 ? 'F' : String(i);
        const el = document.createElement('div');
        el.className = 'gps-endpoint';
        el.textContent = label;
        this.plannedMarkers.push(
          new Marker({ element: el }).setLngLat(p).addTo(this.map),
        );
      }
    }
  }
  private map: Map | null = null;
  private marker: Marker | null = null;
  private endpoints: Marker[] = [];
  private overviewDrawn = false;
  private data: GpsSnapshot | null = null;
  private ready = false;
  private following = true;
  private centered = false;
  private disposed = false;
  private lastCameraTimestamp: number | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    container: HTMLElement,
    private readonly onState: (state: MapState) => void,
    private readonly onFollowing: (following: boolean) => void,
  ) {
    try {
      this.map = new Map({
        container,
        style: MAP_CONFIG.styleUrl,
        center: MAP_CONFIG.initialCenter,
        zoom: MAP_CONFIG.initialZoom,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        maxTileCacheSize: 100,
        refreshExpiredTiles: false,
      });
      this.map.addControl(
        new AttributionControl({ compact: false }),
        'bottom-left',
      );
      this.map.on('load', this.loaded);
      this.map.on('movestart', this.manualMove);
      this.map.on('error', this.failed);
      this.map.on('idle', this.recovered);
      this.map.on('webglcontextlost', this.failed);
      this.timeout = setTimeout(this.failed, MAP_CONFIG.loadTimeoutMs);
    } catch {
      this.failed();
    }
  }

  private failed = () => {
    if (!this.disposed) this.onState('error');
  };
  private recovered = () => {
    if (!this.disposed && this.ready && this.map?.areTilesLoaded())
      this.onState('ready');
  };
  private manualMove = (event: MapMovementEvent) => {
    if (!event.originalEvent) return;
    this.following = false;
    this.onFollowing(false);
  };
  private loaded = () => {
    if (this.disposed || !this.map) return;
    if (this.timeout !== null) clearTimeout(this.timeout);
    try {
      this.map.addSource('gps-route', {
        type: 'geojson',
        data: routeGeometry([]),
      });
      this.map.addSource('planned-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer({
        id: 'planned-route',
        type: 'line',
        source: 'planned-route',
        paint: {
          'line-color': '#f2a65a',
          'line-width': 5,
          'line-dasharray': [2, 1],
        },
      });
      this.map.addSource('gps-accuracy', {
        type: 'geojson',
        data: accuracyGeometry(null),
      });
      this.map.addLayer({
        id: 'gps-accuracy',
        type: 'fill',
        source: 'gps-accuracy',
        paint: {
          'fill-color': '#ff202b',
          'fill-opacity': 0.12,
          'fill-outline-color': '#ff777c',
        },
      });
      this.map.addLayer({
        id: 'gps-route',
        type: 'line',
        source: 'gps-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff202b', 'line-width': 4 },
      });
      this.ready = true;
      this.drawPlan();
      this.onState('ready');
      this.draw();
    } catch {
      this.failed();
    }
  };

  update(data: GpsSnapshot) {
    this.data = data;
    if (!data.active && !data.reading) {
      this.centered = false;
      this.lastCameraTimestamp = null;
    }
    this.draw();
  }

  private draw() {
    if (!this.ready || !this.map || !this.data || this.disposed) return;
    try {
      const { reading, segments, status } = this.data;
      if (this.data.overview && !this.overviewDrawn && segments.length) {
        const points = segments.flat();
        const first = points[0]!;
        const last = points.at(-1)!;
        for (const [point, label] of [
          [first, 'I'],
          [last, 'F'],
        ] as const) {
          const element = document.createElement('div');
          element.className = 'gps-endpoint';
          element.textContent = label;
          element.setAttribute(
            'aria-label',
            label === 'I' ? 'Início do percurso' : 'Fim do percurso',
          );
          this.endpoints.push(
            new Marker({ element })
              .setLngLat([point.longitude, point.latitude])
              .addTo(this.map),
          );
        }
        const lons = points.map((p) => p.longitude),
          lats = points.map((p) => p.latitude);
        this.map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 45, maxZoom: 16, duration: 0 },
        );
        this.overviewDrawn = true;
      }
      if (this.replay) this.drawReplayTrack();
      else {
        void (this.map.getSource('gps-route') as GeoJSONSource)
          .setData(routeGeometry(segments))
          .catch(this.failed);
        void (this.map.getSource('gps-accuracy') as GeoJSONSource)
          .setData(accuracyGeometry(reading))
          .catch(this.failed);
      }
      if (!reading) {
        this.marker?.remove();
        this.marker = null;
        return;
      }
      if (!this.marker) {
        const element = document.createElement('div');
        element.className = 'gps-rider-marker';
        element.setAttribute('role', 'img');
        element.innerHTML = '<span aria-hidden="true">●</span>';
        this.marker = new Marker({ element, rotationAlignment: 'map' })
          .setLngLat([reading.longitude, reading.latitude])
          .addTo(this.map);
      }
      this.marker.setLngLat([reading.longitude, reading.latitude]);
      const fresh = status === 'available' || status === 'reduced';
      const element = this.marker.getElement();
      element.setAttribute(
        'aria-label',
        fresh
          ? 'Posição GPS da motocicleta'
          : 'Última posição GPS; aguardando atualização',
      );
      element.classList.toggle('gps-marker-stale', !fresh);
      const directed =
        status === 'available' &&
        reading.heading !== null &&
        reading.speed !== null &&
        reading.speed >= 1;
      element.firstElementChild!.textContent = directed ? '▲' : '●';
      this.marker.setRotation(directed ? reading.heading! : 0);
      if (
        !this.data.overview &&
        fresh &&
        this.following &&
        this.lastCameraTimestamp !== reading.timestamp &&
        (!this.replay ||
          this.lastCameraTimestamp === null ||
          Math.abs(reading.timestamp - this.lastCameraTimestamp) >= 1000)
      ) {
        this.map.jumpTo({
          center: [reading.longitude, reading.latitude],
          ...(!this.centered ? { zoom: MAP_CONFIG.followZoom } : {}),
        });
        this.centered = true;
        this.lastCameraTimestamp = reading.timestamp;
      }
    } catch {
      this.failed();
    }
  }

  recenter() {
    if (this.data?.overview && this.map && this.data.segments.length) {
      const points = this.data.segments.flat(),
        xs = points.map((p) => p.longitude),
        ys = points.map((p) => p.latitude);
      this.map.fitBounds(
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ],
        { padding: 45, maxZoom: 16, duration: 0 },
      );
      return;
    }
    if (!this.data?.reading || !this.map) return;
    this.following = true;
    this.lastCameraTimestamp = null;
    this.onFollowing(true);
    // Centralizar a última posição continua permitido com aviso de sinal antigo.
    const r = this.data.reading;
    this.map.jumpTo({
      center: [r.longitude, r.latitude],
      zoom: Math.max(this.map.getZoom(), MAP_CONFIG.followZoom),
    });
    this.draw();
  }
  resize() {
    this.map?.resize();
    if (this.data?.overview) this.recenter();
  }
  zoom(delta: number) {
    this.following = false;
    this.onFollowing(false);
    this.map?.zoomTo(
      (this.map?.getZoom() ?? 10) + delta,
      this.reducedMotion ? { duration: 0 } : {},
    );
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.marker?.remove();
    this.endpoints.forEach((marker) => marker.remove());
    this.plannedMarkers.forEach((marker) => marker.remove());
    this.map?.off('load', this.loaded);
    this.map?.off('movestart', this.manualMove);
    this.map?.off('error', this.failed);
    this.map?.off('idle', this.recovered);
    this.map?.off('webglcontextlost', this.failed);
    this.map?.remove();
    this.map = null;
    this.marker = null;
  }
}
