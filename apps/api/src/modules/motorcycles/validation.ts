import { AuthError, body, text } from '../auth/validation.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export function motorcycleId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new AuthError(404, 'Moto não encontrada.');
  return value;
}
export function motorcycleData(value: unknown, partial = false) {
  const data = body(value, [
    'brand',
    'model',
    'year',
    'displacementCc',
    'propulsion',
    'manufactureYear',
    'versionName',
    'catalogVariantId',
    'catalogRevision',
  ]);
  if (!Object.keys(data).length)
    throw new AuthError(400, 'Informe os dados da moto.');
  const result: {
    brand?: string;
    model?: string;
    year?: number;
    displacementCc?: number | null;
    propulsion?: 'combustion' | 'electric';
    manufactureYear?: number | null;
    versionName?: string;
    catalogVariantId?: string | null;
    catalogRevision?: number | null;
  } = {};
  for (const [name, max, label] of [
    ['brand', 60, 'Marca'],
    ['model', 100, 'Modelo'],
  ] as const) {
    if (partial && !(name in data)) continue;
    try {
      result[name] = text(data[name], 1, max);
    } catch {
      throw new AuthError(
        400,
        `${label}: informe de 1 a ${max} caracteres válidos.`,
      );
    }
  }
  if ('propulsion' in data) {
    if (!['combustion', 'electric'].includes(String(data.propulsion)))
      throw new AuthError(400, 'Propulsão inválida.');
    result.propulsion = data.propulsion as 'combustion' | 'electric';
  }
  for (const name of ['year', 'manufactureYear'] as const) {
    if (name === 'manufactureYear' && data[name] === null) {
      result[name] = null;
      continue;
    }
    if ((partial || name === 'manufactureYear') && !(name in data)) continue;
    const n = data[name];
    if (
      typeof n !== 'number' ||
      !Number.isInteger(n) ||
      n < 1885 ||
      n > new Date().getFullYear() + 1
    )
      throw new AuthError(400, 'Ano inválido.');
    result[name] = n;
  }
  if (!partial || 'displacementCc' in data) {
    const n = data.displacementCc;
    if (n === null) {
      result.displacementCc = null;
    } else {
      if (
        typeof n !== 'number' ||
        !Number.isFinite(n) ||
        n < 1 ||
        n > 10000 ||
        (!('propulsion' in data) && !Number.isInteger(n)) ||
        Math.abs(n * 100 - Math.round(n * 100)) > 1e-7
      )
        throw new AuthError(
          400,
          'Informe cilindrada válida entre 1 e 10000 cc.',
        );
      result.displacementCc = n;
    }
  }
  if ('versionName' in data)
    result.versionName =
      data.versionName === '' ? '' : text(data.versionName, 1, 100);
  if ('catalogVariantId' in data)
    result.catalogVariantId =
      data.catalogVariantId === null
        ? null
        : motorcycleId(data.catalogVariantId);
  if ('catalogRevision' in data) {
    if (
      data.catalogRevision !== null &&
      (!Number.isInteger(data.catalogRevision) ||
        Number(data.catalogRevision) < 1)
    )
      throw new AuthError(400, 'Revisão inválida.');
    result.catalogRevision = data.catalogRevision as number | null;
  }
  if (!partial) {
    const electric = result.propulsion === 'electric';
    if (
      (electric && result.displacementCc !== null) ||
      (!electric && result.displacementCc === null)
    )
      throw new AuthError(
        400,
        'Informe cilindrada para combustão; elétrica não possui cilindrada.',
      );
  }
  return result;
}
