// Dados fictícios exclusivos dos testes automatizados; nunca usados pelo Ride.
export function testPosition(
  overrides: Partial<GeolocationCoordinates> = {},
  timestamp = Date.now(),
): GeolocationPosition {
  return {
    timestamp,
    coords: {
      latitude: -9.665,
      longitude: -35.735,
      accuracy: 8,
      speed: 10,
      heading: 90,
      altitude: null,
      altitudeAccuracy: null,
      toJSON: () => ({}),
      ...overrides,
    },
    toJSON: () => ({}),
  };
}
