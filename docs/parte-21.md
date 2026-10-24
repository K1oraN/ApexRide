# Parte 21 — Relatório técnico

## A. Funcionalidades implementadas

Motor de XP, regras versionadas, ledger, níveis extensíveis, onze conquistas,
progresso, três metas opcionais, histórico privado, revisão de atividades,
presença pós-evento, temporadas mensais, rankings agregados voluntários,
filtros e consultas pessoais de circuitos. Perfil, Histórico, resumo após salvar,
Comunidade, Privacidade e compositor social usam os componentes existentes.
Racing Tech, velocímetro e cinco abas foram preservados. Sem deploy ou Parte 22.

## B. Arquivos principais

- `database/migrations/025_gamification.sql` — estrutura aditiva, catálogo e triggers.
- `apps/api/src/modules/gamification/{rules,engine,queries,routes,circuits,integrity}.ts`.
- `apps/api/src/gamification-cli.ts`, `apps/api/src/app.ts` e scripts dos packages.
- `apps/api/src/modules/rides/{persist,history}.ts` — salvamento e exclusão atômicos.
- `apps/api/src/modules/motorcycles/routes.ts` — marco de primeiro cadastro.
- `apps/api/src/modules/events/participation.ts` — estado autorizado de verificação.
- `apps/api/src/modules/social/{validation,routes,policy}.ts` — referência à conquista.
- `apps/web/src/gamification/` — páginas, consultas, progresso e preferências.
- `apps/web/src/styles/gamification.css` — tokens Racing Tech e responsividade.
- `apps/web/src/App.tsx`, páginas Community/Account/RideDetails/RoutePages,
  RideSummary, Social Profile/Composer/Feed e EventParticipants/types.
- Testes gamification unitários/PostgreSQL/Chrome; fixtures antigas de banco
  ajustadas às novas dependências e runner PostgreSQL com dois workers.
- README, progresso, manual de gamificação e índice de migrações.

## C. Sistema de XP

Regras iniciais: primeira atividade 100; atividade 20 (três/dia); primeira rota
40; outra rota 25 (duas/dia); evento verificado 30 (dois/dia); conquista de
exploração 50 e comunitária 40 (duas/dia de cada regra). As quantias não são
proporcionais a desempenho. `xp_rules` permite novas versões e desativação.
Concessões existentes mantêm quantia/versão original; desativar e reprocessar
uma regra é uma correção explícita, compensada no ledger.

O servidor consome apenas dados persistidos e normalizados. Critérios conservadores,
qualidade GPS, sobreposição, exclusão e decisões internas determinam elegibilidade.
Dados insuficientes são inelegíveis; dúvida técnica fica pendente com atividade
preservada. Privacidade, sensores e modo Assistido não são condicionantes de XP
básico. Veja os parâmetros e exemplos no [manual](gamificacao.md).

## D. Ledger, idempotência e auditoria

`persistRide` já serializa operações pela conta e persiste dados em transação.
O motor é chamado nessa mesma transação, após pontos, rota, voltas e associação
de evento. Uma falha desfaz sessão e concessão conjuntamente; retentativa usa
o client ID original. Nenhum endpoint recebe quantidade de XP ou nível.

O ledger registra conta, regra/versão, origem, ocorrência, geração, delta,
estado, motivo, responsável, datas, temporada e snapshot de categoria/faixa.
Unicidade `(user_id,occurrence_key,generation)` e referência única de reversão
protegem concessões e compensações. A chave da ocorrência não contém a versão
da regra. Reprocessar uma nova versão não recria o mesmo prêmio.

Registros são imutáveis por trigger. Compensações negativas apontam para o
lançamento original. Se o mesmo fato voltar a ser elegível após revisão, uma
nova geração restaura o saldo sem alterar lançamentos passados. Trocar a origem
de um marco cujo primeiro fato foi excluído também compensa a origem antiga.
O saldo e as projeções são reconstituíveis pelo ledger; banco limita negativos
indevidos e overflow. Decisões e consentimentos deixam auditoria separada.

Jobs duráveis são inseridos por triggers na mesma transação dos fatos. O worker
retoma lotes, guarda tentativas e aplica espera após erro. A revisão da fila é
comparada antes de remover o job: cancelamento concorrente de evento ou mudança
de rota permanece pendente até outra rodada. Reexecução é idempotente.
O CLI permite reconciliação controlada e retomável. Leituras usam projeções;
não reavaliam conquistas por amostra GPS nem varrem GPS para montar rankings.

## E. Níveis

Progressão pelos limiares de `xp_level_config`, com extensão configurável após
o último limiar. O cálculo produz XP total, nível, piso, próximo limiar, restante
e percentual, respeitando inteiros seguros. Compensações recalculam o nível;
fechar uma temporada não o reinicia.

## F. Conquistas

O catálogo real está integralmente documentado no [manual](gamificacao.md).
Reconhece 1/5/10 atividades, primeiro cadastro de moto, 1/3/5 rotas distintas,
1/3 eventos verificados, passeio organizado verificado e sessão em circuito
fechado verificado. Desbloqueio e progresso derivam dos fatos. Sessões duplicadas,
descartadas/excluídas e RSVP isolado não contam. Não há XP por popularidade,
cadastros repetidos de moto ou GPS social. Premiações adicionais existem apenas
nos marcos de exploração e participação explicitamente indicados no catálogo.

Conquistas dependentes dos fatos podem ser revogadas e restauradas; o marco de
Garagem permanece histórico após arquivamento e não possui prêmio XP. Histórico
da regra e primeiro reconhecimento são preservados. Conquistas desativadas não
podem ser compartilhadas como medalha válida.

## G. Desafios

Três metas pessoais: próxima atividade elegível, próxima rota distinta e próximo
evento verificado. Adesão guarda a contagem inicial. Progresso deriva da diferença
entre fatos atuais e essa base. Sem obrigação diária, prazo, punição ou prêmio
extra. Cancelar ou descansar preserva XP.

## H. Temporadas

Meses em `America/Sao_Paulo`, intervalos semiabertos no servidor. Fechamento
idempotente, histórico persistente e XP total independente do sazonal. Nova
sessão usa recebimento confirmado; evento usa verificação; conquista usa o fato
que atingiu o limiar. Backfill anterior à ativação é exclusivamente pessoal.
Não se concede retroativamente em temporada já fechada. Compensações de
temporada encerrada alteram sua revisão, com checkpoint para não repetir revisão
sem mudança real.

## I. Rankings

XP sazonal, comunidade e exploração. Participação começa desligada. Conta ativa,
perfil público, opt-in e ausência de bloqueio são reavaliados no backend.
Conta com fila pendente sai temporariamente da resposta até a projeção concluir.
Não existe cache público que mantenha participação revogada.

UF, município e macrorregião são escolhidos, nunca inferidos de GPS. Alteração
regional tem intervalo de 30 dias; saída preserva região e é sempre possível.
Seleção regional exige cinco participantes elegíveis. Categoria de moto usa a
taxonomia verificada da Parte 14 e faixa usa o snapshot da sessão. Informações
históricas não são reescritas por editar a moto posteriormente. Empates compartilham
posição; UUID define ordem estável. API retorna vinte entradas por página e meu
posicionamento sem carregar todos os participantes no React.

## J. Circuitos

Voltas são as calculadas no servidor pela Parte 11, sem aceitar lap time fornecido
pelo cliente. Consulta pessoal considera circuito, versão, modo, método, precisão,
geometria e qualidade da sessão. Resultado é estimado com resolução de décimo de
segundo. Alterações do circuito retiram elegibilidade da versão incompatível.

O consentimento técnico fica preparado e é separado. Nenhuma classificação
pública, oficial ou experimental é liberada sem validação técnica adicional.
O endpoint informa explicitamente a indisponibilidade e não retorna voltas de
terceiros. Não há ranking de rodovia nem XP por menor tempo.

## K. Privacidade

Livro-razão e origens exigem proprietário. Progresso público exige autorização
separada; retorna somente XP/nível. Conquistas públicas retornam código/nome/categoria,
sem origem ou data. Ranking agrega pontos de atividades privadas somente com
opt-in explícito e não publica os detalhes dessas atividades.

Compartilhamento usa compositor, seleção de público, prévia e confirmação.
O post referencia uma conquista própria válida; a resposta não contém rota,
evento ou grupo que a originou. A leitura reavalia a validade da medalha e os
controles sociais anteriores. Nenhuma publicação ou permissão GPS é automática.

## L. Integridade e antifraude

Validação anterior de GPS, mínimos conservadores, detecção de sobreposição,
limites diários por recebimento no servidor, ledger único, transações,
backend como autoridade, CSRF, rate limiting, listas explícitas de campos e
controle de propriedade. Dúvidas geram revisão; não suspendem contas.
`decideRide` é um serviço interno com responsável e motivo, sem rota HTTP de
concessão manual. Reavalia a origem, compensa os pontos e mantém auditoria.

GPS falsificado de forma plausível e conluio em verificação de presença não são
eliminados por esses controles. Categorias dependem de mapeamentos confiáveis
inseridos por operador; a implantação não cria categorias fictícias.

## M. Offline

O IndexedDB e a fila anteriores continuam responsáveis pela sessão. Salvar
localmente não concede XP. Ao concluir a sincronização, `persistRide` executa
a mesma transação usada no salvamento online. Resposta perdida ou reenvio de
lotes não duplicam o fato. Não há saldo definitivo local ou transferência
entre contas. O resumo informa avaliação após sincronização; consultas remotas
tratam ausência de rede explicitamente.

## N. Banco de dados e APIs

Migração aditiva **025**, pertencente somente à Parte 21. Tabelas:
`xp_rules`, `xp_level_config`, `xp_ledger`, `user_progress`,
`gamification_projection_cursor`, `gamification_jobs`, `gamification_ride_facts`,
`gamification_reviews`, `gamification_audit`, `gamification_ride_decisions`,
`event_attendance`, `achievement_definitions`, `user_achievements`,
`personal_challenges`, `leaderboard_seasons`, `leaderboard_participation` e
`leaderboard_scores`. `social_posts` recebe a referência opcional à conquista.

Índices cobrem histórico por conta/id, temporada/conta/categoria/faixa,
fatos por conta/estado/rota, jobs por prazo, revisão pendente única, preferências
regionais e ordenação sazonal. Ledger e concessões possuem restrições únicas,
FKs e checks numéricos. Triggers agendam mudanças de sessões, Garagem,
presença, cancelamento e verificação/estado da rota; o ledger é append-only.

| Método     | Caminho após `/api`                  | Função                                                |
| ---------- | ------------------------------------ | ----------------------------------------------------- |
| GET        | /gamification/me                     | Progresso pessoal                                     |
| GET        | /gamification/me/xp-history          | Histórico paginado; filtro opcional rideId            |
| GET        | /gamification/achievements           | Definições                                            |
| GET        | /gamification/me/achievements        | Progresso e estados próprios                          |
| GET        | /gamification/me/rides/:id           | XP/qualidade de atividade própria                     |
| GET, POST  | /gamification/me/challenges          | Consultar/iniciar meta                                |
| DELETE     | /gamification/me/challenges/:code    | Cancelar meta                                         |
| GET        | /gamification/seasons                | Temporadas disponíveis                                |
| GET        | /gamification/seasons/:id            | Estado, limites e revisão                             |
| GET        | /gamification/leaderboards           | Modalidades e filtros disponíveis                     |
| GET        | /gamification/leaderboards/:id       | Lista paginada autorizada                             |
| GET        | /gamification/leaderboards/:id/me    | Meu posicionamento elegível                           |
| GET, PATCH | /gamification/me/ranking-preferences | Consentimentos e região                               |
| GET        | /gamification/users/:id              | Progresso público autorizado, sem origens             |
| POST       | /gamification/me/reviews             | Solicitação de revisão de atividade própria           |
| PATCH      | /events/:id/attendance/:userId       | Verificar/revogar presença pós-evento                 |
| GET        | /circuits/:id/leaderboard            | Voltas pessoais e estado de indisponibilidade pública |

Todas as rotas novas exigem sessão. Escritas usam CSRF/origem. Limites de 180
leituras e trinta escritas por minuto por conta são compartilhados no PostgreSQL.
Campos extras em preferências, metas, verificação e revisões são rejeitados.
O compositor social aceita somente código de conquista própria desbloqueada.
O CLI é local: `pnpm gamification:reconcile [--enqueue-all]`.

## O. Testes executados

| Verificação        | Resultado confirmado                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`       | TypeScript, lint sem warnings, formatação, testes padrão e builds aprovados                                                                                       |
| Testes padrão      | 664 aprovados: 253 API/contratos e 411 web                                                                                                                        |
| PostgreSQL/PostGIS | 330 cenários distintos aprovados; 328 na regressão completa e 34 na reexecução final específica, incluindo dois cenários acrescentados depois da rodada completa  |
| Chrome/Playwright  | 73 cenários distintos aprovados após reexecuções; os 14 cenários de eventos, gamificação, social e vídeo passaram juntos em suas quatro execuções finais isoladas |
| Interface          | 320/360/375/390/430/1440 px sem overflow nas telas novas; cinco abas verificadas; oito capturas móvel/desktop conferidas                                          |
| Banco local        | Migração 025 aplicada; comando de reconciliação executado com zero pendências                                                                                     |

Os 34 cenários específicos de banco cobrem primeira atividade, GPS privado sem
sensores, dez envios simultâneos, IDs diferentes com sobreposição concorrente,
qualidade pendente, dados insuficientes, limites/dias, privacidade, exclusão nas
duas APIs, tombstone, rollback, ledger imutável, versões, backfill em lotes,
conquistas/progresso/definição desabilitada, metas, rotas repetidas/duplicadas,
arquivamento, verificação e revogação de presença sem GPS, auditoria, falsas
presenças, compartilhamento seguro, temporadas fechadas, opt-in/saída, mínimo
regional, paginação, empates, snapshots de categoria, bloqueio, divulgação
separada, correção interna, circuito próprio, CSRF, campos arbitrários, isolamento,
rate limit e revisão concorrente da fila. Os testes padrão cobrem também limites
numéricos e progressão além do nível dez.

A primeira regressão de banco revelou fixtures antigas com listas fixas de
`TRUNCATE`; foram atualizadas às novas FKs e projeções, apenas nos esquemas de
teste. O teste de 31 tentativas de login e a fixture de 25 participantes receberam
limite de execução de quinze segundos, mantendo todas as asserções. A regressão
completa de banco passou depois desses ajustes; os 34 casos de gamificação foram
repetidos no código final.

A rodada completa de navegador terminou com setenta aprovados e três falhas:
corrida ao navegar antes da resposta de aceite de convite, timeout de navegação
social e espera de cinco segundos por sincronização do vídeo. O teste de convite
agora aguarda HTTP 200; o de vídeo mantém a exigência de uma única atividade
remota com espera de até quinze segundos. Eventos (4), gamificação (5), social
(3) e vídeo (2) foram repetidos isoladamente, com um worker e build estável,
e todos passaram. O timeout social não se repetiu. A contagem de 73 representa
cenários distintos aprovados entre as execuções, não uma única rodada sem falhas.

Evidências em `.local/parte21-check-final.log`,
`.local/parte21-postgres-final.log`, `.local/parte21-gamification-final.log`,
`.local/parte21-browser-regression.log` e
`.local/parte21-{events,gamification,social,video}-browser-final.log`.
Capturas em `.local/screenshots/parte21-*.png`. O build mantém o aviso de tamanho
do chunk existente de GPS/MapLibre; não há erro de compilação.

As execuções usam esquemas isolados e não inserem usuários, trajetos, eventos ou
resultados fictícios no banco normal da aplicação. Nenhum aparelho físico foi
declarado homologado.

## P. Limitações

Homologação física Android/iPhone e Safari real, GPS/sensores de aparelhos,
carga nacional e precisão profissional de voltas não foram validadas. A
cronometagem não é certificada; não há ranking público de circuito.

Exploração reconhece rotas aprovadas associadas e geometrias iguais/inversas;
percursos da Parte 15 sem rota aprovada e variantes geométricas quase iguais não
são automaticamente convertidos em novas identidades de exploração. O módulo de
trajetos semelhantes anterior permanece intacto. Novos mapeamentos de categoria
não reclassificam silenciosamente fatos históricos já avaliados.

Projeções são atualizadas por conta e consultadas com índices. Grandes contas
com muitos anos de atividades ainda precisam de ensaio de carga específico; a
reconciliação lê os fatos elegíveis dessa conta, sem reler GPS já avaliado. Não há
infraestrutura distribuída, push, premiação financeira nem sistema global de moderação.

## Q. Preparação para a Parte 22

Pendências, decisões de origem, ledger imutável, auditoria de consentimentos e
presenças, responsáveis e motivos formam a base de revisão. A Parte 22 poderá
impor RBAC ao serviço interno `decideRide`, analisar denúncias anteriores,
revisar presenças e contas, configurar novas versões de regras, suspender
participação e auditar compensações. Isso exigirá autorização explícita no
backend administrativo. Nenhum painel global ou endpoint arbitrário de XP foi
implementado nesta parte.
