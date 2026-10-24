# Funcionamento offline — Parte 10

## Atualização — acesso autenticado da Etapa 1

Uma sessão já validada pode continuar registrando uma atividade ao perder a
conexão. Após **recarregar offline**, o painel exige reconexão e nova confirmação
de sessão pela API antes de abrir. O perfil salvo no dispositivo não substitui
a autenticação. Atividades, checkpoints e vídeos permanecem preservados para
recuperação com a mesma conta. Veja [Etapa 1](refinamento/etapa1-acesso.md).
As seções abaixo descrevem o mecanismo de gravação e sincronização existente.

Implementação local em 23/10/2026. O registro depende de a página e os serviços de
localização continuarem executando. Tela bloqueada, suspensão e encerramento do
navegador podem interromper a coleta. Nenhuma homologação física Android/iPhone
foi realizada nesta entrega.

## Usar

Execute `pnpm db:migrate` e `pnpm build`. O Service Worker é gerado somente no
build de produção; `pnpm dev` não instala cache offline. Use o preview local ou
HTTPS. Abra o aplicativo com internet, faça login, carregue a Garagem e aguarde a
instalação do shell. Sem esse preparo, a primeira visita offline não funciona.

No Ride, inicie com uma moto da conta e GPS autorizado. Internet e GPS têm estados
independentes. Ao cair a rede, o velocímetro, sensores e registro local continuam
se os serviços do navegador estiverem disponíveis. Pause e retome normalmente;
cada retomada começa um segmento. Finalize para abrir o resumo, escolha a
privacidade e confirme **Salvar atividade**. A confirmação local precede o envio.
O texto **Sincronizado** exige confirmação válida do backend.

Abra **Atividades no aparelho** para consultar pendências, revisar resumos,
solicitar **Sincronizar agora** ou limpar uma cópia já confirmada. Dados aguardando
decisão não entram na fila. O descarte confirmado remove somente a atividade
escolhida. Nenhuma atividade pendente é apagada automaticamente.

## Arquitetura e IndexedDB

`apps/web/src/offline` contém acesso transacional, repositório, coordenação da
captura, conectividade, monitoramento de quota, fila e envio. O controlador
existente continua sendo a única entrada das amostras GPS. Sensores, estimador e
detector expõem checkpoints de suas próprias séries; não há um segundo coletor.

Banco `apex-ride-offline`, esquema atual 2, formato de sessão 1:

| Store                | Conteúdo e chave                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `offline_sessions`   | Chave `ownerId:clientId`; moto, modo, privacidade, intervalos, estado, versões, contagens, heartbeat, decisão e confirmação |
| `gps_samples`        | Chave composta sessão/ordem; pontos originais, precisão, direção, altitude, velocidade e segmento                           |
| `sensor_samples`     | Sessão/ordem; amostras processadas, qualidade, aceleração, G, inclinação indisponível e relógios originais                  |
| `speed_samples`      | Sessão/ordem; estimativa, fonte, estado, razão e referência GPS, separadas do GPS original                                  |
| `performance_events` | Sessão/ordem; eventos e informações de qualidade                                                                            |
| `sync_queue`         | Uma operação por sessão; estado, tentativas, datas, erro, recibos e ID do servidor                                          |
| `sync_metadata`      | Leases e contexto mínimo previamente autorizado do aparelho, sem segredos                                                   |

Índices `owner` isolam sessões e fila; índices `session` preservam a ordem das
amostras por chave composta. Cada leitura, decisão, descarte e atualização usa a
chave do proprietário no repositório, além do filtro visual. Isso não criptografa
o IndexedDB nem o protege de alguém com controle do aparelho ou da origem web.
Evite aparelhos compartilhados para armazenar trajetos pessoais.

Migração 0→1 cria as stores básicas; 1→2 acrescenta a série assistida. Atualizações
não limpam sessões ou filas. `versionchange` fecha a conexão antiga; bloqueio por
outra aba e versões futuras incompatíveis produzem erro, preservando o banco.
Nunca use `deleteDatabase` para corrigir migrações com dados pendentes.

## Gravação e recuperação

`OFFLINE_FLUSH_MS`, em `coordinator.ts`, define 2.000 ms. Transições também
solicitam checkpoint; as operações são serializadas. Cada transação grava apenas
amostras posteriores aos cursores confirmados e metadados pequenos. A
consolidação pode substituir as séries selecionadas de velocidade e eventos,
porque os serviços existentes filtram referências inválidas e associam qualidade
no encerramento. O restante das séries não é duplicado em estados React.

Os buffers são os arrays já limitados pelos coletores anteriores: 50.000 pontos,
18.000 amostras de movimento e 18.000 amostras de velocidade. Permanecem os limites
explícitos das Partes 06–09 e seus avisos; eles não representam uma previsão de
capacidade de armazenamento por aparelho. O modo não cria um banco separado.

Metadados e novas amostras são confirmados juntos. A indicação **Salvo no
aparelho** espera `transaction.complete`; sucesso de uma requisição individual
do IndexedDB não basta. Abortos e quota insuficiente não confirmam salvamento.
Os dados disponíveis em memória permanecem no controlador e há nova tentativa.
Uma falha prolongada pode atingir os limites existentes de captura; não há
truncamento silencioso adicional. O intervalo de 2 s é uma meta, não garantia:
abas suspensas e transações lentas podem ampliar a janela ainda não persistida.

`pagehide` e mudança de visibilidade solicitam flush como melhor esforço. Ao
reabrir, as sessões da conta são listadas. **Revisar resumo local** recupera o
checkpoint e encerra uma sessão interrompida no horário efetivamente persistido,
sem contar o período com a página fechada. Não retoma a captura automaticamente.
Pontos ausentes não são reconstruídos. Uma sessão finalizada e não salva volta ao
resumo para decisão; uma já salva localmente continua pendente.

O gravador renova um lease de 15 s em cada checkpoint. Outra aba não pode gravar
enquanto ele estiver válido. Após fechamento inesperado, aguarde até 15 s para
recuperar. A aba recuperadora assume a escrita; um gravador antigo é recusado.

## Conectividade, contas e fila

Estados: online, offline, conexão limitada, verificando e servidor indisponível.
`navigator.onLine` é somente um sinal. `GET /api/health` valida HTTP e identidade
da API, sem enviar coordenadas ou cookies. A verificação tem timeout de 5 s,
intervalo normal de 60 s em primeiro plano e reaproveitamento por 15 s. Eventos
de rede, retomada da página e ação manual podem forçar nova verificação.

Antes do envio, `GET /api/auth/me` confirma a conta e obtém o CSRF pelo fluxo
existente. A identidade é revalidada antes de cada requisição de upload, evitando
enviar dados da conta A usando cookies de B em outra aba. Cookies HttpOnly,
senhas e tokens não entram no IndexedDB. O contexto local contém apenas a última
conta previamente autorizada, preferências e motos sem fotografias; email e
biografia são removidos. Ele permite continuar o Ride após recarga sem API, sem
criar outro mecanismo de login ou autorizar operações no servidor.

Resposta 401 limpa o contexto da conta, mantendo suas atividades. Logout informa
pendências e preserva os dados, acessíveis novamente pela mesma conta. Trocas de
conta explícitas são notificadas entre abas por BroadcastChannel. A Garagem
mantém seus estados de erro e repetição; somente o Ride pode usar suas motos
previamente autorizadas quando a rede falha.

Salvar torna o payload imutável e insere a operação na mesma transação da
decisão. Estados: pendente, enviando, parcial, aguardando autenticação, falha
temporária, permanente/conflito e confirmado. Uma falha nunca esvazia a fila.
401/403 aguardam autenticação; 400/404/409/413 exigem intervenção; rede, timeout,
408, 429 e 5xx permitem retentativa. Erros permanentes ficam visíveis e não são
reenviados continuamente. Alterar um payload já enfileirado não é suportado.

Backoff: base de 5 s, exponencial até 15 min, variação de ±20%; o agendador ativo
avalia a fila a cada 15 s. Filas vazias/confirmadas não geram probes por esse
agendador. A tentativa manual ignora o prazo de falhas temporárias/autenticação.
Login, abertura, reconexão e retorno ao primeiro plano também acionam a fila.
Sincronização nova aguarda a sessão de captura encerrar; não depende de Background
Sync nem continua garantidamente com a página fechada.

O envio usa lease transacional por conta de 60 s, renovado a cada etapa.
Atualizações da fila verificam o lease atomicamente, impedindo que uma aba
suspensa sobrescreva a confirmação de outra após expirar seu bloqueio. Recibos e
tentativas sobrevivem à recarga; `sending` abandonado pode ser repetido. O
BroadcastChannel comunica atualizações entre abas. A unicidade no PostgreSQL
permanece a proteção final contra duplicatas.

## Contratos e backend

Migração aditiva `007_offline_sync.sql`: `ride_uploads` e
`ride_upload_batches`, com FKs e chaves por proprietário/clientId/índice. O
contrato antigo `POST /api/rides` continua com limite de 32 MiB, validação,
transação e HTTP 201 para criação/200 para repetição. A implementação foi
extraída para `persist.ts` e é reutilizada pela conclusão dos lotes.

Até 500 amostras no total usam o POST existente. Acima disso:

1. `POST /api/rides/sync/:clientId`: manifesto versão 1, metadados sem séries e
   contagens `points`, `motion`, `speed`, `events`; retorna índices recebidos.
2. `POST /api/rides/sync/:clientId/batches/:index`: até 500 itens de cada série,
   índice base zero, 1 MiB por requisição, tamanhos exatos conforme manifesto.
3. `POST /api/rides/sync/:clientId/complete`: exige todos os índices e executa a
   validação/consolidação transacional existente antes de responder `status`,
   `id` e `metrics`.

Manifestos e lotes usam hash SHA-256 canônico; a ordem das propriedades JSON não
altera o hash. Conteúdo repetido é aceito, conteúdo diferente no mesmo índice
gera 409. Lotes fora de ordem são aceitos e ordenados ao concluir. A conclusão
não publica atividades parciais. Se a resposta se perder, reiniciar o manifesto
recupera os recibos; repetir a conclusão retorna a mesma atividade.

`UNIQUE(owner_id, client_id)` e hash do payload normalizado em `rides` impedem
duplicação também entre o POST pequeno e o fluxo de lotes. Moto arquivada,
integridade temporal, limites e dados de sensores são verificados antes de
concluir. As métricas GPS usam o mesmo núcleo compartilhado do resumo. Eventos
são recalculados pela API; a confirmação consolidada é preservada localmente.
Não houve divergência relevante nos testes executados.

Retenção: cópias locais só são limpas por confirmação explícita e após recibo
final do servidor. Envios incompletos no backend não têm TTL destrutivo automático:
podem ser retomados legitimamente mesmo após longo período. Na operação futura,
revise envios sem atividade concluída após 30 dias com o proprietário e remova
somente após confirmar abandono; a exclusão da conta elimina seus uploads por FK.
Recibos de concluídos podem ser removidos após 30 dias por manutenção, verificando
a existência da atividade com o mesmo owner/clientId; a unicidade de `rides`
continua protegendo contra repetição. Nenhuma limpeza de dados do usuário foi
executada nesta entrega. Não existe serviço administrativo de limpeza nesta parte.

## Shell e cartografia

O build gera `dist/sw.js` com lista explícita de HTML, chunks, CSS, fontes e
imagens locais. Somente GETs da mesma origem presentes nessa lista e navegações
da aplicação são atendidos pelo cache. APIs, tokens, cookies, fotos privadas,
tiles e URLs externas não são armazenados pelo worker.

O nome do cache deriva dos arquivos versionados e HTML. Não há `skipWaiting`:
um worker atualizado aguarda o fechamento das abas antigas. A ativação limpa
somente caches `apex-shell-*` antigos e nunca toca o IndexedDB. Fechar e abrir
depois de finalizar uma sessão permite usar a versão nova com segurança. O shell
previamente instalado funciona offline; instalação inicial e atualização exigem
rede. Isso não garante execução contínua dos sensores.

MapLibre mantém a rota independentemente dos tiles. Sem base disponível, o Ride
mostra o aviso e um SVG do traçado GPS com segmentos separados, sem inventar mapa
ou coordenadas. Reconexão permite recriar a cartografia. Não existe download de
regiões ou cache de mapas de terceiros.

## Homologação física pendente

Execute os mesmos cenários em Android/Chrome e iPhone/Safari, com HTTPS, aparelho
parado ou percurso seguro. Os dados sintéticos de navegador não substituem isso.

1. Abra online, faça login, carregue motos e shell, inicie GPS e sensores
   opcionais. Desative somente a internet, mantendo localização. Gere leituras,
   pause, retome, finalize e salve. Restabeleça a rede e confira uma única
   atividade e todas as amostras no PostgreSQL.
2. Inicie outra sessão, aguarde gravação confirmada e recarregue. Aguarde expirar
   o lease, revise a sessão interrompida e verifique que o período fechado não
   virou pontos, tempo ativo ou aceleração integrada. Salve ou descarte.
3. Com internet, indisponibilize somente a API de testes. Salve localmente,
   confira estado limitado/indisponível, restaure a API e repita. Simule também
   resposta perdida após commit e autenticação expirada.
4. Use ferramentas de desenvolvimento para limitar quota ou abortar escrita.
   Confirme alerta, ausência de confirmação falsa, retenção em memória e nova
   tentativa. Recuse a solicitação de armazenamento persistente e confira aviso.
5. Gere dados sintéticos longos, incluindo 50.000 pontos. Interrompa após alguns
   lotes, reabra e confirme retomada pelos recibos sem duplicação ou truncamento.
6. Abra duas abas, inicie sincronização simultânea e suspenda uma delas além do
   lease. Confirme que ela não sobrescreve o resultado da outra. Troque de conta
   e confira isolamento, preservação e necessidade de autenticar a conta original.
7. Bloqueie a tela e alterne de aplicativo. Registre quais serviços param e quais
   lacunas são expostas. Não atribua registro aos períodos sem execução.

Preencha uma linha por execução; todos os aparelhos físicos permanecem pendentes:

| Aparelho / SO / navegador    | Cenário / volume | Gravação / sync | Perdas / duplicatas | Suspensão / limitações | Resultado |
| ---------------------------- | ---------------- | --------------- | ------------------- | ---------------------- | --------- |
| Android físico — a preencher | 1–7              | A verificar     | A verificar         | A verificar            | Pendente  |
| iPhone físico — a preencher  | 1–7              | A verificar     | A verificar         | A verificar            | Pendente  |

O navegador pode negar persistência ou remover dados por política/quota; limpar
dados do site ou desinstalar o navegador pode destruir cópias ainda não enviadas.
Não há exportação de contingência nesta etapa, criptografia local, retomada da
captura recuperada, mapas completos offline ou rastreamento nativo em segundo
plano. Para resultados automatizados e arquivos, veja [Parte 10](parte-10.md).

Referências de plataforma: [confirmação transacional do IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
e [ciclo de vida e atualização do Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
