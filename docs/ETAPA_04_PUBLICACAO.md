# APEX RIDE — ETAPA 04: PUBLICAÇÃO DE PERCURSOS

Base consultada: `K1oraN/ApexRide`, `main`, commit `b91b4b7881ff00d7d1316e26ff917e6606b2cfa2`.

## O que este pacote efetivamente implementa

- Publicação direta pelo autor sem aprovação prévia do administrador.
- Quatro visibilidades: **privado**, **público**, **seguidores aprovados** e **grupo/comunidade**.
- As permissões são verificadas **no backend**, inclusive para links diretos e listagens.
- No caso de grupos, a API verifica participação ativa, regras aceitas, restrições e política de postagem.
- Abas **Seguindo** e **Grupos** na exploração, mais um painel de publicação na página do percurso.
- Circuitos podem ser compartilhados, mas **verificação técnica de pista segue independente**.
- Migração aditiva 038: percursos já aprovados mantêm a visibilidade pública anterior; pendentes e rascunhos permanecem privados.

## Como o ZIP foi estruturado

O ZIP inclui **arquivos novos completos** (SQL, API, React e CSS) e um instalador Node para reconstruir os **arquivos existentes completos** da versão atual do projeto. A reconstrução é necessária porque o código que já está no GitHub possui muitas outras funcionalidades; não devemos sobrescrevê-las por versões antigas.

O instalador compara trechos exatos, **aborta antes de alterar qualquer arquivo se algum trecho divergir**, e cria backup dos arquivos que vai alterar em `.local/stage04-backup/<data>/`.

Ele altera estes 6 arquivos existentes:

1. `apps/api/src/modules/routes/routes.ts`
2. `apps/api/src/modules/routes/mutations.ts`
3. `packages/ride-core/routes.d.ts`
4. `apps/web/src/services/routes.ts`
5. `apps/web/src/pages/RoutePages.tsx`
6. `apps/web/src/pages/ExplorePage.tsx`

Os cinco arquivos novos são:

- `database/migrations/038_route_visibility.sql`
- `apps/api/src/modules/routes/visibility.ts`
- `apps/api/src/modules/routes/publication.ts`
- `apps/web/src/routes/RoutePublishPanel.tsx`
- `apps/web/src/styles/apex-stage-04.css`

**Não copie `.env` do ZIP**: ele não existe. Não há Docker.

## INSTALAÇÃO NO WINDOWS

1. Faça backup local dos seus arquivos e do banco PostgreSQL. Confira que concluiu a Etapa 03 e que já tem as migrações até 037.
2. Extraia o ZIP e copie as pastas `apps`, `database`, `packages`, `scripts` e `docs` para `D:\Projetos\ApexRide`, mantendo a estrutura de diretórios. A pasta `packages` só recebe arquivos modificados pelo instalador.
3. Abra PowerShell na raiz do projeto:

```powershell
cd D:\Projetos\ApexRide
node .\scripts\aplicar-etapa-04.mjs
```

Se disser que um arquivo é diferente do esperado, **não force substituição**: envie a mensagem para revisão.

4. Formate e valide:

```powershell
pnpm exec prettier --write apps/api/src/modules/routes/routes.ts apps/api/src/modules/routes/mutations.ts apps/api/src/modules/routes/visibility.ts apps/api/src/modules/routes/publication.ts apps/web/src/services/routes.ts apps/web/src/pages/RoutePages.tsx apps/web/src/pages/ExplorePage.tsx apps/web/src/routes/RoutePublishPanel.tsx apps/web/src/styles/apex-stage-04.css packages/ride-core/routes.d.ts
pnpm typecheck
pnpm lint
pnpm build
```

5. Inicie o PostgreSQL original **apenas se estiver parado**:

```powershell
& ".\.local\postgres-runtime\bin\pg_ctl.exe" status -D ".\.local\postgres-auth\data"
& ".\.local\postgres-runtime\bin\pg_ctl.exe" start -D ".\.local\postgres-auth\data" -l ".\.local\postgres-auth\server.log" -o "-p 55432 -h 127.0.0.1"
```

6. Migre e inicie:

```powershell
pnpm db:migrate
pnpm dev
```

7. Abra `http://127.0.0.1:5173/explorar`, crie uma rota ou abra uma rota já sua, e encontre o novo bloco **Salvar e compartilhar** na página de detalhes da rota.

## TESTES CRÍTICOS

- Publicar como **público**, abrir o link em janela anônima: deve aparecer.
- Mudar para **privado**: ao abrir anonimamente deve retornar 404 / indisponível, mas o proprietário deve ver.
- Publicar **seguidores**: uma conta que segue o autor com status `approved` deve ver; usuário não seguidor deve receber 404.
- Publicar em **grupo**: membro ativo deve ver; não membro e membro suspenso/bloqueado não devem ver.
- Um membro comum não deve conseguir publicar em grupo com `posting_policy='staff'`.
- Verificar as abas **Seguindo** e **Grupos** em `/explorar`.
- Alterar o desenho de uma rota: deve voltar para rascunho privado, necessitando republicação.
- No circuito não verificado, publicar não deve conceder selo `verified`.
- Não acessar geometria/pontos via `GET /api/routes/:id` quando não autorizado.

### Subir para o GitHub APÓS os testes

```powershell
cd D:\Projetos\ApexRide
git status
git add database/migrations/038_route_visibility.sql apps/api/src/modules/routes/visibility.ts apps/api/src/modules/routes/publication.ts apps/api/src/modules/routes/routes.ts apps/api/src/modules/routes/mutations.ts apps/web/src/routes/RoutePublishPanel.tsx apps/web/src/styles/apex-stage-04.css apps/web/src/services/routes.ts apps/web/src/pages/RoutePages.tsx apps/web/src/pages/ExplorePage.tsx packages/ride-core/routes.d.ts scripts/aplicar-etapa-04.mjs docs/ETAPA_04_PUBLICACAO.md
git diff --cached --stat
git commit -m "feat(routes): etapa 04 publicacao direta e visibilidade por publico"
git push origin main
```

Nunca adicione `.env`, `.local`, senhas, tokens ou backups de PostgreSQL ao Git.

### Encerramento

Use `Ctrl+C` no terminal do `pnpm dev` e depois, se desejar, pare apenas o PostgreSQL local do projeto:

```powershell
& ".\.local\postgres-runtime\bin\pg_ctl.exe" stop -D ".\.local\postgres-auth\data" -m fast
```

## Limites e observações

- Mudança de visibilidade exige que o **autor já tenha salvo o percurso**. A seleção fica na página de detalhes depois de salvar; não inventamos publicação de um mapa ainda não persistido.
- Histórico de decisões administrativas e arquivamento continuam existindo. Exclusão física definitiva é objeto de outra etapa.
- Migração 038 não remove dados; não execute rollback do esquema sem análise das colunas dependentes.
- O backend e a aplicação precisam ser validados localmente. Este ambiente não tem conexão com seu banco do Windows nem acesso ao seu `node_modules`, portanto não foi executado `pnpm typecheck`, `lint`, `build` nem os testes integrados contra o banco.

## Referência de design

`referencias/planejamento_e_visibilidade.png` mostra o seletor de visibilidade da imagem conceitual. É uma **referência de aparência**, não um componente executável nem dado real. Não copie para `apps/web/public`.
