# Parte 20 — Relatório técnico

Entrega local de 23/10/2026, exclusivamente eventos, encontros, passeios e GPS
temporário. Sem deploy e sem iniciar a Parte 21. O roteiro de uso e homologação
está em [eventos.md](eventos.md).

## A. Funcionalidades implementadas

20A integra encontros/passeios, criação idempotente, revisão, edição com controle
de concorrência, descoberta, região e mapa. 20B acrescenta participação, capacidade,
solicitações, convites nominais e organização. 20C implementa consentimento e uma
posição efêmera. 20D conecta o mapa existente e a preparação Ride. 20E acrescenta
revogação no banco, testes de privacidade, retenção, carga e documentação física.
Os módulos existentes foram inspecionados antes da implementação e preservados.

## B. Arquivos principais

- `database/migrations/021_events.sql`: eventos, participantes, convites,
  coorganizadores, ações e índices PostGIS.
- `022_live_location.sql`: consentimento, posições UNLOGGED e referência de Ride.
- `023_event_integrations.sql`: mídia privada e autorizações nominais de Ride.
- `024_live_revocation_triggers.sql`: invalidação ao perder vínculos/permissões.
- `apps/api/src/modules/events/{validation,policy,store,routes,participation,live}.ts`:
  validação, acesso, transações, eventos, participação e GPS efêmero.
- `apps/api/src/app.ts`: registro encapsulado do módulo.
- `apps/api/src/modules/social/{routes,media}.ts`: imagens com contexto de evento;
  mídia não pode ser reutilizada em outro contexto para contornar privacidade.
- `apps/api/src/modules/rides/{validation,persist}.ts` e
  `packages/ride-core/index.d.ts`: associação opcional e autorizada de evento.
- `apps/web/src/events/`: descoberta, formulário, detalhes, participantes, convites,
  mapa, fuso, transporte, contexto, provider e banner.
- `apps/web/src/components/maps/RouteMap.tsx`: fonte GeoJSON de pontos/áreas,
  reutilizando a instância e o estilo de mapa anteriores.
- `App.tsx`, `Layout.tsx`, páginas Comunidade/Explorar/Ride, detalhes de grupo,
  controlador Ride e compositor social: somente integrações necessárias.
- `styles/events.css`: componentes novos com tokens Racing Tech existentes.
- Testes `events.test.ts`, `events.postgres.test.ts`, `events/*.test.ts`,
  `e2e/events.spec.ts` e inclusão no runner PostgreSQL.
- README, controle de progresso, manual e este relatório.

## C. Eventos

Criação exige conta/CSRF, título de 3–120 caracteres, horários UTC coerentes,
fuso IANA, ponto geográfico confirmado e duração máxima de sete dias. Campos
extras de identidade são rejeitados. A chave de criação evita duplicação em
retentativas. Edição exige a revisão atual, preserva grupo e versão estável de
rota e confirma mudança de visibilidade. Capacidade não pode ficar abaixo das
confirmações existentes. Status em andamento/encerrado é calculado pelo servidor;
cancelado não volta a agendado. Alterações são mostradas por revisão/data e
consultadas novamente enquanto os detalhes estão abertos.

## D. Participação

Estados: interessado, confirmado, pendente, cancelado, recusado e removido.
Unicidade é `(event_id,user_id)`. O bloqueio transacional do evento serializa
confirmações, aprovações e alterações de capacidade. Criador conta como confirmado.
Cancelamento libera vaga; não há lista de espera. Organização aprova/recusa e
remove; somente principal designa coorganizador confirmado. Convites possuem
unicidade por evento/destinatário, expiração, recusa e revogação. Aceitação usa
a identidade autenticada, sem transformar convite em ativação GPS.

## E. Grupos

Eventos de grupo exigem membros ativos, não suspensos e grupo ativo. Criar e
gerir exige proprietário/administrador atuais, reavaliados no banco. Uma promoção
não vem do cliente ou token antigo. A administração autorizada do grupo pode
gerir evento cujo criador perdeu cargo, preservando o responsável original.
Grupos privados/não listados não vazam seus eventos na busca de terceiros.
Mudanças de status/privacidade, participação, cargo e suspensão invalidam GPS
por triggers, além das condições obrigatórias em cada leitura/envio.

## F. Mapas

MapLibre, estilo, worker, controles e atribuição existentes. Fonte GeoJSON atualiza
pontos e círculos sem reconstruir o mapa ou criar um GPS paralelo. Vermelho é
encontro; azul, posição local; âmbar, participante autorizado. O círculo representa
incerteza, inclusive a área aproximada, com escala Web Mercator corrigida pela
latitude. Não há interpolação de movimento, velocidade de terceiros ou mapa
público global de pessoas. Região visível usa índice GiST e página limitada.
A rota é obtida de `route_versions`, não duplicada em cada evento.

## G. GPS social

Desligado inicialmente, independente de presença, perfil e Ride. O controlador
reutiliza `RideController.gps`. Mensagem contém sessão temporária, coordenadas,
precisão e timestamp. O servidor rejeita idade acima de 10 s, futuro acima de 2 s,
precisão pior que 200 m, repetição, ordem inversa e posições anteriores ao
consentimento. Frequência mínima de cinco segundos. Opção aproximada quantiza
para 0,01° antes de gravar e retorna raio mínimo de 1.600 m.

## H. Consentimento e expiração

POST de ativação aceita apenas consentimento verdadeiro, versão `live-v1`, escopo,
precisão e duração de 15/30/60/120/240 minutos. Usuário é extraído da sessão;
administrador não envia `userId` para ativar alguém. Evento precisa estar em
andamento e o usuário confirmado. Nova ativação revoga a anterior da conta.
Prazo não ultrapassa fim do evento nem quatro horas. Sessão revogada/expirada não
aceita atualização e não é renovada silenciosamente.

## I. Comunicação em tempo real

Alternativa HTTP prevista no pedido, sem adicionar WebSocket/SSE. Cada envio
consulta o consentimento próprio e cada leitura filtra destinatários novamente.
Polling usa cinco segundos, sem sobreposição; falhas de leitura usam recuo até
30 s. A geometria da rota só é recarregada quando sua revisão muda. Autenticação,
origem de escrita, CSRF, limites e `private, no-store` reutilizam a infraestrutura.
Não há coordenadas em URLs, salas públicas ou distribuição global.

Revogação bloqueia novas consultas imediatamente no banco; clientes já com uma
resposta percebem na próxima consulta, sujeitos à latência. Este transporte não
promete remoção instantânea de bytes já recebidos por terceiros.

## J. Armazenamento temporário

Uma linha atual por evento/usuário em tabela UNLOGGED, atualizada por UPSERT;
nenhuma trilha histórica. Posição desatualizada aos 15 s e inacessível aos 30 s.
Worker a cada 5 s apaga expiradas/revogadas/inelegíveis. Queries impõem validade
mesmo sem limpeza. Consentimento sem coordenadas é eliminado sete dias após
expiração; ações de evento, após 90 dias. Excluir dados de posições de backups e
capturas operacionais, conforme o manual. UNLOGGED não substitui controle de
backups e pode perder seu conteúdo após falha do PostgreSQL.

## K. Privacidade

Identidade autenticada, evento, grupo, participação, bloqueio bilateral, escopo,
cargo e prazo são verificados no servidor. A conta que só conhece um ID não obtém
coordenadas. A lista nominal exige confirmação/organização; lista de convites,
gestão. Imagem segue as mesmas permissões do evento e processamento sem EXIF.
Não são enviados email, telefone, Garagem, sensores, telemetria ou vídeos.
Logger registra somente método/caminho sem query e erro categorizado, nunca os
corpos com coordenadas. Sem analytics novo, notificações com GPS ou GPS no feed.

## L. Ride

Preparação emite autorização de associação nominal, limitada ao fim do evento.
`RidePayload.event` segue no IndexedDB e na sincronização já existente. O banco
confere se a autorização pertence à conta/evento e era válida no início do Ride;
salvar depois de sair não recria presença nem GPS social. Parar social não
finaliza Ride e sua pausa não grava GPS histórico novo. Finalizar Ride encerra
social; o usuário pode salvar ou descartar normalmente. Nenhuma publicação,
mudança de Garagem ou exposição da atividade ocorre automaticamente.

## M. Performance

Limites: 50 itens por página, 200 sessões sociais simultâneas por evento, uma
posição por sessão e pelo menos 5 s entre envios. Consultas limitam pelo evento e
escopo; não consultam um GPS global nem fazem uma requisição por marcador.
Índices em ponto GiST, região, agenda, grupo, participantes, expiração e usuário.

A medição sintética local executa dez leituras para 10, 50 e 200 posições e mede
tempo, CPU do processo API, variação de heap, payload e limpeza. Evidência em
`.local/parte20-performance.json`. A execução final registrou:

| Posições | Dez leituras | Média por leitura | Payload  | CPU Node (user + system) | Variação de heap |
| -------- | ------------ | ----------------- | -------- | ------------------------ | ---------------- |
| 10       | 299 ms       | 29,9 ms           | 3.700 B  | 16 ms                    | −892.512 B       |
| 50       | 429 ms       | 42,9 ms           | 17.700 B | 31 ms                    | +1.385.104 B     |
| 200      | 371 ms       | 37,1 ms           | 70.300 B | 62 ms                    | −2.454.640 B     |

Limpeza de 200 posições: 4 ms. O limite de 200 ativações foi verificado e o plano
de consulta geográfica usou `events_point` com seqscan desabilitado no teste,
demonstrando elegibilidade do índice, sem prometer escolha de plano em produção.
CPU e heap são do processo Node, não do PostgreSQL; a queda do heap é compatível
com coleta de lixo, não uma medição de memória residente do sistema inteiro.
São medições locais, sujeitas a concorrência do ambiente, sem simular frota móvel,
conexões TCP simultâneas, bateria ou capacidade de produção. Não foi adicionada
infraestrutura distribuída.

## N. Validação

Validação executada, sem contar repetições como cenários novos:

| Verificação                               | Resultado                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                              | Tipos, lint, formatação, 631 cenários padrão (220 API + 411 web) e builds aprovados                                             |
| PostgreSQL/PostGIS real, dez arquivos     | 296 cenários distintos aprovados, considerando a repetição isolada descrita abaixo                                              |
| Parte 20 PostgreSQL, rodada final isolada | 35 cenários aprovados, incluindo logout, ACL na consulta e índices                                                              |
| Chrome, suíte completa em 17 arquivos     | 68 cenários aprovados                                                                                                           |
| Parte 20 Chrome no build final            | Quatro fluxos repetidos e aprovados; os 11 de interface também passaram na repetição final                                      |
| OpenFreeMap real no Ride                  | Três respostas de tiles, atribuição visível, GPS desligado, 320/390/1440 px sem overflow                                        |
| Mapa social com provedor e fontes reais   | Renderização da área aproximada e fonte Noto Sans Regular; zero erros de página; somente API interceptada com fixture sintética |
| Migrações locais e health DB via Fastify  | 021–024 aplicadas; HTTP 200, PostgreSQL conectado e PostGIS habilitado                                                          |

Total de **995 cenários automatizados distintos**, sendo **84 novos** nesta
parte, além dos dois smokes de provedor. Os 296 cenários PostgreSQL pulados na
suíte padrão foram executados separadamente contra o banco real. Há capturas de
criação/revisão, descoberta, detalhes em 320/360/375/390/430/1440 px e mapa social;
inspeção visual móvel/desktop e verificação automática de overflow.

Na rodada PostgreSQL executada junto com o navegador, o teste anterior de limite
de login por IP excedeu seus 5 s: 295 passaram e um teve timeout. A repetição
isolada do arquivo de autenticação aprovou os 38 cenários em 28,15 s. O teste
não teve seu limite aumentado para ocultar o problema. A regressão PostgreSQL
anterior, antes de acrescentar o cenário de logout, já havia aprovado todos os
295 da ocasião. Os três demais arquivos novos de testes cobrem 29 cenários de
validação API, 11 de controlador GPS e cinco de fuso, incluídos nos 631 padrão.

As primeiras rodadas Chrome detectaram um seletor incorreto de teste, uma
expectativa incorreta de arredondamento negativo e uma corrida real na preparação
Ride. Os testes foram corrigidos e o início de Ride agora aguarda a autorização
de associação; todos os fluxos foram repetidos com sucesso. O primeiro smoke do
mapa não encontrou preview em 5175; após iniciar o preview, passou. O health DB
inicial não encontrou API em 3001; a conexão foi validada depois em instância
Fastify isolada, sem inserir dados.

Evidências: `.local/parte20-check-final.log`, `parte20-postgres-final.log`,
`parte20-auth-isolated.log`, `parte20-events-postgres-final.log`,
`parte20-browser-regression.log`, `parte20-events-browser-final.log`,
`parte20-map-provider.log`, `parte20-event-map-provider.log`,
`parte20-performance.json` e `.local/screenshots/events-*.png`.

As integrações abrangem capacidade simultânea, versões de rota, acesso privado,
convites, grupos/cargos, coorganização, mídia, consentimento separado, públicos,
bloqueios, precisão aproximada antes da gravação, TTL, revogação, ausência de
reativação depois de reingresso/desbloqueio, associação Ride e carga limitada.
Testes cliente incluem ativação tardia interrompida, GPS negado, troca de conta,
offline, suspensão e ausência de fila de coordenadas. Dados são sintéticos em
esquemas isolados; nenhuma pessoa ou evento fictício é criado em produção.

## O. Limitações

Homologação em Android/Chrome e iPhone/Safari físicos permanece pendente, com
roteiro e ficha no manual. Chrome desktop com GPS simulado não comprova GPS real,
Safari, bateria, tela bloqueada ou entrega em rede móvel. Não há execução GPS em
segundo plano garantida, WebSocket, push, geocodificador novo, lista de espera,
sessão social independente que sobreviva ao fim do Ride, proteção por área
residencial, moto opcional divulgada na presença ou cache persistente de eventos.
Esses limites não impedem participação sem Ride ou sem GPS. Mídia opcional pode
ser reenviada se falhar depois do evento já criado, com aviso explícito.

Build mantém o aviso já conhecido do pacote de mapa acima de 500 kB. Não houve
reestruturação do monorepo ou alteração dos estilos/tokens/navegação aprovados.

## P. Preparação para a Parte 21

IDs de evento, participação voluntária, estados e associação privada com Ride
permitem futuramente avaliar presença/atividades válidas sem GPS social ou
velocidade como prova obrigatória. Uma etapa futura deverá definir consentimento
e critérios não competitivos próprios. Nenhum XP, ranking, conquista, recompensa,
chat, SOS ou painel administrativo global foi implementado nesta entrega.
