# Parte 13/23 — Replay Animado de Telemetria

Implementação local de 23/10/2026. Escopo exclusivo do replay privado; sem deploy
e sem implementação da Parte 14. Homologação em Android/iPhone físicos pendente.
Arquitetura e roteiro completo: [manual do replay](replay.md).

## A. Funcionalidades implementadas

Acesso em **Histórico → detalhes → Reproduzir Ride**, incluindo atividades locais.
Carregamento progressivo de originais, preparo de tempo ativo, percurso completo,
marcador temporal, indicadores sincronizados, Play/Pause/Resume, Restart, busca
exata, saltos de dez segundos, velocidades 0,5×/1×/2×/4×, gráficos com cursor,
seleção de eventos/voltas, limites de pausas/lacunas, movimento reduzido e retorno
ao Histórico. Estados indisponível/erro explicam a falta de dados, sem animação
fictícia. Cabeçalho, abas, botão Ride e identidade Racing Tech preservados.

## B. Principais arquivos

Criados `src/replay/{timeline,engine,load,ReplayPanel,ReplayMarks,OfflineReplayTrace}`,
`pages/ReplayPage.tsx`, `styles/replay.css` no web e `modules/rides/replay.ts` na API.
Alterados `App.tsx`, detalhes locais/remotos, `RideMap.tsx`, `rideMapController.ts`,
`TelemetryCharts.tsx`, cliente HTTP e serviço do histórico para integração e
cancelamento. Novos testes de timeline/motor/sincronização/paginação e navegador;
testes do mapa e do Histórico PostgreSQL ampliados. README e progresso atualizados.
O [manual](replay.md) detalha a função de cada arquivo. Não há nova dependência,
migração ou reestruturação do monorepositório.

## C. Motor

`ReplayEngine` independe de React e usa tempo monotônico, base/âncora e velocidade.
Pausar conserva a posição e cancela o único RAF; retomar redefine a âncora. Busca
usa milissegundos ativos e suporta drag com retomada. Velocidade não modifica
dados/métricas. Conclusão limita o tempo; ocultar a página pausa sem salto na volta.
Desmontagem cancela animação, consultas e listeners.

## D. Mapa

O controlador MapLibre existente mantém uma instância, percurso segmentado,
início/fim, parte restante grafite e parte percorrida vermelha. A interpolação
esférica curta exige pontos confiáveis, mesmo segmento/intervalo, até 5 s e 500 m;
não altera GPS ou métricas. Lacunas escondem o marcador até outra posição válida.
Arrastar/zoom suspende acompanhamento, restaurável pelo controle; há enquadramento
completo e câmera atualizada ao cruzar pelo menos um segundo da atividade.

## E. Telemetria

Velocímetro circular e cards existentes consultam o mesmo instante. GPS original
e processamento assistido persistido conservam origem e expiram sem converter
ausência em zero. Força G exige qualidade/calibração e preserva campos separados
de aceleração e frenagem. Inclinação usa somente registro válido; atualmente
permanece indisponível porque o esquema anterior não registra inclinação dinâmica.

## F. Gráficos

Gráficos existentes recebem séries em tempo ativo, preparadas uma vez, com lacunas
preservadas. Cursor usa o store do motor, até 10 Hz; toque busca o instante pelo
mesmo motor. A linha do tempo oferece consulta acessível por teclado. Redução de
exibição não reduz a resolução dos dados originais usados na busca.

## G. Eventos e voltas

Somente eventos persistidos, com status estimado/inconclusivo/rejeitado, são
marcados/listados; botões buscam o início. Voltas usam registros associados a
circuito verificado em Modo Pista. Instantes atuais são destacados; não há nova
detecção de eventos/voltas, correção de tempos ou ranking. Séries/limites com
origem temporal não confiável são omitidos.

## H. Dados/API

Os contratos de resumo, track, telemetry, events e laps foram preservados.
Track/telemetry reduzidos não atendiam à precisão temporal, justificando
`GET /api/rides/:id/replay?kind=meta|gps|motion|speed&page=1&limit=1000`.
Respostas de série têm até 2.000 amostras e `hasMore`; metadados são `replay-1`.
GPS/eventos/voltas são epoch em ms; sensores/velocidade usam `startedAt+relativeMs`.
`eventTimestamp` não é usado para sincronização. Intervalos ativos removem pausas
sem conectar segmentos. Os dados derivam das tabelas anteriores, sem duplicação
persistida. O limite geral de consultas continua aplicável.

## I. Offline

Leitura por proprietário/client ID no IndexedDB, sem exigir sincronização.
Sem tiles, traçado SVG/marcador e indicadores continuam disponíveis. Contexto
autenticado local e shell offline previamente instalado continuam sendo requisitos.
Falhas de rede/503 podem usar cópia confirmada da própria conta; 401/404 não recebem
esse fallback. A conciliação anterior mantém um único Ride após sincronizar.
Voltas locais dependem de referências já gravadas; não são calculadas no replay.

## J. Privacidade

Todas as páginas do endpoint verificam autenticação, proprietário e exclusão.
Outra conta recebe 404 mesmo para atividade pública; sem sessão, 401.
`Cache-Control: private, no-store`. Resumo compartilhado permanece independente,
sem replay/coordenadas precisas. Nenhuma nova transmissão de telemetria ou log de
coordenadas. O provedor de tiles existente continua vendo a região dos tiles pedidos.

## K. Verificações

Resultados finais executados neste ambiente:

| Verificação              | Resultado                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`             | TypeScript, lint, formatação, testes e builds aprovados                                                                        |
| Suíte padrão             | 461 aprovados: 157 API e 304 web; PostgreSQL não contado como aprovado enquanto ignorado nesta suíte                           |
| `pnpm test:postgres`     | 132 aprovados com PostgreSQL/PostGIS reais, incluindo 4 novos contratos de replay                                              |
| Chrome/Playwright        | 48 cenários distintos aprovados, incluindo a reexecução dirigida do caso longo                                                 |
| Atividade longa          | 50.000 pontos reais da fixture persistidos, carregados em 50 páginas, busca ao fim/início e reprodução; caso aprovado em 8,2 s |
| Responsividade do replay | 320/360/375/390/430/1440 px, sem overflow; screenshots geradas, inspeção visual móvel e desktop                                |

São **641 cenários distintos aprovados**. A execução completa de navegador passou
em 47 casos e falhou no caso longo porque o teste procurava Iniciar depois de uma
busca que corretamente deixou o motor pausado. Corrigida a expectativa para
Continuar, a execução dirigida do caso restante passou. O comando completo original
retornou código 1; não foi apresentado como execução integral sem falhas.
Capturas: `.local/screenshots/replay-{largura}.png`. O mapa usa provedor controlado
nos testes; o banco, autenticação, persistência, IndexedDB e sincronização são reais.
Comandos usados: `pnpm check`, `pnpm test:postgres` e
`pnpm --filter @apex-ride/web test:e2e` (via `npx --yes pnpm@10.34.7`).

Os blocos 13A e 13B foram validados antes da integração visual, com 17 testes de
normalização e 14 do motor. Na integração, testes de mapa/sincronização e leitura
paginada ampliaram a cobertura. Há caso sintético de 50.000 pontos e relógio
controlado, sem depender da velocidade real da máquina para testar precisão.

Durante a verificação foram corrigidos: aceitação de parâmetros desconhecidos na
consulta, interrupções explícitas de sensores nos gráficos, busca que atravessa
o fim durante drag, fragmento visual na busca e controles/timeline do replay.
Testes de navegador inicialmente exigiam uma gravação vazia que a API rejeita e
eventos que a fixture não havia persistido; as fixtures passaram a usar uma sessão
real de um ponto e eventos persistidos. O teste de arrasto passou a colocar o mapa
na área visível antes de interagir. O teste longo também foi corrigido para esperar
Continuar após a busca. Não foram alteradas regras da API para acomodar
fixtures inválidas.

## L. Limitações

Android/Chrome e iPhone/Safari físicos não homologados; memória/fluidez no celular
e retorno após bloqueio precisam do roteiro do manual. Testes responsivos em Chrome
não equivalem à execução de Safari/iOS. Tiles reais não são requisito dos testes
automatizados de replay; o provedor é controlado nos testes de interface.
Inclinação dinâmica permanece ausente no modelo atual. Sessões sem intervalos
confiáveis/dois GPS válidos explicam indisponibilidade. Séries truncadas não são
reconstruídas. A prévia SVG sem tiles é regional, sem projeção global/polar.
Muitas marcações podem atingir o limite geral de consultas e exigir retentativa.
O build mantém o aviso de tamanho do chunk cartográfico existente; não bloqueia
o build. Nenhuma alegação de certificação física ou de desempenho em celular.

## M. Preparação para a Parte 14

`ReplayInput`, `activeClock` e `frame(time)` já expõem domínio temporal, segmentos,
posição e indicadores sem depender de componentes. O plano de rota versionado e
as métricas históricas existentes poderão relacionar duas atividades à mesma rota,
com um futuro consumidor de comparação reutilizando mapa e séries. A Parte 13
não implementa esse consumidor, reconhecimento de rotas ou vídeo. Uma futura
integração de vídeo também exigirá conversão explícita do seu relógio.
