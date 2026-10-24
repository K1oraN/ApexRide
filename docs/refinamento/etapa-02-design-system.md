# Etapa 2 de 14 — Design system e refinamento visual global

Registro de 24/10/2026. Trabalho sobre o projeto existente, sem deploy, acesso à
VPS, migração de framework ou início da Etapa 3. As 23 partes anteriores permanecem
históricas; esta entrega segue o novo refinamento de 14 etapas.

## A. Diagnóstico visual anterior

Foram lidos README, auditoria de lançamento, plano de refinamento, Parte 02,
relatório da Etapa 1, componentes, CSS e testes existentes. A Etapa 1 já separava
landing `/`, login `/entrar`, cadastro `/cadastro`, aplicativo `/app`, proteção
de sessão e administração. Essa estrutura foi preservada, incluindo recuperação
de senha condicionada ao provedor real e retorno seguro após autenticação.

Problemas encontrados: controles repetidos, ações positivas e destrutivas
semelhantes, campos estreitos, tipografia e dimensões locais inconsistentes,
superfícies duplicadas, ícones de inclinação rotacionados, região fixa no header,
ponto de notificação sem evento real, aparência de Ride confundida com seleção
da página, mapa ilustrativo na Home e estados vazios pouco orientativos.

O baseline SHA-256 de 856 arquivos foi registrado antes desta etapa em
`.local/refinamento2-baseline.json`. A comparação distingue estas mudanças das
alterações anteriores já presentes na árvore de trabalho.

## B. Design system implementado

`tokens.css` define decisões; `components.css` define controles, superfícies e
estados; `shell.css` compõe o aplicativo; `public.css` compõe a entrada pública.
CSS de cada módulo conserva sua composição específica. As definições antigas
dos controles globais e da navegação foram removidas; não se usa `!important`.
A ordem é global → componentes → shell. Seletores compartilhados de campos têm
baixa especificidade para permitir o tratamento agrupado das telas de conta.

| Grupo                 | Tokens / decisão                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Superfícies           | Fundo `#080B0F`, painel `#10151B`, elevado `#171D25`; gradiente discreto                                              |
| Bordas                | `#2A313B`, controles `#495463`; raios 10, 14 e 18 px                                                                  |
| Identidade            | Racing `#F31327`, escuro `#C70D21`                                                                                    |
| Ação com texto branco | `#D80B20`, hover `#B90B1E`, pressionado `#99091A`                                                                     |
| Texto                 | `#F5F7FA`, secundário `#B2BBC7`, auxiliar `#9DA8B6`                                                                   |
| Estados               | Sucesso `#49DF85`, alerta `#F7BF58`, erro/foco `#FF9BA7`                                                              |
| Espaçamento           | 4, 8, 12, 16, 20, 24, 32, 40 e 48 px                                                                                  |
| Controles             | Small 44, medium 48, large 56, extra large 64 px; ícones 44 px                                                        |
| Tipografia            | Arial do sistema para interface; Roboto Condensed local para títulos e instrumentos; hero conserva tratamento itálico |
| Escala                | Corpo 16, label 14, auxiliar 12–14; H1 30–40 e H2 24–30 px; títulos de seção ajustados à composição                   |
| Movimento             | Transições 150 ms; skeleton pulsa duas vezes; movimento reduzido desliga animações                                    |

Nenhuma dependência ou fonte foi adicionada. Roboto Condensed e Lucide já estavam
instalados e seus avisos permanecem em `THIRD_PARTY_NOTICES.md`.

`design-system.tsx`: Button, ButtonLink, IconButton, Input, Select, SelectField,
Combobox pesquisável, Textarea, Checkbox, Switch, Radio, SearchInput,
SegmentedControl, Card, CardLink, StatusCard, StatCard, Badge, EmptyState,
Skeleton, Feedback, PageHeader e Dialog com apresentação Drawer.
Field/PasswordField evoluem AccountFields; Avatar, Popover e SectionTitle
continuam em `ui.tsx`. Não foi criada outra biblioteca concorrente de menus ou
fotos. Cards de moto, rota, publicação, evento, equipe e conquista mantêm seus
dados e compartilham `.panel` e controles. MetricCard usa Card; MotorcycleCard
usa CardLink. Mensagens correspondem a operações reais, sem toasts decorativos.

## C. Alterações nos botões

| Variante    | Uso e tratamento                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Primary     | Entrar, criar conta, adicionar moto, criar percurso, publicar e iniciar Ride; vermelho com texto branco |
| Secondary   | Editar, configurar, consultar e ver detalhes; grafite com borda                                         |
| Outline     | Cancelar, voltar e alternativas; transparente com borda                                                 |
| Ghost       | Ações discretas e contextuais                                                                           |
| Destructive | Excluir, remover e descartar; vinho escuro e texto claro, distinto das ações positivas                  |
| Selected    | Filtros selecionados; superfície escura e indicação de seleção                                          |
| Loading     | Spinner, `aria-busy`, bloqueio e nome compreensível                                                     |
| Disabled    | Superfície, borda e texto próprios; motivo contextual preservado                                        |

A migração conserva props nativas, refs, handlers, validações e semântica de
submit. Entrar e criar conta usam o mesmo Button do aplicativo. Foco visível,
pressionamento e alvos confortáveis independem de hover. A confirmação da
garagem usa Dialog nativo: Escape, contenção de foco e retorno ao acionador
foram verificados. O diálogo não pode ser dispensado durante a operação.

## D. Formulários e filtros

Inputs, selects e textareas compartilham fonte de 16 px, bordas, espaçamento e
foco. Field associa label, ajuda e erro por ID, mantém restrições HTML e oferece
sucesso explícito. PasswordField conserva autocomplete e valor ao alternar a
visibilidade; seu botão não envia o formulário. Readonly e disabled são distintos.

Comparação/similaridade usam grid mínimo de 220 px, gap de 20 px e labels
separados. Filtros avançados ficam em painel expansível; a aplicação automática
existente permanece explícita. Região administrativa usa Combobox com busca
insensível a acentos, setas, Enter, Escape e Tab. A lista usa portal, limita-se à
viewport e quebra opções longas. Seleção extensa aparece integralmente em ajuda;
cancelar a pesquisa preserva o valor. Opções continuam em `/similarity/regions`.

Popover limita posição e altura ao espaço disponível e reposiciona em rolagem e
redimensionamento. Foi corrigido um corte de 24 px em notificações a 320 px.

## E. Ícones

RideIcon encapsula `Motorbike` do Lucide instalado, usado em Ride, garagem e
conquistas; Bike de bicicleta foi retirado desses usos. LeanLeftIcon e
LeanRightIcon são SVGs próprios com eixo, arco e direção, sem espelhar uma moto.
ForceGIcon identifica G. Traço de 2 px e escala consistente. As rotações antigas
foram removidas. Cálculos, calibração e estados indisponíveis foram preservados.

## F. Navegação

Header com marca existente, região do perfil, notificações honestas e acesso ao
perfil. Não consulta GPS nem simula alertas. Avatar padrão explícito: o produto
ainda não oferece upload de foto de perfil.

Exatamente Início, Explorar, Ride, Comunidade e Garagem, com safe areas e reserva
ao fim do conteúdo. Ride central distingue `aria-current` (página) de
`data-ride-state` (operação): running → ativo, paused → pausado,
finished/saving → finalizando, waiting-gps → preparando. Abrir `/ride` permite
preparação e nunca afirma sessão ativa. O estado permanece ao navegar; retomar
respeita a nova leitura de GPS exigida pelo controlador atual.

## G. Telas refinadas

| Tela       | Refinamento e limite                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing    | Etapa 1 preservada; CTAs compartilham variantes, cores e foco; menu, FAQ e rodapé funcionais                                                |
| Login      | Hero, labels, ícones, senha acessível, ação principal e mensagens reais; recuperação depende da configuração                                |
| Cadastro   | Campos alinhados, confirmação de senha, aceite e CTAs; segurança preservada                                                                 |
| Início     | Saudação real, hero no pôr do sol, hierarquia, cards e ações; mapa ilustrativo substituído por vazio orientativo; sem novos KPIs da Etapa 3 |
| Explorar   | Busca, filtros, categorias e Criar percurso primário acima do mapa; RouteMap real e vazio sem trajetos inventados                           |
| Ride       | Controles, instrumentos, métricas e ícones; preparação, GPS, vídeo e sensores mantêm fluxos/controlador                                     |
| Comunidade | Cards, comentários, ações sociais, publicação, estados vazios/loading/erro e navegação contextual; perfil/feed existentes preservados       |
| Garagem    | PageHeader, Adicionar moto, foto cadastrada, principal, edição secundária e exclusão destrutiva; sem ficha técnica fictícia                 |

Histórico, replay, vídeo, rotas, comparações, eventos, grupos, conquistas/rankings
e administração receberam controles compartilhados. Parte das alterações é
organização de imports/adaptação JSX. Serviços, permissões e persistência mantidos.

## H. Capturas reais

Artefatos em `.local/screenshots/refinamento2/`, preservando a Etapa 1. As oito
telas foram exercitadas em 320, 360, 375, 390, 430, 768, 1024 e 1440 px. O índice
reúne **97 capturas PNG**, incluindo estados adicionais de garagem, filtros,
confirmação e instrumentos.

- [Índice por tela e largura](../../.local/screenshots/refinamento2/index.html)
- [Landing](../../.local/screenshots/refinamento2/landing-390.png), [Login](../../.local/screenshots/refinamento2/login-390.png), [Cadastro](../../.local/screenshots/refinamento2/cadastro-390.png)
- [Início](../../.local/screenshots/refinamento2/inicio-390.png), [Explorar](../../.local/screenshots/refinamento2/explorar-390.png), [Ride](../../.local/screenshots/refinamento2/ride-390.png)
- [Comunidade](../../.local/screenshots/refinamento2/comunidade-390.png), [Garagem cadastrada](../../.local/screenshots/refinamento2/garagem-cadastrada-390.png)
- [Filtros a 320 px](../../.local/screenshots/refinamento2/filtros-abertos-320.png), [Confirmação destrutiva](../../.local/screenshots/refinamento2/exclusao-320.png)

São screenshots do build em Chrome, backend e PostgreSQL locais em schemas
isolados. Contas/motos são fixtures de teste criadas pelas APIs reais; a foto foi
enviada pelo endpoint real. Regiões longas, GPS e provedor de mapa controlados são
fixtures exclusivas de testes, não dados de produção. Arquivos `.local` são
artefatos ignorados pelo Git, disponíveis no workspace.

## I. Comparação com as referências

O texto cita oito imagens, mas foram fornecidos seis arquivos e cinco imagens
distintas: Garagem `b33f…`, Explorar `914b…`, Início `558d…`, Cadastro `a9f1…`,
Login `c614…` e a duplicata `2bb2…`. Faltam referências específicas de landing,
Ride e Comunidade, que seguem a Parte 02 e a identidade compartilhada.

| Referência       | Aproximação e diferença deliberada                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login/cadastro   | Foto já existente, hero esportivo, grafite, vermelho e bordas; composição desktop, mensagens legais e requisitos de senha reais preservados                    |
| Início           | Saudação, pôr do sol, hierarquia e navegação; não copia Lucas, estatísticas, sensores conectados ou manutenção fictícia; estrutura detalhada fica para Etapa 3 |
| Explorar         | Busca, categorias, CTA, cards e espaçamento; não copia rota inventada nem mapa satélite ilustrativo; usa dados cadastrados                                     |
| Garagem          | Cards, CTA, principal e agrupamento; catálogo, potência, torque, documentos e revisão ficam para dados/etapas próprios                                         |
| Tipografia/marca | Marca preservada e duas famílias existentes; não se promete reprodução pixel a pixel de fonte não identificada                                                 |
| Navegação        | Cinco itens e Ride central; estados reais e legibilidade prevalecem sobre neon e supostas conexões                                                             |

A inspeção identificou e corrigiu borda dupla nos campos públicos, cor de ícone
de campo, posicionamento de menus e rotações antigas. Capturas finais registram
esses ajustes. Fotografias são os recursos autorais existentes do projeto,
não as telas completas das referências aplicadas como frontend falso.

## J. Testes

| Verificação                                                                                                   | Resultado                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                  | Typecheck API/web, ESLint sem warnings, Prettier, 260 testes da API + 453 web e build aprovados |
| `pnpm test:postgres`                                                                                          | 367 aprovados em 12 arquivos; 1.195,76 s, schemas locais isolados                               |
| `pnpm --filter @apex-ride/web test:e2e`                                                                       | 100 cenários distintos aprovados em 22 arquivos; nenhum cenário reprovado na rodada ampla       |
| `pnpm --filter @apex-ride/web test:e2e -- design-system.spec.ts interface.spec.ts entry.spec.ts --workers=1`  | 32 aprovados após ajustes de CSS público e ícones                                               |
| `pnpm --filter @apex-ride/web test:e2e -- design-system.spec.ts interface.spec.ts social.spec.ts --workers=1` | 22 aprovados após ajustes finais de espaçamento, alvos do mapa e espera pelos dados de Explorar |
| `git diff --check`                                                                                            | Aprovado                                                                                        |

Os 9 novos testes de componentes cobrem bloqueio de envio, loading/disabled,
label/erro/ajuda, senha sem submit acidental, busca com acentos, Escape/Tab,
segmentação por teclado, diálogo ocupado e restauração de foco, card como link
nativo e contraste. O navegador cobre nomes acessíveis, foco, menus, listbox,
contenção de foco, estados reais de Ride e reduced motion. A regressão funcional
inclui autenticação, garagem, GPS/Ride, offline, vídeo, histórico/replay,
rotas/similaridade, publicação/curtida/comentário, grupos, eventos, XP/ranking e
RBAC/MFA da administração.

Contraste calculado dos tokens: branco sobre ação normal **5,27:1**, hover
**6,71:1**, pressionado **8,72:1**; texto normal/auxiliar/semântico sobre as três
superfícies testadas tem mínimo **7,03:1**. Cor computada e foco do botão de
login também foram verificados em Chrome. Isso corrige o hover identificado na
auditoria, sem substituir auditoria integral WCAG.

O primeiro teste novo de header supunha região vazia; foi corrigido para consultar
o perfil real. O teste de retomada passou a emitir a nova leitura de GPS exigida
pelo controlador. A checagem adicional de viewport revelou o menu cortado a
320 px, corrigido no Popover. A inspeção visual corrigiu borda dupla e cor do
ícone no formulário público e fez a captura de Explorar aguardar o carregamento
após o H1. Os testes finais validam essas correções. Houve uma divergência de
formatação corrigida antes do fechamento; não foi tratada como aprovação.

Logs em `.local/refinamento2-check-delivery.log`, `refinamento2-postgres.log`,
`refinamento2-browser-all.log`, `refinamento2-visual-final.log` e
`refinamento2-final-review.log`. Após o último ajuste do combobox para reabrir
destacando a seleção atual, `pnpm check` passou novamente e os 6 cenários de
`design-system.spec.ts --workers=1` passaram; registro em
`.local/refinamento2-combobox-final.log`. As repetições não somam novos cenários distintos
aos 100 da rodada ampla. O build mantém o aviso preexistente do chunk MapLibre.

## K. Arquivos modificados

Comparação SHA-256 com o baseline anterior: **110 arquivos** nesta etapa.
Backend/API, banco, serviços e cálculos de telemetria mantêm os hashes anteriores.
A lista inclui adaptações JSX e organização de imports; alterações da Etapa 1 já
presentes antes do baseline não são atribuídas a esta etapa.

- `README.md`
- `apps/web/e2e/design-system.spec.ts`
- `apps/web/e2e/entry.spec.ts`
- `apps/web/e2e/interface.spec.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/admin/ActionForm.tsx`
- `apps/web/src/admin/AdminAuth.tsx`
- `apps/web/src/admin/AdminPage.tsx`
- `apps/web/src/admin/Dashboard.tsx`
- `apps/web/src/admin/MyCases.tsx`
- `apps/web/src/admin/RankingDetails.tsx`
- `apps/web/src/admin/Workspace.tsx`
- `apps/web/src/auth/AuthProvider.tsx`
- `apps/web/src/auth/RequireAuth.tsx`
- `apps/web/src/comparison/ComparisonCharts.tsx`
- `apps/web/src/comparison/ComparisonResults.tsx`
- `apps/web/src/components/AccountFields.tsx`
- `apps/web/src/components/Brand.tsx`
- `apps/web/src/components/Layout.tsx`
- `apps/web/src/components/PublicLayout.tsx`
- `apps/web/src/components/design-system.test.tsx`
- `apps/web/src/components/design-system.tsx`
- `apps/web/src/components/maps/IllustrativeMap.tsx`
- `apps/web/src/components/maps/RideMap.tsx`
- `apps/web/src/components/maps/RouteMap.tsx`
- `apps/web/src/components/routes/PersistedRouteCard.tsx`
- `apps/web/src/components/routes/RouteCard.tsx`
- `apps/web/src/components/social/Social.tsx`
- `apps/web/src/components/telemetry/Metrics.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/events/EventDetailsPage.tsx`
- `apps/web/src/events/EventForm.tsx`
- `apps/web/src/events/EventLiveMapPage.tsx`
- `apps/web/src/events/EventMap.tsx`
- `apps/web/src/events/EventParticipants.tsx`
- `apps/web/src/events/EventsPage.tsx`
- `apps/web/src/events/LiveBanner.tsx`
- `apps/web/src/events/LiveProvider.tsx`
- `apps/web/src/gamification/AchievementsPage.tsx`
- `apps/web/src/gamification/Badge.tsx`
- `apps/web/src/gamification/CircuitResults.tsx`
- `apps/web/src/gamification/Progress.tsx`
- `apps/web/src/gamification/RankingPreferences.tsx`
- `apps/web/src/gamification/RankingsPage.tsx`
- `apps/web/src/gamification/XpHistoryPage.tsx`
- `apps/web/src/garage/GaragePreview.tsx`
- `apps/web/src/garage/GarageProvider.tsx`
- `apps/web/src/garage/MotorcycleCard.tsx`
- `apps/web/src/groups/GroupDetailsPage.tsx`
- `apps/web/src/groups/GroupForm.tsx`
- `apps/web/src/groups/GroupManagement.tsx`
- `apps/web/src/groups/GroupsPage.tsx`
- `apps/web/src/history/HistoryFilters.tsx`
- `apps/web/src/history/HistoryPreview.tsx`
- `apps/web/src/history/HistoryTrackMap.tsx`
- `apps/web/src/history/LastRide.tsx`
- `apps/web/src/history/OfflineHistory.tsx`
- `apps/web/src/history/RideHistoryCard.tsx`
- `apps/web/src/history/RidePrivacyControls.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/offline/OfflinePanel.tsx`
- `apps/web/src/pages/AccountPage.tsx`
- `apps/web/src/pages/AuthPage.tsx`
- `apps/web/src/pages/CommunityPage.tsx`
- `apps/web/src/pages/ComparisonPage.tsx`
- `apps/web/src/pages/ExplorePage.tsx`
- `apps/web/src/pages/GaragePage.tsx`
- `apps/web/src/pages/HistoryPage.tsx`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/LandingPage.tsx`
- `apps/web/src/pages/LocalRideDetailsPage.tsx`
- `apps/web/src/pages/ReplayPage.tsx`
- `apps/web/src/pages/RideDetailsPage.tsx`
- `apps/web/src/pages/RidePage.tsx`
- `apps/web/src/pages/RideStatisticsPage.tsx`
- `apps/web/src/pages/RoutePages.tsx`
- `apps/web/src/pages/SimilarityPage.tsx`
- `apps/web/src/replay/OfflineReplayTrace.tsx`
- `apps/web/src/replay/ReplayMarks.tsx`
- `apps/web/src/replay/ReplayPanel.tsx`
- `apps/web/src/ride/AdvancedResults.tsx`
- `apps/web/src/ride/MotionForceCards.tsx`
- `apps/web/src/ride/MotionPreparation.tsx`
- `apps/web/src/ride/RideProvider.tsx`
- `apps/web/src/ride/RideSummary.tsx`
- `apps/web/src/ride/SpeedDisplay.tsx`
- `apps/web/src/ride/SpeedSettings.tsx`
- `apps/web/src/ride/TelemetryCharts.tsx`
- `apps/web/src/similarity/CommunityDiscovery.tsx`
- `apps/web/src/similarity/MatchMap.tsx`
- `apps/web/src/similarity/SimilarityFilters.tsx`
- `apps/web/src/social/CommunityPreview.tsx`
- `apps/web/src/social/Composer.tsx`
- `apps/web/src/social/Feed.tsx`
- `apps/web/src/social/Profile.tsx`
- `apps/web/src/styles/account.css`
- `apps/web/src/styles/components.css`
- `apps/web/src/styles/global.css`
- `apps/web/src/styles/gps.css`
- `apps/web/src/styles/public.css`
- `apps/web/src/styles/ride-session.css`
- `apps/web/src/styles/routes.css`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/tokens.css`
- `apps/web/src/video/VideoLibrary.tsx`
- `apps/web/src/video/VideoPanel.tsx`
- `apps/web/src/video/overlay/VideoExportPanel.tsx`
- `apps/web/src/video/overlay/VideoOverlayPlayer.tsx`
- `docs/progresso.md`
- `docs/refinamento/etapa-02-design-system.md`

## L. Pendências e limites

As imagens ausentes impedem comparação específica de landing, Ride e Comunidade
às oito referências citadas. Homologação de teclado virtual/safe areas e sensores
em Android/iPhone físicos, leitores de tela e auditoria completa de acessibilidade
continuam além do Chromium automatizado. Não se alega conformidade integral AA.

Notificações persistentes, avatar, catálogo/fichas técnicas, dashboard detalhado e
reorganização funcional do Ride dependem das etapas próprias. SMTP, textos
jurídicos e homologação operacional da Etapa 1 seguem pendentes. O aviso
preexistente de chunk MapLibre acima de 500 kB permanece; não se comprova
desempenho em hardware físico nesta etapa.

## M. Preparação para a Etapa 3

Tokens, Button/Field/Card, cabeçalhos, vazios e navegação estão disponíveis para
Início e Dashboard. A próxima etapa poderá organizar status comprovados, moto
principal e indicadores reais, reutilizando serviços e lógica de Ride. Ela não
foi iniciada nesta entrega.

## Revalidação de encerramento — 24/10/2026

A implementação e os artefatos acima já estavam presentes no workspace nesta
revisão. `pnpm check` foi executado novamente e aprovado (tipos, lint,
formatação, testes e build), mantendo o aviso conhecido do chunk MapLibre.
Log: `.local/refinamento2-revalidacao-check.log`.

O SegmentedControl recebeu `type="button"` para impedir submissão acidental
quando reutilizado dentro de formulários. Um teste cobre clique e seleção por
teclado sem submit: os **10 testes** de `design-system.test.tsx` passaram após
o ajuste; Prettier dos dois arquivos e `git diff --check` também passaram.
PostgreSQL, E2E e capturas não foram executados novamente nesta revisão;
os resultados e as 97 imagens descritos acima são os registros existentes.
O usuário solicitou encerramento. Sem deploy, alteração de VPS ou Etapa 3.
