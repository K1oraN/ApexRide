# Apex Ride — Etapa 03 · Explorar e Planejar Rotas

Origem consultada: `K1oraN/ApexRide`, branch `main`, commit `4cab7fba640480de47dd2634240fb25938520c85`.

## Alterações incluídas

- Busca de endereços modernizada: resultado clicável, estado de carregamento, ações Buscar e Limpar evidentes, coordenadas em painel expansível.
- Exibição das condições reais dos provedores de geocodificação e roteamento no planejamento. Não finge que o serviço está disponível.
- CSS refinado para página Explorar, mapas, categorias, criação de rotas, planejador de navegação, pontos intermediários e filtros.
- Script PowerShell **opcional** para configurar o ambiente de desenvolvimento sem alterar `DATABASE_URL`, contas ou tabelas.

## Instalar: arquivos COMPLETOS

Copie mantendo a estrutura abaixo:

```
D:\Projetos\ApexRide\apps\web\src\routes\DestinationSearch.tsx
D:\Projetos\ApexRide\apps\web\src\styles\apex-stage-03.css
D:\Projetos\ApexRide\scripts\configurar-rotas-local.ps1
D:\Projetos\ApexRide\docs\ETAPA_03_EXPLORAR_E_ROTAS.md
```

A pasta `referencias/` é apenas material visual e não precisa ser copiada ao projeto.

## Configurar a busca de endereços

A API implementa MapTiler e exige duas variáveis no `.env` do projeto:

```
GEOCODING_MAPTILER_KEY=<sua chave pessoal adquirida no MapTiler>
GEOCODING_AUTHORIZED=true
```

Obtenha uma chave própria autorizada em https://www.maptiler.com/cloud/ e respeite o plano/licença. **Nunca cole sua chave em conversa nem envie `.env` para GitHub.**

Depois de inserir a chave manualmente no `.env`, pode ativar a flag com:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-rotas-local.ps1 -AtivarMapTilerSeHouverChave
```

Se não houver chave válida, a busca continuará indisponível. Seleção pelo mapa e coordenadas seguem possíveis. Não utilize APIs públicas alternativas sem aprovar suas políticas de uso.

## Configurar itinerário pelas ruas / instruções

O servidor já implementa `/api/routes/directions` e `/api/routes/calculate`, mas `ROUTING_OSRM_URL` precisa apontar para um roteador acessível. O serviço demonstrativo OSRM é **apenas para testes manuais ocasionais**; pode apresentar indisponibilidade e limitações, e não é indicado como infraestrutura de produção. O fornecedor recebe as coordenadas da consulta.

Ative explicitamente apenas no seu computador:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-rotas-local.ps1 -UsarOsrmDemo
```

Isso configura `ROUTING_OSRM_URL=https://router.project-osrm.org` e `ROUTING_OSRM_PROFILE=driving`, sem alterar a porta PostgreSQL. A API do projeto já rejeita esse host na configuração de produção. Uma rota demonstrativa **não garante** resposta nem substitui uma solução com capacidade/contrato para uso real.

Para usar os dois serviços, configure a chave MapTiler antes e depois execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\configurar-rotas-local.ps1 -UsarOsrmDemo -AtivarMapTilerSeHouverChave
```

Leia a política do demo OSRM: https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy

Em produção, use um serviço OSRM sob seu controle ou um provedor comercial com limites e disponibilidade contratados. Não há Docker nesta configuração local do Apex Ride.

## Testar na instalação local existente

```powershell
cd D:\Projetos\ApexRide
& ".\.local\postgres-runtime\bin\pg_ctl.exe" start -D ".\.local\postgres-auth\data" -l ".\.local\postgres-auth\server.log" -o "-p 55432 -h 127.0.0.1"
pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

Se o banco já estiver iniciado, não rode `pg_ctl start` novamente. Execute `pnpm dev` em terminal mantido aberto. Navegador:

- http://127.0.0.1:5173/explorar (mapa, categorias e ações)
- http://127.0.0.1:5173/explorar?tab=destinations (buscar destino)
- http://127.0.0.1:5173/explorar/navegar (pontos, cálculo e instruções)
- http://127.0.0.1:5173/explorar/novo (editor do percurso)

Em **F12 / dispositivo móvel**, confira 360, 390, 430, 768 e 1280 px. Adicione dois pontos por coordenadas ou pesquisa. Se serviços estiverem ativos e acessíveis, solicite cálculo e acompanhe o resultado e instruções; não confunda sucesso da API com precisão rodoviária garantida.

Para interromper, use `Ctrl+C` e, caso deseje, pare o banco:

```powershell
& ".\.local\postgres-runtime\bin\pg_ctl.exe" stop -D ".\.local\postgres-auth\data" -m fast
```

## Subir ao GitHub após testar

```powershell
cd D:\Projetos\ApexRide
git status
git add apps/web/src/routes/DestinationSearch.tsx apps/web/src/styles/apex-stage-03.css scripts/configurar-rotas-local.ps1 docs/ETAPA_03_EXPLORAR_E_ROTAS.md
git diff --cached --stat
git commit -m "feat(explore): etapa 03 melhora mapa busca e planejamento"
git push origin main
```

Não envie `.env`, `.local`, logs ou senhas. Na próxima etapa, ler o HEAD atualizado do repositório antes de trabalhar.

## Limitações deliberadas

- Esta etapa **não remove a aprovação de administrador** para publicação nem cria públicos privados/amigos/grupos (planejado para a Etapa 04, com migração e regras de autorização).
- Não altera a geometria das rotas nem os registros existentes; não acrescenta migrações.
- Sem chave MapTiler e serviço OSRM configurado e acessível, não há como afirmar que `503` estará corrigido; os avisos de indisponibilidade continuam corretos.
- UI não controla a disponibilidade de serviços externos. Não foram executados testes reais com o banco local Windows nem com credenciais privadas.
