# Vídeo com telemetria — arquitetura e homologação

Parte 17/23. Todo processamento de mídia acontece no aparelho. Abra uma atividade
no Histórico, escolha **Assistir com telemetria** no segmento e abra **Configurar
overlay**. A ação de reprodução original da Parte 16 continua disponível. A
mesma biblioteca aparece no resumo e na recuperação de vídeos do aparelho.

## Fontes e sincronização

`video/overlay/VideoOverlayPlayer.tsx` consulta primeiro a sessão completa do
IndexedDB, na conta proprietária. Se ela não estiver disponível e a atividade
estiver sincronizada, utiliza `loadServerReplay`, com a autorização privada e a
paginação da Parte 13. Essa consulta transfere telemetria; nunca mídia.
Sem a sessão disponível, o original continua acessível e o erro é explícito.

`sync.ts` aplica, em milissegundos:

```text
tempo decorrido do Ride = âncora.rideElapsedMs
                        + vídeo.mediaTime * 1000
                        - âncora.mediaEstimatedMs
                        + offset manual
timestamp da sessão    = início do Ride + tempo decorrido
```

Cada segmento é um arquivo de uma instância de MediaRecorder. Pausas, retomadas
e trocas de câmera da Parte 16 encerram/iniciam arquivos, com âncoras próprias.
Chunks do mesmo arquivo são reconstituídos em ordem; arquivos independentes não
são concatenados. Não há consolidação de segmentos nem preenchimento das lacunas.

O offset positivo consulta telemetria posterior; o negativo, anterior. Incrementos
de 100 ms, limite de ±60 s, restauração para zero. O ajuste e a identificação
do segmento são locais; nenhuma medição ou âncora original é reescrita.
Âncora ausente, timestamp inválido e tempos fora da atividade/mídia produzem
sincronização indisponível. Não há ajuste automático da escala temporal para
forçar o fim do arquivo a coincidir com o evento JavaScript de encerramento.

As âncoras da Parte 16 são eventos JavaScript aproximados, e não timestamps de
exposição da câmera. A duração estimada monotônica não equivale à duração
codificada. Latência de captura, encoder, sensores e relógio de parede limita a
precisão; não há promessa de precisão de frame. Desvios variáveis ao longo de
um arquivo não são corrigidos por um offset constante.

## Replay e indicadores

`resolver.ts` prepara uma única timeline com `prepareReplay`. Converte o instante
absoluto para tempo ativo com `activeClock.locate`, depois consulta `frame`.
Uma pausa real nunca é convertida em uma amostra anterior/posterior à pausa.
Tempo decorrido continua avançando durante uma pausa; tempo ativo permanece
congelado; sensores ficam indisponíveis. No final do vídeo, nenhum relógio
independente continua avançando.

Regras existentes do Replay permanecem: GPS com validade de 1,5 s; sensores e
velocidade assistida com 500 ms; qualidade, calibração e âncora GPS respeitadas.
Ausência não vira zero. Inclinação dinâmica continua indisponível nas gravações
anteriores que não a registram. O renderer aceita estimativas históricas válidas
se existirem; não cria nem recalcula inclinação, força G, eventos ou voltas.

A regra histórica de distância foi extraída, sem mudar os cálculos, para
`ride-core.cumulativeDistances`, também usada por `calculateMetrics`. O resolver
prepara prefixos dos pontos GPS aceitos, com os segmentos e limites históricos;
consultas por frame usam busca binária. A interrupção de interpolação visual do
Replay não muda a regra de distância. Não há estimativa de deslocamento pela
duração do vídeo, nem cálculo de todo o histórico por frame.

Velocidade em km/h identifica GPS/estimada; G separa aceleração e frenagem;
inclinação indica E/D e estimativa; distância usa km; tempo usa mm:ss ou hh:mm:ss.
Modo e moto são opcionais. Circuito exige referência verificada; volta exige
registro estimado/válido e evento exige estado `estimated`. Ambos ficam fora
do layout inicial. O layout Pista não transforma uma via em circuito.

## Renderização e controles

`clock.ts` usa `requestVideoFrameCallback().mediaTime` quando disponível. O
fallback observa `video.currentTime` com requestAnimationFrame e eventos de
seek, pausa, taxa e fim. Pausa e buffering não usam avanço por tempo de parede.
Play, Pause, Seek, taxas 0,5×/1×/2×/4× e alternância do overlay estão disponíveis.
A taxa de reprodução não multiplica a velocidade registrada da motocicleta.

`renderer.ts` compõe frame decodificado e indicadores na mesma superfície Canvas.
Prévia e exportação compartilham essa função. Dimensões vêm de `videoWidth` /
`videoHeight`, com proporção preservada, incluindo orientação de decodificação
do navegador. Não há recursos gráficos externos. Paleta e tipografia Racing
Tech são locais; velocímetro circular, cards e margens são compactos.

Layouts: Compacto (velocidade/tempo), Completo (velocidade, G, inclinação,
distância/tempo) e Pista (velocidade, G, inclinação, tempo/volta). Seleção individual,
cantos inferior esquerdo/direito e tempo ativo/decorrido. Indicadores sem dados
mostram “—”; não são preenchidos com valores fictícios.
Sem configuração salva, a composição inicial é reduzida a velocidade, distância
e tempo; sensores podem ser selecionados quando houver registros válidos.

Configuração tipada/versionada `OverlayConfig`, renderer `racing-1`. Salvamento é
explícito e separado por proprietário/segmento. “Aplicar meu layout salvo” reutiliza
preferências em outro arquivo, preservando o alinhamento do arquivo atual e
exigindo nova escolha de áudio. Exportações guardam um snapshot independente;
mudanças futuras da configuração não reescrevem arquivos concluídos.

## Codificação e áudio

Estratégia implementada: **composição/gravação em tempo real**, usando
Canvas.captureStream + MediaRecorder. Não há WebCodecs, muxer próprio, FFmpeg,
transcodificação acelerada ou tarefa de vídeo no servidor. O próprio navegador
codifica e cria o contêiner. Fallback: prévia e cópia original sem overlay.

`capabilities.ts` exige captura Canvas, MediaRecorder e `isTypeSupported` do MIME
com codec. Candidatos: WebM VP8/VP9, com Opus quando há áudio; MP4 AVC/H.264,
com AAC quando há áudio. Suporte declarado é potencial: construção, captura,
codificação e validação do resultado ainda podem falhar. Reproduzir MP4 não
habilita sua codificação. Apenas os candidatos declarados são oferecidos.

Qualidades Econômico (~480p / 1 Mbps / até 24 fps), Padrão (~720p / 2,5 Mbps /
até 30 fps) e Alta (~1080p / 5 Mbps / até 30 fps), limitadas pela resolução e pela
taxa informada da fonte. Dimensões pares, sem ampliar a fonte. São solicitações
ao codificador; desempenho e frames efetivos dependem do aparelho.

Áudio é opção explícita. Web Audio encaminha a trilha do elemento de vídeo para
um MediaStreamAudioDestinationNode, sem conectar a alto-falantes e sem abrir
microfone. Uma única trilha é adicionada ao stream do Canvas, evitando eco e
duplicação. A detecção exige candidato de vídeo+áudio e Web Audio. A validação
exige também confirmação de trilha no resultado via captureStream ou audioTracks.
Sem esse recurso, a exportação com áudio falha com mensagem e o usuário pode
escolher exportar sem áudio. Não há substituição silenciosa por vídeo mudo.
A existência da trilha não certifica ausência de drift ou conteúdo audível em
fontes originalmente silenciosas; isso exige escuta e homologação física.

O codificador pausa durante `waiting` e retoma em `playing`. Monitor detecta
falta de avanço, frames atrasados, suspensão de áudio e tempo excessivo. Ao ocultar
a página, o processo é interrompido e o resultado parcial é descartado. Troca de
conta, fechamento do player ou navegação abortam o trabalho. Não há garantia de
execução com tela bloqueada, em outra aba, aplicativo ou PWA em segundo plano.

## Integridade, recursos e armazenamento

IndexedDB v4 acrescenta `video_overlay_configs`, `video_exports` e
`video_export_chunks`, preservando as stores anteriores. Os chunks codificados
são gravados progressivamente em transações; não se mantém uma lista ilimitada
em memória. A montagem final para validar/download usa Blob lógico, com limite
de 128 MiB por resultado. Fonte mantém o limite anterior de 256 MiB por segmento.
Estimativa de tamanho/quota é conservadora e pode não estar disponível.
Pendências de escrita acima de 16 MiB interrompem o encoder.

Um único encoder é admitido na página e a reserva transacional impede exportações
concorrentes no banco local, inclusive entre abas. Trabalhos não concluídos com
lease expirado são removidos no início da próxima exportação. Arquivos concluídos
não são limpos automaticamente; há exclusão explícita por arquivo. A remoção da
mídia/atividade pelas ações existentes limpa configurações por arquivo,
exportações e chunks associados. Preferência geral de layout permanece sem ID
de atividade ou de segmento de origem.

Conclusão exige: escrita final, cabeçalho WebM/MP4 correspondente ao MIME,
duração finita dentro de max(500 ms, 5%) da fonte, resolução esperada, reprodução,
decodificação de frames a 10/50/90% e confirmação de trilha quando solicitada.
Metadados persistem duração/resolução efetivamente lidas, tamanho, MIME real,
data, proprietário, atividade/segmento, áudio, configuração e renderer.
WebM gerado por MediaRecorder pode reportar duração infinita inicialmente;
o loader busca o fim do arquivo e retorna ao início para obter a duração real.
Se ela continuar desconhecida, o arquivo não é aprovado. Não há remux para
reescrever o cabeçalho de duração.
O percentual representa tempo de mídia processado / duração; finalização e
validação apresentam etapas sem percentual. 100% concluído somente após validar.

URLs temporárias, streams, callbacks e AudioContext são liberados. Erro, quota,
cancelamento ou interrupção excluem somente temporários. Vídeos incompletos
podem tentar reproduzir um prefixo contíguo; permanecem identificados como
incompletos e não são exportados como arquivos íntegros.

Download e compartilhamento nativo exigem ação do usuário. O compartilhamento
verifica suporte de arquivos e mostra aviso de conteúdo sensível. Não há upload,
publicação, localização em logs ou alteração do backend. A configuração inicial
não mostra moto nem circuito. Coordenadas não são adicionadas aos metadados de
exportação. Compartilhar pode divulgar imagens e métricas selecionadas.

## Roteiro Android e iPhone — pendente de execução física

Registrar em cada execução: modelo, SO, navegador/versão, PWA ou aba, MIME/codec
da fonte/resultado, resolução, duração, bytes, áudio, sincronização observada,
erros e recursos/memória quando mensuráveis. Nenhum aparelho físico foi usado
nesta entrega; Chrome desktop com dispositivos sintéticos não homologa Android
ou iOS. Safari/iPhone não foi executado.

1. Gravar no fluxo da Parte 16 uma atividade curta, primeiro sem áudio, depois
   com áudio e consentimento. Registrar eventos conhecidos para comparar tempos.
2. Abrir Histórico → atividade → Assistir com telemetria. Conferir velocidade,
   G/inclinação somente se historicamente válidos, distância, tempo ativo/decorrido.
3. Pausar, buscar para frente/trás, alterar taxas, testar buffering real e lacunas.
   Confirmar que a motocicleta não fica “mais rápida” em 2×.
4. Ajustar ±100 ms, restaurar, trocar layouts, indicadores e posições, salvar,
   fechar/reabrir, aplicar o layout em outro vídeo sem copiar o offset.
5. Testar gravações verticais/horizontais, câmeras frontal/traseira, dois
   segmentos, pausa entre eles, arquivos incompletos e codec não reproduzível.
6. Em modo avião, com app e dados já armazenados, testar prévia e exportação
   de cada formato efetivamente oferecido em cada qualidade. Não prometer MP4
   se só decodificação estiver disponível. Registrar resolução final sem upscale.
7. Acompanhar estados, cancelar em preparação/codificação/finalização e conferir
   que o original continua reproduzível e com os mesmos bytes. Repetir após falha
   de quota e com memória/armazenamento limitados, sem apagar outras atividades.
8. Salvar o composto, fechar o app e abrir em outro player no próprio aparelho.
   Conferir números queimados nos frames em três instantes conhecidos; ouvir
   áudio, verificar eco, duplicação, deslocamento e drift no início/meio/fim.
9. Bloquear a tela e trocar de aplicativo/aba durante exportação: esperar erro
   explícito, nenhuma falsa conclusão, original intacto e nova tentativa possível.
10. Testar saída/entrada de outra conta, remoção da atividade, exclusão de uma
    exportação, ausência de vídeo no segundo aparelho, download e compartilhamento
    nativo. Conferir que nenhuma requisição envia mídia.

Chrome Android: validar captureStream, MediaRecorder, formatos e memória no
aparelho real. Safari iOS: validar inline/gesto de áudio, callback de frames ou
fallback, captura Canvas, formatos de encoder, confirmação de áudio e salvamento.
Se qualquer etapa de composição falhar, registrar a limitação e usar a prévia e
o original, sem afirmar que um arquivo com overlay foi produzido.

Referências de API consultadas: [frames de vídeo](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback),
[captura Canvas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream),
[detecção de MIME](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static),
[origem de áudio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource)
e [destino de áudio](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination).
