# Migrações versionadas

Execute `pnpm db:migrate` da raiz com o PostgreSQL configurado em `.env`.
O executor utiliza uma transação e advisory lock, registra nome/checksum em
`schema_migrations` e recusa modificar uma migração já aplicada. Reexecuções são
idempotentes. Não há rollback destrutivo automático; correções devem usar uma
nova migração, preservando os dados existentes.

Na Parte 23, o checksum passou a usar SQL com finais de linha LF. Recibos
legados do mesmo conteúdo em CRLF são reconhecidos e normalizados na transação,
sem reexecutar a migração ou alterar a data de aplicação. Alterações reais de
conteúdo continuam rejeitadas. Isso evita que a normalização Git Windows/Linux
bloqueie um banco já migrado. `pnpm test:recovery` verifica esse caso em
PostgreSQL real e recusa recibo adulterado. Nenhum SQL aplicado foi reescrito.

`001_auth.sql` cria `users`, `profiles`, `privacy_settings`, `user_sessions`,
`account_tokens` e `auth_rate_limits`, com chaves estrangeiras, unicidade de
identificadores normalizados e índices para expiração/consulta por usuário.
Nenhuma tabela de módulos futuros foi adicionada. PostGIS continua sob a
inicialização da Parte 01 em `../init/`; esta migração não modifica a extensão.

O comando é explícito: o servidor não migra automaticamente na inicialização.
Use uma conta apropriada para migração e uma conta restrita para a API na
infraestrutura de publicação. Testes de integração criam e removem somente seus
esquemas aleatórios `auth_test_*`, `garage_test_*` e `auth_e2e_*`.

`002_motorcycles.sql` adiciona `motorcycles` (FK para `users`, índice por
proprietário e índice único parcial para uma principal ativa por usuário) e
`motorcycle_photo_cleanup` (fila durável de limpeza de arquivos). A exclusão de
motos preenche `archived_at`, preservando o UUID e os dados para referências
históricas futuras. A FK impede remover o proprietário e deixar motos órfãs.
Não cria sessões de Ride ou telemetria. Ver [Garagem](../../docs/garagem.md).

`003_rides.sql` habilita PostGIS em `public`, se necessário, e adiciona `rides`
e `ride_points`, com geografia SRID4326 e índices de proprietário, idempotência,
ordem e localização. As FKs de usuário e moto restringem exclusão; arquivar uma
moto mantém suas atividades. PostGIS precisa estar instalado no servidor e o
usuário de migração precisa poder habilitar a extensão, ou ela deve ser habilitada
previamente por um administrador. Não se alteraram as migrações 001/002.
Testes de sessões usam adicionalmente esquemas isolados `rides_test_*`.
Ver [sessões](../../docs/sessoes.md).

`004_motion.sql` adiciona `ride_motion` e `ride_motion_samples`, ligadas à
atividade por FKs, com séries privadas, parâmetros de calibração, versão,
qualidade, lacunas, máximos válidos e indicação de histórico incompleto.
Atividades antigas continuam válidas sem registros nessas tabelas.
Nenhuma migração anterior foi modificada. Veja [sensores](../../docs/sensores.md).

`005_assisted_speed.sql` adiciona `users.speed_mode`, enum validado com padrão
`assisted`, e `rides.speed_processing` JSONB opcional. O POST existente salva essa
série na mesma transação e chave idempotente. Amostras referenciam timestamps de
`ride_points`, sem copiar o GPS original. Atividades anteriores permanecem válidas
com a coluna nula; o acesso continua exclusivo do proprietário. Veja
[GPS Assistido](../../docs/gps-assistido.md).

`006_advanced_telemetry.sql` adiciona `rides.telemetry_summary` opcional e
`ride_performance_events`, com FK, unicidade, checks temporais e índice por
sessão/tempo. Não altera dados anteriores. Eventos são recalculados pela API e
gravados na transação existente, com idempotência e acesso exclusivo do dono.
Veja [telemetria avançada](../../docs/telemetria-avancada.md).

`007_offline_sync.sql` acrescenta uploads privados em `ride_uploads` e lotes em
`ride_upload_batches`, com chaves compostas por proprietário/clientId/índice e
FKs. As atividades concluídas continuam em `rides`, protegidas pela unicidade
existente e validadas na mesma transação. Nenhuma migração anterior foi alterada.
Uploads parciais não aparecem na listagem de atividades. Não existe limpeza
automática de envios incompletos; veja a política de retenção e retomada no
[manual offline](../../docs/offline.md).

`008_routes.sql` cria percursos, paradas, favoritos, papel restrito de moderação
e decisões versionadas; índices GiST de geometria/geography e GIN de busca.
`009_route_rides.sql` preserva versões aprovadas e adiciona associação opcional,
plano e resultado às sessões anteriores. `010_route_laps.sql` adiciona voltas GPS
estimadas com FK à sessão e ao circuito/versão. Não apagam dados existentes;
nenhuma migração anterior foi alterada. Testes usam esquemas isolados
`routes_test_*`. Consulte [rotas](../../docs/rotas.md).

`011_history.sql` adiciona título, descrição, exclusão lógica, snapshot da moto e
índices parciais de histórico em `rides`. O backfill da moto antiga é identificado
como a informação disponível na migração. `012_ride_deletions.sql` cria tombstones
por proprietário/client ID para impedir recriação por envio offline antigo.
Não alteram medições técnicas existentes. Esquemas isolados `history_test_*`
validam os novos contratos. Ver [histórico](../../docs/historico.md).

`013_comparisons.sql` adiciona consentimentos comunitário/técnico inicialmente
falsos, revisão de consentimento e índices de rota, proprietário, versão, modo,
data, visibilidade e cilindrada. Cria mapeamento complementar de modelos para
categorias, com fonte verificável. `014_comparison_category_index.sql` garante
unicidade desse mapeamento sem diferença de caixa. Não duplica GPS ou sessões,
nem altera campos obrigatórios da Garagem. Testes usam `comparison_test_*`.
Consulte [comparações](../../docs/comparacoes.md).

`015_similarity.sql` cria índices geográficos derivados privados, pares
canônicos únicos e regiões administrativas, além de triggers de fila, revogação
e exclusão. `016_similarity_backfill.sql` guarda checkpoint por versão para
backfill limitado/retomável. Não altera GPS ou métricas históricas. Execute
`pnpm similarity:regions` após migrar para importar o snapshot oficial IBGE de
Alagoas; outras UFs usam o mesmo formato. A importação recusa polígonos inválidos
ou sobrepostos. Testes usam esquemas `similarity_test_*`.
Consulte [trajetos semelhantes](../../docs/trajetos-semelhantes.md).

`017_social.sql` cria posts, mídia, diário de limpeza, curtidas, comentários,
seguimentos com aprovação, bloqueios e denúncias com referências por FK. Inclui
unicidade, checks e índices de feeds/relações/mídia/busca por prefixo. Não duplica
contas, motos, sessões ou GPS. Testes usam `social_test_*`; os outros testes
passaram a limpar as tabelas sociais dependentes dentro dos respectivos esquemas
isolados. Consulte [Comunidade](../../docs/comunidade.md) e
[relatório da Parte 18](../../docs/parte-18.md).

`018_groups.sql`, `019_group_indexes.sql` e `020_group_creation_identity.sql`
implementam exclusivamente a Parte 19: grupos públicos/privados, descoberta,
participação/pedidos, convites e usos, restrições, regras versionadas e auditoria.
Posts, mídia e denúncias sociais recebem contexto opcional de grupo. FKs e
triggers diferíveis preservam o proprietário; triggers transacionais mantêm
contadores. Criação é idempotente por criador original mesmo após transferência.
Índices atendem descoberta, pesquisa, interesses, feed e gestão paginada.
Exclusão é lógica e preserva denúncias/auditoria; não remove Rides/motos/perfis.
A numeração SQL 020 não representa implementação da Parte 20 do produto.
Veja [relatório](../../docs/parte-19.md). Testes usam esquemas `groups_test_*`
isolados, sem inserir comunidades de demonstração no banco normal.

`021_events.sql` a `024_live_revocation_triggers.sql` implementam somente a
**Parte 20**: eventos, ponto PostGIS, convites nominais, participação, organização,
capacidade serializada pelo serviço, consentimentos e posição efêmera UNLOGGED.
Mídia social recebe contexto exclusivo de evento; Ride recebe referência opcional
com autorização de associação nominal. Triggers revogam GPS ao sair/perder
permissões, bloquear ou encerrar sessão de conta. Índices cobrem agenda/região,
GiST do encontro, grupos, participantes e expiração.

Migre todas antes de iniciar a API. Exclua os dados de `live_location_positions`
dos backups (`pg_dump --exclude-table-data=live_location_positions`, adaptando o
schema quando necessário). A tabela contém somente a posição atual e perde seus
dados em recuperação após crash; nenhum histórico social é preservado.
O worker remove posições vencidas a cada cinco segundos, metadados de consentimento
sete dias após expiração e ações depois de 90 dias. Leituras recusam expiradas
mesmo quando a limpeza falha. Nenhum evento é inserido automaticamente.
Testes usam `events_test_*` e os esquemas isolados do runner Chrome.
Veja [manual](../../docs/eventos.md) e [relatório](../../docs/parte-20.md).

`025_gamification.sql` implementa somente a **Parte 21**: regras/níveis versionados,
ledger append-only, fatos privados, jobs duráveis, revisões/decisões/auditoria,
presença verificada, conquistas, metas, temporadas, preferências e projeções de
ranking. Acrescenta referência segura de conquista ao post social. Não replica
GPS, não muda telemetria e não habilita ranking ou localização social.
Contas existentes são agendadas para backfill em lotes. Consulte
[manual](../../docs/gamificacao.md) e [relatório](../../docs/parte-21.md).

`026_admin_foundation.sql` a `032_admin_audit_order.sql` pertencem somente à
**Parte 22**. Acrescentam papéis/permissões, MFA cifrado, sessões privilegiadas,
bootstrap explícito, casos projetados das denúncias anteriores, decisões,
sanções/recursos, aprovações, compensações referenciadas no ledger, revisão de
conquistas/rankings, evidência de circuito, auditoria encadeada, notas de decisão,
solicitações de privacidade, incidentes e configurações versionadas.

Triggers reforçam revogação de GPS social, proteção contra republicação por
endpoints antigos, serialização de sanção/publicação e proteção dos registros.
São migrações aditivas: não recriam GPS, telemetria, mídia, sessões de Ride ou
contas. Não promovem os antigos `route_moderators` nem qualquer conta comum.
Depois de migrar, siga o [provisionamento](../../docs/admin-provisionamento.md);
MFA operacional exige chave de servidor fora do código. Não habilite privilégios
de DDL na credencial da aplicação de produção. A proteção por triggers/cadeia
não impede adulteração por proprietário do banco; arquivo e ancoragem externa
precisam de configuração operacional. Consulte [relatório](../../docs/parte-22.md).
