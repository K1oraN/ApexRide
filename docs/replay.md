# Replay privado de telemetria — Parte 13

## Uso

Entre na conta, abra **Histórico → atividade → Reproduzir Ride**. O replay começa
parado, com o percurso completo. Use Iniciar, Pausar/Continuar, Reiniciar, os saltos
de dez segundos, a linha do tempo ou os gráficos. As velocidades são 0,5×, 1×, 2×
e 4×; elas modificam apenas o relógio de reprodução. Saia por Voltar ao histórico.
Nenhum coletor GPS/sensor é iniciado pelo replay.

Eventos e voltas registrados possuem início/fim e botões de busca. A lista tem
páginas de 50 marcações; a marcação atual aparece separadamente. Âmbar na linha
do tempo representa pausas e intervalos sem posição. Os primeiros 50 limites
também podem ser consultados em texto. O mapa e os gráficos preservam todos os
limites, inclusive os que não cabem na lista textual.

## Arquitetura e arquivos

| Arquivo                                             | Responsabilidade                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/replay/timeline.ts`                   | Normalização, intervalos ativos, índices binários, qualidade, posição visual e séries dos gráficos |
| `apps/web/src/replay/engine.ts`                     | Relógio monotônico independente de React, estados e comandos                                       |
| `apps/web/src/replay/load.ts`                       | Originais paginados, cancelamento e adaptação de dados locais                                      |
| `apps/web/src/replay/ReplayPanel.tsx`               | Controles e componentes existentes de velocímetro, mapa e métricas                                 |
| `apps/web/src/replay/ReplayMarks.tsx`               | Limites temporais e seleção de eventos/voltas                                                      |
| `apps/web/src/replay/OfflineReplayTrace.tsx`        | Traçado e marcador sem base cartográfica                                                           |
| `apps/web/src/pages/ReplayPage.tsx`                 | Carregamento, erro, proprietário e fallback local                                                  |
| `apps/web/src/components/maps/rideMapController.ts` | Extensão do controlador MapLibre existente para replay                                             |
| `apps/web/src/ride/TelemetryCharts.tsx`             | Gráficos existentes com cursor e busca pelo mesmo motor                                            |
| `apps/api/src/modules/rides/replay.ts`              | Leitura privada e paginada das séries originais                                                    |

As páginas de detalhes e `App.tsx` receberam somente acesso/rotas internas.
`styles/replay.css` usa os componentes e tokens existentes, com controles de toque
de pelo menos 44 px. As cinco abas, cabeçalho e botão Ride permanecem preservados.
O cliente HTTP recebeu um sinal opcional para cancelar consultas ao sair da página.

## Modelo temporal e conversão de timestamps

Todos os tempos internos de replay estão em **milissegundos ativos desde o início
da atividade**. Os dados originais não são escritos nem modificados.

| Fonte persistida                   | Conversão                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sessão `started_at`/`ended_at`     | PostgreSQL `timestamptz` → epoch em ms, como `startedAt`/`endedAt`                                                 |
| `active_intervals`                 | Limites absolutos epoch em ms; recorte na sessão, ordenação e união de sobreposições                               |
| GPS `recorded_at`                  | Epoch em ms; associação ao intervalo ativo correspondente                                                          |
| Sensor `relative_ms`               | `startedAt + relativeMs`; somente contrato `motion-1` é confiável                                                  |
| Sensor `event_timestamp`           | Preservado para diagnóstico do registro; nunca usado para sincronização                                            |
| Velocidade processada `relativeMs` | `startedAt + relativeMs`, contrato `speed-1`; `gpsTimestamp` precisa apontar para um GPS válido do mesmo intervalo |
| Eventos `start_ms`/`end_ms`        | Já são epoch em ms, apesar do nome; mesma conversão para tempo ativo                                               |
| Voltas `started_at`/`ended_at`     | Epoch em ms, convertido pelos mesmos intervalos                                                                    |

Cada instante válido recebe o deslocamento acumulado dos intervalos anteriores.
Intervalos encostados permanecem separados; sobreposições não duplicam tempo.
No limite de uma pausa comprimida, a leitura do intervalo retomado prevalece.
Tempo decorrido e pausado ficam disponíveis separadamente. Não se adivinha uma
origem temporal por magnitude, frequência de amostragem ou índice de array.

Amostras fora da sessão/intervalos ativos, timestamps inválidos e duplicados são
descartados. Duplicatas conservam a primeira ocorrência temporal estável. Séries
de sensores sem referência relativa válida, sem versão/calibração ou com qualidade
rejeitada ficam ausentes. Não há fallback para o relógio bruto do navegador.
Sem intervalos ativos confiáveis, o replay é considerado indisponível, sem inferir
pausas a partir da distância ou de um resumo. Sessões GPS antigas do esquema
existente já possuem esses intervalos e não precisam de sensores.

## Lacunas e posição visual

A posição só interpola entre GPS aceitos do mesmo segmento e intervalo ativo,
com distância de até 500 m e intervalo de até 5 s. A função compartilhada
`acceptablePoint` rejeita qualidade/coordenadas inválidas e saltos impossíveis.
Uma amostra rejeitada também interrompe a continuidade até o próximo ponto válido.

A interpolação usa vetores unitários na esfera e arco de grande círculo curto,
incluindo travessia do antimeridiano. É aproximação visual para pontos próximos,
sem correspondência viária, inferência de curvas ou correção pela rota planejada.
`interpolated: true` distingue a posição visual da amostra original. Ela nunca
alimenta métricas, detecção de eventos, força G ou inclinação.

Em pausas, quebras e lacunas não há linha conectando segmentos. O marcador fica
ausente entre trechos sem continuidade e reaparece em uma amostra válida. Também
fica ausente após a última posição, em vez de representar movimento não registrado.
O relógio continua nesses intervalos e a interface informa os dados ausentes.

## Motor e ciclo de vida

Estados: idle, loading, ready, playing, paused, seeking, completed e error.
O carregamento/preparo também possui mensagens próprias na página. O motor
oferece play, pause, resume, restart, seek, setPlaybackSpeed, stop e cleanup.

Durante reprodução: `tempo = base + (performance.now() - âncora) × velocidade`,
limitado à duração ativa. Alterar velocidade captura a posição anterior antes de
trocar a âncora. Pausar cancela o único `requestAnimationFrame`; retomar cria uma
nova âncora. Busca trabalha com tempo, inclusive dentro de lacunas. Arrastar pausa
temporariamente e retoma se a reprodução estava ativa. Ao chegar ao fim, permanece
concluído; um novo Play começa do início. Um registro em memória impede dois
motores ativos para o mesmo identificador no mesmo contexto JavaScript.

`visibilitychange` pausa ao ocultar e não retoma automaticamente. Desmontar cancela
o frame, as consultas, os listeners de visibilidade, os observadores e a instância
MapLibre. Não existe reprodução de fundo. A proteção de múltiplos motores não é
um bloqueio entre abas; cada página visível tem seu próprio estado de consulta.

## Sincronização e performance

Posição, velocidade, sensores, eventos, voltas e cursor consultam o mesmo tempo.
Velocidade GPS expira após 1,5 s; velocidade processada e sensores após 500 ms.
O GPS usado como âncora de velocidade processada deve ter até 1,5 s. Uma leitura
processada explicitamente indisponível permanece indisponível no seu intervalo de
validade; não é convertida em zero. Sem leitura processada atual, pode ser usado o
GPS original ainda válido, com origem identificada. Não se executa o estimador
assistido durante o replay.

Força G exige sensor `browser-linear`, qualidade `limited`, calibração válida
anterior à amostra e modo avançado. Aceleração/frenagem são campos separados;
o gráfico longitudinal usa aceleração menos frenagem. Interrupções explícitas
invalidam a leitura anterior e quebram os gráficos. Inclinação usa somente valores
persistidos confiáveis; o esquema atual persiste `lean = null`, logo permanece
indisponível. Não é calculada pela direção GPS.

Os gráficos da Parte 12 são preparados uma vez, com redução de exibição até 600
pontos por série, sem alterar a busca nos originais. Lacunas quebram caminhos SVG.
Somente o cursor se atualiza pelo store do motor; tocar o gráfico busca pelo mesmo
relógio. A linha do tempo continua sendo a alternativa acessível por teclado.

O marcador MapLibre pode atualizar por frame. React/cartões/cursor recebem até
10 atualizações/s. O mapa mantém fontes estáticas do trajeto completo e das arestas
registradas: `feature-state` altera somente as arestas atravessadas/revertidas.
Um fragmento visual de duas coordenadas é atualizado até 10 vezes/s, ou na busca.
A câmera acompanha ao cruzar pelo menos um segundo da atividade (até quatro
atualizações por segundo real em 4×), sem recentralizar a cada frame. Arrastar/zoom suspende o
acompanhamento; controles permitem voltar a acompanhar ou enquadrar tudo.

Séries e intervalos usam busca binária. Estatísticas históricas não são recalculadas
por frame. Listas de marcações são paginadas/memoizadas. O teste automatizado de
50.000 pontos cobre preparo e consultas; o cenário de navegador correspondente
cobre a paginação e a interface de uma atividade longa. Esses testes em desktop
não substituem medição de memória/fluidez nos celulares.

## API e privacidade

Os contratos reduzidos `/rides/:id/track` e `/telemetry` continuam intactos: eles
não têm resolução suficiente para posicionamento de replay. Por isso foi adicionado
`GET /api/rides/:id/replay`, com `kind=meta|gps|motion|speed`, `page` e `limit`.
Metadados usam `version: replay-1`; séries retornam `items`, `page`, `hasMore`.
Padrão de 1.000 amostras, máximo 2.000 por resposta; frontend conserva os limites
originais de 50.000 GPS/18.000 sensores/18.000 velocidades. Eventos e voltas usam
os endpoints paginados existentes. A reprodução começa somente após o preparo.
O limite geral existente de leituras autenticadas continua aplicável; volumes
excepcionais de marcações podem exigir retentativa após a janela de consultas.

Cada página exige autenticação e propriedade, inclusive para uma atividade pública;
exclusões lógicas produzem 404. Respostas de replay usam `private, no-store`.
Não há endpoint público de replay, nova tabela, migração ou cópia persistida das
séries. Listagens e resumo público da Parte 12 não recebem os originais. Não são
registradas coordenadas em logs. Nenhum novo serviço recebe telemetria. O provedor
cartográfico existente continua recebendo pedidos de tiles da região visualizada;
ele não recebe as amostras pessoais através desta implementação.

## Offline e limitações

A leitura local usa `offline.repo.read(ownerId, clientId)` e o isolamento existente
por proprietário. Não depende de recibo de sincronização. Uma falha de rede/503 ao
abrir um ID remoto pode usar uma cópia local confirmada correspondente; 401/404
não são contornados por fallback. A conciliação anterior preserva um único Ride.
É necessário contexto autenticado local já disponível; não há novo login offline.
O IndexedDB deve conter amostras suficientes; um resumo isolado não gera replay.

Sem tiles, o traçado SVG projetado e o marcador funcionam localmente. Essa prévia
plana é voltada a trajetos regionais; não é uma base cartográfica para percursos
globais/polares. A navegação offline após recarga depende do shell previamente
instalado pelo Service Worker. Nenhum cache novo de tiles/API foi acrescentado.

Voltas locais só aparecem se já houver referências persistidas em
`telemetry.lapContext.laps`. O armazenamento local atual normalmente não contém
essas referências; o replay não executa `detectLaps` para fabricá-las. Voltas do
servidor usam `ride_laps`, com circuito verificado e Modo Pista. Eventos são os
persistidos, incluindo seus estados estimado/inconclusivo/rejeitado; não há nova
detecção durante reprodução. Marcas sem alinhamento temporal confiável ficam ausentes.

Preferência de movimento reduzido ativa consulta sem animação: a linha do tempo,
eventos, voltas e gráficos permanecem utilizáveis. O usuário pode habilitar a
animação explicitamente. Falhas de mapa não impedem telemetria e controles.

## Roteiro real Android/iPhone — pendente

Executar em **Android/Chrome** e **iPhone/Safari**, registrando modelo, sistema,
versão do navegador, memória inicial/final quando disponível e duração do ensaio.
Usar HTTPS e atividades de teste já gravadas; não é necessário pilotar.

1. Login → Histórico → atividade → Reproduzir Ride; verificar percurso completo.
2. Iniciar, conferir marcador, velocidade e origem, G separado e inclinação ausente
   ou registrada. Conferir cursor e indicadores no mesmo instante.
3. Pausar por 30 s, continuar, alterar entre as quatro velocidades e reiniciar.
4. Arrastar/tocar a linha do tempo, inclusive nos limites de pausa/lacuna; confirmar
   ausência de linhas/movimentos falsos. Conferir saltos de dez segundos.
5. Tocar um gráfico, evento e volta registrados; comparar instantes com a gravação.
6. Arrastar mapa/zoom e restaurar acompanhamento. Enquadrar percurso completo.
7. Trocar de aplicativo/bloquear tela por 30 s; voltar e confirmar pausa sem salto.
8. Ativar redução de movimento no sistema; consultar instantes sem animação.
9. Testar retrato/paisagem, controles por toque, legibilidade e ausência de overflow.
10. Abrir cópia local salva sem internet; verificar traçado sem tiles e telemetria.
11. Voltar online, sincronizar e confirmar um único Ride no Histórico.
12. Concluir, sair e reabrir. Confirmar interrupção da animação e liberação de memória.

Repetir com GPS apenas, sensores calibrados, GPS Assistido, pausas, perda de sinal,
eventos, circuito com voltas e atividade longa. Registrar fluidez, desvio temporal,
travamentos, crescimento de memória e recuperação após falha de mapa. Marcar cada
caso como aprovado/reprovado/indisponível com evidências, sem presumir aprovação
a partir da execução automatizada em Chrome desktop.

## Reutilização futura

`ReplayInput`, `activeClock`, índices e `frame(time)` podem alimentar um consumidor
futuro de comparação por rota cadastrada: cada atividade manterá seu próprio domínio
temporal e suas séries originais. A associação ao plano versionado existente permite
relacionar posições à rota em uma etapa futura. O motor/mapa não precisam ser
reescritos para receber outro consumidor. Vídeo exigirá mapeamento explícito entre
seu relógio e o tempo da atividade. Nenhuma comparação, detecção de rotas semelhantes,
captura/reprodução de vídeo ou exportação foi implementada nesta parte.
