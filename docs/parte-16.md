# Parte 16 — Gravação local de vídeo durante o Ride

Entrega de 23/10/2026, limitada à Parte 16/23. Implementação local nos blocos
16A–16D, com design Racing Tech e funcionalidades anteriores preservados.
Homologação com câmeras físicas Android/iPhone permanece pendente. Não houve deploy.

## A. Funcionalidades implementadas

Vídeo opcional nos modos Passeio, Pista e Misto; câmera frontal/traseira e lentes
disponíveis; permissão por ação explícita; prévia real inline; três qualidades;
áudio opt-in; REC confirmado; escrita incremental; pausas/retomadas por segmentos;
troca em pausa; falhas independentes do GPS; resumo; recuperação; Histórico;
reprodução/cópia original de segmentos compatíveis e exclusão confirmada.
Quota, memória pendente e interrupções têm estados e mensagens próprios.

## B. Arquivos criados ou modificados

Novos, relativos a `apps/web/src/video/`:

| Arquivo                   | Responsabilidade                                          |
| ------------------------- | --------------------------------------------------------- |
| `types.ts`                | Contratos, estados e presets                              |
| `camera.ts`               | Permissão, dispositivos, captura, fallback e liberação    |
| `recorder.ts`             | MediaRecorder, chunks, eventos e barreira de encerramento |
| `repository.ts`           | Metadados/Blobs transacionais e recuperação               |
| `storage-monitor.ts`      | Quota e solicitação de persistência                       |
| `timing.ts`               | Âncoras temporais do Ride e da mídia                      |
| `coordinator.ts`          | Integração com a sessão, interrupções e retentativa       |
| `context.ts`              | Assinatura React do serviço de vídeo                      |
| `VideoPanel.tsx`          | Configuração, prévia e estado real                        |
| `VideoLibrary.tsx`        | Localização, reprodução, cópia, recuperação e exclusão    |
| `fixtures.ts`             | Dispositivo/gravador sintéticos somente para testes       |
| `camera.test.ts`          | Suporte, permissões, seleção, fallback e cancelamento     |
| `recorder.test.ts`        | Formatos, ordem, finalização, quota e timeouts            |
| `repository.test.ts`      | Migração, integridade, isolamento, recuperação e volume   |
| `integration.test.ts`     | Sessões, modos, pausas, falhas, relógios e descarte       |
| `storage-monitor.test.ts` | Quota, qualidade, persistência e suporte ausente          |

Outros arquivos novos:

- `apps/web/src/styles/video.css`: estilos locais usando o design existente.
- `apps/web/e2e/video.spec.ts`: MediaRecorder nativo com câmera sintética no Chrome.
- `docs/videos.md`: arquitetura, uso, limitações e roteiro físico.
- `docs/parte-16.md`: este relatório.

Arquivos modificados:

- `apps/web/src/offline/database.ts`: upgrade aditivo v2→v3, duas stores de vídeo.
- `apps/web/src/offline/coordinator.ts`: ID remoto local e exclusão por atividade.
- `apps/web/src/offline/repository.test.ts`: expectativas de esquema e versão futura.
- `apps/web/src/ride/controller.ts`: aguarda vídeo antes de salvar/descartar.
- `apps/web/src/ride/RideProvider.tsx`: serviço único por ciclo da aplicação/conta.
- `apps/web/src/ride/RideSummary.tsx`: persistência, biblioteca e confirmação de descarte.
- `apps/web/src/pages/RidePage.tsx`: configuração e prévia real no espaço da câmera.
- `apps/web/src/pages/RideDetailsPage.tsx`: vídeos no detalhe sincronizado.
- `apps/web/src/pages/LocalRideDetailsPage.tsx`: vídeos no detalhe local.
- `apps/web/src/pages/HistoryPage.tsx`: acesso aos arquivos recuperáveis deste aparelho.
- `apps/web/src/history/RidePrivacyControls.tsx`: exclusão inclui vídeos da atividade.
- `apps/web/e2e/interface.spec.ts`: expectativa atual do controle de câmera sem login.
- `README.md` e `docs/progresso.md`: registro e acesso à entrega.

API, PostgreSQL, contratos de upload, GPS, cálculos de sensores/velocidade,
Replay, comparação e reconhecimento de trajetos não foram alterados.

## C. Câmeras

`getUserMedia` exige contexto seguro e toque explícito. Não é chamado ao entrar
no Ride, login ou cadastro. Frente/traseira usam `facingMode` ideal; o rótulo
real vem de `getSettings`, com aviso de divergência ou orientação desconhecida.
`enumerateDevices` oferece lentes quando o navegador permite. Não há deviceId
persistente obrigatório. Troca em pausa fecha a câmera anterior e requer nova
preparação explícita; falha não remove segmentos anteriores. Microfone desligado
por padrão, ativado somente pela opção de áudio e permissão correspondente.

## D. MediaRecorder

Escolha de candidatos WebM/VP9/Opus, WebM/VP8/Opus, WebM e MP4 por
`isTypeSupported`, preservando MIME efetivo. Partes são solicitadas em ~2s,
ordenadas e persistidas. Vazio não conta como mídia. O encerramento aguarda
último `dataavailable`, `stop` e escritas; oito segundos sem confirmação levam
a incompletude. O indicador REC depende do evento `start` e da âncora persistida.
Falhas de encoder e armazenamento não encerram o Ride.

## E. Segmentos

Cada início/retomada cria ID/ordem próprios e guarda câmera, resolução, áudio,
MIME, início/fim, dono, sessão, contagem/tamanho e motivo do fim. Pausar finaliza
o fluxo; retomar grava outro arquivo. Não se presume que cada chunk isolado seja
reproduzível. Somente chunks do mesmo gravador formam um segmento; segmentos
distintos não são unidos. Escrita expirada é incompleta, sem fim/duração inventados.

## F. Armazenamento

IndexedDB existente v3: `video_segments` e `video_chunks`. Append confirma Blob
e contadores atomicamente e não duplica chave em retentativa. Metadados são
consultados sem Blobs; reprodução carrega somente o segmento escolhido.
Recuperação valida sequência/tamanho por cursor e respeita lease de outra aba.

Quota é aproximada e opcional. Escrita falha encerra vídeo, preserva confirmados
e mantém blocos pendentes em memória para nova tentativa explícita ou descarte
confirmado. Uma fila acima de 32 MiB solicita parada; eventos grandes ainda podem
exceder essa margem. Recarregar ou encerramento pelo sistema perde memória não
persistida, com aviso de saída quando possível. Vídeos antigos nunca são apagados
automaticamente. Persistência protegida pode ser negada e não é backup.

## G. Sincronização temporal

Âncoras registram epoch, relógio monotônico, tempo decorrido do Ride, tempo ativo
dos intervalos já existentes e tempo de mídia estimado. Duração da mídia, quando
o elemento nativo fornece valor finito, é armazenada separadamente. Pausas e
lacunas aparecem pelos intervalos do Ride e pelos inícios/fins e motivos dos
segmentos. Chunk atrasado não altera a duração como se fosse um relógio.
Não há promessa de alinhamento por frame, preenchimento de lacunas ou captura
anterior ao primeiro segmento.

## H. Integração com Ride

Um serviço assina o controlador da Parte 06 nos três modos. Início após GPS
válido; pausa solicita stop imediatamente; retomada cria segmento; fim consolida
antes da persistência final. Salvar espera a barreira do vídeo, mantendo a decisão
GPS independente de eventual falha da câmera. Descarte aguarda operações e apaga
somente arquivos associados. Excluir vídeo de outra atividade preserva a captura
atual. Nenhum cálculo de GPS, GPS Assistido ou sensores foi substituído.

## I. Histórico

Biblioteca nos detalhes local/sincronizado e no resumo. Consulta por proprietário
e clientId estável; confirmação remota preenche serverId sem duplicar mídia.
Quantidade, estado, tempo, tamanho, formato e câmera são reais. Arquivo ausente
tem mensagem específica. O catálogo local também conserva acesso a gravações sem
cópia de atividade, para recuperação ou exclusão consciente. Player nativo inline,
um segmento de cada vez, e URLs temporárias revogadas ao fechar/trocar/sair.
Cópia usa extensão real e não recodifica. Replay de telemetria é independente.

## J. Privacidade

Sem upload, armazenamento remoto, publicação, URLs públicas ou logs de frames/Blobs.
Mídia fora da fila da Parte 10 e do Service Worker. Logout/troca de conta encerra
tracks e cancela câmera pendente; a interface da outra conta não expõe arquivos
anteriores. O navegador pode manter dados após logout; isolamento lógico não é
criptografia contra acesso físico ao perfil do navegador. A interface informa
privacidade de terceiros, áudio e preparação com a motocicleta parada.

## K. Testes executados

Comandos pelo pnpm 10.34.7 via shim local Corepack; nenhuma dependência de produto
foi adicionada. Evidências ficam em `.local/parte16-*.log` e
`.local/screenshots/video-*.png` (artefatos locais ignorados pelo Git).

| Verificação                                 | Resultado                                  |
| ------------------------------------------- | ------------------------------------------ |
| `pnpm typecheck`                            | API e frontend aprovados                   |
| `pnpm lint`                                 | Sem erros ou avisos                        |
| `pnpm format:check`                         | Aprovado                                   |
| `pnpm test`                                 | 352 frontend + 191 API = 543 aprovados     |
| `pnpm build`                                | API/frontend e shell offline gerados       |
| `pnpm test:postgres`                        | 160 aprovados em PostgreSQL/PostGIS real   |
| `pnpm --filter @apex-ride/web test:e2e`     | 55 aprovados no Chrome, 13 arquivos        |
| Novos testes de unidade/integração de vídeo | 48 aprovados, incluídos na suíte frontend  |
| Novos E2E de vídeo                          | 2 aprovados, incluídos nos 55 de navegador |

Total distinto: **758 cenários aprovados**. Os 160 casos PostgreSQL aparecem
como skipped na suíte padrão e foram executados separadamente; não são contados
duas vezes. A primeira execução PostgreSQL teve timeout de 5s num teste de limite
de login sob concorrência com outras verificações; repetição sem essa carga passou
nos 160, sem alterar testes ou lógica de autenticação. As primeiras regressões
detectaram expectativas antigas de versão IndexedDB e uma espera desnecessária
no descarte sem vídeo; ambos corrigidos e regressão aprovada.

Os dois novos E2E usam câmera sintética do Chrome e MediaRecorder nativo: prévia
sem áudio, captura, último chunk, pausa, troca, persistência/reprodução offline,
cópia com extensão real (WebM nesta execução), recarga, vínculo no detalhe remoto, outra conta no mesmo IndexedDB,
exclusão só de vídeo e negação de câmera com GPS preservado. Não simulam uma
câmera física nem Safari. Não houve requests contendo mídia à API nesses fluxos.

Responsividade automática: preparação e Histórico com vídeo em 320/390/430/1440
px; regressão geral em 320/360/375/390/430/768/1440 px. Capturas de preparação
390 px e Histórico 320 px foram inspecionadas visualmente. Velocímetro, mapa,
cabeçalho, botões Ride e navegação inferior continuam com a composição existente.
O build mantém o aviso de chunk grande do pacote de mapas já existente.

## L. Limitações e pendências

Sem homologação física Android/iPhone, longa duração real, chamadas, tela bloqueada
ou aquecimento medido em aparelho. Roteiro e ficha de registro em [videos.md](videos.md).
APIs detectadas em execução; formatos, lentes, qualidade e permissões variam.
Segundo plano é interrompido conservadoramente, sem reinício silencioso. Uma
queda abrupta pode deixar somente trechos incompletos. Lease pode exigir aguardar
30s e verificar novamente. O armazenamento pode ser removido pelo navegador.

Montagem local para player/cópia limitada a **256 MiB por segmento**; acima disso,
o arquivo permanece em chunks e a interface informa a limitação de memória.
Não há limite artificial em minutos para captura; a sessão mantém seu limite
prévio de 48h. Não se garante horas contínuas, alinhamento por frame ou recuperação
de estrutura que nunca foi finalizada. Áudio em movimento não tem qualidade garantida.

## M. Preparação para a Parte 17

Contratos versionados preservam IDs, câmera/resolução, MIME, sequência e âncoras
de tempo decorrido/ativo/monotônico, duração estimada e duração disponível da mídia.
Uma etapa futura poderá relacionar telemetria registrada aos intervalos filmados,
mantendo lacunas e incerteza, e avaliar renderização/exportação compatível no
dispositivo. **Nenhum overlay, editor, vídeo composto, streaming, sincronização
do player com Replay ou compartilhamento social foi implementado.** A Parte 17
permanece não iniciada.
