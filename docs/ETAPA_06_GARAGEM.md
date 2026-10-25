# Apex Ride — Etapa 06: Garagem premium e exclusão de motos

Base consultada: `K1oraN/ApexRide`, `main`, commit `6171df6781703543b4c0c39ae3f9b8261b6a4772`, 25/10/2026.

## O que mudou

- Estilos escuros/vermelhos, cards com proporções estáveis, seletor horizontal de motos, hero de foto do próprio usuário.
- Ficha técnica compacta existente (sem preencher dados ausentes e sem usar especificações de outras versões).
- Quatro resumos reais e privados: manutenção, seguro, documentos e anotações. Dados são lidos das APIs já existentes `GET /motorcycles/:id/records`; vencimentos são somente os declarados pelo usuário.
- Separação explícita entre **Arquivar** (`DELETE /motorcycles/:id`, legado) e **Excluir definitivamente** (`DELETE /motorcycles/:id/permanent`, novo).
- Exclusão definitiva: permissão do dono, transação com bloqueio de usuário, recusa se há *qualquer* Ride vinculado, exclusão de revisões e registros privados e de identidades históricas, limpeza assíncrona de fotos, conservação de publicações sociais (FK nula quando necessário). Se existir outra FK não prevista, o banco interrompe a transação em vez de apagar o restante.

**Limite importante:** caso a moto tenha atividades Ride, a exclusão permanente devolve 409; use Arquivar para escondê-la sem perder o histórico. Não houve nova migração do banco. Ainda não incluí limpeza permanente de posts, das atividades Ride ou de todos os registros do perfil — essa parte pertence às entregas específicas de exclusões.

**Imagens:** `referencias/garagem_cb650r_conceito.png` é somente uma ideia visual, *não* é foto de uma moto pertencente ao usuário. A interface exibe a fotografia real do cadastro ou um substituto neutro.

## Instalar

1. Faça backup do código e da base local antes de modificar comportamento de exclusão.
2. Extraia e copie `apps`, `scripts` e `docs` para `D:\Projetos\ApexRide`. **Não copie** `referencias` para `public/assets`.
3. Execute na raiz: `node .\scripts\aplicar-etapa-06.mjs`. O instalador adiciona o registro do novo endpoint a `apps/api/src/modules/motorcycles/routes.ts`; o arquivo anterior recebe backup `.before-etapa-06-*.bak`. Ele para se os pontos de inserção forem diferentes, sem modificar nada.
4. Formate e valide:

```powershell
cd D:\Projetos\ApexRide
node .\scripts\aplicar-etapa-06.mjs
pnpm exec prettier --write apps/web/src/garage/GaragePremium.tsx apps/web/src/garage/GarageOverview.tsx apps/web/src/pages/GaragePage.tsx apps/web/src/services/motorcycles.ts apps/web/src/styles/apex-stage-06.css apps/api/src/modules/motorcycles/permanent-delete.ts apps/api/src/modules/motorcycles/routes.ts
pnpm typecheck
pnpm lint
pnpm build
```

## Iniciar seu ambiente original (sem Docker)

```powershell
cd D:\Projetos\ApexRide
& ".\.local\postgres-runtime\bin\pg_ctl.exe" start -D ".\.local\postgres-auth\data" -l ".\.local\postgres-auth\server.log" -o "-p 55432 -h 127.0.0.1"
pnpm db:migrate
pnpm dev
```

Se o banco já estiver ligado, não repita o comando `pg_ctl start`. Acesse http://127.0.0.1:5173/garagem. Pare o app com Ctrl+C e, quando quiser encerrar o banco:

```powershell
& ".\.local\postgres-runtime\bin\pg_ctl.exe" stop -D ".\.local\postgres-auth\data" -m fast
```

## Checklist manual antes de enviar ao GitHub

1. Verifique `/garagem` no desktop e no modo F12 para 390 px e 320 px. Selecione mais de uma moto; foto e os 4 indicadores devem mudar para a selecionada.
2. Use uma moto com catálogo para verificar a ficha; outra sem catálogo não deve ganhar potência/torque inventados.
3. Adicione um registro de manutenção, documento, seguro e anotação no detalhe; volte para `/garagem` e veja os resumos. Confira que outro usuário não pode carregar esses dados.
4. Arquive uma moto de teste: ela deve sumir da lista ativa e aparecer em Arquivadas.
5. Crie uma moto **de teste sem Ride**, selecione `Excluir definitivamente`, confirme e verifique que deixa de aparecer até na área Arquivadas e que a API `GET /motorcycles/:id` retorna 404.
6. Para moto com Ride, exclusão permanente deve retornar **409** sem perder dados; arquivar permanece disponível.
7. Revise os registros de logs da API e erros no DevTools (F12). Não teste com a única moto valiosa sem backup.

## Subir para o GitHub após passar nos testes

```powershell
git status
git add apps/web/src/garage/GaragePremium.tsx apps/web/src/garage/GarageOverview.tsx apps/web/src/pages/GaragePage.tsx apps/web/src/services/motorcycles.ts apps/web/src/styles/apex-stage-06.css
git add apps/api/src/modules/motorcycles/routes.ts apps/api/src/modules/motorcycles/permanent-delete.ts scripts/aplicar-etapa-06.mjs docs/ETAPA_06_GARAGEM.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(garage): etapa 06 garagem premium e exclusao definitiva protegida"
git push origin main
```

Não adicione `.env`, `.local`, senhas ou dumps ao GitHub. Os backups `.bak` não são para commit.

## Validação desta entrega

Código do ZIP foi preparado com base no estado remoto mencionado. Sintaxe TypeScript/TSX, CSS e instalador local inspecionados em ferramenta de parsing. Sem acesso ao seu PostgreSQL e sem executarmos o build real do monorepo, a conclusão funcional requer a checklist acima. Não há novo SQL de migração.
