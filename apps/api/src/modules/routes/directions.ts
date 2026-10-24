import {
  lineLength,
  project,
  validCoordinate,
  type Coordinate,
  type Line,
} from '@apex-ride/ride-core/routes';
import { AuthError } from '../auth/validation.js';
import { distanceMeters } from '@apex-ride/ride-core';

export function normalizeManeuvers(
  legs: unknown,
  geometry: Line,
  legCount: number,
) {
  if (!Array.isArray(legs) || legs.length !== legCount)
    throw new Error('Invalid legs');
  const maneuvers: {
    type: string;
    modifier: string | null;
    location: Coordinate;
    roadName: string;
    instruction: string;
    geometry: Coordinate[];
    distanceMeters: number;
    durationSeconds: number;
    legIndex: number;
    along: number;
  }[] = [];
  let along = 0,
    vertices = 0;
  let previousEnd: Coordinate | null = null;
  const separation = (a: Coordinate, b: Coordinate) =>
    distanceMeters(
      { longitude: a[0], latitude: a[1] },
      { longitude: b[0], latitude: b[1] },
    );
  const directions: Record<string, string> = {
    left: 'à esquerda',
    right: 'à direita',
    'slight left': 'levemente à esquerda',
    'slight right': 'levemente à direita',
    'sharp left': 'acentuadamente à esquerda',
    'sharp right': 'acentuadamente à direita',
    straight: 'em frente',
    uturn: 'para retornar',
  };
  for (const [legIndex, leg] of legs.entries()) {
    if (!leg || !Array.isArray(leg.steps) || !leg.steps.length)
      throw new Error('Invalid steps');
    for (const step of leg.steps) {
      const m = step?.maneuver;
      if (
        !m ||
        typeof m.type !== 'string' ||
        m.type.length > 40 ||
        !validCoordinate(m.location) ||
        !Array.isArray(step.geometry?.coordinates) ||
        !step.geometry.coordinates.length ||
        !step.geometry.coordinates.every(validCoordinate) ||
        !Number.isFinite(step.distance) ||
        step.distance < 0 ||
        step.distance > 5_000_000 ||
        !Number.isFinite(step.duration) ||
        step.duration < 0 ||
        step.duration > 604800 ||
        project(geometry, m.location).distance > 150
      )
        throw new Error('Invalid maneuver');
      vertices += step.geometry.coordinates.length;
      const first = step.geometry.coordinates[0] as Coordinate,
        last = step.geometry.coordinates.at(-1) as Coordinate;
      if (
        separation(first, m.location) > 40 ||
        (previousEnd && separation(previousEnd, first) > 80)
      )
        throw new Error('Discontinuous steps');
      previousEnd = last;
      if (vertices > 30000 || maneuvers.length >= 1000)
        throw new Error('Too many steps');
      const modifier =
        typeof m.modifier === 'string' && m.modifier.length < 40
          ? m.modifier
          : null;
      const roadName =
        typeof step.name === 'string' ? step.name.slice(0, 160) : '';
      const turn = directions[modifier ?? ''];
      const instruction =
        m.type === 'arrive'
          ? 'Chegue ao ponto de parada'
          : m.type === 'depart'
            ? 'Siga pela via indicada'
            : ['roundabout', 'rotary', 'roundabout turn'].includes(m.type)
              ? Number.isInteger(m.exit) && m.exit > 0 && m.exit < 100
                ? `Na rotatória, pegue a saída ${m.exit}`
                : 'Siga pela rotatória conforme a rota'
              : m.type === 'turn' && turn
                ? `Vire ${turn}`
                : m.type === 'merge' && turn
                  ? `Entre na via ${turn}`
                  : m.type.includes('ramp') && turn
                    ? `Pegue o acesso ${turn}`
                    : turn
                      ? `Continue ${turn}`
                      : 'Continue pela rota indicada';
      maneuvers.push({
        type: m.type,
        modifier,
        location: m.location,
        roadName,
        instruction:
          instruction +
          (roadName && m.type !== 'arrive' ? ` · ${roadName}` : ''),
        geometry: step.geometry.coordinates,
        distanceMeters: step.distance,
        durationSeconds: step.duration,
        legIndex,
        along,
      });
      if (step.geometry.coordinates.length >= 2)
        along += lineLength({
          type: 'LineString',
          coordinates: step.geometry.coordinates,
        });
    }
  }
  if (maneuvers.at(-1)?.type !== 'arrive' || !along)
    throw new AuthError(503, 'O provedor não forneceu manobras utilizáveis.');
  const length = lineLength(geometry);
  if (
    !previousEnd ||
    separation(previousEnd, geometry.coordinates.at(-1)!) > 80 ||
    Math.abs(along - length) > Math.max(40, length * 0.05)
  )
    throw new Error('Steps disagree with route');
  const scale = length / along;
  return maneuvers.map((item) => ({ ...item, along: item.along * scale }));
}
