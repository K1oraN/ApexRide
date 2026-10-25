/**
 * Apex Ride Etapa 04 — atualiza arquivos INTEIROS usando fontes locais recentes.
 * Falha fechado se trecho esperado nao existir; nao altera banco, .env nem Git.
 * Rode APENAS na raiz D:\Projetos\ApexRide depois de copiar o pacote.
 */
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(root, 'apps/api/src/modules/routes/routes.ts')) ||
    !existsSync(resolve(root, 'pnpm-workspace.yaml'))) {
  console.error('Execute este script dentro da pasta-raiz do Apex Ride.');
  process.exit(1);
}
const ops = new Map();
const replacements = [];
function replaceOnce(path, oldText, newText, tag) {
  replacements.push({ path, oldText, newText, tag });
}

const routes = 'apps/api/src/modules/routes/routes.ts';
replaceOnce(routes,
  "import { listQuery } from './validation.js';",
  "import { listQuery } from './validation.js';\nimport { routeReader, publicRouteReader } from './visibility.js';",
  'route-policy-import');
replaceOnce(routes,
  'r.category,r.status,r.verification,r.version',
  'r.category,r.status,r.visibility,r.group_id AS "groupId",r.verification,r.version',
  'route-view-fields');
replaceOnce(routes,
  `scope === 'mine'
        ? \`r.owner_id=$1\`
        : scope === 'favorites'
          ? \`r.status='approved' AND EXISTS(SELECT 1 FROM route_favorites f WHERE f.route_id=r.id AND f.user_id=$1)\`
          : \`r.status='approved'\`,`,
  `scope === 'mine'
        ? \`r.owner_id=$1\`
        : scope === 'favorites'
          ? \`\${routeReader()} AND EXISTS(SELECT 1 FROM route_favorites f WHERE f.route_id=r.id AND f.user_id=$1)\`
          : scope === 'following'
            ? \`r.visibility='followers' AND \${routeReader()}\`
            : scope === 'groups'
              ? \`r.visibility='group' AND \${routeReader()}\`
              : publicRouteReader(),`,
  'route-list-visibility');
replaceOnce(routes,
  "  app.get('/routes/favorites', (req) => list(req, 'favorites'));",
  "  app.get('/routes/favorites', (req) => list(req, 'favorites'));\n  app.get('/routes/following', (req) => list(req, 'following'));\n  app.get('/routes/groups', (req) => list(req, 'groups'));",
  'route-following-endpoints');
replaceOnce(routes,
  "(r.status='approved' OR r.owner_id=$1)",
  '${routeReader()}',
  'route-detail-visibility');

const mutations = 'apps/api/src/modules/routes/mutations.ts';
replaceOnce(mutations,
  "import { geocode } from './geocoding.js';",
  "import { geocode } from './geocoding.js';\nimport { publishRoute } from './publication.js';\nimport { routeReader } from './visibility.js';",
  'publication-import');
replaceOnce(mutations,
  "status='draft',verification='suggested',version=version+1",
  "status='draft',visibility='private',group_id=NULL,verification='suggested',version=version+1",
  'edit-makes-private');
replaceOnce(mutations,
  "status='archived',verification='suggested',updated_at=now()",
  "status='archived',visibility='private',group_id=NULL,verification='suggested',updated_at=now()",
  'archive-makes-private');
replaceOnce(mutations,
  `  app.post('/routes/:id/submit', async (req) => {
    const { user } = await principal(req, true);
    const result = await db().query(
      \`UPDATE routes SET status='pending',verification='suggested',updated_at=now() WHERE id=$1 AND owner_id=$2 AND status IN ('draft','rejected') RETURNING id\`,
      [id(req), user.id],
    );
    if (!result.rowCount)
      throw new AuthError(409, 'Percurso indisponível para envio.');
    return { status: 'ok' };
  });`,
  `  app.post('/routes/:id/publish', async (req) => {
    const { user } = await principal(req, true);
    return tx((c) => publishRoute(c, id(req), user.id, req.body));
  });
  // Compatibilidade com apps mais antigos: a antiga acao agora publica sem ADM.
  app.post('/routes/:id/submit', async (req) => {
    const { user } = await principal(req, true);
    return tx((c) => publishRoute(c, id(req), user.id, { visibility: 'public' }));
  });`,
  'publish-without-admin');
replaceOnce(mutations,
  `\`INSERT INTO route_favorites(user_id,route_id) SELECT $1,id FROM routes WHERE id=$2 AND status='approved' ON CONFLICT DO NOTHING RETURNING route_id\`,`,
  `\`INSERT INTO route_favorites(user_id,route_id) SELECT $1,r.id FROM routes r WHERE r.id=$2 AND \${routeReader()} ON CONFLICT DO NOTHING RETURNING route_id\`,`,
  'favorite-access-write');
replaceOnce(mutations,
  `"SELECT id FROM routes WHERE id=$1 AND status='approved'",`,
  `\`SELECT r.id FROM routes r WHERE r.id=$2 AND \${routeReader()}\`,`,
  'favorite-access-check-query');
replaceOnce(mutations,
  `[id(req)],
        )
      ).rowCount
    )
      throw new AuthError(404, 'Percurso não encontrado.');
    return { status: 'ok' };
  });
  app.delete('/routes/:id/favorite'`,
  `[user.id, id(req)],
        )
      ).rowCount
    )
      throw new AuthError(404, 'Percurso não encontrado.');
    return { status: 'ok' };
  });
  app.delete('/routes/:id/favorite'`,
  'favorite-check-bindings');

const shared = 'packages/ride-core/routes.d.ts';
replaceOnce(shared,
  `  ownerId: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';`,
  `  ownerId: string;
  visibility: 'private' | 'public' | 'followers' | 'group';
  groupId: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';`,
  'shared-route-type');

const service = 'apps/web/src/services/routes.ts';
replaceOnce(service,
  'export type { RouteRecord, RouteData };',
  `export type { RouteRecord, RouteData };
export type RouteVisibility = 'private' | 'public' | 'followers' | 'group';`,
  'route-service-type');
replaceOnce(service,
  `  submit: (id: string) => authRequest(\`/routes/\${id}/submit\`, 'POST'),`,
  `  submit: (id: string) => authRequest(\`/routes/\${id}/submit\`, 'POST'),
  publish: (id: string, visibility: RouteVisibility, groupId: string | null) =>
    authRequest(\`/routes/\${encodeURIComponent(id)}/publish\`, 'POST', {
      visibility,
      ...(groupId ? { groupId } : {}),
    }),`,
  'route-service-publish');

const editor = 'apps/web/src/pages/RoutePages.tsx';
replaceOnce(editor,
  "import { DestinationSearch } from '../routes/DestinationSearch';",
  "import { DestinationSearch } from '../routes/DestinationSearch';\nimport { RoutePublishPanel } from '../routes/RoutePublishPanel';",
  'publish-panel-import');
replaceOnce(editor,
  `                   pending: 'Em análise',
                   approved: 'Aprovado',`,
  `                   pending: 'Em análise (legado)',
                   approved: 'Publicado',`,
  'route-status-label');
replaceOnce(editor,
  '                Copiar link aprovado',
  '                Copiar link do percurso',
  'route-link-copy');
replaceOnce(editor,
  `                {['draft', 'rejected'].includes(route.status) && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(() => routeService.submit(route.id))
                    }
                  >
                    Solicitar publicação
                  </Button>
                )}`, 
  `                <RoutePublishPanel
                  route={route}
                  onUpdated={() => setRefresh((n) => n + 1)}
                />`,
  'route-publish-panel');

const explore = 'apps/web/src/pages/ExplorePage.tsx';
replaceOnce(explore,
  "import '../styles/explore.css';",
  "import '../styles/explore.css';\nimport '../styles/apex-stage-04.css';",
  'explore-stage04-styles');
replaceOnce(explore,
  '  Folder,\n',
  '  Folder,\n  UsersRound,\n',
  'explore-social-icon');
replaceOnce(explore,
  `  {
    value: 'mine',
    label: 'Meus percursos',
    icon: <Folder />,
  },`,
  `  {
    value: 'mine',
    label: 'Meus percursos',
    icon: <Folder />,
  },
  { value: 'following', label: 'Seguindo', icon: <UsersRound /> },
  { value: 'groups', label: 'Grupos', icon: <UsersRound /> },`,
  'explore-extra-tabs');
replaceOnce(explore,
  `                 'favorites',
                 'destinations',`,
  `                 'favorites',
                 'following',
                 'groups',
                 'destinations',`,
  'explore-auth-tabs');
replaceOnce(explore,
  `          ['mine', 'favorites'].includes(tab)
            ? '/' + tab
            : '',`,
  `          ['mine', 'favorites', 'following', 'groups'].includes(tab)
            ? '/' + tab
            : '',`,
  'explore-api-scope');

// Preflight: falha ANTES de escrever se arquivos divergem do main esperado.
const originals = new Map();
for (const { path } of replacements) {
  if (!originals.has(path)) originals.set(path, await readFile(resolve(root, path), 'utf8'));
}
for (const { path, oldText, newText, tag } of replacements) {
  const current = ops.get(path) ?? originals.get(path);
  if (!current.includes(oldText)) {
    if (current.includes(newText)) {
      console.error(`A etapa parece ja aplicada: ${tag} (${path}).`);
    } else {
      console.error(`Arquivo diferente do GitHub esperado: ${tag} (${path}).`);
    }
    console.error('Nada foi alterado. Atualize seu projeto ou consulte o README.');
    process.exit(1);
  }
  if (current.split(oldText).length !== 2) {
    console.error(`Trecho nao exclusivo em ${path}: ${tag}`);
    process.exit(1);
  }
  ops.set(path, current.replace(oldText, newText));
}
const backup = resolve(root, '.local', 'stage04-backup', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(backup, { recursive: true });
for (const path of originals.keys()) {
  const dest = resolve(backup, path);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(resolve(root, path), dest);
}
for (const [path, content] of ops) await writeFile(resolve(root, path), content, 'utf8');
console.log('Etapa 04 aplicada aos arquivos completos com sucesso.');
console.log('Backup:', backup);
console.log('Arquivos atualizados:');
for (const path of ops.keys()) console.log('-', path);
console.log('Agora rode pnpm exec prettier --write e pnpm typecheck, lint, build.');
