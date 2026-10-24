# Apex Ride

Plataforma mobile-first para motociclistas: Garagem, registro de Ride por GPS,
telemetria estimada, histórico, replay, rotas, vídeos locais e comunidade.

**Refinamento — Etapa 6:** Garagem premium com catálogo brasileiro inicial
(2 marcas, 3 famílias, 7 versões/ano, todas com fichas parciais e fontes),
cadastro manual e elétrico, registros privados persistentes de manutenção,
odômetro, seguro, documentação e notas. Histórico preserva identidade por Ride.
Veja o [relatório A–R](docs/refinamento/etapa-06-garagem-catalogo.md),
[catálogo e curadoria](docs/catalogo-motos.md) e
[matriz de cobertura](docs/catalogo-cobertura.csv).
Sem deploy, alteração da VPS ou início da Etapa 7.
As descrições anteriores abaixo são históricas.

**Refinamento — Etapa 5:** preparação compacta, painel de pilotagem, diagnóstico
individual de sensores e páginas internas de sessões, circuitos, telemetria,
vídeos e estúdio. Reutiliza coleta, IndexedDB, Histórico e exportação existentes.
Consulte o [relatório A–R](docs/refinamento/etapa-05-ride-telemetria.md).
Homologação física pendente; sem deploy, VPS ou início da Etapa 6.
Ajustes aprovados: Guia único no menu Mais opções, Configurações e Descobertas;
filtros com escolhas curtas em cartões, paginação alinhada e Missões no desempenho.
As descrições das etapas anteriores abaixo preservam seu alcance histórico.

**Refinamento — Etapa 4:** Explorar, mapa real, editor, navegação interna com
GPS compartilhado, GPX e elevação. Implementação local; homologação de
OSRM/MapTiler depende de provedores autorizados configurados. Consulte o
[relatório A–Q](docs/refinamento/etapa-04-explorar-navegacao.md).
Sem deploy ou início da Etapa 5.
Interface Racing Tech com cinco abas: **Início, Explorar, Ride, Comunidade e Garagem**.

**Refinamento — Etapa 1:** `/` apresenta a landing pública; `/entrar` e `/cadastro`
têm telas próprias. O painel começa em `/app` e todas as abas internas exigem
sessão confirmada pelo backend. As demais URLs existentes foram preservadas.
Veja [entrada e acesso autenticado](docs/refinamento/etapa1-acesso.md) para rotas,
validação, recuperação de senha e comportamento após recarga offline.

**Refinamento — Etapa 2:** tokens, controles e cards compartilhados, variantes
semânticas de botão, filtros confortáveis, novos indicadores de inclinação e
navegação com estados reais de Ride. Veja o [relatório do design system](docs/refinamento/etapa-02-design-system.md)
para componentes, capturas, comparação com as referências e testes.

**Refinamento — Etapa 3:** Início com hero, acesso ao Ride, status reais,
moto principal, desempenho por período, atividades recentes e evolução.
Veja o [relatório do dashboard](docs/refinamento/etapa-03-home-dashboard.md)
para origem dos dados, correção do carregamento em desenvolvimento, capturas e testes.
Sem deploy; a Etapa 4 não foi iniciada.

**Candidata avaliada em 23/10/2026 — NO-GO para produção.** A auditoria local e
os testes automatizados não substituem homologação física Android/iPhone,
validação operacional e aprovação do proprietário. Consulte o
[relatório final da Parte 23](docs/parte-23.md) e os
[bloqueios e correções](docs/qa-defeitos.md). Nenhum deploy foi realizado.

## Código e licença

Copyright © 2026 **K1oraN**. Código autoral sob [licença proprietária](LICENSE),
com todos os direitos reservados. Dependências e recursos externos mantêm suas
[licenças e avisos próprios](THIRD_PARTY_NOTICES.md). Disponibilidade do código
no GitHub não concede licença de exploração nem comprova aprovação do produto.

## O que existe

- Contas, sessões por cookie, perfil/privacidade e Garagem com fotos privadas.
- GPS, sessões Passeio/Pista/Misto, sensores opcionais e GPS Assistido com fallback.
- IndexedDB, checkpoints, recuperação de Ride e sincronização retomável/idempotente.
- Rotas/circuitos versionados, Histórico, replay e comparações pessoais autorizadas.
- Gravação de vídeo segmentada e overlay/exportação compatível no próprio aparelho.
- Feed, fotos, seguidores, grupos, eventos e localização temporária consentida.
- XP calculado no servidor, conquistas e rankings voluntários.
- Administração separada em `/admin`, permissões por operação, MFA TOTP e auditoria.

A presença do código não significa homologação de todos os recursos. Inclinação
dinâmica está indisponível; telemetria e voltas são estimativas. GPS, câmera,
armazenamento e exportação dependem do navegador. Não há garantia de coleta
com tela bloqueada ou app suspenso. Consulte [compatibilidade e limites](docs/qa-mobile.md).

## Estrutura

```text
apps/web/             React + TypeScript + Vite, PWA, IndexedDB, MapLibre
apps/api/             Fastify + PostgreSQL/PostGIS, autenticação e módulos
packages/ride-core/   Contratos e cálculos compartilhados
database/            32 migrações, inicialização e referência geográfica
scripts/              Verificações e inventário de licenças
docs/                Manuais, arquitetura, relatórios e licenças de terceiros
```

O [inventário das 23 partes](docs/qa-matriz.md) relaciona código, testes,
correções e pendências. O [histórico das entregas](docs/historico-entregas.md)
preserva os registros anteriores; suas afirmações de escopo são históricas.

## Requisitos

- Node.js **24.16.0 ou superior na linha 24**, pnpm **10.34.7** e Git.
- PostgreSQL **17** com PostGIS **3.6**; Docker Compose v2 é a opção local prevista.
- Chrome instalado para E2E. `pg_dump` e `pg_restore` para o ensaio de recuperação.

As versões estão fixadas no workspace/lockfile. Se pnpm não estiver disponível,
use `corepack pnpm` ou `npx --yes pnpm@10.34.7` no lugar de `pnpm`.

## Instalação local

Na raiz do repositório, com PowerShell:

```powershell
pnpm install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edite `.env`: defina a senha local e a mesma credencial em `DATABASE_URL`,
usando percent-encoding quando necessário. O exemplo contém apenas valores
locais. **Não versione `.env`, dumps, dados pessoais, vídeos ou segredos.**

```powershell
pnpm db:up
pnpm db:migrate
pnpm dev
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:3001/api/health
- Banco/PostGIS: http://127.0.0.1:3001/api/health/db
- Diagnóstico web: `/tecnico`; administração: `/admin`.

Use a mesma origem para cookies, CSRF e links de conta. O proxy Vite encaminha
`/api` ao backend. `pnpm dev:web` e `pnpm dev:api` permitem terminais separados.
`pnpm db:check` exige API e banco ativos. `pnpm db:down` preserva o volume.

Não existe conta administrativa padrão. Configure `ADMIN_MFA_KEY` exclusivamente
no servidor e siga o [provisionamento restrito](docs/admin-provisionamento.md).
SMTP de teste não envia mensagens externas. A produção exige SMTP real e
versões finais dos documentos operacionais.

## Verificação

```powershell
pnpm check
pnpm test:postgres
pnpm --filter @apex-ride/web test:e2e
pnpm test:recovery
pnpm audit --json
```

Execute as rodadas de banco, E2E e recuperação **sequencialmente**, em banco
exclusivo de homologação. `TEST_DATABASE_URL` separa os testes; sem ela, os
runners antigos usam a conexão local configurada. `check` executa tipos, lint,
formatação, testes padrão e build. Testes PostgreSQL ignorados na suíte padrão
precisam do runner separado; não são marcados como aprovados por terem sido ignorados.

E2E usa esquemas temporários e API real com fixtures sintéticas; GPS, sensores,
mapas e câmera são controlados nos cenários indicados. Não representam testes
físicos. O [relatório](docs/parte-23.md) registra os resultados reais, inclusive
falhas iniciais e repetições.

O ensaio `test:recovery` cria dois bancos temporários **somente em loopback**,
restaura dump e mídia sintética e compara dados e autorização. Precisa de
CREATE DATABASE; configure `PG_BIN_DIR` se os executáveis não estiverem no PATH.
Nunca use a conexão de produção. Consulte o [procedimento operacional](docs/qa-operacao.md).

## Uso e documentação

Crie conta, cadastre a moto, entre em Ride e autorize GPS. Sensores e câmera
são opcionais. Inicie, pause/retome, finalize e revise antes de salvar ou
descartar. “Salvo no aparelho” e “Sincronizado” são confirmações diferentes.
Abra Histórico para detalhes, replay e compartilhamento explícito.

- [Autenticação](docs/autenticacao.md), [Garagem](docs/garagem.md), [sessões](docs/sessoes.md).
- [GPS](docs/gps.md), [sensores](docs/sensores.md), [GPS Assistido](docs/gps-assistido.md), [telemetria](docs/telemetria-avancada.md).
- [Offline](docs/offline.md), [rotas](docs/rotas.md), [Histórico](docs/historico.md), [replay](docs/replay.md).
- [Comparações](docs/comparacoes.md), [trajetos semelhantes](docs/trajetos-semelhantes.md).
- [Vídeos](docs/videos.md), [overlay e exportação](docs/video-overlay.md).
- [Comunidade](docs/comunidade.md), [grupos](docs/grupos.md), [eventos/GPS social](docs/eventos.md), [gamificação](docs/gamificacao.md).
- [Permissões administrativas](docs/admin-matriz.md), [moderação](docs/admin-moderacao.md), [incidentes](docs/admin-incidentes.md).
- [Arquitetura](docs/architecture.md), [progresso](docs/progresso.md), [migrações](database/migrations/README.md).

## Build e operação

```powershell
pnpm build
pnpm --filter @apex-ride/api start
pnpm --filter @apex-ride/web preview
```

Saídas: `apps/api/dist` e `apps/web/dist`. O preview local encaminha `/api` e não
substitui a hospedagem definitiva. O Service Worker é gerado no build, usa cache
apenas do shell e aguarda fechamento das abas antigas para atualizar. Vídeos e
exports permanecem locais; fotos do servidor exigem volume privado persistente.

HTTPS, certificados, proxy, CSP, SMTP, mapas/OSRM, backup agendado, retenção,
alertas e rollback de produção precisam de validação. Consulte o
[checklist operacional e de recuperação](docs/qa-operacao.md). Enviar o código
ao GitHub não publica a aplicação nem autoriza mudança de DNS ou banco real.
