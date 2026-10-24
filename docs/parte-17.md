# Parte 17 — Vídeo com overlay de telemetria e exportação local

Entrega de 23/10/2026, limitada à Parte 17/23, sem deploy e sem implementação da
Parte 18. Design Racing Tech, cinco abas, gravação original, backend e algoritmos
de medição preservados. A validação física Android/iPhone continua pendente.

## A. Funcionalidades

Histórico, resumo e biblioteca local permitem **Assistir com telemetria**,
**Configurar overlay** e **Exportar com telemetria**, por segmento. Prévia Canvas
com Play/Pause/Seek, taxas de reprodução, overlay ativável, ajustes de alinhamento,
layout e indicadores. O original mantém sua reprodução/cópia própria. Sem vídeo
ou sem telemetria, a interface informa a ausência; Replay da Parte 13 permanece.

Os blocos internos foram implementados sequencialmente: 17A (mapeamento/resolver)
foi verificado com 49 testes direcionados de sincronização/Replay/controlador;
17B (renderer/configuração/relógio/player) recebeu testes de layout e controles
antes do encoder; 17C (exportação/storage) recebeu testes de quota, isolamento,
formatos e Chrome nativo; 17D integra documentação, inspeção visual e regressão.
Os testes iniciais de renderer importavam um arquivo de teste com fixtures e
reexecutavam casos de sincronização; as fixtures foram separadas e as contagens
finais não incluem essa duplicação.

## B. Principais arquivos

Em `apps/web/src/video/overlay/`:

| Arquivo                                                             | Função                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| `sync.ts`                                                           | Âncora de mídia → sessão, limites e offset               |
| `resolver.ts`                                                       | Integração com timeline e métricas do Replay             |
| `clock.ts`                                                          | Callback de frames e fallback pelo elemento de vídeo     |
| `config.ts`, `format.ts`                                            | Configuração versionada e tempo comum                    |
| `renderer.ts`                                                       | Frame + velocímetro circular/cards Racing Tech           |
| `VideoOverlayPlayer.tsx`                                            | Carregamento privado/local e controles de prévia         |
| `capabilities.ts`                                                   | MIME/codecs, dimensões e presets                         |
| `media.ts`, `validation.ts`                                         | Decodificação, duração, contêiner, áudio e frames        |
| `export-service.ts`                                                 | Captura Canvas, áudio, encoder, progresso e cancelamento |
| `repository.ts`                                                     | Configurações, snapshots e arquivos/chunks exportados    |
| `VideoExportPanel.tsx`                                              | Formato, áudio, estados, download e compartilhamento     |
| `sync.test.ts`, `renderer.test.ts`, `export.test.ts`, `fixtures.ts` | Testes e dados sintéticos isolados                       |

Outros arquivos criados: `apps/web/e2e/video-overlay.spec.ts`,
`docs/video-overlay.md` e este relatório.

Arquivos modificados: `video/VideoLibrary.tsx`, `video/repository.ts`,
`offline/database.ts`, `styles/video.css`, `pages/RideDetailsPage.tsx`,
`packages/ride-core/index.js` e declaração de tipos, testes anteriores de
migração IndexedDB, README e controle de progresso. O helper de distância foi
extraído da implementação existente; não houve mudança das regras históricas.

## C. Sincronização

`rideElapsedMs + mediaTime*1000 - mediaEstimatedMs + offsetMs`, depois somado ao
início da atividade. Cada arquivo tem origem própria. A timeline do Replay
converte o timestamp para tempo ativo e resolve métricas válidas. Pausa não
consulta amostra anterior/posterior. Offset ±60 s em passos de 100 ms, com
restauração, salva somente apresentação. Não muda GPS, sensores, estatísticas,
âncoras ou vídeo. Precisão aproximada, limitada pelos eventos da Parte 16 e
cadência original; não certificada por frame e sem correção de drift variável.

## D. Renderização

Canvas desenha o frame decodificado e indicadores na mesma superfície, preservando
proporção e orientação. A função é compartilhada entre prévia e encoder. O tempo
vem de requestVideoFrameCallback; fallback pelo currentTime e eventos do player.
Sem contador autônomo, imagens remotas ou interface React reconstruída por frame.
Inspeção das capturas levou ao aumento dos textos no overlay móvel.

## E. Configuração

Compacto, Completo e Pista; seleção de velocidade, G, inclinação, distância,
tempo, modo, moto, circuito/volta e eventos. Cantos inferiores esquerdo/direito,
tempo ativo/decorrido, três qualidades. Indicadores ausentes mostram “—”. G e
inclinação são estimativas, com calibração/qualidade do Replay. Circuitos exigem
referência verificada e eventos/voltas são apenas os persistidos válidos.
Preferência reutilizável não transfere offset, identificação do arquivo nem
consentimento de áudio. Versões da configuração e renderer ficam no snapshot.

## F. Exportação

Implementada estratégia A: Canvas.captureStream + MediaRecorder, em tempo real,
um segmento por arquivo. Não há WebCodecs, muxer próprio, consolidação ou
processamento em nuvem. MIME potencial é verificado antes; construção e execução
podem falhar. Progresso usa duração de mídia efetivamente processada. Há etapas
de preparação, formato, frames/codificação, finalização, validação e conclusão,
além de erro/cancelamento.

Antes de concluir: conferir assinatura do contêiner, duração finita com tolerância
max(500 ms, 5%), resolução, reprodução, decodificação em 10/50/90% e áudio quando
solicitado. Arquivo final contém os indicadores queimados nos frames; download
nunca entrega HTML ou original rotulado como composto.

## G. Formatos

No Chrome desktop 155.0.8059.85 / Windows, o fluxo da Parte 16 produziu fontes WebM e MP4. Os testes
da Parte 17 produziram WebM VP9 e MP4 AVC/H.264 sem áudio e WebM VP9/Opus com
áudio. A extensão segue o MIME real, com verificação de cabeçalho e reprodução.
VP8 é outro candidato detectável; não foi necessário para os testes nativos.
MP4/AAC não foi homologado com áudio. Nenhum resultado é garantia para iPhone
ou Android. Presets e codecs suportados são detectados no aparelho.

## H. Áudio

Opt-in, obtido da mídia original via Web Audio, encaminhado a um único destino
de stream, sem alto-falantes duplicados e sem nova solicitação de microfone.
MIME de vídeo+áudio e confirmação de trilha são exigidos. Falha não converte
silenciosamente para vídeo mudo. O usuário pode escolher explicitamente exportar
sem áudio. Escuta, drift e interrupções em aparelhos físicos seguem pendentes.

## I. Segmentos

Arquivos da Parte 16 são identificados individualmente, com codec, câmera,
resolução, estado e intervalo sem filmagem. Selecionar outro segmento desmonta o
player anterior e utiliza a âncora correspondente. Não há concatenação de bytes
de arquivos distintos. Prefixos contíguos de gravações incompletas podem tentar
reprodução, com aviso; não são promovidos a íntegros nem exportados como tal.

## J. Armazenamento

IndexedDB v4, migração aditiva. Chunks exportados são escritos incrementalmente;
finalização monta Blob lógico para validação/download. Limite operacional:
256 MiB para fonte e 128 MiB por resultado, com guarda adicional de 16 MiB de
escrita pendente. Verificação conservadora de tamanho/quota, presets sem upscale,
reserva contra encoder concorrente e limpeza de trabalhos expirados.
Exportações concluídas têm exclusão explícita e snapshot imutável. Excluir mídia
ou atividade limpa resultados/configurações associados. Original não é sobrescrito.

## K. Privacidade

Nenhum upload de vídeo, frame ou áudio foi implementado. Backend e sincronização
continuam sem mídia. Dados locais por proprietário; outra conta não vê arquivos
da anterior pela interface. Download é explícito; compartilhamento nativo exige
ação e aviso de conteúdo sensível. URLs e recursos temporários são liberados.
Metadados de exportação não incluem coordenadas. O hash SHA-256 dos chunks
originais foi comparado antes/depois de falha, interrupção e exportação nativa.

## L. Verificação

**796 cenários distintos aprovados**, incluindo 35 testes novos de unidade /
integração e três novos fluxos Chrome. Reexecuções direcionadas não são contadas
como novos cenários. Os 160 casos PostgreSQL ignorados na suíte padrão foram
executados separadamente contra o banco real.

| Comando                                 | Resultado                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm check`                            | TypeScript, lint, formatação, 578 testes e builds API/web aprovados             |
| `pnpm test:postgres`                    | 160 testes em sete arquivos aprovados, PostgreSQL/PostGIS real                  |
| `pnpm --filter @apex-ride/web test:e2e` | 58 testes Chrome aprovados em 14 arquivos, incluindo regressão das Partes 01–16 |

Ambiente: Node 24, pnpm 10.34.7, Playwright 1.64.1, Chrome headless com câmera /
microfone sintéticos e GPS controlado. Capturas em 320/360/375/390/430/1440 px,
sem overflow; prévia e arquivo composto inspecionados visualmente. Os testes
nativos também decodificam os frames do resultado, conferem sua duração e
verificam download, MIME e extensão. O build mantém o aviso anterior de tamanho
do chunk MapLibre; não houve erro de build ou teste pendente na regressão final.

Logs locais: `.local/parte-17-check.log`, `.local/parte-17-browser.log` e
`.local/parte-17-postgres.log`. Screenshots: `.local/screenshots/overlay-*.png`.
O teste de frames salva evidências JSON em `.local/screenshots/overlay-frames-*.json`,
com MIME, dimensões, duração e pontuação de correspondência dos números, e também
as anexa aos resultados em `.local/playwright-results`. Os três novos fluxos foram
reexecutados no build final após os ajustes de recursos e interface.

Nos fluxos Chrome: gravação real com dispositivos sintéticos; prévia offline;
Play/Pause/Seek/2×; layout/offset; cancelamento; fonte WebM/MP4; codificação
WebM/MP4; vídeo+áudio; falha do encoder; suspensão; restauração local; isolamento
de conta; extensão correta; ausência de mídia nas requisições; hash do original.
Pixels do arquivo exportado são comparados ao texto esperado de **36 km/h**,
distinguindo-o de **72 km/h** após prévia em 2×, além da presença do overlay.

Falhas encontradas durante o desenvolvimento: mock de API Canvas ausente no
jsdom (corrigido no teste), seletores ambíguos/label de layout (contextualizados
e rótulo acessível explícito) e atualização tardia do tempo ao pausar (corrigida
no componente). Não houve falha nativa de formato ocultada como sucesso.

## M. Limitações

Homologação física Chrome Android/Safari iOS, gravações longas, medições térmicas/
de memória, áudio audível/drift/eco, Web Share/download em celulares e codecs
específicos permanecem pendentes. Safari não foi executado. O processo depende
da página ativa, interrompe ao ocultar e não garante execução em segundo plano.
Não há exportação acelerada nem união de arquivos. Formatos e recursos podem
falhar mesmo após isTypeSupported; fallback mantém prévia/original honestamente.
Inclinação real continua ausente onde o histórico anterior não a registrou.

O [manual técnico e roteiro físico](video-overlay.md) detalha APIs, limites,
matriz de cenários e os campos que devem ser registrados em cada aparelho.

## N. Preparação para a Parte 18

IDs de atividade/segmento, arquivos compostos privados, snapshots versionados e
ação explícita de escolha permitem uma integração social futura com revisão
de privacidade e consentimento próprios. Será necessário implementar essa camada
separadamente, sem reutilizar a sincronização de telemetria como upload de mídia.
Nenhum feed, publicação, curtida, comentário, seguidor, ranking ou XP foi criado.
