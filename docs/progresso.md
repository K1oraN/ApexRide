# Controle de progresso — Apex Ride

**Refinamento oficial — Etapa 6, 24/10/2026:** Garagem premium, catálogo BR
progressivo com fontes e revisões, cadastro manual/elétrico, registros privados
persistentes e snapshots da identidade no início do Ride. Cobertura inicial:
2 marcas, 3 famílias e 7 versões/ano, todas parciais. Veja o
[relatório A–R](refinamento/etapa-06-garagem-catalogo.md) e a
[matriz](catalogo-cobertura.csv). Sem deploy/VPS ou início da Etapa 7.
Os registros anteriores são históricos.

**Refinamento oficial — Etapa 5, 24/10/2026:** Ride reorganizado em preparação,
pilotagem e resumo; diagnóstico individual de sensores; sessões, circuitos,
biblioteca e estúdio como páginas internas. Coleta, contratos, vídeos locais e
sincronização preservados. Sem VPS/deploy ou início da Etapa 6. Evidências e
limites no [relatório de Ride e telemetria](refinamento/etapa-05-ride-telemetria.md).
Ajustes aprovados: Guia único no menu Mais opções, Configurações e Descobertas;
filtros com escolhas curtas em cartões, paginação alinhada e Missões no desempenho.
Os registros anteriores são históricos.

**Refinamento oficial — Etapa 4, 24/10/2026:** Explorar, editor, navegação, GPX
e elevação implementados. OpenFreeMap validado com tiles reais; OSRM/MapTiler
dependem de configuração autorizada e homologação externa. Sem VPS/deploy
ou início da Etapa 5. Veja o
[relatório de Explorar e navegação](refinamento/etapa-04-explorar-navegacao.md).
Os registros anteriores abaixo são históricos.

**Refinamento oficial — Etapa 3, 24/10/2026:** Home autenticada reorganizada
com dados existentes de Garagem, Histórico, XP, conquistas e estado global do
Ride. Status comprovados, períodos funcionais, duas atividades recentes,
tratamento offline e falhas parciais. Revisão visual de Login/Cadastro mobile
e recuperação de falhas de página. Evidências no
[relatório da Etapa 3](refinamento/etapa-03-home-dashboard.md).
Sem VPS/deploy ou início da Etapa 4. Os registros anteriores são históricos.

**Refinamento oficial — Etapa 2, 24/10/2026:** design system compartilhado,
hierarquia de botões, formulários, filtros, ícones, cards, header e cinco abas
refinados sobre a estrutura da Etapa 1. Backend, banco e cálculos preservados.
Capturas, testes e limites no [relatório da Etapa 2](refinamento/etapa-02-design-system.md).
Sem VPS/deploy e sem início da Etapa 3. O registro seguinte da Etapa 1 é histórico.

**Refinamento oficial — Etapa 1, 23/10/2026:** landing pública, telas de conta
separadas e proteção das entradas internas implementadas sobre a base existente.
Início do painel em `/app`; login real aceita e-mail ou usuário. Relatório,
testes e limites em [Etapa 1](refinamento/etapa1-acesso.md). Sem deploy e sem
início da Etapa 2; homologação produtiva continua pendente. Os registros abaixo
descrevem as entregas anteriores.

**Fechamento da Parte 23 em 23/10/2026: auditoria local concluída; decisão NO-GO
para produção.** Os registros abaixo preservam o alcance histórico de cada
entrega. Consulte a [matriz final das 23 partes](qa-matriz.md),
[relatório final](parte-23.md), [defeitos e bloqueios](qa-defeitos.md),
[compatibilidade](qa-mobile.md) e [operação](qa-operacao.md). Sem deploy.

| Parte                                              | Estado                                                                                                                                                              | Registro                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 01/23 — Fundação                                   | Implementada; pendência PostGIS local resolvida e validada na Parte 06                                                                                              | [Parte 01](parte-01.md) |
| 02/23 — Interface                                  | Concluída; composição visual preservada                                                                                                                             | [Parte 02](parte-02.md) |
| 03/23 — Contas, autenticação, perfis e privacidade | Implementada e validada em 23/10/2026; publicação depende de SMTP, documentos jurídicos e revisões descritas                                                        | [Parte 03](parte-03.md) |
| 04/23 — Garagem de Motocicletas                    | Concluída e validada em 23/10/2026; PostgreSQL, fotos privadas e interface integrados                                                                               | [Parte 04](parte-04.md) |
| 05/23 — GPS e mapa em tempo real                   | Implementada e validada automaticamente em 23/10/2026; homologação Android/iPhone físicos pendente                                                                  | [Parte 05](parte-05.md) |
| 06/23 — Sessões de Pilotagem                       | Implementada e validada automaticamente em 23/10/2026; PostgreSQL/PostGIS real, homologação física pendente                                                         | [Parte 06](parte-06.md) |
| 07/23 — Sensores e calibração                      | Implementada; força G estimada, inclinação dinâmica indisponível até homologação física                                                                             | [Parte 07](parte-07.md) |
| 08/23 — GPS Assistido Automático                   | Implementada e validada automaticamente em 23/10/2026; homologação Android/iPhone físicos pendente                                                                  | [Parte 08](parte-08.md) |
| 09/23 — Telemetria avançada e modos                | Implementada e validada automaticamente em 23/10/2026; estimativas experimentais, homologação Android/iPhone pendente                                               | [Parte 09](parte-09.md) |
| 10/23 — Offline e sincronização                    | Implementada localmente; IndexedDB, recuperação, fila, lotes retomáveis e shell offline; homologação física pendente                                                | [Parte 10](parte-10.md) |
| 11/23 — Rotas, circuitos e exploração              | Implementada localmente nos blocos 11A–11D; OSRM configurável, PostGIS, acompanhamento, voltas estimadas e offline; homologação física pendente                     | [Parte 11](parte-11.md) |
| 12/23 — Histórico de atividades                    | Implementada nos blocos 12A–12D; filtros, detalhes, estatísticas, telemetria, privacidade, resumo público e reconciliação offline; homologação física pendente      | [Parte 12](parte-12.md) |
| 13/23 — Replay Animado de Telemetria               | Implementada nos blocos 13A–13D; replay privado, tempo ativo, mapa/indicadores/gráficos, eventos/voltas e IndexedDB; homologação física pendente                    | [Parte 13](parte-13.md) |
| 14/23 — Comparação na mesma rota                   | Implementada nos blocos 14A–14D; seleção, alinhamento, trechos, filtros, privacidade, circuitos e interface; homologação física pendente                            | [Parte 14](parte-14.md) |
| 15/23 — Reconhecimento de trajetos semelhantes     | Implementada nos blocos 15A–15D; PostGIS, fila/backfill, pares, grupos, trechos, comparação e agregados autorizados; homologação física pendente                    | [Parte 15](parte-15.md) |
| 16/23 — Gravação local de vídeo                    | Implementada em 16A–16D; câmera opcional, MediaRecorder, segmentos, IndexedDB, referências temporais e Histórico; homologação física pendente                       | [Parte 16](parte-16.md) |
| 17/23 — Vídeo com telemetria e exportação local    | Implementada em 17A–17D; prévia sincronizada, Canvas, configurações privadas e exportação individual validada; homologação física Android/iPhone pendente           | [Parte 17](parte-17.md) |
| 18/23 — Comunidade, feed e seguidores              | Implementada e validada em 18A–18E; dados reais, fotos privadas, relações e resumo seguro de Ride; homologação Android/iPhone físicos pendente                      | [Parte 18](parte-18.md) |
| 19/23 — Grupos públicos e privados                 | Implementada em 19A–19E; PostgreSQL, permissões, convites, feed, fotos e moderação integrados; homologação física pendente                                          | [Parte 19](parte-19.md) |
| 20/23 — Eventos e mapa social temporário           | Implementada em 20A–20E; encontros, passeios, grupos, participação e consentimento GPS efêmero; homologação física pendente                                         | [Parte 20](parte-20.md) |
| 21/23 — Gamificação e rankings voluntários         | Implementada em 21A–21E; XP transacional, ledger, níveis, conquistas, metas, temporadas, consentimentos e circuitos pessoais estimados; homologação física pendente | [Parte 21](parte-21.md) |
| 22/23 — Administração, moderação e segurança       | Implementada em 22A–22F; MFA, RBAC, casos, sanções, recursos, gestão, integridade, auditoria e privacidade; homologação operacional/física pendente                 | [Parte 22](parte-22.md) |
| 23/23 — QA Final e homologação                     | Auditoria local concluída; correções, regressão, restauração e documentação; NO-GO por pendências físicas e operacionais                                            | [Parte 23](parte-23.md) |

Na Parte 22, `/admin` integra os serviços anteriores sem criar uma sexta aba.
Permissões são consultadas por ação no backend e revalidadas nas transações;
MFA e sessões privilegiadas protegem as ferramentas. Denúncias, sanções, recursos,
grupos/eventos, rotas/circuitos, XP/rankings, aprovações críticas, auditoria,
incidentes e solicitações do titular têm fluxos persistidos. Migrações 026–032
aplicadas localmente, sem contas administrativas padrão ou acesso geral a GPS
privado. Veja [relatório](parte-22.md), [matriz](admin-matriz.md),
[provisionamento e recuperação](admin-provisionamento.md),
[moderação](admin-moderacao.md), [incidentes](admin-incidentes.md) e
[homologação](admin-homologacao.md). Sem deploy ou avanço à Parte 23.

Validação da Parte 22: tipos, lint, formatação e builds aprovados; **667 testes
padrão, 365 PostgreSQL/PostGIS e 76 Chrome distintos aprovados**, consolidados
após correções e repetições das falhas registradas no relatório. Inclui MFA,
matriz negativa por API, concorrência/idempotência, rollback de auditoria,
revogação de GPS social, compensação de XP, privacidade dos seis papéis e
responsividade em seis larguras. Uma corrida anterior de resposta de ranking
após offline foi corrigida. Pendências de segurança independente, retenção,
backup/restauração e Android/iPhone físicos permanecem documentadas.

Na Parte 21, Perfil, Histórico e Comunidade usam progresso confirmado pelo
backend. Migração 025, ledger imutável, compensações, fila/backfill, onze
conquistas, três metas opcionais, presença verificada pós-evento, temporadas
mensais e rankings opt-in preservam privacidade e não premiam desempenho perigoso.
Circuitos ficam em análise pessoal estimada, sem ranking público por falta de
homologação técnica. Design e cinco abas preservados. Sem deploy ou Parte 22.
Veja [relatório técnico](parte-21.md) e [manual/roteiro físico](gamificacao.md).

Validação da Parte 21: tipos, lint, formatação e builds aprovados; 664 testes
padrão, 330 PostgreSQL/PostGIS e 73 Chrome distintos aprovados entre as execuções
(1.067 no total; 72 novos). A regressão completa de banco passou com 328 casos;
os 34 específicos passaram na versão final. No navegador, os arquivos de eventos,
gamificação, social e vídeo foram repetidos após ajustes de sincronização dos
testes, somando 14 cenários finais aprovados. Limites de execução de fixtures
com trabalho criptográfico e 25 contas foram ajustados sem remover asserções.
Capturas móvel/desktop e seis larguras conferidas. Homologação física e
cronometagem profissional permanecem pendentes; detalhes no relatório.

Na Parte 20, eventos e encontros integram Comunidade/Explorar e os grupos,
com criação revisada, datas UTC/fuso IANA, ponto confirmado, rotas versionadas,
convites nominais, presenças/aprovação, capacidade transacional e coorganização.
GPS social exige consentimento separado por evento, público, precisão e prazo.
Transporte por consultas HTTP autenticadas a cada cinco segundos; posição atual
UNLOGGED, estado desatualizado aos 15 s, TTL de 30 s e limpeza automática.
Revogação reavalia bloqueios, grupo, cargo e sessão de conta; reingresso ou
desbloqueio não reativa consentimentos antigos. Ride reutiliza o mesmo GPS,
preserva a associação privada e continua independente da participação.

Migrações 021–024 pertencem exclusivamente à Parte 20. Sem deploy ou Parte 21.
Resultados finais e limites em [Parte 20](parte-20.md); uso e roteiro físico em
[Eventos](eventos.md). Não há homologação Android/iPhone/Safari físicos.

Validação: tipos, lint, formatação e builds aprovados; 631 cenários padrão,
296 PostgreSQL/PostGIS e 68 Chrome distintos aprovados (995 no total; 84 novos).
Um teste anterior de limite de login excedeu o timeout na rodada concorrente;
a repetição isolada dos 38 testes de autenticação passou. Os 35 testes de banco
da Parte 20 e seus quatro fluxos Chrome foram repetidos no código final. Dois
smokes adicionais verificaram OpenFreeMap, fontes e áreas aproximadas reais.
Capturas em seis larguras foram inspecionadas. A medição final com 200 posições
registrou 37,1 ms por leitura e 4 ms para limpeza, em ambiente local sintético.

Na Parte 19, Grupos integra Comunidade sem nova aba: públicos/privados,
descoberta opcional, criação idempotente, regras, pedidos, convites, hierarquia,
transferência, moderação, denúncias, auditoria e contadores transacionais. Posts,
fotos, curtidas e comentários reutilizam a Parte 18; URLs diretas verificam
privacidade, participação e bloqueios. Migrações 018–020 aplicadas localmente;
020 pertence ao banco da Parte 19. Sem deploy nem Parte 20. Resultados e
limitações no [relatório](parte-19.md) e [manual físico](grupos.md).

Validação da Parte 19: tipos, lint, formatação e builds aprovados; 586 testes
padrão, 261 PostgreSQL/PostGIS e 64 Chrome distintos validados (911 ao total;
60 novos). A suíte de grupos passou com 55 cenários; os três fluxos novos e os
11 testes de interface foram repetidos no build final. Contratos antigos de
mock/índice/mensagem futura foram atualizados; um timeout de autenticação na
execução simultânea não se repetiu na rodada isolada completa. Detalhes em seis
larguras, criação, descoberta, convites e gestão foram capturados e inspecionados.
Android/iPhone físicos, Safari e expurgo físico por retenção permanecem pendentes.

Na Parte 18, a Comunidade usa feed público/Seguindo, texto/fotos/moto/Ride,
curtidas e comentários reais, perfis, busca, seguidores, solicitações aprovadas,
bloqueios e denúncias. Migração aditiva `017_social.sql` aplicada localmente;
fotos WebP/miniaturas privadas sem EXIF/GPS, limpeza durável e autorização em
cada leitura. Histórico abre o compositor sem publicar ou mudar a privacidade;
vídeos continuam no dispositivo. Design Racing Tech, grade social do Início e
cinco abas preservados. Sem deploy, grupos ou implementação da Parte 19.

Validação: tipos, lint, formatação e builds aprovados; 584 testes padrão,
206 PostgreSQL/PostGIS e 61 Chrome distintos aprovados (851 no total; 55 novos).
Uma execução simultânea de banco/navegador teve falhas/timeouts; repetição isolada
com um worker aprovou os 206. O contrato Chrome antigo de comentários fictícios
foi atualizado e os 11 testes de interface, três sociais e quatro do Histórico
passaram no build final. Capturas em seis larguras e dos novos fluxos inspecionadas.
Android/iPhone físicos e Safari permanecem pendentes conforme o
[relatório](parte-18.md) e [manual/roteiro](comunidade.md).

Na Parte 17, o Histórico reutiliza vídeos/âncoras da Parte 16 e a timeline do
Replay. Prévia com velocímetro/indicadores, layouts, seleção, offsets locais e
exportação Canvas + MediaRecorder por segmento. IndexedDB v4 preserva originais,
grava resultados incrementalmente e guarda configurações/snapshots por conta.
Formatos, duração, frames, resolução e áudio solicitado são validados antes de
liberar o composto. Download/compartilhamento são explícitos; não há upload,
consolidação, deploy ou implementação da Parte 18. Homologação física permanece
pendente; resultados completos no [relatório](parte-17.md) e roteiro no
[manual](video-overlay.md).

Validação da Parte 17: tipos, lint, formatação e builds aprovados; 578 cenários
padrão, 160 PostgreSQL/PostGIS e 58 Chrome distintos aprovados (796 no total).
35 novos casos unitários/integração e três novos fluxos Chrome. Inclui fontes
WebM/MP4, saída composta WebM/MP4, áudio WebM, verificação dos pixels de 36 km/h
sem duplicar para 72 km/h em 2×, cancelamento, suspensão, quota, isolamento e
hash do original. Capturas em seis larguras inspecionadas. Homologação Android /
iPhone físicos, Safari e áudio audível/drift em aparelhos continuam pendentes.

Na Parte 16, vídeo opcional foi integrado nos blocos 16A–16D: câmera por ação
explícita, prévia inline, qualidade/áudio opt-in, MediaRecorder, segmentos por
pausa/troca, IndexedDB v3, recuperação, quota e relógios do Ride. Histórico e resumo
oferecem reprodução, cópia original e exclusão confirmada. Não há upload ou
alteração do backend. São 758 cenários distintos aprovados: 543 na suíte padrão,
160 PostgreSQL/PostGIS e 55 Chrome, incluindo 48 novos testes unitários/integração
e dois de navegador para vídeo. Design e cinco abas preservados; sem deploy,
sem Parte 17 e com homologação física Android/iPhone pendente. Limite operacional
de montagem para reprodução/cópia: 256 MiB por segmento; captura incremental sem
limite artificial em minutos. Consulte o [relatório](parte-16.md) e o
[manual/roteiro físico](videos.md).

A Parte 04 tem 161 cenários aprovados: 63 na suíte padrão, 79 com PostgreSQL
real e 19 no Chrome. A migração `002_motorcycles.sql` está aplicada; cadastro,
edição, detalhes, fotos, principal, arquivamento e garagem do perfil funcionam
com a sessão da Parte 03. Responsividade da Garagem validada de 320 a 430 px.
Não houve deploy. A pendência PostGIS da fundação não foi ocultada nem
substituída por resposta simulada do endpoint de saúde.
Na Parte 05, a validação passou em 224 cenários: 119 na suíte padrão,
79 com PostgreSQL real e 26 no Chrome, além do smoke com OpenFreeMap real.
O Ride usa GPS somente por ativação explícita, com velocidade direta e percurso
temporário em memória. Interface preservada e nenhum dado GPS enviado ao backend.
Android e iPhone físicos ainda precisam ser homologados conforme [roteiro](gps.md).
Na Parte 06, 274 cenários passaram: 153 unitários, 91 PostgreSQL/PostGIS e
30 Chrome. Moto e modos reais, estados, pausas, segmentos, resumo antes de
salvar, privacidade, descarte e persistência transacional/idempotente estão
integrados. PostGIS local habilitado com runtime isolado; `db:check` passou.
Preparação e resumo foram inspecionados nas capturas móveis e desktop.
Homologação Android/iPhone físicos pendente conforme [roteiro](sessoes.md).
Na Parte 07, sensores opcionais, calibração, força G longitudinal estimada e
persistência transacional foram integrados sem alterar o serviço GPS ou o design.
336 cenários aprovados: 209 unitários/contratos, 95 PostgreSQL/PostGIS e 32 Chrome.
Build, TypeScript, lint e formatação passaram. Migração `004_motion.sql` aplicada.
Homologação Android/iPhone físicos permanece
pendente e inclinação dinâmica segue indisponível; consulte o [manual](sensores.md).
Na Parte 08, GPS Assistido padrão e GPS Puro manual foram integrados ao velocímetro,
com preferência por conta, fusão conservadora, timestamps reconciliados, fallback,
limites de deriva, pausa/retomada e série processada opcional separada do GPS.
416 cenários distintos aprovados: 285 unitários/contratos, 98 PostgreSQL/PostGIS e
33 Chrome. TypeScript, lint, formatação e build passaram. Migração aditiva
`005_assisted_speed.sql` aplicada localmente. Design e estatísticas GPS preservados.
Roteiro físico e resultados sintéticos no [manual de GPS Assistido](gps-assistido.md).
Nenhum aparelho físico homologado. A Parte 09 está registrada abaixo.
Não houve deploy.

Na Parte 09, modos centralizados, eventos passivos 0–100/100–0, qualidade,
associação de G, gráficos reais, resumo técnico e persistência transacional foram
integrados. Migração `006_advanced_telemetry.sql` aplicada localmente. Eventos são
recalculados pela API e acessíveis somente ao proprietário, mesmo em atividades
públicas. GPS Puro/Assistido preservados, sem utilizar ticks do velocímetro como
novas medições. Inclinação dinâmica e voltas permanecem indisponíveis. Resultados
e roteiro de aparelhos físicos no [relatório](parte-09.md) e no
[manual](telemetria-avancada.md). As Partes 11 a 23 não foram iniciadas; a Parte 10 está registrada abaixo.

Verificação da Parte 09: TypeScript, lint, formatação e build aprovados;
338 cenários unitários/contratos, 101 PostgreSQL/PostGIS e 34 Chrome aprovados
(473 distintos). Capturas de telemetria em 320/390/430/1440 px, com inspeção
visual móvel/desktop. Nenhum aparelho físico homologado.

Na Parte 10, captura incremental, recuperação, decisão local, fila persistente,
sincronização automática/manual, locks entre abas, retentativas e lotes retomáveis
foram integrados. Migração `007_offline_sync.sql` aplicada localmente. Shell de
produção versionado, sem cache de API/tiles ou ativação forçada de atualização.
Atividades pendentes não são limpas automaticamente e a confirmação do servidor
é separada do salvamento no aparelho. Design preservado; sem deploy ou avanço à
Parte 11. Veja o [relatório](parte-10.md) e o [manual físico pendente](offline.md).

Verificação da Parte 10: TypeScript, lint, formatação e build aprovados;
375 testes unitários/contratos, 105 PostgreSQL/PostGIS e 37 Chrome aprovados
(517 distintos, incluindo reexecução direcionada do arquivo Ride após ajustar
o polling do teste). Sessão sintética de 50.000 pontos validada tanto no IndexedDB
quanto em 100 lotes no servidor, sem truncamento. Capturas offline em
320/390/430/1440 px inspecionadas. Nenhum aparelho físico homologado.

Na Parte 11, os blocos 11A–11D integram exploração real, editor por toque,
roteamento OSRM configurável, favoritos, moderação, verificação de circuito,
acompanhamento Ride e voltas GPS estimadas. Migrações 008–010 aplicadas localmente;
versões aprovadas e associações preservadas para sincronização offline. Não há
percursos fictícios inseridos na exploração pública nem circuitos reais
verificados automaticamente. Sem deploy e sem avanço à Parte 12.

Validação: TypeScript, lint, formatação e build aprovados; 400 cenários
unitários/contratos, 116 PostgreSQL/PostGIS e 39 Chrome aprovados (555 distintos).
Uma execução concorrente excedeu o timeout de um teste de login; a regressão do
banco foi repetida isoladamente e passou. O fluxo de rota com offline e as
capturas em 320/390/430/1440 px foram conferidos. Provedor OSRM real e aparelhos
Android/iPhone físicos permanecem pendentes; veja [relatório](parte-11.md) e
[manual](rotas.md).

Na Parte 12, os blocos 12A–12D integram histórico paginado, pesquisa/filtros,
detalhes com mapa segmentado e gráficos, eventos/voltas persistidos, estatísticas
acumuladas, edição restrita, privacidade e compartilhamento conservador sem GPS.
Início e perfil usam atividades e totais reais. O IndexedDB é conciliado por
client ID/recibo, e exclusão lógica/tombstones bloqueiam recriação por reenvio.
Migrações 011/012 aplicadas localmente; navegação e composição Racing Tech
preservadas. Sem deploy e sem avanço à Parte 13.

Validação: TypeScript, lint, formatação e build aprovados; 411 testes
unitários/contratos, 128 PostgreSQL/PostGIS e 43 Chrome aprovados (582 distintos,
incluindo reexecução direcionada após contextualizar o nome do link de login).
Capturas em 320/360/375/390/430/1440 px verificadas. Android/iPhone físicos,
clipboard e compartilhamento nativo permanecem pendentes. Exclusão é lógica,
sem expurgo físico nesta parte. Consulte [relatório](parte-12.md) e
[manual](historico.md).

Na Parte 13, os blocos 13A–13D integram replay privado pelo Histórico, originais
paginados, tempo ativo sem pausas, relógio monotônico, Play/Pause/Resume/Restart,
busca temporal, quatro velocidades, mapa segmentado, velocímetro e sensores
disponíveis, gráficos com cursor, eventos/voltas persistidos e leitura local no
IndexedDB. O replay não detecta eventos/voltas novos, não cria medições ausentes e
não libera detalhes pelo resumo público. Sem migração, deploy ou avanço à Parte 14.

Validação: TypeScript, lint, formatação e builds aprovados; 461 cenários padrão,
132 PostgreSQL/PostGIS e 48 Chrome distintos aprovados (641 no total). O caso de
50.000 pontos passou após reexecução dirigida que corrigiu o nome esperado do
botão Continuar depois da busca; os outros 47 casos passaram na execução completa.
Responsividade em 320/360/375/390/430/1440 px, screenshots e inspeção visual móvel
e desktop. Android/iPhone físicos e medições de memória nesses aparelhos continuam
pendentes. Inclinação dinâmica permanece ausente no esquema anterior. Consulte o
[relatório](parte-13.md) e o [roteiro de homologação](replay.md).

Na Parte 14, os blocos 14A–14D integram seleção de 2–4 atividades na mesma rota,
validação de geometria/versões/sentido, cobertura por trechos, alinhamento por
distância, resumos, mapa sobreposto, gráficos, filtros, consentimentos separados,
agregados com pelo menos dez contas distintas e circuitos verificados. Migrações
013/014 aplicadas localmente, sem duplicar atividades ou GPS. Histórico e Replay
receberam somente os acessos necessários; design e cinco abas preservados.

Validação: TypeScript, lint, formatação e builds aprovados; 478 cenários padrão,
147 PostgreSQL/PostGIS e 50 Chrome distintos aprovados (675 no total). Uma corrida
na confirmação visual de revogação foi corrigida e os dois novos fluxos foram
repetidos duas vezes no build final. Capturas e responsividade em
320/360/375/390/430/1440 px inspecionadas. Teste geográfico de 50.000 pontos e
5.000 segmentos dentro do orçamento. Android/iPhone físicos, inclinação dinâmica
e comparação offline completa permanecem pendentes/indisponíveis conforme
[relatório](parte-14.md) e [manual](comparacoes.md). Sem deploy e sem avanço à
Parte 15.

Na Parte 15, os blocos 15A–15D acrescentam reconhecimento pelo GPS real sem rota
cadastrada, índice GiST, fila secundária, backfill com checkpoint, trechos comuns,
coberturas A/B e sentidos. Grupos exigem equivalência entre todos os membros.
Histórico/Explorar usam componentes existentes; a comparação da Parte 14 aceita
referência derivada e o Replay original permanece acessível. Migrações 015/016
aplicadas localmente e 102 municípios de Alagoas importados de snapshot IBGE.
Sem deploy ou avanço à Parte 16. Consulte [relatório](parte-15.md) e
[manual/roteiro físico](trajetos-semelhantes.md).

Validação da Parte 15: tipos, lint, formatação e builds aprovados; 495 testes
padrão, 160 PostgreSQL/PostGIS e 53 Chrome distintos aprovados (708 no total).
Inclui 50.000 pontos, consultas com até 5.000 sessões, plano GiST, autorização,
dez participantes distintos/revogação, recuperação de lease e regiões oficiais.
Uma disputa de recursos no teste anterior de login exigiu repetição isolada;
uma corrida de respostas da comparação anterior foi corrigida e os cinco testes
de comparação/reconhecimento passaram juntos. Capturas em seis larguras
inspecionadas; Android/iPhone físicos e memória nesses aparelhos continuam
pendentes. Não houve deploy nem implementação da Parte 16.
