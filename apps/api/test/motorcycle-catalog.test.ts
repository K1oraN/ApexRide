import { describe, expect, it } from 'vitest';
import { catalogRevision } from '../src/modules/motorcycles/catalog.js';
import { motorcycleData } from '../src/modules/motorcycles/validation.js';
const valid = {
  variantId: '66000000-0000-4000-8000-000000000002',
  modelId: '66010000-0000-4000-8000-000000000001',
  brandId: 'honda',
  brand: 'Honda',
  model: 'CB650R',
  year: 2026,
  versionName: 'E-Clutch',
  propulsion: 'combustion',
  categoryId: 'street',
  expectedRevision: 1,
  status: 'reviewed',
  changeNote: 'Conferência sintética da fonte.',
  sources: [
    {
      title: 'Fonte oficial',
      url: 'https://www.honda.com.br/motos/street/naked/cb650r',
      consultedAt: '2026-01-01',
      publishedAt: null,
      scope: 'Brasil, ano-modelo 2026 e versão E-Clutch.',
    },
  ],
  specifications: { power: { value: 86.7, unit: 'cv', source: 0 } },
};
describe('Curadoria e identidade de motocicletas', () => {
  it('mantém unidade original e referência de cada campo', () => {
    expect(catalogRevision(valid).specifications).toEqual(valid.specifications);
    expect(
      catalogRevision({
        ...valid,
        specifications: { torque: { value: 5.8, unit: 'kgf·m', source: 0 } },
      }).specifications.torque?.unit,
    ).toBe('kgf·m');
  });
  it.each([
    { specifications: { power: { value: 0, unit: 'cv', source: 0 } } },
    { specifications: { power: { value: 1, unit: 'CV', source: 0 } } },
    { specifications: { power: { value: 1, unit: 'cv', source: 8 } } },
    {
      propulsion: 'electric',
      specifications: { displacement: { value: 1, unit: 'cc', source: 0 } },
    },
    { sources: [{ ...valid.sources[0], url: 'javascript:alert(1)' }] },
    { sources: [{ ...valid.sources[0], consultedAt: '2026-02-30' }] },
    { sources: [{ ...valid.sources[0], publishedAt: '2026-02-01' }] },
    { sources: [{ ...valid.sources[0], consultedAt: '2099-01-01' }] },
  ])('rejeita fonte, data ou especificação inconsistente: %j', (patch) =>
    expect(() => catalogRevision({ ...valid, ...patch })).toThrow(),
  );
  it('aceita moto manual desconhecida, ano de fabricação distinto e elétrica sem cilindrada', () => {
    expect(
      motorcycleData({
        brand: 'Independente',
        model: 'Modelo livre',
        year: 2026,
        manufactureYear: 2025,
        propulsion: 'electric',
        displacementCc: null,
      }),
    ).toMatchObject({ displacementCc: null, manufactureYear: 2025 });
    expect(() =>
      motorcycleData({
        brand: 'Manual',
        model: 'Livre',
        year: 2026,
        propulsion: 'electric',
        displacementCc: 1,
      }),
    ).toThrow();
  });
});
