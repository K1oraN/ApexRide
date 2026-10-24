# Inventário e matriz de rastreabilidade — 23 partes

Auditoria de 23/10/2026 sobre o código presente, sem assumir conclusão a partir
dos prompts antigos. A aprovação abaixo é **local/automatizada e delimitada**;
nenhuma linha representa homologação física ou liberação operacional.
Resultados consolidados e exceções: [relatório final](parte-23.md).

## Estrutura realmente encontrada

| Área                   | Implementação                                           | Verificação / contrato                                                                     |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Workspace              | pnpm 10.34.7, Node 24.16.0, TypeScript, ESLint/Prettier | Lockfile congelado, scripts reais `check`, `test:postgres`, E2E                            |
| Web                    | `apps/web`, React/Vite, React Router, CSS Racing Tech   | Providers Auth/Garage/Ride/Live, lazy loading e cinco abas                                 |
| API                    | `apps/api`, Fastify, pg, cookies, SMTP, sharp, TOTP     | `buildApp`, injeção HTTP, contratos compartilhados e DTOs protegidos                       |
| Compartilhado          | `packages/ride-core`                                    | Sessões, motion, speed, modes, telemetry, routes, charts, history, comparison              |
| Banco                  | PostgreSQL 17/PostGIS, 32 SQLs numerados                | `schema_migrations`, SHA-256, advisory lock e transação; 93 tabelas de aplicação no ensaio |
| Persistência local     | IndexedDB e repositórios de Ride/vídeo/overlay          | Checkpoints, lease, recuperação, isolamento por proprietário, filas retomáveis             |
| PWA                    | Manifest, favicon SVG, gerador de Service Worker        | Cache allowlist do shell; sem APIs/mídias/tiles; atualização sem skipWaiting               |
| Armazenamento servidor | `LocalPhotoStorage` e pasta social privada              | Reencodificação e autorização por leitura; volume deve ser persistente                     |
| Integrações externas   | SMTP, estilo/tiles OpenFreeMap, OSRM, referência IBGE   | Configuráveis/explicitamente limitadas; operação de produção não verificada                |
| Infraestrutura         | `compose.yaml`, healthchecks e scripts                  | Compose inspecionado, sem execução Docker nesta rodada; sem CI remoto/deploy               |
| Testes                 | Vitest API/web, 12 suítes PostgreSQL, Playwright        | Fixtures sintéticas e esquemas isolados; hardware simulado identificado                    |
| Artefatos anteriores   | `docs/parte-01.md` a `parte-22.md`, manuais e progresso | Registros históricos preservados; não substituem os resultados desta auditoria             |

O repositório não tinha commits nem remoto configurado no início desta etapa.
Arquivos existentes foram preservados; não houve reestruturação do monorepo,
troca de framework nem migração de produto criada na Parte 23.

## Matriz das 23 partes

`PG` significa testes com PostgreSQL/PostGIS reais, não mock. Nomes de teste
abaixo são relativos a `apps/api/test` ou `apps/web/e2e`; testes web unitários
ficam junto do código em `apps/web/src`.

| Parte | Módulo / código                                            | Estado atual                   | Testes realizados                                                   | Problemas encontrados                                                         | Resolvidos na 23                            | Pendências                                           | Aprovação                            |
| ----- | ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| 01    | Fundação: workspace, `api/app.ts`, `config`, `database.ts` | Implementado                   | Install congelado, tipos/lint/build, health/env, PG                 | CORS HTTP aceito em produção; correlação ausente                              | QA-01/02/08/08                              | Infra HTTPS/CI e readiness operacional               | Local delimitada                     |
| 02    | Design: `Layout`, `styles`, mapas/telemetry                | Implementado com correções     | `interface.spec.ts`, screenshots em sete larguras, `qa.spec.ts`     | Home exibia números fictícios; aviso histórico; fallback com texto corrompido | QA-03/04                                    | Referências originais e auditoria assistiva completa | Sem aprovação visual integral        |
| 03    | Autenticação: `modules/auth`, `auth/`, páginas de conta    | Implementado                   | auth/env unitários, `auth.postgres`, `auth.spec`                    | Sem nova falha funcional confirmada                                           | Headers/CORS transversais                   | SMTP real, jurídico, proxy/cookies HTTPS             | Automatizada                         |
| 04    | Garagem: `modules/motorcycles`, `garage/`                  | Implementado                   | Fotos/validação, `motorcycles.postgres`, `garage.spec`, recuperação | Sem nova falha confirmada                                                     | Recuperação comprova acesso pós-restore     | Aparelhos reais, volume/backup operacional           | Automatizada                         |
| 05    | GPS: `services/gps`, mapas e velocímetro                   | Limitado por dispositivo       | GPS/controller/map unitários, `gps.spec`, `rides.spec`              | Sem medição física nesta rodada                                               | Home sem velocidade inventada               | GPS real, consumo, precisão/suspensão                | Simulação aprovada; físico pendente  |
| 06    | Ride: `ride/`, `modules/rides`, `ride-core`                | Implementado                   | Controller/cálculo, `rides.postgres`, `rides.spec`, recovery        | Nenhuma perda silenciosa confirmada nos cenários                              | Restore valida Ride privado                 | Longa duração e interrupções físicas                 | Automatizada                         |
| 07    | Sensores: `services/motion`, `ride-core/motion`            | Parcial / limitado             | Motion/calibração unitários e sensores E2E                          | Inclinação dinâmica intencionalmente indisponível                             | Não criado valor fictício                   | Montagem e calibração físicas                        | Sem homologação física               |
| 08    | Assistido: `services/speed`, `ride-core/speed`             | Limitado por dispositivo       | Speed/fallback/estado unitários e E2E Ride                          | Estimativa não certificada                                                    | Nenhuma alteração algorítmica               | GPS/sensores reais e perdas de sinal                 | Simulação delimitada                 |
| 09    | Modos/telemetria: `ride-core/modes`, `telemetry`           | Implementado com limites       | API telemetry/motion, unitários e E2E                               | Inclinação indisponível; eventos/voltas estimados                             | Nenhuma ampliação artificial                | Homologação técnica de pista/hardware                | Automatizada delimitada              |
| 10    | Offline: `offline/`, `sync-routes`, SW                     | Implementado                   | IndexedDB/sync unitários, PG Rides/history, `offline.spec`          | Dependência de quota/evicção do navegador                                     | Nenhuma perda nova confirmada               | Upgrades com dados antigos, PWA real e quota física  | Automatizada nos cenários executados |
| 11    | Rotas/circuitos: `modules/routes`, UI e `ride-core/routes` | Implementado com dependência   | Rotas/routing unitários, `routes.postgres`, `routes.spec`           | Provedor OSRM produtivo não configurado                                       | Nenhuma rota falsa introduzida              | OSRM real, mapas, critérios de circuito              | Local; integração externa pendente   |
| 12    | Histórico: `modules/rides/history*`, `history/`            | Implementado                   | `history.postgres`, `history.spec`, unitários                       | Exclusão lógica não é expurgo                                                 | Sem alteração de retenção                   | Política de expurgo/backup e dispositivos            | Automatizada                         |
| 13    | Replay: `replay/`, backend paginado                        | Implementado                   | Replay unitário, `replay.spec`, `replay-long.spec` (50 mil pontos)  | Limites físicos não medidos                                                   | Sem alteração temporal                      | Memória/bateria em celular                           | Automatizada desktop                 |
| 14    | Comparação: `modules/comparisons`, `comparison/`           | Implementado                   | Comparison unitários, PG, `comparison.spec`                         | Circuitos pessoais estimados                                                  | Sem liberação de dados brutos               | Validação física e circuito homologado               | Automatizada delimitada              |
| 15    | Similaridade: `modules/similarity`, PostGIS                | Implementado                   | Similarity unitários, PG, `similarity.spec`                         | Timeouts iniciais sob contenção local                                         | Repetição isolada e fechamento PG aprovados | Volume real e índices/planos com carga-alvo          | Automatizada; escala pendente        |
| 16    | Vídeo: `video/`, IndexedDB                                 | Limitado por navegador         | Capture/repository unitários e `video.spec`                         | Suporte a câmera/codec/quota varia                                            | Sem sucesso fictício adicionado             | Câmeras Android/iPhone, duração/evicção              | Desktop automatizado                 |
| 17    | Overlay/export: `video/overlay`                            | Limitado por navegador         | Relógio/render/export/repository e `video-overlay.spec`             | Export em tempo real; limites de memória                                      | Originais preservados                       | Codecs/áudio/1080p em aparelhos                      | Desktop automatizado                 |
| 18    | Comunidade: `modules/social`, `social/`                    | Implementado                   | PG social, unitários, `social.spec`                                 | Três timeouts iniciais sob contenção                                          | Repetição isolada e fechamento PG aprovados | Retenção/jurídico/storage real                       | Automatizada; escala pendente        |
| 19    | Grupos: `modules/groups`, `groups/`                        | Implementado                   | `groups.postgres`, `groups.spec`, policies                          | Sem nova quebra de autorização confirmada                                     | Nenhuma reescrita                           | Escala/uso físico                                    | Automatizada                         |
| 20    | Eventos/social: `modules/events`, `events/`                | Implementado                   | Events/live unitários, PG, `events.spec`                            | E2E recarregava outra conta antes da confirmação                              | QA-05: aguardar resposta de cancelamento    | GPS e revogação em dispositivos reais                | Automatizada delimitada              |
| 21    | XP/rankings: `modules/gamification`, `gamification/`       | Implementado                   | Rules unitários, `gamification.postgres`, E2E                       | Escala produtiva não comprovada                                               | Sem novo XP arbitrário                      | Operação de jobs, capacidade e aceites               | Automatizada                         |
| 22    | Admin: `modules/admin`, `admin/`                           | Implementado                   | Policies/MFA unitários, `admin.postgres`, `admin.spec`              | Recuperação operacional, retenção/arquivo pendentes                           | Correlação HTTP transversal                 | Pentest, chave/recuperação, retenção e domínio       | Automatizada; operação pendente      |
| 23    | QA final: runners, documentos e evidências                 | Processo de auditoria entregue | Check, PG, Chrome, audit, recovery e inspeção                       | Bloqueios operacionais/físicos                                                | Correções pequenas e regressões registradas | Go/No-Go depende dos bloqueios                       | **NO-GO para produção**              |

## Contratos e superfícies auditadas

| Família API                             | Controle esperado / evidência                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/auth/*`, `/users/me/*`                | Sessão em cookie, CSRF/origem em escrita, validação, rate limit, revogação e privacidade                |
| `/motorcycles/*`, fotografias           | Proprietário em CRUD, foto privada revalidada, sem acesso estático ao volume                            |
| `/rides/*`, sync/history/replay         | Propriedade, client ID estável, tombstone, lotes idempotentes e telemetria validada/recalculada         |
| Resumo público de Ride                  | DTO separado, sem coordenadas brutas, perfil/atividade públicos reavaliados                             |
| Rotas/circuitos/comparação/similaridade | Versão imutável/referenciada, políticas por recurso, consentimento/agregados mínimos, sem trilha alheia |
| `/social/*`, `/groups/*`                | Bloqueios, relações e membership por consulta; mídia sob a mesma autorização                            |
| `/events/*`, live-location              | Participação/público, consentimento separado, prazo/TTL, revogação e sem backlog de posições            |
| Gamificação/rankings                    | Cálculo de servidor, ledger/transação, idempotência e opt-in                                            |
| `/admin/*`, moderação/recursos          | Sessão privilegiada/MFA, RBAC por ação, autorização transacional e auditoria                            |

Vídeos/exports não têm endpoint de upload no backend encontrado; são locais e
isolados por conta no navegador. Administração não recebe acesso geral a eles.
Esquema, enums, permissões e campos são documentados nos manuais de cada parte;
os testes PG exercitam acessos diretos com contas distintas, sem confiar nos botões.

## Distinções e divergências

- Código presente não é aprovação de hardware nem de operação. Documentos antigos
  usavam “concluído” para a entrega local; esta matriz explicita seu alcance.
- Inclinação dinâmica e certificação esportiva não foram entregues; não foram
  simuladas para preencher a matriz. GPS e G seguem estimados conforme qualidade.
- Há componentes de demonstração antigos sem uso nos fluxos reais; a Home tinha
  dependência ativa de `demoTelemetry`, removida na Parte 23. Fotografias e terreno
  ilustrativos permanecem identificados, sem simular conteúdo social real.
- A matriz de dispositivos reais, referências visuais originais, migração de
  IndexedDB com bases antigas e configuração de produção permanecem pendentes.
- O ensaio de backup cobriu banco novo, reaplicação com dados e restauração. Não
  reencenou todos os históricos de upgrade 01→22 nem rollback de produção.
