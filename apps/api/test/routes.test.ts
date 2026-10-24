import { describe, it, expect } from 'vitest';
import { listQuery, routeData } from '../src/modules/routes/validation.js';
import { routeFixture } from './route-fixtures.js';
describe('11A consulta espacial limitada', () => {
  it('pagina e limita resultados', () => {
    expect(listQuery({ page: '2', limit: '5' })).toMatchObject({
      page: 2,
      limit: 5,
    });
    expect(() => listQuery({ limit: '51' })).toThrow();
  });
  it('valida região, unidades e proximidade', () => {
    expect(listQuery({ lon: '-35.73', lat: '-9.66' }, true).radius).toBe(25000);
    expect(() => listQuery({}, true)).toThrow();
    expect(() => listQuery({ radius: '100001' })).toThrow();
    expect(() => listQuery({ bbox: '-180,-80,180,80' })).toThrow();
  });
  it('rejeita filtros inesperados', () => {
    expect(() => listQuery({ sort: 'sql' })).toThrow();
    expect(() => listQuery({ kind: 'live' })).toThrow();
  });
});
describe('11B geometria e paradas', () => {
  it('aceita origem e destino', () =>
    expect(routeData(routeFixture()).waypoints).toHaveLength(2));
  it('rejeita geometria vazia e coordenadas inválidas', () => {
    expect(() =>
      routeData({
        ...routeFixture(),
        geometry: { type: 'LineString', coordinates: [] },
      }),
    ).toThrow();
    expect(() =>
      routeData({
        ...routeFixture(),
        waypoints: [
          [200, 0],
          [0, 0],
        ],
      }),
    ).toThrow();
  });
  it('rejeita circuito aberto', () =>
    expect(() => routeData(routeFixture(), true)).toThrow());
});
