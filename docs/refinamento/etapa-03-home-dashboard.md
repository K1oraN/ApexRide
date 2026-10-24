# Etapa 3 de 14 — Início e dashboard

Registro de 24/10/2026. Trabalho sobre o workspace existente, preservando Etapas
1/2, autenticação, serviços e controlador. Sem deploy, acesso à VPS, alteração
de banco/backend, dependências novas ou início da Etapa 4.

## A. Diagnóstico anterior e correções

A Home tinha hero, três opções de modo, último Ride, percurso vazio, velocímetro
sem medição, indicadores indisponíveis e prévia comunitária. Faltavam moto
principal, desempenho por período e evolução. Foram consultados README,
auditoria, plano, Parte 02, relatórios das Etapas 1/2, documentação e código
de sessões, Garagem, Histórico, offline e gamificação.

O erro informado foi reproduzido no Vite local: HTTP 200 em
`/src/history/LastRide.tsx` retornava apenas sourcemap com fonte vazia, embora
o arquivo em disco exportasse LastRide. A atualização do módulo invalidou essa
transformação; o servidor passou a entregar JavaScript com exportação nomeada.
O watcher de desenvolvimento aguarda a escrita estabilizar por 250 ms antes
de publicar HMR, reduzindo o risco de transformar um arquivo transitoriamente vazio.
O teste em desenvolvimento verifica esse contrato. Não se criou outra cópia
do componente ou uma exportação fictícia.

`/api/auth/me` retorna 401 sem cookie de sessão válido: contrato de segurança
tratado pelo AuthProvider, distinto da falha de importação. Não foi convertido
em sucesso falso. Login, sessão, expiração e logout permanecem verificáveis.

PageErrorBoundary trata falhas de página dentro do Layout com orientação e recarga
explícita. Mantém providers e navegação; não recarrega automaticamente nem
reinicia um Ride por uma falha de tela.

## B. Nova estrutura

1. Header compartilhado com marca, região do perfil, notificações honestas e avatar.
2. Hero costeiro, saudação da conta e “Encontrar rotas” para `/explorar`.
3. Preparar Ride, retornar à sessão ou revisar atividade local, conforme o estado.
4. Status de GPS, sensores, vídeo e conexão/sincronização.
5. Minha moto: principal cadastrada, foto real ou fallback, dados e detalhes.
6. Desempenho: distância, tempo ativo, XP e conquistas.
7. Até duas atividades recentes com links reais.
8. Evolução compacta: nível, XP e progresso para o próximo nível.
9. Convite à Comunidade, sem duplicar o feed.
10. As cinco abas existentes, com Ride central e estado real.

## C. Fidelidade e revisão das Etapas 1/2

Foram fornecidos seis arquivos e cinco telas distintas: Garagem, Explorar,
Início, Cadastro e Login duplicado. Faltam as referências específicas de Landing,
Ride e Comunidade. A imagem Início é a principal desta etapa.

Reproduzidos: preto/grafite, bordas discretas, vermelho nas ações/ícones,
títulos esportivos, hero fotográfico, moto, desempenho e atividades. Mantidos
tokens, fontes e componentes da Etapa 2. Login/Cadastro mobile perderam a caixa
externa do formulário e o cabeçalho redundante; Cadastro recebeu menor espaço
superior. Labels, senha, confirmação, aceite e autenticação foram preservados.
Landing, Explorar e Garagem conservam a implementação anterior, com revisão por
capturas/testes. Não se promete equivalência pixel a pixel.

## D. Origem dos dados

| Informação      | Fonte e significado                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Saudação/região | AuthProvider e perfil confirmado; sem inferir residência pelo GPS                                         |
| Moto            | GarageProvider, `isPrimary` e foto cadastrada; sem seleção arbitrária de outra moto                       |
| Distância/tempo | `/api/rides/stats`, métricas persistidas; atividades salvas, sem odômetro físico                          |
| Períodos        | Mês/ano do calendário local do navegador, últimos 30 dias ou total; ISO `from` inclusivo e `to` exclusivo |
| XP/nível        | `/api/gamification/me`; saldo confirmado acumulado, identificado como total                               |
| Conquistas      | `/api/gamification/me/achievements`, somente `unlocked`; total independente do período                    |
| Recentes        | `/api/rides?limit=2`: data, métricas, moto histórica e rota quando presente                               |
| Cópias locais   | OfflineCoordinator/IndexedDB da conta atual, fila, confirmação e decisão existentes                       |
| Status          | Snapshots dos serviços GPS/motion/video e ConnectivityService; sem iniciar permissões                     |

Não foram adicionados manutenção, documentos, missões, percentuais de crescimento,
fichas técnicas ou usuários fictícios. XP não é calculado no navegador. Métricas
reutilizam os critérios de salvamento e validação do Histórico, sem confundir
distância de atividades com elegibilidade para XP.

## E. Componentes e performance

Criados: HomeQuickRide, HomeSystemStatus, HomeMotorcycle, HomePerformance,
HomeRecentRides, useHomeOffline e PageErrorBoundary. O hero fica na HomePage.
Reutilizados: Button/ButtonLink, Badge, Card/StatCard, Select, Skeleton,
MotorcyclePhoto, LastRide, ProgressSummary e os providers/hooks existentes.

LastRide ganhou variante compacta sem buscar geometria. A Home não carrega
MapLibre, traçados, séries de telemetria, vídeo ou câmera para preencher cards.
`styles/home.css` compõe o dashboard com tokens compartilhados. Desktop tem
largura máxima/grid; mobile preserva leitura, alvos e duas colunas de status/métricas.

useHistoryStats agora associa resposta/falha à conta e consulta. Trocar período
oculta valores anteriores até a nova resposta; resultados atrasados são ignorados.
Há retry e atualização após reconexão/confirmação de sincronização, sem consultas
a cada tick do GPS. Recentes e evolução compartilham os dados necessários.

## F. Ride e estados

O mesmo RideController informa running, paused, waiting-gps e conclusão, com
texto além de cor. Tempo ativo deriva dos intervalos/relógio existentes, sem pausas.
A rota selecionada não comprova gravação. Atividades locais revisáveis abrem
o detalhe real. Não há outro controlador ou início automático de sensores.

GPS só fica positivo com leitura/coleta válida; sensores dependem de amostras
ativas/calibração; vídeo distingue não iniciado, prévia, gravação e falha.
Conectividade e fila são independentes de recibo: online não confirma envio.

## G. Vazios, offline e isolamento

Conta nova recebe preparação, convite à primeira moto e primeiro Ride. Zero
somente após resposta bem-sucedida. Falhas de garagem, estatísticas e histórico
têm recuperação independente, sem derrubar o restante da Home.

Totais remotos e locais não são somados; pendências ficam explícitas. Recentes
reconciliam client_id, confirmação e recibos. Se a conferência falhar, não misturam
uma cópia local possivelmente sincronizada ao remoto. Offline exibe cópias da
conta no aparelho e não trata o total remoto indisponível como zero. Revisão e
sincronização têm rótulos distintos. A Home aguarda o checkpoint existente antes
de ler as sessões locais.

Dashboard remonta por conta; resultados e leituras locais verificam ownerId.
As proteções da Etapa 1 permanecem: recarga offline não transforma perfil salvo
em sessão autenticada.

## H. Testes

`pnpm check` aprovado novamente em `.local/refinamento3-final-check.log`: tipos API/web,
lint, Prettier, 260 testes API, 458 web e build. Os 367 testes PostgreSQL ignorados
na suíte padrão não contam como execução nova.

Home E2E: cinco aprovados em `.local/refinamento3-home-closure.log`. Cobrem conta
nova, moto/períodos/XP/histórico pelas APIs reais, Ride ativo/pausado, falhas/retry,
offline/revisão e outra conta. Backend/PostgreSQL locais com schema isolado.

| Comando / ensaio                                                                                     | Resultado                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @apex-ride/web test:e2e`                                                              | **105 aprovados em 23 arquivos**, nenhuma falha; `.local/refinamento3-regression.log`                                            |
| `$env:E2E_WEB_MODE='development'; pnpm --filter @apex-ride/web test:e2e -- home.spec.ts --workers=1` | **5 aprovados**; `.local/refinamento3-development-closure.log`                                                                   |
| `node .local/refinamento3-hmr-probe.mjs`                                                             | Escrita vazia intermediária seguida de conteúdo: watcher publicou somente o módulo completo; `.local/refinamento3-hmr-probe.log` |
| Consulta da URL exata informada de LastRide                                                          | HTTP 200 com JavaScript e exportação nomeada, sem sourcemap vazio                                                                |
| `git diff --check`                                                                                   | Aprovado                                                                                                                         |

A regressão usa backend e PostgreSQL reais locais em schemas isolados e inclui
autenticação, Garagem, Ride/GPS, Histórico/replay, offline, rotas/comparação,
Comunidade, grupos/eventos, gamificação, administração e vídeo/overlay.
Os cinco cenários de desenvolvimento repetem cenários da rodada ampla: não são
somados como novas funções distintas. Não foi repetida a suíte PostgreSQL de
367 testes, já que não houve mudança de backend/banco.

Novos testes unitários cobrem mudança de consulta, resposta atrasada, erro/retry,
troca de conta e preservação do pai pela barreira de erro. E2E verifica oito
larguras, cinco abas, links, dados reais e ausência de GPS/câmera/mapa automático.

Falhas intermediárias registradas: teste da barreira de erro precisou retorno
TypeScript `never`; expectativa dos últimos 30 dias foi corrigida à data da fixture;
leitura local após finalizar precisou aguardar flush/refresh do coordenador.
No ensaio de desenvolvimento, a primeira verificação de recursos confundia o
JavaScript dos serviços globais com chamadas de dados de telemetria; o teste
agora distingue módulos de código e endpoints. A simulação offline também passou
a aguardar a Home carregar antes de retirar a conexão, pois Vite dev não possui
o shell offline do build produtivo. A rodada final dos cinco cenários passou.
O ensaio de HMR passou a aguardar a invalidação assíncrona do grafo antes de
examinar a transformação; a escrita completa já é conferida no evento.
Cards estreitos foram corrigidos após inspeção. Essas falhas não são apresentadas
como aprovações. O aviso preexistente do chunk MapLibre acima de 500 kB continua.

## I. Capturas reais

São **26 capturas reais**, além de três referências copiadas para comparação,
em `.local/screenshots/refinamento3/`: conta nova e atividades nas oito larguras,
mais moto sem atividades, Ride ativo/pausado, erro e offline. Fixtures locais,
sem dados de produção ou comprovação física de sensores.

[Galeria e comparação lado a lado](../../.local/screenshots/refinamento3/index.html).
A galeria também contém Landing, Login, Cadastro, Explorar e Garagem revistos.

- [Conta nova](../../.local/screenshots/refinamento3/inicio-vazio-390.png)
- [Moto cadastrada](../../.local/screenshots/refinamento3/inicio-com-moto-390.png)
- [Atividades](../../.local/screenshots/refinamento3/inicio-com-atividades-390.png)
- [Ride ativo](../../.local/screenshots/refinamento3/inicio-ride-ativo-390.png)
- [Ride pausado](../../.local/screenshots/refinamento3/inicio-ride-pausado-390.png)
- [Offline](../../.local/screenshots/refinamento3/inicio-offline-390.png)
- [Falha parcial](../../.local/screenshots/refinamento3/inicio-falha-parcial-390.png)
- [Desktop](../../.local/screenshots/refinamento3/inicio-com-atividades-1440.png)

Capturas da Etapa 2 arquivadas antes da regressão em
`.local/screenshots/refinamento2-anterior-etapa3/`; relatórios anteriores preservados.

## J. Diferenças visuais

Foto/marca autorais existentes aproximam o conceito; fonte exata e fotos isoladas
do mockup não foram fornecidas. Não se usa screenshot como interface. Status
neutros substituem sensores falsamente verdes. XP/conquistas substituem missões
inexistentes. Sem manutenção/documentação inventada. Recentes são tipográficos,
sem mapa fictício. Texto legível/alvos e ação de Ride exigem maior altura no mobile
que o conceito denso. A navegação fixa aparece na posição da viewport nas capturas
completas; há reserva inferior para alcançar o conteúdo. Aviso de pré-lançamento,
senha real e dependência de SMTP foram preservados.

## K. Pendências

Faltam referências específicas de Landing, Ride e Comunidade. Aceite visual do
proprietário, aparelhos Android/iPhone, teclado virtual/safe areas físicos,
leitores de tela e auditoria WCAG completa permanecem pendentes. Notificações
persistentes, avatar, catálogo/fichas e missões pertencem às etapas próprias.
A Etapa 4 poderá reutilizar os componentes/contratos; não foi iniciada.

## L. Arquivos desta revisão

- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/home/HomeRideStatus.tsx`
- `apps/web/src/home/HomeMotorcycle.tsx`
- `apps/web/src/home/HomePerformance.tsx`
- `apps/web/src/home/HomeRecentRides.tsx`
- `apps/web/src/home/useHomeOffline.ts`
- `apps/web/src/styles/home.css`
- `apps/web/src/history/LastRide.tsx`
- `apps/web/src/history/useHistoryStats.ts`
- `apps/web/src/history/useHistoryStats.test.tsx`
- `apps/web/src/components/PageErrorBoundary.tsx`
- `apps/web/src/components/PageErrorBoundary.test.tsx`
- `apps/web/src/components/Layout.tsx`
- `apps/web/src/styles/shell.css`
- `apps/web/src/styles/public.css`
- `apps/web/e2e/home.spec.ts`
- `apps/web/e2e/interface.spec.ts`
- `apps/web/e2e/history.spec.ts`
- `apps/web/playwright.config.ts`
- `apps/web/vite.config.ts`
- `README.md`
- `docs/progresso.md`
- `docs/refinamento/etapa-03-home-dashboard.md`

Outros arquivos já modificados no workspace pertencem às etapas anteriores;
não foram revertidos nem atribuídos integralmente a esta revisão.
