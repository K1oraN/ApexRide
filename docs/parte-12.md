# Parte 12 — relatório de implementação

Registro em 23/10/2026. Escopo exclusivo: histórico, detalhes, estatísticas,
gráficos, privacidade e compartilhamento; blocos 12A–12D. Sem deploy ou avanço
à Parte 13. O design Racing Tech e a navegação inferior foram preservados.

## A. Funcionalidades implementadas

Histórico próprio real, filtros combinados, paginação e pesquisa; detalhes com
mapa segmentado, métricas consolidadas, gráficos GPS/assistido/sensores, eventos e
voltas persistidas; estatísticas por conta/período/moto/modo/mês; edição restrita
de título/descrição/privacidade; resumo público conservador; exclusão com proteção
contra recriação por sincronização; histórico local e reconciliação por sessão.
Início e perfil agora usam o histórico real nos pontos de integração pedidos.

## B. Principais arquivos

Criados:

- `database/migrations/011_history.sql`, `012_ride_deletions.sql`.
- `apps/api/src/modules/rides/history-query.ts`, `history.ts`, `history-data.ts`,
  `history-stats.ts`, `public.ts`.
- `packages/ride-core/history.js`, `history.d.ts`, `charts.js`, `charts.d.ts`.
- `apps/web/src/history/`: tipos, cliente, filtros, cards, métricas, mapa,
  controles de privacidade, último Ride, estatísticas e reconciliação local.
- `HistoryPage.tsx`, `RideDetailsPage.tsx`, `LocalRideDetailsPage.tsx`,
  `RideStatisticsPage.tsx`, `PublicRidePage.tsx`, `styles/history.css`.
- Testes `history.postgres.test.ts`, `history-data.test.ts`, `local-history.test.ts`
  e `e2e/history.spec.ts`; [manual do histórico](historico.md).

Integrações modificadas:

- Registro de API, módulos existentes de sessão/persistência/sync e runner Postgres.
- `HomePage`, `CommunityPage`, `App`, resumo de sessão e guarda de páginas próprias.
- MapLibre existente, com centralização do trajeto histórico e atualização de
  dimensões; gráficos existentes, com inspeção de amostra apenas no histórico.
- Repositório/coordenador offline, adicionando resumo final e cancelamento protegido,
  sem substituir os checkpoints, IndexedDB ou protocolo de lotes anteriores.
- README, progresso, arquitetura, registro das migrações e testes de regressão.

Não foram alterados coletores GPS/sensores, GPS Assistido, algoritmos de sessão,
modos, estrutura do monorepo ou os cinco destinos da navegação inferior.

## C. Histórico

`GET /api/rides` ganhou filtros reais e contagem, mantendo `offset` por
compatibilidade. A interface pagina em 12 atividades, sem carregar pontos ou
sensores. Pesquisa por título (inclusive o neutro), descrição, moto e nome da rota;
filtros de período, modo, moto histórica, rota/sem rota, visibilidade, estado local
de sincronização e ordenação por data/distância/tempo ativo. Há estados vazios,
carregamento, erro e limpeza de filtros. A guarda remonta o conteúdo próprio ao
trocar de conta, e as consultas permanecem vinculadas ao proprietário no backend.

O Início mostra o último Ride com título/data/modo/moto/métricas e miniatura de
GPS real quando disponível. O perfil usa Rides e km reais, últimas atividades e
links para o histórico; Garagem, XP indisponível e os módulos sociais existentes
continuam preservados e identificados.

## D. Detalhes

`/historico/:id` começa com métricas consolidadas e contexto histórico da moto,
rota/circuito e qualidade. A geometria real vem separadamente, com até 1.000 pontos
por padrão. Segmentos e lacunas não são conectados. O usuário pode arrastar,
aproximar, afastar, centralizar e alternar o plano associado em âmbar tracejado,
separado do GPS real vermelho. Não há marcador percorrendo o trajeto automaticamente.

O mapa informa redução e quantidade de pontos/segmentos; os originais permanecem
salvos e consultáveis pelos contratos privados existentes. Detalhes e estatísticas
tratam motos/rotas arquivadas sem remover as associações históricas.

## E. Telemetria

Os gráficos da Parte 09 foram reutilizados, com a implementação de redução
compartilhada com a API. O carregamento inicial não envia 50 mil pontos para montar
um gráfico. O proprietário solicita até 600 amostras por série, preservando extremos,
timestamps e descontinuidades; a inspeção por toque consulta amostras, sem replay.

GPS original e GPS Assistido ficam identificados separadamente. Força G, inclinação,
qualidade, calibração, fonte e truncamento só aparecem quando registrados; ausência
não vira zero. A inclinação dinâmica continua indisponível conforme a implementação
anterior. Eventos 0–100/100–0 são pessoais, paginados e mantêm método/qualidade/estado.
Voltas são lidas do banco, com circuito, qualidade e melhor duração estimada;
não são geradas voltas novas para ruas nem rankings públicos.

## F. Privacidade

O backend exige proprietário para toda consulta privada, inclusive mapa, sensores,
eventos e voltas. Alterações aceitam exclusivamente título, descrição e visibilidade;
tentativas de mudar métricas/identidade/modo são rejeitadas. A política pública
reavalia perfil público, atividade pública, conta ativa e ausência de exclusão em
cada consulta; a condição mais restritiva prevalece.

A política geográfica escolhida é ocultação integral do mapa público. Não são
retornados pontos, coordenadas, rota planejada, velocidades, eventos, voltas,
moto, email ou horários individuais. Isso evita também expor uma residência
quando o trajeto volta a passar perto dela. Não há alegação de anonimato completo.

## G. Compartilhamento

O proprietário pode copiar `/compartilhar/rides/:id`, abrir o resumo e usar a API
nativa quando suportada, sempre por ação explícita. A operação não altera a
privacidade automaticamente. O resumo público usa nome de perfil autorizado,
modo, dia sem horário, distância/duração arredondadas e título neutro. Título
personalizado e descrição ficam fora da resposta pública, pois podem conter
locais particulares. Metadados de link são genéricos; não há imagem derivada do GPS.

Respostas usam `no-store`, `noindex/noarchive` e política de referrer restrita.
Privatizar perfil/atividade ou excluir revoga novas consultas imediatamente. Uma
página já aberta reconsulta em foco/visibilidade e a cada 30 s; não é possível
apagar cópias anteriormente feitas pelo destinatário. Não há feed, mensagens
externas automáticas ou publicação de rota pessoal.

## H. Offline

A lista local usa metadados do IndexedDB da conta atual, sem ler todas as séries.
Abrir detalhes recupera somente a atividade escolhida e reutiliza mapa, métricas
e gráficos. Pendências/erros/recibos são reais; a interface avisa quando só as
cópias do aparelho estão disponíveis. Sessões finalizadas aguardando decisão
podem retornar ao resumo do Ride anterior.

`client_id`, recibos do servidor e ID confirmado conciliam as cópias, inclusive
resposta perdida depois de commit. Uma sincronizada aparece uma vez; estatísticas
acumuladas contam somente o servidor. Cancelamento utiliza o lease existente
entre abas. Nunca enviadas podem ser descartadas offline; se já houve tentativa,
exige-se confirmação online para não deixar um commit desconhecido reaparecer.
Marcas locais e `ride_deletions` impedem checkpoint/reenvio de uma sessão excluída.
Não há outra fila para edições/publicação/exclusão remota.

## I. Banco e API

`011_history.sql`: título, descrição, exclusão lógica, snapshot da moto e índices
parciais por proprietário/data/modo/moto/rota/visibilidade, além de GIN textual.
O backfill de moto antiga identifica que usa o cadastro disponível na migração.
`012_ride_deletions.sql`: tombstones por proprietário/client ID para cancelamento
estável. Ambas foram aplicadas localmente, sem modificar migrações anteriores.

Principais endpoints: `/rides`, `/rides/filters`, `/rides/stats`,
`/rides/receipts`, `/rides/:id?view=summary`, `/rides/:id/track`,
`/rides/:id/telemetry`, `/rides/:id/events`, `/rides/:id/laps`,
`PATCH/DELETE /rides/:id`, `DELETE /rides/by-client/:clientId` e
`GET /public/rides/:id`, todos sob `/api`. O GET privado completo e os POSTs de
salvamento/sync anteriores continuam compatíveis, respeitando exclusões.

A exclusão é lógica: remove acesso, listas e estatísticas, preservando dados
relacionados no banco. Não apaga uma rota independente. Não foi implementado
expurgo físico ou restauração. Consultas e DTOs detalhados, limites e permissões
estão no [manual](historico.md).

## J. Testes

**582 cenários distintos aprovados**, sem somar reexecuções:

| Verificação executada                                              | Resultado                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `pnpm check`                                                       | TypeScript, ESLint, Prettier, 411 testes unitários/contratos e build aprovados        |
| `pnpm test:postgres`                                               | 128 testes com PostgreSQL/PostGIS real, cinco arquivos, esquemas temporários isolados |
| `pnpm --filter @apex-ride/web test:e2e` e reexecuções direcionadas | 43 cenários distintos Chrome aprovados                                                |
| `pnpm db:migrate`                                                  | Migrações 011 e 012 aplicadas localmente                                              |

A regressão Chrome passou inicialmente em 42/43: o novo link de histórico e o
link do perfil tinham o mesmo nome acessível, deixando um seletor anterior
ambíguo. O novo rótulo foi contextualizado como **Entrar para ver atividades**.
Os 15 cenários de histórico/interface foram repetidos no build final e passaram,
incluindo o cenário anteriormente ambíguo. O teste de copiar link usa uma API de
clipboard controlada, sem escrever na área de transferência real do usuário.
Compartilhamento nativo e clipboard físicos permanecem no roteiro de homologação.

A suíte completa do banco passou em 128/128. Após ajustes finais, os 49 cenários
de histórico/sessões/rotas e depois os 12 de histórico foram reexecutados e
aprovados. Foram conferidos gráficos sem sensores/processamento assistido,
nulls reais, título neutro pesquisável, média ponderada, bloqueios de privacidade,
tombstones, 50.000 pontos com prévia limitada e consulta de voltas persistidas.

O fluxo Chrome validou filtros combinados, paginação, Início/perfil reais, edição,
revogação de link por perfil/atividade privados, exclusão, offline e uma única
atividade após sincronização. As telas novas foram verificadas em
320/360/375/390/430/1440 px; as páginas anteriores, em sete larguras.
Capturas de histórico, detalhes e estatísticas foram inspecionadas visualmente.
Não houve teste físico Android/iPhone, GPS real ou certificação de sensores.

Evidências: `.local/parte12-*.log`; capturas: `.local/screenshots/history*.png`.

## K. Limitações

Android/iPhone físicos, compartilhamento nativo, permissões reais de clipboard,
consumo e comportamento de suspensão continuam pendentes de homologação. Os
pontos e o provedor de mapa dos testes de navegador são controlados. A inspeção
visual e os testes não certificam GPS, sensores ou cronômetros profissionais.

Mapas/tiles novos dependem de conexão; não há download completo, cache de tiles,
replay, comparação, vídeo ou feed social. Os contadores de rate limiting são por
processo e precisarão de controle compartilhado ao escalar. O build mantém o
aviso de tamanho do chunk cartográfico. Agregações mensais/por moto apresentam
até 120 linhas, com indicação e filtros para outros recortes.

A exclusão lógica não é expurgo físico de todas as medições; metadados e dados
relacionados permanecem protegidos no banco. Revogar um link impede novas
consultas, sem prometer apagar cópias já realizadas. O contexto local não é login
offline e alterações em outro aparelho exigem conexão para chegar ao dispositivo.
O [roteiro Android/iPhone](historico.md#android-e-iphone--roteiro-físico-pendente)
usa caminhada segura, duas contas e nenhum teste de alta velocidade.

## L. Preparação para a Parte 13

A fonte original mantém GPS ordenado por timestamp e segmento, série assistida
separada, sensores com tempos relativos, calibração/qualidade, eventos e voltas.
As prévias reduzidas não substituem esses registros. Uma futura consulta temporal
autorizada poderá alimentar marcador e gráficos sincronizados, sem ligar pausas
ou lacunas. O replay animado e a comparação não foram implementados.
