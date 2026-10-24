# Histórico de atividades — Parte 12

O histórico consulta as sessões reais das Partes 06–11. A fonte técnica continua
sendo `rides`, `ride_points`, sensores, velocidade processada, eventos e voltas.
Não há outro sistema de atividades, replay animado ou comparação de trajetos.

## Usar

Execute `pnpm db:migrate` e reinicie a API. Abra `/historico`, pelo perfil,
pelo card **Último Ride** do Início ou pelo link do resumo de uma sessão salva.
Os cinco itens da navegação inferior permanecem iguais. `/estatisticas` mostra
os totais da conta; `/historico/:id` mostra uma atividade sincronizada;
`/historico/local/:clientId` mostra uma cópia autorizada deste aparelho.

A listagem é cronológica, com filtros combináveis e paginação. Sem dados, há
convite para o primeiro Ride. Títulos ausentes recebem o nome neutro do modo e
a data, sem geocodificar ou inventar lugares. Motos arquivadas permanecem nas
opções quando têm atividades. A identificação da moto é congelada no salvamento;
atividades antigas receberam a identificação disponível durante a migração,
marcada com `historicalFallback: true`, sem alegar que é um snapshot original.

O card de último Ride preserva a estrutura existente e usa um traçado SVG dos
pontos reais, sem gerar uma fotografia ou criar um mapa por card. As demais
prévias de instrumentos e módulos sociais anteriores continuam identificadas
como ilustrativas. O perfil usa totais reais de Rides/km, últimas atividades e
mantém Garagem, XP indisponível, conquistas e componentes sociais anteriores.

## Arquitetura e carregamento

- `modules/rides/history-query.ts`: validação e SQL parametrizado de filtros.
- `history.ts`: histórico, opções, paginação, metadados, exclusão e reconciliação.
- `history-data.ts`: detalhes leves, traçado, gráficos e acesso por proprietário.
- `history-stats.ts`: agregações SQL por conta, período, modo, moto e mês.
- `public.ts`: contrato público separado, com whitelist conservadora.
- `packages/ride-core/history`: redução visual de pontos, mantendo segmentos.
- `packages/ride-core/charts`: implementação já existente dos gráficos da Parte 09
  compartilhada com a API; o frontend anterior reexporta essas mesmas funções.
- `src/history`: cards, filtros, detalhes reutilizáveis, reconciliação e tipos.
- `HistoryPage`, `RideDetailsPage`, `LocalRideDetailsPage`, `RideStatisticsPage` e
  `PublicRidePage`: telas React Racing Tech, sem biblioteca visual adicional.

Listagens não carregam pontos nem séries de sensores. Detalhes começam com
metadados/métricas e uma prévia limitada do mapa. O botão **Carregar gráficos e
eventos** busca as séries reduzidas e as primeiras páginas de eventos/voltas.
A redução não altera os originais nem recalcula métricas históricas persistidas.
O backend lê uma sessão limitada pelas regras anteriores, calcula sua apresentação
e envia até 600 pontos por série ao navegador. Não existe cache público de dados
privados. O Service Worker anterior continua restrito ao shell/assets, excluindo
API e tiles.

## Filtros

A interface oferece últimos 7/30/90 dias, ano corrente, intervalo personalizado
ou tudo; modos Passeio/Pista/Misto; moto; rota associada ou ausência de rota;
visibilidade e estados de sincronização. Ordenação por data recente/antiga,
distância ou tempo ativo. Não existe ordenação competitiva por velocidade.

Datas da interface são convertidas para timestamps UTC; o fim do intervalo
personalizado é inclusivo para a pessoa, convertido para início do dia seguinte
como limite exclusivo da API. Datas e horários são exibidos no contexto local.
A consulta usa `from <= started_at < to`. Pesquisa textual cobre título,
descrição, identificação histórica da moto e nome da rota salva. Termos e
wildcards são parametrizados; a busca combina FTS português e correspondência
parcial. Não são pesquisados endereços inferidos a partir do GPS.

Os filtros locais usam o mesmo período/modo/moto/rota/privacidade e estado da fila.
A lista local tem paginação própria e nunca se apresenta como todo o histórico.
Atividades descartadas e registros de outras contas não entram nessa lista.

## APIs

Prefixo `/api`. Endpoints próprios exigem sessão válida e proprietário; escritas
mantêm CSRF e proteção de origem da Parte 03. IDs e limites são validados. As
respostas próprias têm `Cache-Control: no-store` pela proteção de sessão existente.

| Endpoint                            | Contrato                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /rides`                        | Listagem leve, `rides`, `total`, `hasMore`, `page`, `offset`, `limit`                                      |
| `GET /rides/filters`                | Motos/rotas referenciadas pelas atividades ainda visíveis da conta                                         |
| `GET /rides/:id?view=summary`       | Metadados, métricas consolidadas, plano, qualidade, contagens e melhor volta persistida                    |
| `GET /rides/:id`                    | Contrato privado completo anterior, preservado para compatibilidade e recuperação autorizada dos originais |
| `GET /rides/:id/track`              | Prévia GPS segmentada; padrão 1.000 pontos, máximo 2.000                                                   |
| `GET /rides/:id/telemetry`          | Séries GPS/assistida/G/inclinação reduzidas, contagens e identificação de origem                           |
| `GET /rides/:id/events`             | Eventos persistidos, paginados, com fonte, método, qualidade, estado e força associada                     |
| `GET /rides/:id/laps`               | Voltas persistidas, paginadas, com duração e qualidade                                                     |
| `GET /rides/stats`                  | Totais ponderados e agrupamentos por modo/moto/mês                                                         |
| `PATCH /rides/:id`                  | Somente `title`, `description`, `visibility`                                                               |
| `DELETE /rides/:id`                 | Exclusão lógica e tombstone do identificador estável                                                       |
| `DELETE /rides/by-client/:clientId` | Cancela inclusive envio interrompido, impedindo sua recriação posterior                                    |
| `GET /rides/receipts?ids=...`       | Até 100 IDs estáveis locais; retorna somente correspondências da conta e estado de exclusão                |
| `GET /public/rides/:id`             | Resumo público separado, sujeito à privacidade atual de perfil e atividade                                 |

Parâmetros de listagem/estatísticas:

- `q`: até 120 caracteres; `mode=passeio|pista|misto`.
- `motorcycleId`: UUID histórico; `routeId`: UUID ou `none`.
- `visibility=public|private`.
- `from`, `to`: ISO UTC com `Z`, início inclusivo/fim exclusivo.
- `sort=recent|oldest|distance|duration`.
- `page=1..20000`, `limit=1..50`; padrão 50. `offset=0..1000000` é mantido por
  compatibilidade. A interface usa 12 itens/página.

Eventos/voltas: `page=1..1000`, `limit=1..100`, padrão 50. O mapa informa número
original de pontos/segmentos, redução e segmentos omitidos se o limite for muito
pequeno. Cada parte é desenhada separadamente. Um limite de um ponto fornece só
uma amostra real, sem interpolação. Nenhuma linha liga segmentos omitidos.

Há limite por processo e conta de 240 leituras/minuto e 24 leituras pesadas
(mapa/telemetria)/minuto. O resumo público limita 60 consultas/IP/minuto. Operações
SQL usam os timeouts já configurados no pool. Várias réplicas exigirão limitação
compartilhada no gateway/armazenamento apropriado; a implementação não presume
que o contador em memória seja global.

## Estatísticas e medições

Somam-se exclusivamente atividades salvas, pertencentes à conta e não excluídas.
A média geral é `soma(distância em metros) × 3600 / soma(tempo ativo em ms)` em
km/h; tempo ativo total zero produz indisponibilidade, sem divisão por zero.
Não se calcula média aritmética das médias de atividades. As agregações usam uma
transação somente de leitura com snapshot consistente (repeatable read), evitando
misturar totais e grupos de instantes diferentes durante salvamentos/exclusões.

Há total de Rides, distância, tempo ativo, contagens dos três modos, número de
motos, distância por moto e evolução mensal de contagem/distância. Meses usam
`America/Sao_Paulo` no agrupamento. Tabelas apresentam até 120 motos e 120 meses;
quando atingem o limite, isso é informado e filtros permitem consultar outros
recortes. Os totais continuam referentes a todo o filtro, sem truncamento.
A exclusão afeta as agregações imediatamente porque não há totais derivados
materializados nem uma cópia das medições para o histórico.

A origem é o consolidado do módulo de sessões, que valida pontos e qualidade no
salvamento. Não há novo método de distância ou mistura de GPS original com
velocidade assistida. Estimativas de sensores ficam identificadas, com calibração,
qualidade e truncamento preservados. Atividades sem sensores mostram
indisponibilidade; inclinação dinâmica continua indisponível conforme as partes
anteriores. Zero é usado para contagem/soma realmente vazias, não para uma medição
individual ausente.

Eventos e voltas são lidos do que já foi registrado. Não são criados tempos novos
para uma rua circular. O melhor tempo de volta é uma agregação das voltas
persistidas, não um ranking. Os detalhes mostram contexto do circuito/versão
mesmo após arquivamento da rota. Gráficos mantêm timestamps, segmentos, lacunas,
unidades e extrema na redução visual. A inspeção por slider consulta uma amostra;
não move marcador nem reproduz uma atividade.

## Privacidade e compartilhamento

A política pública é **`summary-only-v1`**. Para qualquer visitante, inclusive
alguém com o link, o servidor reavalia em cada consulta:

1. Conta ativa.
2. Perfil público.
3. Atividade pública.
4. Atividade não excluída.

A política mais restritiva prevalece. Caso falhe qualquer regra, a API retorna
404 uniforme sem revelar dados privados. O proprietário consulta o conteúdo
completo somente pelos endpoints privados autenticados.

O DTO público contém exclusivamente `rider` (nome de perfil público), `mode`,
`day` (dia sem horário), `distance_km` arredondado a 0,1 km, `active_minutes`
arredondado, `title` neutro por modo/data e `locationPolicy`. Título personalizado
e descrição são privados nesse contrato, pois podem conter endereços ou
coordenadas. Não há moto, identificadores da conta, rota planejada, geometria,
trajeto, pontos originais, timestamps individuais, velocidade, eventos ou voltas.
Não existe mapa público nem imagem derivada do trajeto. Essa escolha conservadora
protege também retornos do trajeto a uma residência: não basta remover só as pontas.

A página `/compartilhar/rides/:id` segue o shell Apex Ride, usa metadados genéricos
e `noindex, noarchive`. A API envia `no-store, private, max-age=0`, `Pragma:
no-cache`, `Referrer-Policy: no-referrer`, `X-Robots-Tag` e `Vary: Cookie`.
A página reconsulta ao receber foco/visibilidade e a cada 30 segundos. Mudar para
privada ou privatizar o perfil revoga imediatamente **novas consultas**. Um resumo
já aberto depende dessa atualização para desaparecer da tela; revogação não apaga
cópias anteriormente feitas por um destinatário. Não há promessa de anonimização
completa: o nome público e o próprio resumo ainda identificam sua publicação.

**Copiar link público** e **Compartilhar** (API nativa quando disponível) são ações
voluntárias. Não alteram privacidade automaticamente. Quando a atividade/perfil
não permitem publicar, a interface explica a restrição. O link é genérico e não
inclui informações pessoais na URL além do UUID do registro. Não há envio para
contatos, postagem em feed, recordes públicos de ruas ou publicação de rota
pessoal derivada da atividade.

## Exclusão e integridade

Somente o proprietário exclui, após confirmação na interface. A exclusão lógica
preenche `rides.deleted_at`, registra atualização e mantém o UUID/client ID.
Todos os endpoints de consulta, compartilhamento, filtros e estatísticas excluem
o registro. Pontos, sensores, eventos, voltas e metadados técnicos permanecem
fisicamente relacionados no banco para integridade; não há restauração pela UI
nem política de expurgo físico implementada nesta parte. Esse limite é explícito:
excluir do histórico não significa apagar imediatamente todas as linhas SQL.
Rotas cadastradas independentemente e motos não são removidas junto com a atividade.

`ride_deletions` guarda a intenção por `(owner_id,client_id)`. Persistência e
a conclusão dos lotes respeitam essa marca; um POST antigo retorna 410, não recria
atividade. Exclusão e criação serializam no mesmo lock do proprietário já usado
pelo salvamento. Cancelamento por client ID também remove uploads parciais.
Não há exclusão em massa.

## Histórico offline e reconciliação

Os checkpoints/filas anteriores foram preservados. Só foi acrescentado um resumo
de métricas aos metadados de uma sessão finalizada, sem outra coleção IndexedDB.
Listar cópias locais não lê suas séries; abrir detalhes lê a sessão solicitada.
Cópias antigas sem resumo usam a confirmação existente ou calculam as métricas
somente ao abrir os pontos originais nos detalhes, sem inventar zeros na listagem.

A lista remota e a prévia local usam `client_id` e o ID confirmado. Cópias já
sincronizadas não aparecem novamente enquanto o remoto está disponível. O endpoint
de recibos resolve ainda um commit cuja resposta se perdeu; registros excluídos
não são reinseridos na lista. Os recibos são consultados em lotes de até 100 IDs.
Não há soma dupla nas estatísticas: os totais acumulados contam apenas o servidor.
Quando a rede falha, as cópias da conta continuam consultáveis, com mensagem clara
de que não representam necessariamente todo o histórico.

Finalizadas sem decisão permitem **Revisar para salvar no Ride**, reutilizando o
fluxo anterior. Pendentes mostram estado real da fila e permitem sincronizar.
Cópias confirmadas redirecionam ao detalhe remoto quando a API está novamente
acessível. Metadados são isolados por conta; logout/troca de conta não concedem
acesso aos dados do usuário anterior. O contexto local lembrado do dispositivo
continua sendo o da Parte 10 e não substitui autenticação no servidor.

Para descartar uma pendência, o coordenador obtém o mesmo lease de sincronização
entre abas. Uma sessão sem nenhuma tentativa de envio pode ser descartada offline.
Se já houve tentativa/recibo, é necessária conexão para confirmar o cancelamento
no servidor: a resposta de um commit pode ter sido perdida. Após cancelar, remove
fila e amostras locais e grava uma marca local que bloqueia um checkpoint antigo.
Se outra aba está sincronizando, a interface pede aguardar essa operação. Não há
nova fila offline de edições, privacidade ou exclusão remota.

Mapas novos e tiles continuam dependendo da conexão. O traçado local pode ser
mostrado sem a base cartográfica; não há cache/download não autorizado de tiles.
Mudanças feitas em outro aparelho só chegam à cópia local quando há conexão.

## Banco e migrações

`011_history.sql` é aditiva: título, descrição, `deleted_at` e
`motorcycle_snapshot` em `rides`; backfill identificado da moto disponível;
índices parciais por proprietário/data, modo, moto, rota e visibilidade, e GIN
textual de título/descrição. Não altera métricas GPS existentes.

`012_ride_deletions.sql` acrescenta tombstones por proprietário/client ID para
cancelar também uma sincronização ainda não concluída. Não duplica sensores,
geometrias ou eventos. Migrações anteriores permanecem intactas e o executor
continua conferindo seus checksums.

## Android e iPhone — roteiro físico pendente

Em cada plataforma, com HTTPS e duas contas de teste:

1. Entrar, cadastrar/carregar a moto e fazer uma sessão simples em caminhada segura.
2. Finalizar e salvar; abrir o link do resumo para o histórico.
3. Localizar por data, moto e modo; abrir detalhes, mapa, segmentos e gráficos.
4. Conferir indisponibilidade de sensores quando não foram coletados; não testar
   aceleração de alta velocidade nem inclinações arriscadas.
5. Alterar título, descrição e privacidade; recarregar e conferir persistência.
6. Publicar somente um resumo de teste, copiar o link e abrir em outro navegador.
   Confirmar ausência de mapa, coordenadas, título/descrição pessoais e eventos.
7. Privatizar atividade e perfil separadamente, reabrir o link e conferir bloqueio.
8. Desconectar, salvar outra atividade localmente, abrir o histórico e seus detalhes.
9. Reconectar e sincronizar; confirmar uma única atividade e acesso remoto correto.
10. Repetir com resposta de rede perdida e confirmar reconciliação por client ID.
11. Descartar uma pendência nunca enviada offline; tentar uma já enviada sem rede e
    confirmar a orientação para conectar, preservando dados até o cancelamento.
12. Trocar para a segunda conta e verificar que nenhum trajeto local ou remoto da
    primeira é exibido. Conferir exclusão própria e rejeição de acesso alheio.
13. Verificar toque, slider dos gráficos, zoom, arraste, centralização, atribuição,
    área abaixo da navegação e ausência de rolagem horizontal em 320–430 px.
14. Testar compartilhamento nativo e permissões de clipboard de cada navegador.

Nenhum Android/iPhone físico foi homologado. Suspensão de aba, tela bloqueada e
fechamento do navegador mantêm as limitações já documentadas das partes anteriores.

## Preparação para a Parte 13

Pontos originais conservam ordem, timestamp e segmento. Séries de GPS Assistido,
sensores, calibração, eventos e voltas mantêm tempos relativos/absolutos e qualidade.
O histórico fornece apresentações reduzidas separadas da recuperação autorizada
dos originais. Isso permite futuramente consultar janelas temporais e sincronizar
um replay com os mesmos dados, respeitando pausas/lacunas. Nenhum controle de
reprodução, animação sincronizada ou comparação foi implementado nesta parte.
