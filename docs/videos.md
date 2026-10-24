# Vídeo local durante o Ride — Parte 16

**Interface da Etapa 5:** `/ride/videos` reúne as gravações da conta neste
aparelho; `/ride/estudio` abre os mesmos segmentos no compositor existente.
Configuração de câmera fica recolhida antes de iniciar e durante pausa. Durante
o registro há estado real e ação para encerrar somente a câmera. A transição
para espera de GPS preserva a prévia autorizada; sair do preparo sem sessão
nem início pendente continua liberando a câmera. Importação de arquivos externos
não foi implementada: o contrato atual exige âncoras produzidas pelo Ride.

## Uso

Entre na conta, selecione moto e modo e abra **Vídeo opcional** na preparação
do Ride. Escolha frontal/traseira, qualidade e, opcionalmente, áudio. Toque em
**Ativar vídeo e abrir prévia**, autorize a câmera e confira a imagem com a moto
parada e o telefone fixado. Abrir a tela não pede câmera. A prévia não grava.
O áudio começa desligado e nunca é reproduzido pelos alto-falantes na prévia.

Inicie o Ride normalmente: a captura começa após a confirmação GPS e do
gravador. O indicador **REC** só aparece após o evento de início e sua referência
temporal ser persistida. Uma falha de câmera não encerra GPS ou sensores.
Use **Continuar sem vídeo / encerrar câmera** para desligar somente o vídeo.

Pausar o Ride encerra o segmento, preservando seu último bloco. Retomar inicia
outro segmento. Esta implementação usa segmentação em todas as pausas, sem
depender de `MediaRecorder.pause/resume`. Durante a pausa é possível escolher
outra câmera/lente, tocar novamente em Ativar vídeo, conferir a prévia e retomar.
A troca pode falhar ou criar lacunas; os segmentos anteriores são preservados.
Não há controles de troca de câmera durante o deslocamento.

Finalize e aguarde o estado do vídeo no resumo. Salvar a atividade mantém os
arquivos neste aparelho. Descartar informa e remove os vídeos associados.
No Histórico e nos detalhes locais/sincronizados, **Vídeos desta atividade**
mostra os segmentos. **Vídeos neste aparelho** também permite encontrar arquivos
de uma sessão ainda não recuperada ou cuja cópia de telemetria não existe mais.
Não é necessário entrar na API para reproduzir os arquivos já persistidos.

**Assistir vídeo** abre um segmento por vez com controles nativos; fechar, trocar
segmento, navegar ou trocar de conta libera sua URL temporária. **Salvar cópia**
usa o arquivo original, sem recodificar, com extensão WebM ou MP4 coerente.
Alguns navegadores móveis abrem o arquivo e oferecem controles próprios para
salvar. O arquivo não passa a existir na nuvem. Excluir vídeos exige confirmação
e preserva a telemetria. Excluir/descartar uma atividade também exclui seus vídeos
locais, após a confirmação do fluxo existente. Limpar somente a cópia sincronizada
de telemetria pelo painel offline preserva o vídeo: não há cópia remota dele.

## Arquitetura

- `video/camera.ts`: contexto seguro, MediaDevices, constraints, fallback e tracks.
- `video/types.ts`: estados, presets e contratos versionados.
- `video/recorder.ts`: MediaRecorder, eventos, ordem, fila limitada e encerramento.
- `video/repository.ts`: transações e recuperação no IndexedDB existente.
- `video/storage-monitor.ts`: estimativa de quota e pedido explícito de persistência.
- `video/timing.ts`: âncoras dos relógios do Ride e da captura.
- `video/coordinator.ts`: controlador único compartilhado pelos três modos,
  assinando transições do RideProvider; não modifica cálculos GPS/sensores/replay.
- `video/VideoPanel.tsx`: configuração, prévia nativa inline e indicador.
- `video/VideoLibrary.tsx`: consulta de metadados, recuperação, reprodução,
  cópia original e exclusão por conta/atividade.

O banco `apex-ride-offline` evolui de v2 para **v3**, aditivamente:

| Store            | Chave                | Conteúdo                                                                                                                                   |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `video_segments` | `id`                 | Dono, clientId estável, serverId opcional, ordem, writer/lease, câmera solicitada/obtida, áudio, MIME, âncoras, estado, contagem e tamanho |
| `video_chunks`   | `[segmentId, order]` | Blob original e instante de recebimento                                                                                                    |

Não há cópia do Blob em estado React, payload do Ride, localStorage, cache do
Service Worker, fila de sincronização ou banco remoto. Não foram criados uploads,
endpoints de vídeo, dependências de transcodificação ou migrações PostgreSQL.
Quando a sincronização confirma uma atividade, seu ID remoto é associado localmente
sem alterar o clientId ou duplicar arquivos. O Histórico usa o clientId original.

Cada escrita confirma chunk e contadores na mesma transação. A sequência é
contígua; uma retentativa da mesma chave não duplica dados. Vazios são ignorados.
Falha transitória de escrita tem uma retentativa; quota não provoca repetição
automática. Escritas são serializadas e liberam referências após confirmação.
Uma fila acima de 32 MiB solicita encerramento para conter crescimento de memória.
O navegador ainda pode entregar um único chunk grande ou atrasado.

Após falha de escrita, os blocos ainda não confirmados ficam temporariamente
retidos no serviço, fora do estado React. A captura para; não se acumula outra
gravação nessa conta até resolver a pendência. O indicador mostra os bytes somente
em memória e oferece **Tentar persistir vídeo novamente** ou **Descartar blocos
não persistidos**, com confirmação. A retentativa reabre somente o segmento do
mesmo writer e reaplica os chunks em ordem, sem duplicar confirmados. Um arquivo
só passa a completo se o encoder também tiver confirmado encerramento íntegro.
Os trechos já persistidos não são removidos pelo descarte de blocos pendentes.
Recarregar/fechar perde essa memória; o aplicativo solicita o aviso nativo de saída
enquanto houver pendência. Isso não garante resgate após encerramento pelo SO.

`start(2000)` solicita partes aproximadamente a cada dois segundos; não calcula
duração por contagem de chunks. Stop aguarda `dataavailable` final, `stop` e a
fila de transações. Ausência de confirmação de início/stop tem timeout de oito
segundos e deixa o arquivo incompleto. Somente um fluxo do mesmo gravador é
montado; segmentos independentes nunca são concatenados.

Os estados cobrem desativado, permissão, preparação de câmera, prévia, preparação
de gravação, REC confirmado, pausa, troca, encerramento, persistência, finalizado,
interrupção, erro e falta de espaço. Troca se realiza pela nova preparação após
o segmento anterior fechar. Estado da sessão e estado do vídeo são independentes.

## Relógios, pausas e integridade

Cada início/fim guarda epoch em ms, `performance.now()`, tempo decorrido desde
`payload.startedAt`, tempo ativo derivado dos intervalos existentes e tempo de
mídia estimado. A duração estimada vem da diferença monotônica entre âncoras.
Após `loadedmetadata`, duração finita da mídia é registrada separadamente.
O fim do Ride limita sua referência relativa; relógios inválidos geram estado
incompleto em vez de uma duração fictícia.

As pausas do Ride continuam nos intervalos existentes. Motivo do fim em cada
segmento e a diferença entre fim anterior/início seguinte identificam lacunas.
Trechos anteriores ao primeiro segmento e posteriores ao último não são vídeo.
Um segmento interrompido sem fim confirmado tem duração desconhecida. Timestamps
JavaScript não são alinhamento por frame; pode haver atraso do encoder/event loop.
Não há sincronização da reprodução com Replay nem overlay nesta parte.

Cada atividade admite somente um writer de vídeo ativo, com lease de 30 segundos
renovado durante a captura/escrita. A recuperação não toma segmentos de uma aba
com lease válido. Ao abrir a conta e consultar arquivos, escritas expiradas são
marcadas incompletas; arquivos finalizados são validados por cursor, sem carregar
o histórico inteiro de blobs na RAM. Também existe verificação sob demanda.
Após uma queda abrupta, aguarde expirar o lease e verifique novamente.
Chunks sem finalização não têm reprodução garantida e não são expostos como
arquivos completos. Dados confirmados são mantidos para eventual recuperação.

## Qualidade, quota e limites

Presets solicitados: Econômico ~854×480/24fps/1 Mbps, Padrão
~1280×720/30fps/2,5 Mbps e Alta ~1920×1080/30fps/5 Mbps. São preferências.
`getSettings()` informa a câmera/resolução/fps realmente obtidos; orientação não
informada aparece como desconhecida. FacingMode é ideal, nunca prova de que a
câmera traseira foi fornecida. Lentes enumeradas após permissão são opcionais;
deviceId é apenas da seleção atual, sem preferência persistente obrigatória.
`OverconstrainedError` tenta presets inferiores uma vez cada. Negação, câmera
ocupada ou falha do microfone não geram tentativas silenciosas de permissão.
Desative áudio explicitamente para tentar somente vídeo após falha do microfone.

O MIME é negociado por `isTypeSupported`, incluindo candidatos WebM e MP4; o
MIME efetivo do gravador é mantido. Suporte declarado não garante sucesso de
codificação nem reprodução em outro navegador. Não se renomeia WebM para MP4.

Quota é consultada antes da captura e periodicamente. Reserva conservadora de
um minuto no bitrate solicitado, com piso de 16 MiB, interrompe somente vídeo
quando o espaço estimado fica baixo. Estimativas podem não existir ou falhar;
erros de escrita continuam sendo tratados. Nenhum vídeo antigo é apagado
automaticamente. Persistência é solicitada somente pelo botão específico e pode
ser negada; limpeza de dados do navegador continua removendo vídeos.

Captura não tem limite artificial em minutos. A atividade mantém o limite já
existente de 48 horas. Reprodução e cópia por montagem de Blob têm **teto operacional
de 256 MiB por segmento**, para conter uso de memória. Acima dele os chunks são
preservados e a interface explica a limitação; não há streaming local ou montagem
de arquivo grande nesta entrega. Para essas gravações, use pausas em condições
seguras para criar segmentos menores. Isso não é limite universal do MediaRecorder.

Não há garantia de horas contínuas, armazenamento ilimitado, gravação em segundo
plano ou recuperação de estruturas incompletas. Bateria, calor, sistema operacional,
encoder e memória podem interromper a captura. O navegador não mede temperatura
interna do telefone para este sistema.

## Privacidade e compatibilidade

Conta diferente não consulta os metadados ou os Blobs pela interface. Logout/troca
de conta cancela câmera pendente, encerra captura e esconde referências anteriores.
Isso é isolamento lógico de aplicação, não criptografia contra acesso físico ao
perfil do navegador. Não há URLs públicas, upload, publicação ou log de mídia.

HTTPS ou localhost é obrigatório. APIs são detectadas em execução. Safari pode
escolher MP4; Chrome pode escolher WebM ou MP4; não se presume equivalência entre
plataformas. Prévia usa `autoPlay`, `muted`, `playsInline` e limpeza de `srcObject`.
Saída para segundo plano/pagehide e tracks `ended`/`mute` encerram a captura de
forma conservadora e registram motivo. Voltar ao aplicativo não pede câmera
silenciosamente: pause, prepare novamente e retome. A instalação PWA não remove
restrições do sistema. Fechamento abrupto pode impedir a escrita final.

Referências consultadas:
[MediaRecorder/dataavailable](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event),
[getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[implementação MediaRecorder no WebKit](https://webkit.org/blog/11353/mediarecorder-api/).
A detecção real de formato prevalece sobre exemplos históricos dessas páginas.

## Homologação física Android e iPhone — pendente

Realizar com aparelho parado, telefone fixado e site em HTTPS. Não confundir
Chrome desktop com dispositivo sintético com câmera física ou Safari do iPhone.

1. Registrar modelo, SO/versão, navegador/versão e modo PWA ou aba.
2. Entrar, escolher moto e Passeio; confirmar que abrir Ride não pede câmera.
3. Ativar vídeo traseiro Padrão, autorizar e conferir prévia inline e áudio desligado.
4. Registrar câmera efetiva, resolução/fps, codec/MIME e espaço estimado.
5. Iniciar, filmar brevemente, verificar REC e bytes, pausar, aguardar finalização,
   retomar, finalizar, salvar e reproduzir cada segmento no Histórico.
6. Repetir frontal; testar troca em pausa, múltiplas lentes, Econômico e Alta.
7. Repetir Pista e Misto verificando GPS, GPS Assistido/Puro, sensores e Replay.
8. Ativar áudio explicitamente, negar microfone e testar tentativa sem áudio;
   negar câmera, simular câmera ocupada e revogar permissão durante captura.
9. Cortar internet antes de finalizar/salvar; reproduzir offline, recarregar e
   verificar recuperação local e sincronização apenas da telemetria.
10. Bloquear tela, trocar de app e atender chamada. Registrar interrupções,
    estado após retorno e quais segmentos permanecem reproduzíveis.
11. Fechar aba abruptamente, aguardar lease, recuperar a atividade e consultar
    arquivos completos/incompletos. Testar quota baixa sem apagar arquivos antigos.
12. Testar cópia do segmento, exclusão só de vídeo, descarte de atividade e conta
    diferente no mesmo navegador. Conferir que não há requests de mídia à API.
13. Somente depois testar duração longa real; registrar duração, tamanho,
    consumo/aquecimento observado, lacunas, erros e recuperação. Não extrapolar
    um vídeo curto para uma promessa de gravação de horas.

Ficha por execução: modelo; SO; navegador; MIME/codec; câmera; resolução/fps;
qualidade/áudio; duração solicitada e obtida; tamanho; internet; bloqueio/app/chamada;
interrupções; erros; resultado de recuperação; reprodução; cópia; observações.
Não há aparelhos Android/iPhone físicos homologados nesta entrega.
