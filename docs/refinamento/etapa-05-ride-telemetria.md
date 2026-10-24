# Etapa 5 de 14 — Ride, telemetria, sensores, sessões e vídeo

Registro local de 24/10/2026. Implementação sobre as Etapas 1–4 e os módulos
existentes. Sem deploy, VPS, DNS, novas dependências, migrações ou Etapa 6.
Homologação física continua pendente. O plano histórico de 12 partes não muda a
numeração de 14 etapas deste pedido.

## A. Diagnóstico inicial

O Ride já tinha sessão GPS, sensores/calibração opcionais, GPS Assistido,
detecção passiva de eventos, circuitos, checkpoints, sincronização, vídeos locais,
overlay e exportador. A interface empilhava preparação, configurações extensas
de vídeo/sensores e avisos antes dos comandos de início. Preparação e pilotagem
compartilhavam a mesma apresentação. Sessões e vídeos eram encontrados sobretudo
pelo Histórico; faltavam entradas internas organizadas e diagnóstico por canal.

Foram consultados README, auditoria/plano, manuais de sessões/GPS/assistido,
sensores/telemetria, offline/Histórico, vídeo/overlay/QA e relatórios das Etapas
1–4. Inspecionados controladores, captura/processamento, contratos, repositórios,
leases, Replay, exportação e testes. O workspace já continha alterações das etapas
anteriores; o inventário desta entrega usa um snapshot SHA-256 separado delas.

## B. Nova organização

| Área       | Endereço e comportamento                                                |
| ---------- | ----------------------------------------------------------------------- |
| Painel     | `/ride`: preparação, espera GPS, pilotagem, pausa e resumo              |
| Sessões    | `/ride/sessoes`: sessão atual, recuperação/fila e Histórico existente   |
| Circuitos  | `/ride/circuitos`: catálogo autorizado e voltas da sessão atual         |
| Telemetria | `/ride/telemetria`: eventos, gráficos e consulta de amostras            |
| Vídeos     | `/ride/videos`: metadados locais por sessão, segmentos e reprodução     |
| Estúdio    | `/ride/estudio`: escolha da gravação e compositor/exportador existentes |

São páginas internas, todas sob `RequireAuth`. O menu único **Mais opções**, no
cabeçalho, reúne Guia (`/guia`), Configurações (`/configuracoes`) e Descobertas
(`/descobertas`). O Guia concentra instruções de GPS/sensores, navegação, vídeo,
estúdio, armazenamento e privacidade. A ferramenta de agregados autorizados fica
exclusivamente em Descobertas; foi retirada de Explorar e do Guia. A navegação global continua com
cinco abas. A preparação destaca moto da Garagem, modo, contexto, GPS e Iniciar;
os painéis de câmera, sensores/calibração e preferência GPS começam recolhidos.
Durante a sessão o preparo desaparece. O resumo conserva Salvar/Descartar e
confirmações reais. Nenhum banco ou histórico paralelo foi criado.

### Ajustes aprovados e pedidos complementares

O usuário aprovou a composição e solicitou simplificação adicional. Removidos o
rodapé de comunidade do Início, “Sem gravação ativa” e textos extensos dos fluxos
operacionais. As instruções foram preservadas no Guia, com busca e tópicos; não
há links repetidos para o Guia no painel ou nas configurações. Acesso único pelo
menu Mais opções, incluindo Configurações e Descobertas.

Seleções curtas de duas ou três opções usam cartões com rádios nativos, borda
vermelha selecionada, teclado e estados desabilitados. Listas de quatro ou mais
opções continuam listas. Aplicado a eventos, privacidade, grupos, sensores,
telemetria, qualidade de vídeo e estúdio. Os filtros mantêm seus contratos e
permissões. Pesquisa disponível em eventos, sessões, circuitos, vídeos, Guia e
conquistas. Paginação de eventos e outras listas centralizada com ações alinhadas.
Links de retorno e ações de seção ganharam áreas de toque e bordas consistentes.

Meu desempenho conserva o período escolhido e soma distância e tempo de
pilotagem das atividades confirmadas desse período. XP no cartão foi substituído
por Missões ativas, lidas das metas reais da conta; o clique abre as missões em
Conquistas. A evolução/XP continua na área própria. Não se inventam missões,
atividades, odômetro, estatísticas ou estados de sensores.

## C. Fidelidade visual

A referência principal é `d926bea1-51c9-4aee-b158-5cef4f5adef8.png`, fornecida pelo
usuário, além das outras sete telas distintas. Velocímetro circular com graduação,
número branco itálico, arco vermelho proporcional ao valor, cards grafite,
bordas discretas, indicadores vermelhos e comandos grandes seguem a composição.
Os ícones E/D usam eixos/arcos geométricos da Etapa 2; a caricatura central foi
removida. Fontes, tokens, Button/Select/Card e cinco abas são os existentes.

Diferenças deliberadas: sem copiar 118 km/h, tempos, G, inclinação, satélites,
fotos de moto ou contagens da imagem. Sem moldura física de iPhone. GPS ausente
mostra `—`. Em mobile os controles antecedem os indicadores secundários; em
desktop o painel fica centralizado e o estúdio dispõe prévia e controles lado a
lado. O proprietário aprovou a composição e pediu os ajustes acima; isso não
equivale a correspondência pixel a pixel ou homologação física.

## D. Estados e controles

| Estado do controlador        | Interface e ação                                                     |
| ---------------------------- | -------------------------------------------------------------------- |
| preparation/error sem sessão | Moto/modo/contexto editáveis; Iniciar ou prévia GPS                  |
| waiting-gps                  | Espera explícita, sem relógio novo; cancelar espera; aba indica GPS  |
| running                      | Estado Em andamento, velocidade/fonte/qualidade, Pausar e Finalizar  |
| paused                       | Tempo ativo congelado; Continuar ou Finalizar; câmera configurável   |
| finished                     | Resumo; nenhuma publicação automática                                |
| saving                       | Fluxo existente aguarda persistência/confirmação e impede duplicação |
| saved                        | Confirmação local ou remota distinta; preparar outro Ride            |
| discarded                    | Remoção confirmada, retorno ao preparo                               |

Iniciar usa o mesmo `RideController.start`; só uma posição utilizável inicia a
atividade. A seleção de modo/moto fica bloqueada depois do início solicitado.
Livre remove associações; Com rota/Com evento levam às seleções autorizadas já
existentes. Contexto não altera enums Passeio/Pista/Misto. A espera de retomada
não é apresentada como sessão gravando. Preferência GPS em Configurações também
fica bloqueada durante gravação/espera. `aria-current` representa navegação;
estado operacional do Ride tem texto e atributo próprios.

## E. Telemetria, fontes e qualidade

- Velocidade atual: `SpeedTelemetry`/`SpeedDisplay`, GPS direto ou assistência
  identificada. Sem velocidade válida, `—`; zero somente quando medido.
- Distância/média/máxima/tempos: `rideMetrics` e núcleo compartilhado existentes.
  Média é distância validada dividida por tempo ativo, incluindo paradas. Não há
  segunda média em movimento sem contrato definido. Total e pausado são distintos.
- Máxima conserva rejeição de leituras/picos inválidos; saltos e segmentos não
  entram como deslocamento contínuo. Não se alteraram thresholds ou versões.
- Eventos 0–100/100–0: apenas resultados `estimated` do detector passivo, exibidos
  como análise pessoal. Detalhes mantêm origem, amostras, intervalo, método e motivo
  dos inconclusivos/rejeitados. O card 100–0 usa tempo, não distância inventada.
- G longitudinal: aceleração/frenagem separadas, em G, apenas com calibração e
  amostra de qualidade `limited`; ausência não vira zero. Inclinação dinâmica,
  máximas/médias E/D permanecem indisponíveis.
- Gráficos reutilizam séries e redução existentes; seletor por amostra funciona
  com teclado, readout temporal e ponto destacado. Lacunas continuam separadas.

O contrato histórico de Ride não preserva precisão vertical suficiente para
homologar um novo perfil altimétrico de sessão. Não se adicionaram ganho/perda ou
altitude de exemplo. O perfil GPX da Etapa 4 continua em Explorar, com sua origem
e precisão desconhecida explícitas. GPS Assistido, `motion-1`, `speed-1`,
`events-1`, regras de distância e cálculos de voltas foram preservados.

## F. Sensores e calibração

Diagnóstico individual de acelerômetro, giroscópio, orientação, GPS e referência
de calibração, consumindo a captura única. API detectada não comprova sensor.
Funcionamento por canal exige três leituras utilizáveis distintas, extensão de
pelo menos 100 ms e atualização dentro de 1,5 s. Após lacuna a sequência precisa
ser comprovada novamente. Orientação é avaliada mesmo sem movimento utilizável;
repetir sua última leitura não aumenta a contagem. Negativa de orientação e
bloqueio de giroscópio por política têm indicação própria.

O diagnóstico guarda somente três contadores/referências, sem histórico bruto.
Atualizações de captura para a UI são limitadas a 200 ms e verificações já usam
o timer de 500 ms existente. Os indicadores assinam suas próprias atualizações;
o mapa/página não recebem uma renderização por evento de movimento.

Calibração fica em painel opcional com montagem, suporte fixo, moto parada e
vertical, resultado e recalibração. O controlador mantém sua janela e validações
originais. Não recalibra durante uma sessão aberta; após perda da referência,
continua em GPS e requer nova preparação. Nenhuma manobra física foi solicitada.

## G. Circuitos e voltas

`LapDetector`/`RouteTracker` existentes, mesma geometria/versão, verificação,
largada e direção. A primeira passagem válida abre o cronômetro estimado.
Painel mostra volta atual quando defensável, última/melhor, diferença compatível,
histórico e inconclusivas. Pausa/perda de GPS interrompem a observação; a contagem
de inconclusivas agora é publicada imediatamente nessas transições.

Não se criaram splits, tempos oficiais, voltas em vias comuns ou ranking público.
Pista sem circuito elegível continua com voltas indisponíveis. A fixture de
quadrado fecha uma volta conhecida e verifica interrupção da seguinte, sem mudar
nenhum limiar de aceitação.

## H. Sessões e Histórico

`RideSessionsPage` incorpora `HistoryPage`, `OfflinePanel`, filtros, paginação,
cópias locais, pendências e detalhes já autorizados. A sessão aberta tem retorno
direto. Detalhes existentes conservam resumo, mapa, eventos/gráficos, circuitos,
Replay, vídeos, privacidade e estado de sincronização. Não há nova coleção de
sessões nem contagem somada em duplicidade. Navegar pelas páginas internas
preserva o controlador global e a única coleta GPS.

## I. Vídeos e biblioteca

Mesmos Camera/MediaRecorder/coordenador/IndexedDB. Câmera não abre ao entrar na
página. Frontal/traseira são alternativas, uma de cada vez; áudio é opt-in.
Preparação aguarda permissão e mostra a captura obtida. A transição para espera
GPS preserva a câmera autorizada, corrigindo o encerramento causado pela nova
desmontagem do preparo. Fora de sessão/início pendente, sair continua liberando-a.

REC depende do início real e âncora persistida. Pausa encerra segmento, retomada
abre outro; erros não encerram GPS. Durante gravação há ação para desligar somente
vídeo. A biblioteca consulta metadados por proprietário: data, segmentos, câmera,
resolução, MIME, duração conhecida/estimada, bytes e estado. Reprodução abre
arquivo real sob ação; não há thumbnail fictícia. Exclusão continua confirmada.

## J. Estúdio, sincronismo e exportação

O estúdio reutiliza `VideoOverlayEntry`/player, resolver e renderer; entrada
própria com seleção de gravação. Layouts Compacto/Completo/Pista, indicadores,
posição, linha temporal, taxas e offset manual de ±60 s em passos de 100 ms.
Ausências ficam `—`; nenhuma âncora/medição original é reescrita.

Exportador existente grava composição real em Canvas/MediaRecorder, com codec
efetivamente oferecido, progresso/cancelamento e validação do arquivo. WebM/MP4
dependem de suporte de codificação; áudio exige escolha e confirmação da trilha.
Cópia original continua separada. O pipeline preserva originais e limpa temporários
em falhas. A regressão verifica reprodução, frames compostos e integridade.

**Importação externa não implementada**, conforme a exceção técnica permitida no
pedido: `VideoSegment` depende de âncoras da captura do Ride. Falta um contrato
específico de procedência/alinhamento e validação de mídia externa. Não há botão
decorativo, upload ou associação por nome/data. A limitação aparece na ajuda.

## K. Offline e recuperação

Reutilizados coordenador, checkpoints transacionais, fila, leases, idempotência e
recuperação. O painel compacto mantém conexão/estado e erros à vista; detalhes de
armazenamento e atividades ficam na expansão. Somente `transaction.complete`
confirma armazenamento; memória não é apresentada como arquivo salvo. Recuperação
encerra no checkpoint persistido, sem reconstruir tempo/posições enquanto fechado.
Salvar localmente e confirmação remota continuam diferentes; não há XP duplicado.

GPS não depende da internet, mas permissão/hardware/SO continuam necessários.
Shell offline não equivale a mapa offline. Vídeos são locais, sujeitos a quota,
evicção e limpeza do navegador, sem promessa de permanência/nuvem.

## L. Privacidade e autorização

Nenhum endpoint ou política de autorização foi relaxado. Moto da Garagem da conta,
percurso/evento elegíveis, CSRF e validação remota preservados. Conteúdo local usa
proprietário no repositório e na seleção visual; biblioteca de outra conta não
aparece. Iniciar Ride não inicia GPS social, feed, upload de vídeo ou divulgação
de trilha. Logout/troca de conta preservam interrupção/isolamento existentes.

## M. Testes e desempenho

- `pnpm check`: **783 testes aprovados** (276 API + 507 web), TypeScript,
  ESLint, Prettier e build. Log `.local/refinamento5-check-entrega.log`.
- PostgreSQL/PostGIS: **369/369**, em execução própria; não se contaram os
  369 casos ignorados no check padrão. Log `.local/refinamento5-postgres.log`.
- Recuperação: **aprovada**, backup/restauração sintéticos com 33 migrações,
  hashes de 93 tabelas, constraints, índices, SRID, mídia e autorização de conta.
  Log `.local/refinamento5-recovery.log`. Não comprova RPO/RTO de produção.

A regressão completa após os ajustes executou **116 cenários**: 109 aprovações
na primeira rodada e sete falhas, preservadas em
`.local/refinamento5-regressao-final.log`. Seis dependiam da apresentação antiga
(selects, texto removido, seletor de modo durante gravação e leitura de valor de
um controle convertido em rádio). O caso de Replay precisava abortar explicitamente
o provedor simulado: `route.fulfill` continuava atendendo mesmo com a rede offline.
O bloqueio do grupo de opções também recebeu `aria-disabled`, mantendo os inputs
nativos efetivamente desabilitados. **58/58 cenários repetidos em 12 grupos passaram**, com build final e banco novo
por arquivo. As sete falhas foram resolvidas: **116 cenários distintos validados
na consolidação**, sem falha pendente. Resultados nos logs
`.local/refinamento5-validado-*.log` e `.local/refinamento5-consolidado.json`.

As rodadas iniciais registraram falhas reais: configuração de launchOptions no
describe do novo teste; fixture com sentido de largada incompatível; câmera
desligada na desmontagem da preparação; seletores ambíguos de status/título e
armazenamento. Corrigidos e repetidos, sem remover cenários ou mudar limiares de qualidade da telemetria.
Uma tentativa de build detectou tipo opcional na fixture antes da rodada ampla;
essa rodada usou o build anterior e não é apresentada como aprovação final.

Benchmark sintético Windows/Node: 216.000 amostras equivalentes a 3 h em 20 Hz,
120,0 ms de processamento do diagnóstico; 100 cálculos de métricas com 50.000
pontos, média 3,94 ms por cálculo. Dados em `.local/refinamento5-performance.json`.
É execução acelerada de CPU, sem medição de bateria, duração real, câmera longa
ou homologação móvel. MapLibre mantém o aviso de bundle grande existente.

## N. Capturas e comparação

**99 capturas de Ride + 88 dos ajustes**, além de oito referências fornecidas.
Galeria local: [Etapa 5 — comparação](../../.local/screenshots/refinamento5/index.html).
Inclui referências fornecidas e cenas reais do aplicativo executado com fixtures
explicitamente sintéticas: sem moto, preparação/opcionais recolhidos, diagnóstico,
calibração, espera GPS, gravando, pausado, rota, G válido, telemetria, circuito/volta,
sessões, biblioteca, estúdio e resumo/offline. Larguras 320/360/375/390/430/768/1024/
1440 e paisagem 844×390. Capturas completas e de viewport distinguem rolagem da
posição fixa da barra inferior. Há galeria adicional dos ajustes de Guia, menu,
eventos, filtros, planejamento, configurações e desempenho em
[Capturas dos ajustes](../../.local/screenshots/refinamento5-ajustes/index.html).
Fixtures visuais não são testes físicos.

## O. Limites físicos e técnicos

Android intermediário/superior e iPhone Safari/PWA não foram disponibilizados.
O [roteiro atualizado](../qa-mobile.md) exige GPS, permissões, cada canal, montagem,
calibração, assistência, câmera/áudio, pausas, background/bloqueio, chamadas,
armazenamento, recuperação, exportação/codec/áudio, paisagem e safe areas.

Sem garantia de captura em segundo plano, precisão metrológica, inclinação
dinâmica, mapas completos offline ou exportação longa em qualquer celular.
Segmento original limitado a 256 MiB; composto a 128 MiB; exportação em tempo
real/página ativa e codecs compatíveis. Provedores OSRM/MapTiler da Etapa 4
continuam dependências externas não homologadas. Não se executaram ensaios físicos
perigosos nem se alterou infraestrutura de produção.

## P. Arquivos modificados

Inventário por SHA-256: **105 arquivos** nesta etapa e nos ajustes aprovados.
Não corresponde ao `git status` agregado, que também inclui as Etapas 1–4.

- `README.md`
- `apps/web/e2e/auth.spec.ts`
- `apps/web/e2e/choices.ts`
- `apps/web/e2e/design-system.spec.ts`
- `apps/web/e2e/explore-navigation.spec.ts`
- `apps/web/e2e/guide-ux.spec.ts`
- `apps/web/e2e/history.spec.ts`
- `apps/web/e2e/home.spec.ts`
- `apps/web/e2e/interface.spec.ts`
- `apps/web/e2e/premium-ride.spec.ts`
- `apps/web/e2e/replay.spec.ts`
- `apps/web/e2e/ride-settings.ts`
- `apps/web/e2e/rides.spec.ts`
- `apps/web/e2e/routes.spec.ts`
- `apps/web/e2e/similarity.spec.ts`
- `apps/web/e2e/social.spec.ts`
- `apps/web/e2e/video-overlay.spec.ts`
- `apps/web/e2e/video.spec.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/admin/AdminPage.tsx`
- `apps/web/src/admin/MyCases.tsx`
- `apps/web/src/auth/returnTo.ts`
- `apps/web/src/comparison/ComparisonResults.tsx`
- `apps/web/src/components/Layout.tsx`
- `apps/web/src/components/design-system.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/events/EventDetailsPage.tsx`
- `apps/web/src/events/EventForm.tsx`
- `apps/web/src/events/EventLiveMapPage.tsx`
- `apps/web/src/events/EventsPage.tsx`
- `apps/web/src/events/LiveBanner.tsx`
- `apps/web/src/gamification/AchievementsPage.tsx`
- `apps/web/src/gamification/Progress.tsx`
- `apps/web/src/gamification/RankingsPage.tsx`
- `apps/web/src/gamification/XpHistoryPage.tsx`
- `apps/web/src/garage/GaragePreview.tsx`
- `apps/web/src/groups/GroupDetailsPage.tsx`
- `apps/web/src/groups/GroupForm.tsx`
- `apps/web/src/groups/GroupsPage.tsx`
- `apps/web/src/history/HistoryFilters.tsx`
- `apps/web/src/history/HistoryPreview.tsx`
- `apps/web/src/history/OfflineHistory.tsx`
- `apps/web/src/history/RidePrivacyControls.tsx`
- `apps/web/src/home/HomeMotorcycle.tsx`
- `apps/web/src/home/HomePerformance.tsx`
- `apps/web/src/home/HomeRecentRides.tsx`
- `apps/web/src/navigation/NavigationPage.tsx`
- `apps/web/src/offline/OfflinePanel.tsx`
- `apps/web/src/pages/AccountPage.tsx`
- `apps/web/src/pages/CommunityPage.tsx`
- `apps/web/src/pages/ComparisonPage.tsx`
- `apps/web/src/pages/DiscoveriesPage.tsx`
- `apps/web/src/pages/ExplorePage.tsx`
- `apps/web/src/pages/GaragePage.tsx`
- `apps/web/src/pages/GuidePage.tsx`
- `apps/web/src/pages/HistoryPage.tsx`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/pages/LocalRideDetailsPage.tsx`
- `apps/web/src/pages/PublicRidePage.tsx`
- `apps/web/src/pages/ReplayPage.tsx`
- `apps/web/src/pages/RideDetailsPage.tsx`
- `apps/web/src/pages/RidePage.tsx`
- `apps/web/src/pages/RideStatisticsPage.tsx`
- `apps/web/src/pages/RideWorkspacePages.tsx`
- `apps/web/src/pages/RoutePages.tsx`
- `apps/web/src/pages/SimilarityPage.tsx`
- `apps/web/src/ride/AdvancedResults.tsx`
- `apps/web/src/ride/MotionForceCards.tsx`
- `apps/web/src/ride/MotionPreparation.tsx`
- `apps/web/src/ride/RideCircuitPanel.tsx`
- `apps/web/src/ride/RideDashboard.tsx`
- `apps/web/src/ride/RideSectionNav.tsx`
- `apps/web/src/ride/RideSummary.tsx`
- `apps/web/src/ride/SensorDiagnostics.tsx`
- `apps/web/src/ride/SpeedSettings.tsx`
- `apps/web/src/ride/TelemetryCharts.tsx`
- `apps/web/src/ride/controller.ts`
- `apps/web/src/routes/DestinationSearch.tsx`
- `apps/web/src/services/motion/capture.ts`
- `apps/web/src/services/motion/diagnostics.test.ts`
- `apps/web/src/services/motion/diagnostics.ts`
- `apps/web/src/services/motion/types.ts`
- `apps/web/src/similarity/SimilarGroups.tsx`
- `apps/web/src/social/CommunityPreview.tsx`
- `apps/web/src/social/Composer.tsx`
- `apps/web/src/social/Feed.tsx`
- `apps/web/src/social/Profile.tsx`
- `apps/web/src/styles/explore.css`
- `apps/web/src/styles/guide.css`
- `apps/web/src/styles/history.css`
- `apps/web/src/styles/navigation.css`
- `apps/web/src/styles/ride-workspace.css`
- `apps/web/src/styles/video.css`
- `apps/web/src/video/VideoLibrary.tsx`
- `apps/web/src/video/VideoPanel.tsx`
- `apps/web/src/video/overlay/VideoExportPanel.tsx`
- `apps/web/src/video/overlay/VideoOverlayPlayer.tsx`
- `docs/gps-assistido.md`
- `docs/progresso.md`
- `docs/qa-mobile.md`
- `docs/refinamento/etapa-05-ride-telemetria.md`
- `docs/sensores.md`
- `docs/sessoes.md`
- `docs/video-overlay.md`
- `docs/videos.md`

## Q. Pendências

Homologação física e operacional permanece aberta; critérios dependentes dela
não estão aprovados por causa da UI ou de simulação. Importação externa requer
contrato seguro próprio. Calibração em sessão aberta, altimetria de Ride com
qualidade vertical, cronometragem oficial e satélite/provedores externos não foram
introduzidos. Não há alegação de lançamento aprovado. A aprovação visual do
usuário e seus ajustes complementares estão registrados; validações físicas
permanecem pendentes.

## R. Preparação para a Etapa 6

Seleção/foto/dados da motocicleta consomem `GarageProvider` e contrato atual.
Sessões mantêm identidade e moto histórica; um catálogo/ficha técnica futuros
podem evoluir a Garagem sem outro controlador de Ride. A Etapa 6 não foi iniciada.
