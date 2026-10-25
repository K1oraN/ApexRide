# Apex Ride — Etapa 07: Comunidade, feed e eventos

## Versão de referência

- Repositório: https://github.com/K1oraN/ApexRide
- Branch: `main`, commit consultado: `e670ed275f3d3c339264ce04709b2314f6e5bb99`.
- Referência visual: `referencias/07_comunidade_conceito.png`.
- Entrega: CSS da comunidade e eventos; hub social; links para posts compartilhados; melhoria do convite de publicação, compartilhar post e ações do feed por instalador seguro.

## Arquivos completos fornecidos

- `apps/web/src/pages/CommunityHubPage.tsx`: comunidade com publicações, rankings e eventos; publicação compartilhada aberta via `/comunidade?post=<uuid>` com autorização real da API.
- `apps/web/src/main.tsx`: importa nova camada global de estilos da Etapa 07.
- `apps/web/src/styles/apex-stage-07.css`: reformulação premium e responsiva para cards do feed, mosaico de fotos, comentários, curtidas, compositor e eventos.
- `scripts/aplicar-etapa-07.mjs`: transforma a versão exata e auditada do `Feed.tsx`, com backup automático. Faz a modificação apenas quando o Git blob é o esperado, e gera o **arquivo completo modificado** no próprio projeto.

**Atenção:** O `Feed.tsx` completo é gerado pelo instalador local, que parte do original atual do GitHub. Não copie `referencias` para `apps/web/public`.

## Instalação

1. Confira `git status`. Faça commit/backup das mudanças locais antes de substituir arquivos.
2. Extraia o ZIP e copie as pastas `apps`, `scripts` e `docs` para `D:\Projetos\ApexRide`, mantendo a estrutura e aceitando substituir os arquivos apontados.
3. Execute na raiz do repositório:

```powershell
cd D:\Projetos\ApexRide
node .\scripts\aplicar-etapa-07.mjs
```

O instalador só altera `apps/web/src/social/Feed.tsx` se seu conteúdo for igual à versão auditada. Se detectar diferença, **interrompe sem sobrescrever o arquivo**; verifique as alterações locais antes de prosseguir. Backup (arquivo Git-ignored): `.local/stage-backups/etapa-07/Feed.b97fafc5a8617ff363f6aaee879ee3daaa59ef0e.tsx`.

```powershell
pnpm exec prettier --write apps/web/src/pages/CommunityHubPage.tsx apps/web/src/social/Feed.tsx apps/web/src/main.tsx apps/web/src/styles/apex-stage-07.css
pnpm typecheck
pnpm lint
pnpm build
```

Sem migração SQL nova nesta etapa. Rode `pnpm db:migrate` no fluxo normal de execução apenas para confirmar migrações previamente existentes.

## Executar (PostgreSQL portátil; **sem Docker**)

```powershell
cd D:\Projetos\ApexRide
& ".\.local\postgres-runtime\bin\pg_ctl.exe" start -D ".\.local\postgres-auth\data" -l ".\.local\postgres-auth\server.log" -o "-p 55432 -h 127.0.0.1"
pnpm db:migrate
pnpm dev
```

Se o PostgreSQL já estiver iniciado, ignore o comando `pg_ctl start`.

Abra `http://127.0.0.1:5173/comunidade`. Teste em desktop e modo responsivo (F12). Para encerrar, `Ctrl+C` e depois:

```powershell
& ".\.local\postgres-runtime\bin\pg_ctl.exe" stop -D ".\.local\postgres-auth\data" -m fast
```

## Checklist funcional

- [ ] Feed público exibe somente posts autorizados e criados realmente (sem dados demonstrativos).
- [ ] Abas Para todos / Seguindo filtram corretamente e Atualizar feed refaz a busca.
- [ ] `Compartilhe sua próxima aventura…` abre o compositor existente.
- [ ] Criar post com texto/fotografias, atualizar, editar e excluir como proprietário.
- [ ] Curtir/descurtir, expandir, comentar e denunciar conforme autorização.
- [ ] Mosaico de fotos com 1, 2, 3 ou mais arquivos e imagens autênticas.
- [ ] Botão Compartilhar usa compartilhamento nativo ou copia link.
- [ ] Link `/comunidade?post=<id>` carrega o post autorizado; conta sem acesso vê mensagem genérica sem conteúdo.
- [ ] Abas Rankings e Eventos abrem as rotas existentes.
- [ ] Filtros, convites e botões dos eventos permanecem funcionais.
- [ ] Celular estreito, tablet e desktop não cortam botões/textos.
- [ ] Sem erros no console F12 ou `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Privacidade e escopo real

O link compartilhado **não concede acesso**: a API `/social/posts/:id` valida a visibilidade do autor e bloqueios. Fotos reais continuam hospedadas no backend; a captura conceitual permanece no ZIP apenas como referência. Nesta entrega não são criados usuários, mídias, rankings ou eventos fictícios.

O botão "Salvar" da imagem conceitual não foi incluído: favoritos de posts sincronizados exigem API e tabela dedicadas, não só controle de frontend. Curtidas, comentários, denúncias e exclusões seguem as regras já existentes no projeto. Publicações de grupo seguem suas próprias permissões.

## Subir no GitHub após validar

```powershell
cd D:\Projetos\ApexRide
git status
git add apps/web/src/pages/CommunityHubPage.tsx
git add apps/web/src/social/Feed.tsx
git add apps/web/src/main.tsx
git add apps/web/src/styles/apex-stage-07.css
git add scripts/aplicar-etapa-07.mjs
git add docs/ETAPA_07_COMUNIDADE.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(community): etapa 07 feed premium e compartilhamento"
git push origin main
```

Não adicione `.env`, `.local`, imagens pessoais nem senhas ao GitHub. O pacote não foi enviado automaticamente ao GitHub; publique apenas após os testes locais.
