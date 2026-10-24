import { SaxesParser } from 'saxes';
import { validCoordinate, type Coordinate } from '@apex-ride/ride-core/routes';
import { distanceMeters } from '@apex-ride/ride-core';
export interface GpxPoint {
  coordinate: Coordinate;
  altitude: number | null;
  timestamp: number | null;
}
export interface GpxImport {
  segments: GpxPoint[][];
  name: string;
  duplicates: number;
  timed: boolean;
}
export function parseGpx(
  xml: string,
  limits = { bytes: 2_000_000, points: 10000 },
): GpxImport {
  if (new TextEncoder().encode(xml).length > limits.bytes)
    throw new Error('GPX excede o limite de 2 MB.');
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml))
    throw new Error('GPX com DTD ou entidades não é permitido.');
  const segments: GpxPoint[][] = [];
  let segment: GpxPoint[] = [],
    point: GpxPoint | null = null,
    text = '',
    field = '',
    depth = 0,
    root = false,
    count = 0,
    duplicates = 0,
    name = '',
    timed = false;
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  let namespace = '';
  const flush = () => {
    if (segment.length >= 2) segments.push(segment);
    segment = [];
    if (segments.length > 100) throw new Error('Muitos segmentos no GPX.');
  };
  parser.on('doctype', () => {
    throw new Error('DTD não permitido.');
  });
  parser.on('opentag', (node) => {
    const parent = stack.at(-1);
    stack.push(node.local);
    depth++;
    if (depth > 32) throw new Error('XML excessivamente aninhado.');
    if (depth === 1) {
      root =
        node.local === 'gpx' &&
        [
          '',
          'http://www.topografix.com/GPX/1/0',
          'http://www.topografix.com/GPX/1/1',
        ].includes(node.uri);
      if (!root) throw new Error('O arquivo precisa ser GPX.');
      namespace = node.uri;
    }
    if (node.uri !== namespace) return;
    if (
      (node.local === 'trkpt' && parent !== 'trkseg') ||
      (node.local === 'rtept' && parent !== 'rte') ||
      (node.local === 'trkseg' && parent !== 'trk') ||
      (['trk', 'rte'].includes(node.local) && parent !== 'gpx')
    )
      throw new Error('Estrutura de segmentos GPX inválida.');
    if (node.local === 'trkseg' || node.local === 'rte') flush();
    if (node.local === 'trkpt' || node.local === 'rtept') {
      count++;
      if (count > limits.points) throw new Error('GPX excede 10.000 pontos.');
      const lat = node.attributes.lat?.value,
        lon = node.attributes.lon?.value;
      const coordinate = [Number(lon), Number(lat)];
      if (
        lat === undefined ||
        lon === undefined ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(lat.trim()) ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(lon.trim()) ||
        !validCoordinate(coordinate)
      )
        throw new Error('GPX contém coordenadas inválidas.');
      point = { coordinate, altitude: null, timestamp: null };
    }
    if (['ele', 'time', 'name'].includes(node.local)) {
      field = node.local;
      text = '';
    }
  });
  const appendText = (value: string) => {
    if (field) {
      text += value;
      if (text.length > 512) throw new Error('Campo GPX excessivo.');
    }
  };
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.on('closetag', (node) => {
    stack.pop();
    if (node.uri !== namespace) {
      depth--;
      return;
    }
    if (point && node.local === 'ele') {
      const value = Number(text);
      if (
        !text.trim() ||
        !Number.isFinite(value) ||
        value < -500 ||
        value > 9000
      )
        throw new Error('Altitude GPX inválida.');
      point.altitude = value;
    }
    if (point && node.local === 'time') {
      const calendar = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/.exec(
        text.trim(),
      );
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
          text.trim(),
        ) ||
        !Number.isFinite(Date.parse(text)) ||
        !calendar ||
        Number(calendar[2]) < 1 ||
        Number(calendar[2]) > 12 ||
        Number(calendar[3]) < 1 ||
        Number(calendar[3]) >
          new Date(
            Date.UTC(Number(calendar[1]), Number(calendar[2]), 0),
          ).getUTCDate() ||
        Number(calendar[4]) > 23 ||
        Number(calendar[5]) > 59 ||
        Number(calendar[6]) > 59
      )
        throw new Error('Horário GPX inválido.');
      point.timestamp = Date.parse(text);
      timed = true;
    }
    if (node.local === 'name' && !name && !point)
      name = text.trim().slice(0, 120);
    if ((node.local === 'trkpt' || node.local === 'rtept') && point) {
      const previous = segment.at(-1);
      if (
        previous &&
        point.timestamp !== null &&
        previous.timestamp !== null &&
        point.timestamp < previous.timestamp
      )
        throw new Error('Horários GPX fora de ordem.');
      if (
        previous &&
        (distanceMeters(
          {
            longitude: previous.coordinate[0],
            latitude: previous.coordinate[1],
          },
          { longitude: point.coordinate[0], latitude: point.coordinate[1] },
        ) > 2000 ||
          (point.timestamp !== null &&
            previous.timestamp !== null &&
            point.timestamp - previous.timestamp > 120000))
      )
        flush();
      const last = segment.at(-1);
      if (
        last?.coordinate[0] === point.coordinate[0] &&
        last.coordinate[1] === point.coordinate[1]
      )
        duplicates++;
      else segment.push(point);
      point = null;
    }
    if (node.local === 'trkseg' || node.local === 'rte') flush();
    if (node.local === field) {
      field = '';
      text = '';
    }
    depth--;
  });
  parser.write(xml).close();
  flush();
  if (!root || !segments.length)
    throw new Error('GPX sem segmento contínuo com pelo menos dois pontos.');
  return { segments, name, duplicates, timed };
}
export function exportGpx(
  name: string,
  coordinates: Coordinate[],
  altitudes?: (number | null)[],
) {
  const escape = (value: string) =>
    value.replace(
      /[<>&"']/g,
      (char) =>
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        })[char]!,
    );
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Apex Ride" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escape(name)}</name><trkseg>${coordinates.map((p, i) => `<trkpt lat="${p[1]}" lon="${p[0]}">${altitudes?.[i] != null ? `<ele>${altitudes[i]}</ele>` : ''}</trkpt>`).join('')}</trkseg></trk></gpx>`;
}
