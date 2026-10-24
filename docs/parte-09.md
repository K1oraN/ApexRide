# Parte 09/23 — Telemetria avançada e configuração dos modos

Entrega local em 23/10/2026. Sem deploy e sem avanço à Parte 10. Implementação
experimental; homologação em Android/iPhone físicos permanece pendente.

## A. Funcionalidades implementadas

Configuração central tipada dos três modos, dois detectores passivos incrementais,
estados explícitos, histerese, interrupções, eventos estimados/inconclusivos/rejeitados,
metadados de qualidade, múltiplos eventos por sessão e melhores tempos pessoais.
G longitudinal válido pode ser associado ao intervalo dos eventos; os máximos e
médias disponíveis continuam nos serviços da Parte 07. Ride e resumo mostram dados
reais, gráficos com lacunas e indisponibilidade sem zeros artificiais.

Integração com preparação, moto selecionada, pausa, retomada, finalização,
resumo antes de salvar, tentativa idempotente e descarte sem envio. Falhas de
processamento avançado preservam GPS/mapa e deixam os resultados indisponíveis.

## B. Principais arquivos criados e alterados

| Arquivos                                                                                                     | Responsabilidade                                                                     |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `packages/ride-core/modes.js`, `modes.d.ts`                                                                  | Configuração central de recursos                                                     |
| `packages/ride-core/telemetry.js`, `telemetry.d.ts`                                                          | Máquinas de estados, parada, parâmetros, consolidação, contratos de eventos e voltas |
| `packages/ride-core/index.d.ts`, `package.json`                                                              | Contrato opcional e exports do núcleo compartilhado                                  |
| `apps/web/src/services/telemetry/session.ts`                                                                 | Detecção incremental e isolamento de falhas                                          |
| `apps/web/src/services/telemetry/charts.ts`                                                                  | Séries, redução e lacunas de exibição                                                |
| `apps/web/src/ride/controller.ts`                                                                            | Ciclo de vida, mudança de preferência e consolidação                                 |
| `apps/web/src/services/speed/estimator.ts`, `telemetry.ts`                                                   | Parada centralizada, aviso de troca de modo e acesso limitado aos dados reais        |
| `apps/web/src/services/motion/telemetry.ts`                                                                  | Janela limitada para gráficos, sem recalcular sensores                               |
| `apps/web/src/ride/AdvancedResults.tsx`, `TelemetryCharts.tsx`                                               | Eventos pessoais, qualidade e gráficos                                               |
| `apps/web/src/pages/RidePage.tsx`, `ride/RideSummary.tsx`, `styles/ride-session.css`                         | Integração nos painéis aprovados, ocultação avançada no Passeio                      |
| `apps/api/src/modules/rides/telemetry-validation.ts`, `validation.ts`, `routes.ts`                           | Reprocessamento, contrato compatível, transação e leitura privada                    |
| `database/migrations/006_advanced_telemetry.sql`                                                             | Migração aditiva                                                                     |
| `apps/api/test/telemetry*`, `rides.postgres.test.ts`, `motorcycles.postgres.test.ts`                         | Testes de núcleo, contratos e PostgreSQL                                             |
| `apps/web/src/services/telemetry/charts.test.ts`, `ride/controller.test.ts`, `e2e/rides.spec.ts`             | Gráficos, integração Ride, falhas e regressão Chrome                                 |
| `README.md`, `docs/progresso.md`, `database/migrations/README.md`, este relatório e `telemetria-avancada.md` | Operação, progresso e roteiro físico                                                 |

Nenhuma biblioteca nova, reestruturação do monorepositório ou migração destrutiva.
O repositório já estava integralmente sem arquivos rastreados no início; nenhum
commit ou limpeza de alterações anteriores foi realizado.

## C. Detecção 0–100

Parada GPS sustentada por 2 s, velocidade ≤ 0,15 m/s, raio de 1 m e precisão
≤ 10 m arma uma observação. A última leitura estacionária estima o início do
movimento. Cruzamento ascendente de 100 é interpolado entre pontos próximos e
precisa de uma segunda leitura independente acima do limiar. O cálculo usa fim
estimado menos início; não inclui o atraso da confirmação.

Há requisitos de quantidade de amostras, continuidade, origem, precisão e
plausibilidade. Dados insuficientes nunca completam eventos. Interrupção, pausa,
reversão, fim de sessão ou troca de modo encerram candidatos sem tempo válido.

## D. Detecção 100–0

Uma velocidade de pelo menos 102 km/h arma o detector. O cruzamento descendente
de 100 inicia o evento, com interpolação somente em leituras próximas. A parada
sustentada confirma a conclusão, usando como fim a primeira leitura da janela
estacionária. O tempo é fim menos cruzamento. Histerese impede duplicatas próximas
do limiar. Um zero, perda de GPS ou pausa manual não representam frenagem concluída.

## E. Precisão e limitações das estimativas

Todos os eventos são experimentais e usam timestamps GPS originais. A integração
usa medições GPS independentes para tempos, inclusive quando o velocímetro está
em GPS Assistido. Séries assistidas continuam disponíveis separadamente nos
gráficos; ticks visuais e previsão sem confirmação GPS não viram medições de
desempenho. Mudança de origem interrompe eventos. Sem velocidade GPS direta
suficiente para comprovar parada e cruzamentos, não há resultado completo.

G vem somente de amostras longitudinais processadas válidas, com calibração,
intervalo e qualidade registrados. Inclinação dinâmica mantém a indisponibilidade
da Parte 07 até homologação, incluindo médias/máximas E/D. Exibição de tempos
usa segundos inteiros com intervalos ≥ 500 ms; maior cadência admite décimos.
Não foram inventadas margens de erro nem alegada certificação.

## F. Diferenças funcionais dos modos

| Modo    | Funcionamento                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Passeio | Moto, GPS/mapa, velocidades, distância e tempos; GPS Puro/Assistido; sem eventos ou cards/gráficos esportivos    |
| Pista   | Básico e telemetria avançada disponível; contratos futuros de circuito/voltas, tempos de volta indisponíveis     |
| Misto   | Básico e todas as ferramentas técnicas da Pista, inclusive em ruas/estradas, exclusivamente para análise pessoal |

Selecionar Pista não habilita competição nem valida um circuito. Nenhum modo
publica automaticamente eventos, G ou inclinação.

## G. Interface e design

Preservados paleta, tokens, fonte, velocímetro, cards, mapas, controles e navegação
com Ride central. Elementos avançados usam os mesmos painéis e estilos Racing
Tech. Detalhes ficam recolhidos durante a sessão; o resumo mostra os resultados
antes de salvar. Não foram adicionados desafios, contagens regressivas ou comandos
para executar acelerações/frenagens.

Capturas de resumo com dados sintéticos geradas em
`.local/screenshots/telemetry-{pista,misto}-{320,390,430,1440}.png`.
As capturas de Misto 390 px e Pista 1440 px foram inspecionadas visualmente.
Mapa dessas capturas usa base de teste identificada; os percursos vêm da série
sintética, sem representar uma atividade ou homologação física.

## H. Banco e API

Migração `006_advanced_telemetry.sql` aplicada no banco local pelo comando
`db:migrate`; migrações anteriores preservadas. Resumo em `rides.telemetry_summary`,
eventos em `ride_performance_events`, com FK, índice por sessão/tempo, unicidade
e checks de intervalos/durações/estados. GPS original, sensores e série assistida
continuam separados em suas estruturas anteriores.

O POST existente mantém autenticação, CSRF/origem, propriedade, limites e transação.
A API reconstrói eventos/qualidade/estatísticas e compara o contrato completo;
duração, resumo, ID, fonte ou volta incompatíveis são rejeitados. Atividades
antigas não precisam enviar telemetria. Hash, trava e chave de sessão preservam
idempotência. Detalhe e eventos continuam privados ao proprietário mesmo quando
a atividade é pública; não são incluídos na listagem.

## I. Testes realmente executados

| Verificação                             | Resultado                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm check`                            | TypeScript, lint, formatação, testes e build aprovados                          |
| Suíte padrão                            | 338 aprovados: 149 API/núcleo e 189 frontend; PostgreSQL separado               |
| `pnpm test:postgres`                    | 101 aprovados com PostgreSQL/PostGIS reais                                      |
| `pnpm --filter @apex-ride/web test:e2e` | 34 aprovados no Chrome: 5 autenticação, 3 garagem, 7 GPS, 11 interface e 8 Ride |
| `pnpm db:migrate`                       | Migração aditiva 006 aplicada localmente                                        |

Total: **473 cenários distintos aprovados**, sem contar reexecuções. O build
mantém o aviso conhecido do chunk MapLibre acima de 500 kB. Não houve falha de
compilação. Capturas móveis/desktop foram geradas e inspecionadas conforme G.
Os oito cenários de Ride também foram reexecutados e aprovados no build final,
após o ajuste de segmentação do gráfico assistido em pausas curtas. A formatação
foi novamente verificada após consolidar esta documentação.

Um teste de regressão identificou a ordem de uma troca de preferência ocorrida
no mesmo milissegundo de uma posição; o reprocessamento passou a aplicar essa
interrupção após a medição já recebida. A revisão também passou a limitar a
reversão acumulada pelo extremo do candidato, evitando que várias oscilações
pequenas escondam uma reversão real. Os testes correspondentes passaram.

As suítes cobrem dados sintéticos válidos, nulos, insuficientes, fora de ordem,
frequência baixa, oscilações, falsa parada, pausas, mudanças de fonte/preferência,
eventos consecutivos, G ausente/inválido, gráficos com lacunas, redução sem alterar
persistência, modos e falhas de processamento. PostgreSQL testa eventos,
idempotência concorrente, propriedade, compatibilidade antiga, constraints e
rollback completo em falha forçada por trigger. Chrome testa os três modos,
gráficos reais, resumo, salvamento e regressões de login, garagem, GPS/sensores.

## J. Pendências

Homologação física Android/iPhone, cadência real, montagem, calibração, comportamento
em background/tela bloqueada e comparação com equipamento de referência seguem
pendentes. Nenhuma pilotagem real ou precisão experimental foi afirmada. Medições
permanecem experimentais, inconclusivas ou indisponíveis conforme seus dados.
Roteiro e ficha de registro estão no [manual](telemetria-avancada.md).

Tempos de volta e inclinação dinâmica continuam indisponíveis. Não há distância
de frenagem, resultados certificados, base de circuitos, vídeos, rankings,
comparações sociais ou sincronização offline. Fechar/recarregar ainda pode perder
atividade não salva. Limites de GPS/sensores continuam explícitos no resumo.

## K. Preparação para a Parte 10

Payload versionado, UUID da sessão, intervalos, GPS original, sensores, série
assistida, interrupções e IDs determinísticos de eventos permitem futura fila
local transacional e reenvio idempotente. A etapa futura precisará tratar estado
de envio, confirmação perdida, recuperação, limites, migrações e privacidade por
conta. Nenhum armazenamento offline persistente ou sincronização foi implementado.
Contratos de circuito/volta estão preparados para a Parte 11, sempre vazios hoje.
