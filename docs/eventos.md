# Eventos, encontros e mapa social — Parte 20

Entre na conta e abra **Comunidade → Eventos** ou **Explorar → Eventos**.
As cinco abas, o botão Ride e a identidade Racing Tech continuam os anteriores.
O grupo também oferece **Eventos do grupo**. Não existem eventos de demonstração
inseridos no banco normal.

## Organizar e participar

1. Escolha **Criar evento**. Encontro não possui rota; passeio admite uma rota
   aprovada do catálogo existente, sem exigir que os participantes gravem Ride.
2. Informe nome, descrição, regras, cidade/UF, datas e fuso IANA. Os campos de
   horário pertencem ao fuso do evento. UTC é usado na API e no banco.
3. Escolha o ponto tocando no mapa ou ajustando latitude/longitude. Confirme
   explicitamente o local a divulgar. Nenhum GPS ou endereço residencial é
   consultado automaticamente. Sem geocodificador configurado, use esses controles.
4. Defina público, privado por convite ou grupo. Eventos associados a grupos
   são exclusivos dos membros. Proprietário e administrador podem organizá-los;
   moderador e membro não recebem essa permissão automaticamente.
5. Capacidade é opcional e inclui o criador, inicialmente confirmado. A presença
   é imediata ou sujeita à aprovação. Revise antes de confirmar a criação.
6. Uma imagem opcional usa o processamento privado da Comunidade, sem EXIF/GPS.
   Seu acesso acompanha as permissões do evento.

A busca admite nome, cidade, UF, tipo, intervalo UTC de datas, grupo, região do
mapa e filtros de participação/convite. Resultados são paginados. Alagoas recebe
prioridade de ordenação sem excluir outras UFs. O mapa geral contém apenas os
pontos de encontro autorizados; os cards abrem os detalhes.

Nos detalhes, confirme presença, marque interesse ou cancele. A lista nominal
fica restrita à organização e aos confirmados; visitantes elegíveis recebem
somente o total de confirmações. Membros bloqueados são filtrados das listas.
Solicitações pendentes são visíveis à organização, que pode aprovar, recusar ou
remover. A capacidade é verificada dentro de uma transação com bloqueio do evento.
Não há lista de espera ou promoção automática.

Convites são nominais, vinculados à conta destinatária, válidos por até 30 dias,
sem token permanente na URL. A organização busca uma pessoa ou seleciona um
integrante do grupo. **Eventos → Convites recebidos** permite aceitar/recusar.
**Convites enviados** permite revogar pendentes. Aceitar não ativa GPS. Um link
público não autoriza acesso a um evento privado ou a posições pessoais.

Somente o principal designa/revoga coorganizadores confirmados. Nos eventos de
grupo, eles também precisam ser proprietário/administrador atuais. A equipe
autorizada do grupo mantém capacidade de gestão se o criador perder seu cargo.
Não há transferência arbitrária do organizador principal.

Editar exige a revisão atual e confirmação do ponto. Mudar visibilidade exige
confirmação adicional. Datas/local/regras alterados incrementam a revisão,
mostrada com a data de atualização nos detalhes. A página consulta novamente a
cada 15 segundos enquanto está aberta. Cancelar/encerrar retira GPS imediatamente
das novas consultas. Horário final também encerra a elegibilidade automaticamente.
Eventos cancelados não são reabertos pela interface.

## GPS social separado do GPS local

**Participar, abrir o mapa e iniciar Ride nunca autorizam transmitir localização.**
O campo global anterior `liveLocationEnabled` continua falso: consentimento é
específico da sessão de cada evento, e não uma preferência persistente de ligar GPS.

Durante o evento, participantes confirmados podem abrir **Mapa social** sem
compartilhar. **Mostrar minha localização neste aparelho** usa o GPS existente
apenas localmente. O botão de ativação social exige escolher e confirmar:

- Evento e público: somente organizadores ou participantes confirmados.
- Prazo: 15, 30, 60, 120 ou 240 minutos, limitado ao término do evento.
- Precisão aproximada ou mais precisa.
- Caixa de consentimento explícito com versão `live-v1`.

Na opção aproximada, o servidor arredonda as coordenadas para uma grade de 0,01°
**antes de persistir** e informa um raio conservador mínimo de 1.600 m. O mapa
desenha uma área, não um pino exato. A opção mais precisa conserva a precisão
horizontal medida, recusando leituras piores que 200 m. Nenhuma opção oferece
anonimato aos destinatários autorizados.

Há uma posição atual por usuário/evento, enviada no máximo a cada cinco segundos.
Leituras anteriores ao consentimento, antigas, duplicadas, fora de ordem ou com
coordenadas inválidas são recusadas. Velocidade, direção, sensores, histórico,
vídeos, fotos e dados de Garagem não fazem parte da mensagem social.

O banner global identifica público, prazo e confirmação recente do servidor e
oferece **Parar compartilhamento**, inclusive fora do mapa. Depois de 15 segundos
sem atualização, a posição é marcada como desatualizada. Depois de 30 segundos,
ela deixa de ser retornada e é retirada do mapa. Não há previsão de movimento.

Parar interrompe novos envios imediatamente. Com internet, revoga a sessão e
remove o ponto no servidor. O mapa remoto percebe a remoção na próxima consulta
bem-sucedida, normalmente em um ciclo de cinco segundos, acrescido da latência.
Sem internet, apenas os identificadores da intenção de revogar ficam no
localStorage, separados por conta; nenhuma coordenada é guardada para reenvio.
O ponto no servidor expira em até 30 segundos sem nova leitura. Não se pode apagar
uma informação que um destinatário já tenha visto ou copiado.

Perda de rede, ocultação da página, saída da conta, GPS negado e encerramento do
Ride interrompem a transmissão. **Retomar exige uma nova autorização.**
Trocar o público ou prorrogar também exige parar e consentir novamente.
Nenhuma sessão social é restaurada a partir do IndexedDB ou da fila de Ride.

## Ride e divulgação

Em um passeio confirmado, **Iniciar Ride neste passeio** abre a preparação
existente: seleção de moto, modos e sensores continuam iguais. A API emite uma
autorização nominal de associação e carrega a versão estável da rota. O Ride
registra essa referência junto aos seus próprios dados, inclusive na cópia local
e na sincronização anterior. A preparação da associação exige internet.

O mesmo serviço de GPS atende Ride e mapa social. Parar o compartilhamento não
finaliza Ride; pausar Ride não gera pontos históricos enquanto pausado. Ao
finalizar Ride, o compartilhamento é interrompido. O Ride pode ser salvo ou
descartado independentemente de cancelar presença. A autorização emitida antes
da saída permite salvar o Ride histórico posteriormente; não concede GPS social.

Somente um organizador de evento público recebe **Divulgar no feed**, que abre o
compositor anterior com título/data/região/link para revisão e publicação
explícita. Não se cria postagem de presença, convite ou localização. Essa
publicação de texto é uma divulgação escolhida pelo autor; não é um card que se
atualiza automaticamente quando o evento muda. Eventos privados não recebem
esse atalho público.

## Operação e limites

Execute `pnpm db:migrate` para 021–024. Esses números são migrações da **Parte 20**,
não implementação das Partes 21–24. `LIVE`, em `modules/events/live.ts`, centraliza
a política de frequência, precisão, prazo curto e limite de 200 compartilhamentos
simultâneos por evento. A API limita páginas a 50; o mapa social a 200 posições.

O transporte é HTTP autenticado por cookies/CSRF e consultas periódicas limitadas,
alternativa prevista no escopo. Não há WebSocket, SSE, salas ou tokens na URL.
Use HTTPS no telefone. Cada leitura e envio reavalia usuário, evento, participação,
grupo, cargo, consentimento, prazo, público e bloqueios. Leituras usam `no-store`.

`live_location_positions` é uma tabela UNLOGGED de posições atuais, sem histórico;
o worker apaga expiradas a cada cinco segundos. Filtros de leitura recusam dados
expirados mesmo se a limpeza falhar. Metadados sem coordenadas de consentimento
são eliminados sete dias depois da expiração; auditoria de ações, após 90 dias.
Exclua os dados de `live_location_positions` de backups, exportações, replicação
lógica, analytics e ferramentas de captura de requisições. O logger da API não
registra corpo, resposta, coordenadas ou parâmetros de consulta.

Eventos e alterações exigem conexão. Esta parte não adiciona cache persistente
de eventos privados nem de posições. O Service Worker anterior não armazena API
ou GPS. Mapas podem ficar sem tiles offline; o Ride local permanece independente.

Não há garantia de continuidade com tela bloqueada, navegador fechado, aba
suspensa, troca de aplicativo ou restrições de bateria, tanto em Android quanto
em iPhone. Instalar a PWA não remove essas restrições. Não existe promessa de
resgate, monitoramento permanente ou rastreamento em segundo plano.

## Roteiro físico Android e iPhone — pendente

Use ambiente isolado com HTTPS, moto parada e três contas: organização, confirmado
e não autorizado. Nenhum aparelho físico foi homologado nesta entrega.

1. Registrar aparelho, versão Android/iOS, versão Chrome/Safari e modo navegador/PWA.
2. Criar encontro/passeio, ajustar o ponto no mapa, escolher rota e conferir o fuso
   do evento em dois aparelhos com fusos de sistema diferentes.
3. Confirmar presença e iniciar Ride. Verificar ausência de pedido/envio GPS social.
4. Abrir o mapa sem compartilhar e testar GPS apenas local.
5. Consentir somente com organizadores, prazo de 15 minutos, precisão aproximada.
   Verificar a área na organização e ausência de coordenadas na conta não autorizada.
6. Parar; medir remoção no servidor e no mapa remoto. Repetir com precisão maior,
   público de confirmados e múltiplos participantes. Verificar apenas um coletor GPS.
7. Negar/revogar permissão GPS; conferir estado e ausência de envios.
8. Desligar rede, parar offline e religar: a revogação é reenviada, posições não.
   Conferir TTL de 30 s e exigência de novo consentimento.
9. Bloquear tela, trocar aplicativo, suspender navegador e retornar. Registrar
   interrupção, latência, consumo e comportamento real; não presumir continuidade.
10. Remover participante, bloquear usuário, suspender membro, trocar cargo,
    arquivar grupo e encerrar/cancelar evento. Conferir perda de acesso na API,
    sessão revogada e ausência de reativação depois de restaurar o vínculo.
11. Esperar expiração do prazo; não aceitar renovação automática.
12. Parar GPS social e continuar Ride, pausar/retomar, finalizar e salvar offline.
    Sincronizar depois e verificar que não foram enviadas posições sociais antigas.

Ficha a preencher: aparelho; SO; navegador; HTTPS; tempo testado; frequência GPS
observada; precisão; latência de revogação; TTL; interrupções; consumo; resultado
de reconexão; resultado de troca de conta; limitações e evidências. Chrome desktop
automatizado não substitui esses testes, nem equivale a Safari iOS.

## Contrato HTTP

Todas as rotas exigem autenticação. Escritas também exigem a origem autorizada,
`X-Apex-Request: 1` e o CSRF da sessão existente. Identificadores de usuário no
corpo são aceitos somente como destinatário de convite/gestão, nunca como a
identidade de quem compartilha GPS. Erros usam o formato de autenticação existente:
`{status:'error',message}`; 400 validação, 401 conta, 403 permissão, 404 conteúdo
indisponível, 409 conflito/capacidade, 410 sessão inválida, 429 limite e 503 serviço.

| Método e caminho sob `/api`                        | Uso                                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /events` ou `/events/mine`                    | Busca paginada: `q`, `city`, `state`, `type`, `from`, `to`, `groupId`, `filter`, `bbox`, `page`, `limit` |
| `POST /events`                                     | Criação revisada com `creationKey` e `confirmPoint:true`                                                 |
| `GET /events/:id`                                  | Detalhes e estado autorizado                                                                             |
| `PATCH /events/:id`                                | Configuração completa com `revision`, `confirmPoint` e, se necessário, `confirmDisclosure`               |
| `DELETE /events/:id` ou `POST /events/:id/cancel`  | Cancelamento lógico                                                                                      |
| `POST /events/:id/finish`                          | Encerramento                                                                                             |
| `GET /events/:id/map`                              | Ponto e plano estável, sem posições pessoais                                                             |
| `POST /events/:id/rsvp`                            | `{status:'confirmed'}` ou `{status:'interested'}`; aprovação pode produzir `pending`                     |
| `DELETE /events/:id/rsvp`                          | Cancela presença e revoga GPS próprio, inclusive após perda de acesso                                    |
| `GET /events/:id/participants?page=1`              | Lista autorizada, até 50 por página                                                                      |
| `PATCH /events/:id/participants/:userId`           | `confirmed` para aprovar pendente, `rejected` ou `removed`                                               |
| `POST` / `DELETE /events/:id/organizers/:userId`   | Principal designa/revoga coorganizador                                                                   |
| `POST /events/:id/invitations`                     | `{userId,expiresAt}`; nominal e sem ativação automática                                                  |
| `GET /events/:id/invitations?page=1`               | Organização consulta convites enviados                                                                   |
| `GET /events/invitations/mine`                     | Até 50 convites pendentes válidos para a conta                                                           |
| `POST /events/invitations/:id/accept` ou `/reject` | Resposta nominal autenticada                                                                             |
| `DELETE /events/:id/invitations/:invitationId`     | Revoga convite pendente                                                                                  |
| `PATCH /events/:id/image`                          | `{mediaId}` de upload social próprio; `null` remove                                                      |
| `POST /events/:id/ride-association`                | Emite autorização de associação privada para preparação de Ride                                          |
| `POST /events/:id/live-location/start`             | `{consent:true,consentVersion:'live-v1',audience,precision,durationMinutes}`                             |
| `POST /events/:id/live-location/stop`              | `{sessionId}` da própria conta; não afeta sessão posterior de outra aba                                  |
| `GET /events/:id/live-location/me`                 | Metadados próprios válidos, sem retomar transmissão                                                      |
| `POST /events/:id/live-location/position`          | `{sessionId,longitude,latitude,accuracy,timestamp}`; substitui a posição atual                           |
| `GET /events/:id/live-location/participants`       | Até 200 posições autorizadas, com prazo, precisão e estado                                               |

O corpo de evento usa `title`, `description`, `rules`, `eventType`, `visibility`,
`joinPolicy`, `city`, `state`, `meetingPoint:[longitude,latitude]`,
`meetingPointLabel`, `meetingReference`, `startsAt`, `endsAt`, `timezone`,
`capacity`, `groupId` e `routeId`. IDs opcionais e capacidade ausente usam `null`.
Coordenadas no mundo de mapa são limitadas a longitude ±180° e latitude ±85°.
Não há endpoint de histórico GPS social.
