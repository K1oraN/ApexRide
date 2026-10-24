import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { AuthError, body, text } from '../auth/validation.js';
import { motorcycleId } from './validation.js';
const fields: Record<string, string[]> = {
  maintenance: [
    'title',
    'date',
    'odometerKm',
    'description',
    'costCents',
    'workshop',
    'nextDate',
    'nextOdometerKm',
  ],
  odometer: [
    'title',
    'date',
    'odometerKm',
    'origin',
    'correctionOf',
    'description',
  ],
  note: ['title', 'description'],
  insurance: [
    'title',
    'date',
    'endDate',
    'provider',
    'coverage',
    'description',
  ],
  document: ['title', 'endDate', 'status', 'description'],
  reminder: ['title', 'nextDate', 'nextOdometerKm', 'description'],
  modification: ['title', 'date', 'description'],
};
export function recordData(kind: string, value: unknown) {
  if (!Object.hasOwn(fields, kind))
    throw new AuthError(400, 'Tipo de registro inválido.');
  const b = body(value, fields[kind]!);
  const data: Record<string, string | number> = {
    title: text(b.title, 1, 100),
  };
  for (const [key, v] of Object.entries(b)) {
    if (key === 'title' || v === '' || v === null) continue;
    if (['odometerKm', 'nextOdometerKm', 'costCents'].includes(key)) {
      if (
        typeof v !== 'number' ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > 100000000 ||
        (key === 'costCents' && !Number.isInteger(v))
      )
        throw new AuthError(400, 'Valor numérico inválido.');
      data[key] = v;
    } else if (['date', 'nextDate', 'endDate'].includes(key)) {
      if (
        typeof v !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v
      )
        throw new AuthError(400, 'Data inválida.');
      data[key] = v;
    } else if (key === 'correctionOf') data[key] = motorcycleId(v);
    else data[key] = text(v, 1, key === 'description' ? 3000 : 300);
  }
  if (['maintenance', 'odometer', 'insurance'].includes(kind) && !data.date)
    throw new AuthError(400, 'Informe a data.');
  if (kind === 'odometer' && (data.odometerKm === undefined || !data.origin))
    throw new AuthError(400, 'Informe odômetro e origem da leitura.');
  if (
    kind === 'reminder' &&
    !data.nextDate &&
    data.nextOdometerKm === undefined
  )
    throw new AuthError(400, 'Informe data ou quilometragem planejada.');
  if (
    ['odometer', 'maintenance'].includes(kind) &&
    String(data.date) > new Date().toISOString().slice(0, 10)
  )
    throw new AuthError(400, 'Registro realizado não pode ter data futura.');
  if (
    kind === 'insurance' &&
    data.endDate &&
    String(data.endDate) < String(data.date)
  )
    throw new AuthError(400, 'Fim da vigência anterior ao início.');
  return data;
}
type Dependencies = {
  db: () => Pool;
  identify: (r: FastifyRequest) => Promise<void>;
  owner: (r: FastifyRequest) => string;
  own: (
    db: Pool | PoolClient,
    id: string,
    user: string,
    archived?: boolean,
  ) => Promise<{ id: string; archived_at: Date | null }>;
  transaction: <T>(
    user: string,
    run: (c: PoolClient) => Promise<T>,
  ) => Promise<T>;
};
export function registerGarageRecords(app: FastifyInstance, ctx: Dependencies) {
  const { db, owner, own, identify, transaction } = ctx;
  const bike = (r: FastifyRequest) =>
    motorcycleId((r.params as { id: string }).id);
  const key = (r: FastifyRequest) =>
    motorcycleId((r.params as { recordId: string }).recordId);
  app.get('/motorcycles/:id/records', { onRequest: identify }, async (r) => {
    await own(db(), bike(r), owner(r), true);
    const q = r.query as { kind?: string; page?: string; q?: string };
    if (q.kind && !Object.hasOwn(fields, q.kind))
      throw new AuthError(400, 'Filtro inválido.');
    if (String(q.q ?? '').length > 100)
      throw new AuthError(400, 'Pesquisa muito longa.');
    const page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 1000)
      throw new AuthError(400, 'Página inválida.');
    const rows = (
      await db().query(
        `SELECT id,kind,data,revision,created_at,updated_at FROM motorcycle_records WHERE motorcycle_id=$1 AND deleted_at IS NULL AND ($2='' OR kind=$2) AND ($4='' OR strpos(garage_normalize(concat(data->>'title',' ',data->>'description')),garage_normalize($4))>0) ORDER BY created_at DESC,id LIMIT 21 OFFSET $3`,
        [bike(r), q.kind ?? '', (page - 1) * 20, q.q ?? ''],
      )
    ).rows;
    const latest =
      q.kind === 'odometer'
        ? ((
            await db().query(
              "SELECT id,kind,data,revision,created_at FROM motorcycle_records WHERE motorcycle_id=$1 AND kind='odometer' AND deleted_at IS NULL ORDER BY created_at DESC,id LIMIT 1",
              [bike(r)],
            )
          ).rows[0] ?? null)
        : null;
    return {
      items: rows.slice(0, 20),
      hasMore: rows.length > 20,
      page,
      latest,
    };
  });
  app.post(
    '/motorcycles/:id/records',
    { onRequest: identify },
    async (r, reply) => {
      const b = body(r.body, ['kind', 'data']),
        kind = String(b.kind),
        data = recordData(kind, b.data);
      const result = await transaction(owner(r), async (c) => {
        await own(c, bike(r), owner(r));
        if (kind === 'odometer') {
          const last = (
            await c.query(
              `SELECT id,data FROM motorcycle_records WHERE motorcycle_id=$1 AND kind='odometer' AND deleted_at IS NULL ORDER BY created_at DESC,id LIMIT 1`,
              [bike(r)],
            )
          ).rows[0];
          if (
            data.correctionOf &&
            (!last ||
              data.correctionOf !== last.id ||
              String(data.description ?? '').length < 5)
          )
            throw new AuthError(
              400,
              'Confirme a última leitura e informe o motivo da correção.',
            );
          if (
            last &&
            Number(data.odometerKm) < Number(last.data.odometerKm) &&
            !data.correctionOf
          )
            throw new AuthError(
              409,
              'Leitura inferior à anterior: registre uma correção com motivo.',
            );
        }
        const id = randomUUID();
        const row = (
          await c.query(
            'INSERT INTO motorcycle_records(id,motorcycle_id,kind,data) VALUES($1,$2,$3,$4) RETURNING *',
            [id, bike(r), kind, JSON.stringify(data)],
          )
        ).rows[0];
        await c.query(
          `INSERT INTO motorcycle_record_revisions(record_id,revision,data,actor_id,action) VALUES($1,1,$2,$3,'create')`,
          [id, JSON.stringify(data), owner(r)],
        );
        return row;
      });
      return reply.code(201).send({ record: result });
    },
  );
  for (const method of ['PATCH', 'DELETE'] as const)
    app.route({
      method,
      url: '/motorcycles/:id/records/:recordId',
      onRequest: identify,
      handler: async (r) => {
        const b = body(
          r.body,
          method === 'PATCH' ? ['revision', 'data'] : ['revision'],
        );
        if (!Number.isInteger(b.revision) || Number(b.revision) < 1)
          throw new AuthError(400, 'Revisão inválida.');
        return transaction(owner(r), async (c) => {
          await own(c, bike(r), owner(r));
          const row = (
            await c.query(
              'SELECT * FROM motorcycle_records WHERE id=$1 AND motorcycle_id=$2 AND deleted_at IS NULL FOR UPDATE',
              [key(r), bike(r)],
            )
          ).rows[0];
          if (!row) throw new AuthError(404, 'Registro não encontrado.');
          if (row.revision !== b.revision)
            throw new AuthError(
              409,
              'Registro alterado. Recarregue antes de salvar.',
            );
          if (row.kind === 'odometer')
            throw new AuthError(
              409,
              'Odômetro mantém histórico: registre outra leitura ou uma correção.',
            );
          const data =
              method === 'PATCH' ? recordData(row.kind, b.data) : row.data,
            revision = row.revision + 1;
          const changed = (
            await c.query(
              'UPDATE motorcycle_records SET data=$1,revision=$2,updated_at=now(),deleted_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE id=$4 RETURNING *',
              [JSON.stringify(data), revision, method === 'DELETE', row.id],
            )
          ).rows[0];
          await c.query(
            'INSERT INTO motorcycle_record_revisions(record_id,revision,data,actor_id,action) VALUES($1,$2,$3,$4,$5)',
            [
              row.id,
              revision,
              JSON.stringify(data),
              owner(r),
              method === 'DELETE' ? 'delete' : 'update',
            ],
          );
          return { record: changed };
        });
      },
    });
}
