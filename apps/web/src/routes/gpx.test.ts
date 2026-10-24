import { expect, it } from 'vitest';
import { exportGpx, parseGpx } from './gpx';
const point = (longitude: number, content = '') =>
  `<trkpt lat="-9.66" lon="${longitude}">${content}</trkpt>`;
const document = (content: string) =>
  `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Plano sintético</name><trkseg>${content}</trkseg></trk></gpx>`;
it('aceita CDATA como texto XML e rejeita data impossível ou pontos fora de segmento', () => {
  expect(
    parseGpx(
      document(point(-35.73, '<ele><![CDATA[100]]></ele>') + point(-35.729)),
    ).segments[0]![0]!.altitude,
  ).toBe(100);
  expect(() =>
    parseGpx(
      document(
        point(-35.73, '<time>2026-02-31T00:00:00Z</time>') + point(-35.729),
      ),
    ),
  ).toThrow(/Horário/);
  expect(() =>
    parseGpx(`<gpx>${point(-35.73)}${point(-35.729)}</gpx>`),
  ).toThrow(/Estrutura/);
});
it('importa GPX com altitude, sem criar atividade ou inventar horário', () => {
  const result = parseGpx(
    document(
      point(-35.73, '<ele>100</ele>') + point(-35.729, '<ele>110</ele>'),
    ),
  );
  expect(result.segments[0]![0]).toEqual({
    coordinate: [-35.73, -9.66],
    altitude: 100,
    timestamp: null,
  });
  expect(result.timed).toBe(false);
  expect(result.name).toBe('Plano sintético');
});
it.each([
  '',
  '<gpx>',
  '<html/>',
  '<!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///secret">]><gpx>&x;</gpx>',
  document('<trkpt lat="91" lon="0"/>'),
  document('<trkpt lat="" lon="0"/>'),
  document(point(-35.73, '<ele>NaN</ele>') + point(-35.729)),
])(
  'rejeita vazio, XML inválido/malicioso e coordenadas/altitude inválidas',
  (xml) => {
    expect(() => parseGpx(xml)).toThrow();
  },
);
it('aplica limites de bytes, pontos e profundidade', () => {
  expect(() => parseGpx(' '.repeat(2000001))).toThrow(/limite/);
  expect(() =>
    parseGpx(document(point(-35.73) + point(-35.729)), {
      bytes: 2000000,
      points: 1,
    }),
  ).toThrow(/pontos/);
  expect(() =>
    parseGpx('<gpx>' + '<a>'.repeat(33) + '</a>'.repeat(33) + '</gpx>'),
  ).toThrow(/aninhado/);
});
it('remove duplicatas adjacentes e não conecta lacunas ou segmentos', () => {
  const result = parseGpx(
    document(
      point(-35.73) +
        point(-35.73) +
        point(-35.729) +
        point(-35.6) +
        point(-35.599),
    ),
  );
  expect(result.duplicates).toBe(1);
  expect(result.segments).toHaveLength(2);
  expect(result.segments.map((s) => s.length)).toEqual([2, 2]);
  const explicit = parseGpx(
    `<gpx><rte><rtept lat="0" lon="0"/><rtept lat="0" lon="0.001"/></rte><rte><rtept lat="1" lon="1"/><rtept lat="1" lon="1.001"/></rte></gpx>`,
  );
  expect(explicit.segments).toHaveLength(2);
});
it('horários precisam ser válidos e ordenados; lacuna temporal separa segmentos', () => {
  expect(() =>
    parseGpx(document(point(-35.73, '<time>invalido</time>') + point(-35.729))),
  ).toThrow(/Horário/);
  expect(() =>
    parseGpx(
      document(
        point(-35.73, '<time>2026-01-01T00:00:02Z</time>') +
          point(-35.729, '<time>2026-01-01T00:00:01Z</time>'),
      ),
    ),
  ).toThrow(/ordem/);
  const result = parseGpx(
    document(
      [0, 1, 300, 301]
        .map((s, i) =>
          point(
            -35.73 + i * 0.001,
            `<time>${new Date(Date.UTC(2026, 0, 1) + s * 1000).toISOString()}</time>`,
          ),
        )
        .join(''),
    ),
  );
  expect(result.segments).toHaveLength(2);
});
it('exporta somente planejamento com escape XML e altitude, sem timestamps', () => {
  const xml = exportGpx(
    'A & <B>',
    [
      [0, 0],
      [0.001, 0],
    ],
    [100, null],
  );
  expect(xml).toContain('A &amp; &lt;B&gt;');
  expect(xml).not.toContain('<time>');
  expect(parseGpx(xml).segments[0]![1]!.altitude).toBeNull();
});
