export const MAP_CONFIG = {
  styleUrl:
    import.meta.env.VITE_MAP_STYLE_URL?.trim() ||
    'https://tiles.openfreemap.org/styles/dark',
  initialCenter: [-35.735, -9.665] as [number, number],
  initialZoom: 10,
  followZoom: 16,
  loadTimeoutMs: 20_000,
};
