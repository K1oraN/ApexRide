# Parte 22 — Administração, moderação e segurança

Data da entrega: **23/10/2026**, fuso de referência America/Sao_Paulo.
Escopo exclusivo da Parte 22. Sem deploy, domínio novo ou implementação da Parte 23.

## A. Funcionalidades implementadas

Área interna `/admin`, carregada separadamente do layout do motociclista, com
sidebar, dashboard, busca/paginação de contas, fila de denúncias, evidência por
caso, decisões, sanções, recursos, grupos, eventos, rotas, circuitos, revisão de
XP/conquistas/rankings, aprovações, operadores, matriz, auditoria, segurança,
incidentes, solicitações de privacidade e configuração versionada de orientação
ao usuário. O painel usa tokens/componentes Racing Tech existentes. As cinco abas
e o botão Ride permanecem no layout principal; não há sexta aba administrativa.

O backend aplica as decisões aos domínios existentes. Não há conteúdo nem métricas
demonstrativas no painel. O processo de primeiro acesso não cria usuários reais
ou credenciais por conta própria.

## B. Arquivos

| Grupo de arquivos                                                                                                     | Função                                                                                   |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/api/src/modules/admin/policy.ts`, `context.ts`, `validation.ts`                                                 | Matriz persistida, autorização, revalidação transacional, limites, auditoria e validação |
| `admin/mfa.ts`, `auth-routes.ts`, `apps/api/src/admin-cli.ts`                                                         | TOTP, cifragem, recuperação, sessão privilegiada e bootstrap interativo                  |
| `admin/content.ts`, `moderation-routes.ts`, `user-routes.ts`, `appeal-routes.ts`, `decision.ts`                       | Moderação proporcional, evidências, medidas e comunicação/revisão                        |
| `admin/platform-routes.ts`                                                                                            | Grupos, eventos e revisão geográfica delimitada                                          |
| `admin/integrity-routes.ts`, `ranking-routes.ts`                                                                      | Ledger, anomalias, conquistas, temporadas, entradas e resultados experimentais           |
| `admin/security-routes.ts`, `operations-routes.ts`, `routes.ts`                                                       | Aprovações, operadores, auditoria, indicadores, privacidade e incidentes                 |
| `admin/sanctions.ts`, autenticação, social, eventos, rotas e gamificação existentes                                   | Aplicação das medidas e das decisões nos serviços comuns                                 |
| `apps/api/src/app.ts`, `config/env.ts`, manifests e lockfile, `.env.example`                                          | Registro dos módulos, configuração MFA e dependência OTPAuth fixada                      |
| `database/migrations/026_*` a `032_*`                                                                                 | Migrações administrativas aditivas                                                       |
| `apps/web/src/admin/AdminPage.tsx`, `AdminAuth.tsx`, `Dashboard.tsx`                                                  | Acesso protegido, MFA e dashboard                                                        |
| `admin/Workspace.tsx`, `actions.ts`, `ActionForm.tsx`, `RankingDetails.tsx`, `service.ts`, `admin.css`                | Tabelas, evidência, ações com revisão, leitura de resultados e estilos responsivos       |
| `admin/MyCases.tsx`, `App.tsx`, `AccountPage.tsx`, `ExplorePage.tsx`, `RoutePages.tsx`, serviços web                  | Avisos/recursos do titular e entradas autorizadas; caminho antigo encaminha ao painel    |
| `apps/web/vite.config.ts`                                                                                             | Cabeçalhos de proteção do `/admin` no preview de homologação                             |
| `apps/api/test/admin.test.ts`, `admin.postgres.test.ts`                                                               | Primitivas, matriz, APIs reais, privacidade, concorrência e transações                   |
| Fixtures de auth/gamificação/social/rotas, runners PostgreSQL/Chrome e `apps/web/e2e/admin.spec.ts`, `routes.spec.ts` | Compatibilidade das fixtures com as novas FKs/proteções e validação do painel            |
| `docs/admin-*.md`, README, progresso e README de migrações                                                            | Matriz, provisionamento/recuperação, operação, incidentes e homologação                  |

## C. Arquitetura de acesso

Seis papéis iniciais, permissões explícitas por operação, negação por padrão e
revogação consultada em fonte confiável. O perfil administrativo é um DTO mínimo,
separado do perfil privado. Autorização é obrigatória em todas as APIs do painel,
inclusive nas rotas antigas de moderação. A lista `route_moderators` não concede
acesso adicional. O servidor não aceita `isAdmin`, papel ou ator do payload como
identidade do operador.

Permissões específicas do domínio são verificadas novamente durante decisões
transacionais. Escritas administrativas curtas usam advisory lock separado do
Ride; decisões de conta e XP também usam os locks de usuário do domínio. A
serialização administrativa prioriza consistência nesta versão e deve ser medida
sob carga antes de produção. A [matriz completa](admin-matriz.md) descreve as
restrições contextuais e a segunda aprovação de acesso.

O servidor limita a duas requisições administrativas simultâneas por processo,
sem fila de espera no limite. O excedente recebe 429 com orientação de retentativa;
as requisições comuns de Ride não entram nesse limite. Consultas ao banco mantêm
timeout e índices/paginação. Isso reduz disputa pelo pool existente, sem substituir
o ensaio de carga e a observabilidade previstos para homologação.

## D. Autenticação

Cookie HttpOnly e CSRF da Parte 03, sem senha paralela. MFA TOTP por OTPAuth 9.4.1;
segredo cifrado AES-256-GCM com AAD da conta, códigos de recuperação hasheados e
de uso único, contador antirreplay, limite persistido de tentativas e e-mail
verificado obrigatório. Sessão privilegiada de 30 minutos, ligada à sessão comum;
operações críticas exigem autenticação reforçada nos últimos cinco minutos.

Logout comum, senha alterada, perda de papel, expiração e revogação impedem uso
privilegiado. O painel limpa o estado em negação, troca de conta/aba oculta e
reconsulta permissões periodicamente. Não persiste dados administrativos no
IndexedDB/localStorage. O service worker continua excluindo `/api/` do cache.

Configurar `ADMIN_MFA_KEY` e provisionar uma conta verificada são passos reais
do operador, conforme [procedimento](admin-provisionamento.md). Ausência de chave
impede inscrição de MFA; não há fallback inseguro. Nenhum administrador real foi
provisionado por esta entrega.

## E. Dashboard e métricas

Contas cadastradas; novas e ativas no período; publicações; grupos ativos; eventos
programados; rotas/circuitos pendentes; denúncias abertas/prioritárias; casos em
análise; jobs/anomalias de XP; pedidos de privacidade; incidentes; número agregado
de sessões sociais. Ativo significa uso autenticado de sessão no período, com
granularidade de atualização de até cinco minutos; não significa online.

Hoje, sete dias, 30 dias ou período personalizado de até 93 dias. Novos/ativos
usam o período; inventário e filas representam o estado atual, identificados na
interface. A API agrega no PostgreSQL e não faz consultas a cada renderização.
O gráfico diário de novas contas usa contagens persistidas no mesmo intervalo,
com dias em America/Sao_Paulo e descrição acessível dos valores.
Carregamento, ausência, erro e indisponibilidade têm estados próprios. Há timeout
de consulta e respostas privadas sem cache; não foi acrescentado cache de métricas.

## F. Moderação

Denúncias anteriores recebem casos por backfill; novas são projetadas por trigger.
Posts, comentários, fotografias, perfis, grupos, membros, eventos e percursos
públicos são reportáveis. Moderadores veem casos próprios e metadados da fila
sem responsável; supervisores podem designar outros revisores. Abertura de
evidência e leitura de mídia são auditadas. Nenhum DTO do caso inclui denunciante.

Decisões fundamentadas, versão otimista, lock transacional, identificador único
de operação e reabertura. Ocultar/remover/restaurar muda visibilidade pelos
serviços sociais e pelos guardas de conteúdo. Fotografias e miniaturas passam
pela autorização a cada acesso, inclusive com URL antiga. React renderiza textos
como texto; não existe HTML arbitrário executável na revisão. Fotos continuam
reencodificadas e sem EXIF pelo pipeline anterior.

## G. Usuários e sanções

Busca paginada por usuário, nome e ID; somente identidade pública mínima, estado,
verificação e histórico de medidas. Advertência, restrição temporária por
publicações/comentários/grupos/eventos/rankings/GPS social e suspensão de conta.
Política, motivo, responsável, início, prazo, caso e operação ficam registrados.
Restaurar revoga a medida; não reativa tokens revogados.

O estado original `active/disabled` é preservado; restrições e suspensões são
medidas com vigência própria, sem misturar denúncia com conta. Expiram no servidor.
O DTO/tabela administrativa apresenta também o estado efetivo derivado: ativa,
restrita, suspensa temporariamente ou suspensa por prazo indeterminado.
O principal comum verifica os escopos e os domínios têm guardas contra corrida
de publicação versus sanção. Posts em grupos também são bloqueados. Suspensão
revoga sessões e consentimentos; novo login permite somente os canais necessários
de medidas/recursos/privacidade enquanto as demais funções permanecem restritas.

## H. Grupos e eventos

Metadados operacionais sem participantes privados, feeds privados completos ou
transferência automática de propriedade. Suspensão/arquivamento de grupo preserva
relações e usa os estados do domínio. Eventos podem sair da descoberta ou ser
cancelados; ações globais geram decisão consultável pelo responsável. Publicação
e restauração não reescrevem descrições de terceiros.

## I. GPS social

Cancelamento de evento, suspensão pertinente, perda de cargo ou revogação de
sessão invalidam consentimentos e removem posições pelo mecanismo existente,
com reforço transacional por trigger. O painel recebe somente quantidade
agregada e referências necessárias para revogação; não recebe coordenadas,
mapa global, histórico de trajetos ou ativação de localização de terceiros.

## J. Rotas e circuitos

O revisor consulta somente representações submetidas (`pending/approved`), nunca
rascunhos privados alheios. Usa mapa existente, versão, descrição, geometria,
linha e sentido. Aprovar/rejeitar/arquivar reutiliza as decisões e versões da
Parte 11. Rejeição fundamentada pode pedir correções e nova submissão.

Verificação esportiva exige autorização adicional, circuito aprovado, validação
do domínio, área fechada confirmada e evidência mínima registrada. A evidência
precisa de revisão humana responsável; o software não certifica uma instalação
por nome ou checkbox. Suspender verificação invalida a elegibilidade atual e
aciona a fila de reprocessamento, preservando os históricos privados.

## K. XP, conquistas e rankings

Ledger paginado por conta, anomalias existentes, revisão fundamentada, consulta
de conquistas e resultados estimados de pista sem GPS integral. Toda compensação
identifica concessão original e deriva seu valor no servidor. Requer pedido,
MFA recente e segundo operador autorizado; autoaprovação, próprio XP, duplicação,
pedido expirado e permissão revogada são recusados.

`reverseGrant` e `reconcileUser` preservam o original e atualizam projeções. Uma
exclusão por occurrence key impede reconcessão automática do mesmo fato corrigido.
Níveis continuam derivados do saldo. Conquistas podem perder elegibilidade
pública, ser restauradas/reprocessadas e contestadas. Não são fabricadas medalhas.

Entradas podem ser suspensas por conta/temporada e restauradas/reprocessadas.
Opt-in e perfil privado continuam soberanos. Correções de temporadas encerradas
incrementam revisão explícita. Resultados de pista podem ficar em análise ou
inválidos, sem homologar tempos. Ranking público de tempos permanece indisponível,
como na Parte 21; não há classificação de velocidade em rua.

## L. Recursos e comunicação

`/perfil/medidas` apresenta medidas e decisões do titular, justificativa permitida,
prazo/estado, contestações e resultado. Um recurso por decisão/titular; revisor
independente, autorização do domínio e registro transacional. Decisões de
conquistas e entradas suspensas também podem ser contestadas. Não há e-mail
automático nem identidade do denunciante na comunicação.

Cancelamento de evento é terminal: restaurar divulgação não reabre evento nem
GPS. A revisão deve registrar providências proporcionais e eventual novo evento;
o sistema não oferece reversão automática de um cancelamento já efetivado.

## M. Banco e migrações

Migrações aditivas `026`–`032`, aplicadas localmente com `pnpm db:migrate`.

- Acesso: `admin_permissions`, `admin_roles`, `admin_role_permissions`,
  `admin_user_roles`, `admin_mfa`, `admin_recovery_codes`, `admin_sessions`,
  `admin_bootstrap`.
- Moderação: `moderation_cases`, `moderation_decisions`, `moderation_sanctions`,
  `moderation_appeals`, `admin_content_states`, ampliação de `social_reports`.
- Integridade: `admin_action_approvals`, `admin_xp_exclusions`,
  `admin_achievement_states`, `admin_result_states`, `admin_ranking_entries`,
  `circuit_verification_evidence`.
- Operação: `admin_audit_logs`, `admin_decision_notes`, `privacy_requests`,
  `security_incidents`, `admin_settings_versions`.

FKs, unicidade de concessões ativas/operações, índices de fila, vigência,
usuário/data e recurso. Triggers: projeção de denúncias, revogação de acesso/GPS,
enforcement de conteúdo/escritas e proteção/encadeamento da auditoria. Dados GPS
e vídeos não são duplicados. Correções e decisões críticas incluem auditoria na
mesma transação; falha no registro faz rollback da medida.

## N. APIs

| Caminho sob `/api`                                                                                   | Permissão/controle                                                                                               |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /admin/access`; `POST /admin/mfa/enroll`, `/verify`, `/admin/logout`                            | Conta privilegiada verificada, senha/CSRF/limites; inscrição não abre operação sem MFA                           |
| `GET /admin/dashboard`                                                                               | `admin.dashboard.read`                                                                                           |
| `GET /admin/users`, `/:id`                                                                           | `admin.users.read`                                                                                               |
| `POST /admin/users/:id/warn`, `/restrict`                                                            | `admin.users.restrict` e contexto/prazo                                                                          |
| `POST /admin/users/:id/suspend`, `/restore`                                                          | `admin.users.suspend`, autenticação recente                                                                      |
| `GET /admin/reports`, `/:id`, `/:id/media/:mediaId`                                                  | `admin.reports.read` e caso autorizado                                                                           |
| `POST /admin/reports/:id/assign`, `/resolve`, `/reopen`                                              | `admin.reports.review`; ação sobre conteúdo também exige permissão do recurso                                    |
| `GET /admin/appeals`; `POST /admin/appeals/:id/resolve`                                              | `admin.reports.review`, independência e permissão de domínio para reverter                                       |
| `GET /admin/groups`, `/admin/events`; `POST /admin/{groups,events}/:id/decision`                     | `admin.groups.moderate` / `admin.events.moderate`; confirmação e MFA recente para decidir                        |
| `GET /admin/routes`, `/:id/review`, `/:id/decisions`; `POST /admin/routes/:id/decisions`             | `admin.routes.review`; verificação também exige `admin.circuits.verify`                                          |
| `GET /admin/circuits`; `POST /admin/circuits/:id/suspend-verification`                               | `admin.circuits.verify`                                                                                          |
| `GET /admin/gamification/anomalies`, `/users/:id/ledger`, `/users/:id/achievements`                  | `admin.xp.review`                                                                                                |
| `POST /admin/gamification/anomalies/:id/review`                                                      | `admin.xp.review`, fundamento                                                                                    |
| `POST /admin/gamification/adjustments/request`, `/users/:id/achievements`                            | `admin.xp.adjust`, MFA recente; compensação ainda exige aprovação independente                                   |
| `GET /admin/rankings`, `/entries`, `/admin/gamification/results`                                     | `admin.rankings.manage`                                                                                          |
| `POST /admin/rankings/entries/:id/decision`, `/results/:id/decision`                                 | `admin.rankings.manage`, MFA recente                                                                             |
| `GET /admin/roles`, `/operators`; `POST /admin/operators/:id/roles`, `/admin/roles/:id/permissions`  | `admin.roles.manage`; mudanças críticas entram na fila                                                           |
| `GET /admin/approvals`; `POST /admin/approvals/:id/review`                                           | Permissão própria do pedido: `admin.xp.adjust` ou `admin.roles.approve`; execução única, expiração e MFA recente |
| `GET /admin/audit`                                                                                   | `admin.audit.read`, leitura registrada e limitada                                                                |
| `GET /admin/security/overview`, `/incidents`                                                         | `admin.security.read`; responsáveis com `admin.incidents.manage` também leem a fila de incidentes                |
| `POST /admin/security/revoke`                                                                        | `admin.sessions.revoke`, MFA recente                                                                             |
| `POST /admin/security/incidents`, `/:id/decision`                                                    | `admin.incidents.manage`                                                                                         |
| `GET /admin/privacy`; `POST /admin/privacy/:id/decision`                                             | `admin.privacy.requests`, verificação operacional de identidade e MFA recente para decidir                       |
| `GET/POST /admin/settings`                                                                           | `admin.settings.manage`, versão; MFA recente para mudança                                                        |
| `GET /moderation/me`, `/moderation/notice`; `POST /moderation/appeals`; `GET/POST /privacy/requests` | Conta comum autenticada; titularidade, CSRF e limites apropriados                                                |

Listas operacionais limitam páginas a 30 registros; endpoints anteriores de rotas
preservam 50. Não há endpoints de exportação em massa, consulta administrativa de
GPS privado ou início de compartilhamento de terceiros.

## O. Auditoria

Ator, ação, permissão, recurso/referência, resultado, código de motivo, horário e
correlação; decisões/aprovações fornecem o fundamento relacionado. Notas humanas
ficam em registro protegido separado. A auditoria não copia payloads de GPS,
senhas, cookies, tokens, códigos MFA, fotos ou IPs. Leitura é paginada e auditada.

Triggers recusam edição/exclusão/truncate comuns. A cadeia SHA-256 é serializada
e aloca sua ordem depois de adquirir o lock, inclusive em inserções concorrentes.
Não é uma garantia contra o proprietário do PostgreSQL; faltam ancoragem externa,
credencial de aplicação com DDL segregado e política formal de arquivo/retenção.

## P. Privacidade

DTOs mínimos; evidência por caso; bloqueios e privacidade do produto mantidos;
sem GPS privado, sensores completos ou vídeos locais no painel. Respostas privadas
com `no-store`, URLs de mídia reavaliadas e sem exportação indiscriminada. Pedidos
de privacidade têm fila, estado, responsável, verificação e resposta. A fila não
executa automaticamente exportação/expurgo nem promete apagar todos os backups.

## Q. Segurança e riscos residuais

SQL parametrizado, campos de entrada permitidos, origem/CORS/CSRF existentes,
MFA, rate limiting persistido, contexto por recurso, revisões de estado/versão,
dupla aprovação, autorização transacional e saída React escapada. Preview `/admin`
recebe CSP, `nosniff`, `no-referrer` e `no-store`; a hospedagem definitiva deve
replicar esses cabeçalhos. Desenvolvimento Vite mantém o funcionamento de HMR.

Não foram implementados WebAuthn, SIEM, exportação sensível, ações em massa,
autoexpurgo, reset irrestrito de MFA ou certificação esportiva. Recuperação sem
códigos, rotação da chave, critérios documentais, retenção e infraestrutura
precisam de responsáveis e validação operacional. Segurança não é inferida
somente de testes unitários.

## R. Testes realmente executados

O fechamento administrativo repetiu os 35 cenários com sucesso; verificações
dirigidas adicionais cobriram limite antes da negação de permissão e recurso
antigo tentando reverter uma decisão posterior. Evidências em
`.local/parte22-admin-closure.log`, `.local/parte22-appeal-closure.log` e
`.local/parte22-authorization-closure.log`.

**1.108 cenários distintos aprovados em execuções consolidadas**, sem contar
repetições: 667 padrão, 365 PostgreSQL/PostGIS e 76 Chrome. Não houve homologação
em aparelhos físicos. Os testes PostgreSQL são intencionalmente ignorados na
suíte padrão e executados separadamente pelo runner de banco.

| Execução                                                          | Resultado efetivamente observado                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                      | Aprovado: TypeScript, lint sem avisos, formatação, 256 testes API + 411 web e builds                                                 |
| `pnpm db:migrate`                                                 | Migrações 026–032 aplicadas no banco local, sem provisionar contas                                                                   |
| `pnpm test:postgres`                                              | Rodada geral inicial: 306 aprovados e 51 falhas; 46 por fixture social sem CASCADE, cinco por timeouts em três suítes                |
| Repetição de administração, Garagem, Rides e trajetos semelhantes | 113 aprovados após ajuste das fixtures/execução isolada                                                                              |
| Repetição social                                                  | 46 aprovados                                                                                                                         |
| Administração e gamificação no código final                       | 69 aprovados: 35 administrativos e 34 de gamificação; inclui fotografias reais e negação de GPS/garagem privados para os seis papéis |
| Repetição do dashboard e gráfico diário                           | Seis cenários de papel aprovados, conferindo métricas e soma dos registros diários                                                   |
| Runner Chrome completo, 19 arquivos                               | 75 aprovados e uma falha inicial de resposta tardia restaurando ranking após offline                                                 |
| Chrome administrativo no build final, isolado                     | Três aprovados: usuário comum/cinco abas; MFA/viewport/revogação; XSS/decisão/feed/recurso                                           |
| Chrome gamificação após corrigir a corrida offline, isolado       | Cinco aprovados; a falha de ranking ficou resolvida                                                                                  |

As capturas em 320/360/390/430/850/1440 px foram geradas; versões desktop e mobile
foram inspecionadas visualmente, inclusive com o gráfico diário final. A navegação
principal continuou com cinco itens. O cenário de paginação usa 3.000 contas
sintéticas, 30 linhas por página e orçamento de três segundos. As suítes anteriores
também exercitaram feeds, mapas, GPS, sensores, offline, replay, comparações,
trajetos semelhantes, vídeos locais, overlay, grupos, eventos e consentimentos.

Logs locais: `.local/parte22-delivery-check.log`,
`.local/parte22-postgres.log`, `.local/parte22-recheck-postgres.log`,
`.local/parte22-social.log`, `.local/parte22-verified-postgres.log`,
`.local/parte22-dashboard-check.log`, `.local/parte22-e2e-final.log`,
`.local/parte22-admin-delivery.log` e `.local/parte22-gamification-delivery.log`.
Capturas: `.local/screenshots/admin-*`. Todos os cenários usam dados sintéticos
em esquemas temporários; não são dados de usuários reais.

As rodadas iniciais detectaram: fixture social sem CASCADE após novas FKs,
limpeza de fixture bloqueada pela proteção de auditoria, estouro de largura da
sidebar móvel, rótulo acessível do seletor de decisão e timeouts de hooks sob
contenção local. Os defeitos de produto e de fixtures foram corrigidos. O runner
PostgreSQL passou a executar um worker e reservar até 30 segundos à preparação;
limites de consulta/segurança da aplicação não foram relaxados. Houve também
ajuste de fixture para repor a configuração inicial após TRUNCATE com CASCADE.
Uma tentativa manual de agrupar dois arquivos Chrome no mesmo ambiente atingiu
o limite real de cadastros e revelou um seletor de teste ambíguo entre duas
mensagens de status. O seletor foi delimitado e os arquivos foram repetidos
separadamente, sem relaxar rate limiting. O build mantém o aviso anterior de
chunk MapLibre/GPS maior que 500 kB; não foi feita reestruturação do bundle.

## S. Limitações

Homologação física Android/iPhone/Safari/Edge/Firefox não realizada. Carga de
produção, pentest independente, retenção/arquivo, backup/restauração, CSP da
hospedagem, SMTP e proteção operacional do host/chave ainda precisam de validação.
O mapa depende do provedor configurado e não certifica segurança física. A
configuração editável limita-se à orientação de suporte, sem editar `.env` nem
alterar retroativamente regras XP. A revogação visual depende da próxima consulta,
mas a API nega operações imediatamente em sua próxima autorização.

## T. Preparação para a Parte 23

Consulte [roteiro de homologação](admin-homologacao.md),
[matriz](admin-matriz.md), [provisionamento/recuperação](admin-provisionamento.md),
[operação de moderação](admin-moderacao.md) e [incidentes/privacidade](admin-incidentes.md).
Esses documentos definem os cenários A–H e pendências de segurança, performance,
compatibilidade, backup, observabilidade, produção e revisão jurídica. Nenhum
lançamento foi executado ou autorizado implicitamente por esta entrega.
