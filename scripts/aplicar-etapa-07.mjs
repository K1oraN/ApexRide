/* APEX RIDE — Etapa 07. Modifica somente Feed.tsx e faz backup.
   O original foi lido do GitHub main em e670ed275f3d3c339264ce04709b2314f6e5bb99.
   Não sobrescreve arquivos cuja versão não corresponda à auditada. */
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';

const root = process.cwd();
const relativePath = 'apps/web/src/social/Feed.tsx';
const target = resolve(root, relativePath);
const requiredSha = 'b97fafc5a8617ff363f6aaee879ee3daaa59ef0e';
const marker = '/* APEX STAGE 07 FEED */';

function blobSha(content) {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`))
    .update(bytes)
    .digest('hex');
}
function replaceOnce(source, before, after, name) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0)
    throw new Error(`Padrão não corresponde a um único trecho: ${name}. Feed.tsx preservado.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function upgradeFeed(source) {
  if (source.includes(marker)) return { changed: false, content: source };
  if (blobSha(source) !== requiredSha) {
    throw new Error(
      `Feed.tsx diferente do GitHub auditado (SHA ${blobSha(source)}). ` +
      'Sincronize o repositório e confira suas alterações locais; o instalador não sobrescreveu nada.',
    );
  }
  let out = source;
  out = replaceOnce(
    out,
    "import { Heart, MessageCircle, MoreHorizontal } from 'lucide-react';",
    "import { Heart, ImagePlus, MessageCircle, MoreHorizontal, PencilLine, Share2 } from 'lucide-react';\n" + marker,
    'ícones do feed',
  );
  out = replaceOnce(
    out,
    '  const [comments, setComments] = useState(false),',
    "  const [shareMessage, setShareMessage] = useState('');\n" +
    '  const [comments, setComments] = useState(false),',
    'estado de compartilhamento',
  );
  out = replaceOnce(
    out,
    "  async function action(kind: 'like' | 'delete') {",
    `  async function sharePost() {
    setShareMessage('');
    const link = new URL('/comunidade', window.location.origin);
    link.searchParams.set('post', post.id);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'Publicação Apex Ride', url: link.href });
        setShareMessage('Compartilhamento iniciado. O acesso depende das permissões do autor.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link.href);
        setShareMessage('Link copiado. O acesso depende das permissões do autor.');
      } else {
        setShareMessage('Copie o endereço: ' + link.href);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setShareMessage('Não foi possível compartilhar agora. Copie o endereço: ' + link.href);
    }
  }
  async function action(kind: 'like' | 'delete') {`,
    'compartilhamento seguro',
  );
  out = replaceOnce(
    out,
    '        {user && user.id !== post.author_id && (',
    `        <button type="button" onClick={() => void sharePost()} aria-label="Compartilhar publicação">
          <Share2 size={20} aria-hidden="true" />
          <span>Compartilhar</span>
        </button>
        {user && user.id !== post.author_id && (`,
    'botão compartilhar',
  );
  out = replaceOnce(
    out,
    '      {confirm && (',
    `      {shareMessage && <p className="community-stage-share-message" role="status">{shareMessage}</p>}
      {confirm && (`,
    'mensagem de compartilhamento',
  );
  const createButton = `      {!compact &&
        user &&
        canPost &&
        (!username || username === user.username) && (
          <Button variant="primary" onClick={() => setComposing(true)}>
            Criar publicação
          </Button>
        )}`;
  const newButton = `      {!compact &&
        user &&
        canPost &&
        !composing &&
        !selectedRide &&
        (!username || username === user.username) && (
          <div className="feed-composer-prompt">
            <Avatar name={user.displayName} placeholder />
            <Button variant="secondary" type="button" onClick={() => setComposing(true)}>
              <PencilLine size={19} aria-hidden="true" />
              Compartilhe sua próxima aventura…
            </Button>
            <ImagePlus size={24} aria-hidden="true" />
          </div>
        )}`;
  out = replaceOnce(out, createButton, newButton, 'convite para publicação');
  return { changed: true, content: out };
}

async function main() {
  const original = await readFile(target, 'utf8');
  // O checkout do Git no Windows pode converter LF para CRLF.
  // Comparamos os bytes normalizados ao blob do GitHub, mas mantemos o backup original.
  const current = original.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const { changed, content } = upgradeFeed(current);
  if (!changed) {
    console.log('Etapa 07 já aplicada ao Feed.tsx. Nenhuma alteração necessária.');
    return;
  }
  const backupDir = join(root, '.local', 'stage-backups', 'etapa-07');
  await mkdir(backupDir, { recursive: true });
  const backup = join(backupDir, `Feed.${requiredSha}.tsx`);
  await writeFile(backup, original, { flag: 'wx' }).catch((error) => {
    if (error?.code !== 'EEXIST') throw error;
  });
  const temp = target + '.stage07.tmp';
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temp, content, 'utf8');
  await rename(temp, target);
  console.log('Feed.tsx atualizado; backup: ' + backup);
  console.log('Execute prettier, typecheck, lint e build antes do commit.');
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error('A Etapa 07 NÃO foi aplicada ao Feed.tsx:', error.message);
    process.exitCode = 1;
  });
}
