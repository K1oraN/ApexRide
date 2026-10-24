# Parte 15/23 — Reconhecimento automático de trajetos semelhantes

Entrega local em 23/10/2026. Implementação limitada aos blocos 15A–15D,
preservando o monorepositório, os dados originais e a composição Racing Tech.
Manual técnico e roteiro físico: [trajetos semelhantes](trajetos-semelhantes.md).

## A. Funcionalidades implementadas

- Enfileiramento no salvamento e na sincronização, sem aguardar o cálculo.
- Indexação de GPS real sem exigir rota cadastrada e backfill retomável.
- Classificações integral, parcial, contrária, limitada e inconclusiva.
- Distância comum, coberturas A/B independentes e janelas de trechos contínuos.
- Grupos pessoais sem equivalência transitiva presumida.
- Histórico com grupos e acesso aos pares pelos detalhes da atividade.
- Mapa dos dois percursos próprios, trechos comuns selecionáveis e marcadores.
- Filtros de moto/cilindrada/categoria e regiões administrativas verificáveis.
- Comparação dos trechos pelo motor existente e retorno do Replay individual.
- Descoberta comunitária regional agregada, com opt-in e supressão conservadora.
- Revogação/exclusão, reprocessamento limitado e estados de insuficiência/erro.

## B. Principais arquivos

| Área                     | Arquivos                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Preparação e motor       | `apps/api/src/modules/similarity/geometry.ts`, `engine.ts`                                           |
| Fila e dados             | `repository.ts`, `worker.ts`, `routes.ts` no mesmo módulo                                            |
| Referência e comunidade  | `reference.ts`, `community.ts`, `regions.ts`                                                         |
| Integração da Parte 14   | `apps/api/src/modules/comparisons/service.ts`, `routes.ts`                                           |
| Bootstrap                | `apps/api/src/app.ts`                                                                                |
| Banco                    | `database/migrations/015_similarity.sql`, `016_similarity_backfill.sql`                              |
| Regiões                  | `database/reference/alagoas-regions.json`, `apps/api/src/similarity-regions-cli.ts`                  |
| Interface                | `apps/web/src/pages/SimilarityPage.tsx`, `src/similarity/*`                                          |
| Integrações visuais      | Histórico, detalhes, Explorar, Replay, privacidade, App, RouteMap e ComparisonResults existentes     |
| Contrato compartilhado   | `packages/ride-core/comparison.d.ts` expõe candidatos do índice já existente                         |
| Testes                   | `apps/api/test/similarity.test.ts`, `similarity.postgres.test.ts`, `apps/web/e2e/similarity.spec.ts` |
| Infraestrutura de testes | Runner PostgreSQL inclui a nova suíte; limpezas incluem as tabelas derivadas                         |
| Documentação             | Este relatório, manual, README, arquitetura, banco e progresso                                       |

Os dois `package.json` ganharam somente o comando de importação de regiões.
Nenhuma biblioteca foi instalada. O comparador da Parte 14 também recebeu
separação dos estados de erro de candidatos e comparação: uma resposta de lista
bem-sucedida não apaga mais um erro de autorização retornado pela comparação.

## C. Algoritmo geográfico

Versão `similarity-1`: preparação e segmentação, simplificação limitada a 0,5 m,
alinhamento progressivo em sentidos direto/inverso e rejeição de ambiguidades.
Considera conjuntamente forma local, distância, sequência, direção, continuidade,
qualidade e cobertura. Trechos exigem 300 m e cinco pares observados. Corredor
de 8 m, precisão até 10 m, mediana de afastamento até 3 m. Cobertura integral
exige ≥95% em ambas as atividades e ausência de interrupções/rejeições.

Coberturas são a união de intervalos aceitos dividida pela extensão válida de
cada atividade. Distância comum usa o menor comprimento aceito entre A/B.
Comprimentos geodésicos e operações SQL em metros; projeção local dependente da
latitude apenas no alinhamento/simplificação. Não há percentual de certeza.
Fórmulas, complexidade e condições de rejeição estão no manual.

## D. Busca de candidatos

GiST sobre `geography(MultiLineString,4326)` e `ST_DWithin(...,30)` reduzem a
pesquisa antes do alinhamento. São consultados 41 registros e analisados até 40.
O status informa truncamento. As permissões entram no funil e são verificadas
novamente ao persistir/consultar. Não existe comparação global de todos os pares.

## E. Correspondência parcial

Cada cadeia contínua produz início/fim temporal em A/B, geometria e extensão.
As duas coberturas são apresentadas separadamente. Lacunas e trechos curtos não
são unidos para aumentar a cobertura. Referências com várias partes compartilham
eixo de distância sem criar uma linha entre as partes. A comparação restringe
pontos, séries e tempos às janelas e à interseção efetivamente observada.

## F. Direção e qualidade

O sentido vem da progressão dos registros. Caminhos invertidos são relacionados,
mas não habilitam comparação orientada. Mistura de sentidos tem limitação
explícita. GPS impreciso, saltos, pausas, ordem corrompida e afastamentos
persistentes são rejeitados/limitados. Vias paralelas a 5 m no conjunto sintético
ficam inconclusivas; cruzamento isolado não vira percurso comum. Identidade de
via em pontes/túneis sobrepostos não pode ser certificada só com esse GPS.

## G. Agrupamento pessoal

Agrupamento determinístico exige compatibilidade integral entre todos os
membros. Falta de aresta não é evidência de equivalência. Grupos são privados,
paginados e recalculados a partir dos pares vigentes; exclusão e reprocessamento
removem suas dependências. Não se cria rota pública automaticamente.

## H. Comparação

`compareActivities`, `alignActivity`, `timeOnRanges`, gráficos, MapLibre e
identificação de sensores da Parte 14 foram reutilizados. As referências
derivadas são construídas exclusivamente no servidor e têm versão. Tempo,
velocidade observada e séries usam somente os trechos comuns; totais históricos
são contexto, sem diferenças totais em sessões parciais. Sensores ausentes
permanecem indisponíveis. O Replay usa o original e oferece retorno ao par.

## I. Privacidade

Pares detalhados exigem propriedade de ambas as atividades. A comunidade usa
somente células municipais fixas × categoria × cilindrada e pelo menos dez
contas autorizadas distintas. Cada proprietário contribui com sua média, sem
contagem exata, identidade, coordenadas, origens/destinos, horários ou telemetria.
São verificados perfil/atividade públicos, conta ativa, consentimento e versão
vigentes. Não existe mapa público derivado ou cache de agregados.

Revogação apaga pares e reenfileira; exclusão remove índice e dependências.
Consulta por ID, ponto, bounding box ou filtros comunitários arbitrários é
recusada. O agregado é regional e não certifica um grupo integral único entre
todos os participantes. Não há garantia formal de anonimização.

## J. Banco de dados

Migrações **015 e 016 aplicadas localmente**. Criam índice espacial privado,
pares canônicos únicos, polígonos administrativos e checkpoint de backfill.
Triggers integram salvamento, exclusão e consentimento. FKs, GiST, índice de
pendências e índice reverso de pares foram adicionados. Originais não mudaram.

O snapshot oficial de Alagoas foi importado pelo novo comando
`pnpm similarity:regions`: 102 municípios, sem trajetos/pessoas. A arquitetura
aceita importação municipal de outras UFs. Não se executou deploy.

## K. API

- `GET /api/rides/:id/similar`.
- `GET /api/rides/similar-groups`.
- `GET /api/rides/:id/similarity-status`.
- `POST /api/rides/:id/similarity/reprocess`.
- `POST /api/rides/:id/similar/compare`, com `{activityId}` próprio.
- `GET /api/similarity/regions`.
- `GET /api/similarity/community`, com célula fixa e autorizada.
- `PATCH /api/rides/:id/comparison-privacy` adaptado para sessões sem rota.

Todos autenticam, validam filtros, limitam carga e aplicam autorização no backend.
POST/PATCH exigem CSRF. Nenhuma permissão fornecida pelo cliente é aceita como
prova de autorização. As rotas anteriores continuam disponíveis.

## L. Performance

Geometria de 50.000 pontos foi testada com limite de 6 s por par. Consultas
sintéticas com 200, 1.000 e 5.000 sessões indexadas preservaram limite de
candidatos e tempo de pré-seleção abaixo de 1 s nos testes locais. `EXPLAIN`
confirmou GiST, incluindo plano natural com 5.000 sessões e `ANALYZE/BUFFERS`.
Isso não é benchmark de produção ou garantia em qualquer hardware.

Backfill usa lotes de 25 e cursor persistido por versão; fila usa lease, token,
SKIP LOCKED, três tentativas e trabalhos limitados. As regras limitam 50.000
pontos, 64 segmentos, 300 km e 40 candidatos. O processamento detalhado não é
executado durante renderizações React. Casos patológicos podem ser recusados.

## M. Testes e evidências

Foram executados:

| Verificação                   | Resultado                                                        |
| ----------------------------- | ---------------------------------------------------------------- |
| TypeScript, lint e formatação | Aprovados                                                        |
| Builds API/web                | Aprovados; alerta preexistente de tamanho MapLibre               |
| Suíte padrão Vitest           | 495 aprovados: 191 API/contratos e 304 web                       |
| PostgreSQL/PostGIS            | 160 cenários distintos aprovados, incluindo 13 novos da Parte 15 |
| Chrome/Playwright             | 53 cenários distintos aprovados; 3 novos da Parte 15             |
| Migrações locais 015/016      | Aplicadas                                                        |
| Importação municipal oficial  | 102 municípios importados e validados                            |
| Saúde real através da API     | PostgreSQL acessível e PostGIS habilitado                        |

Total: **708 cenários automatizados distintos aprovados**, sem contar
reexecuções como testes novos. Os testes PostgreSQL são intencionalmente pulados
na suíte padrão e executados separadamente com o runner real.

As 17 verificações geográficas/agrupamento da nova suíte cobrem igualdade, ruído,
frequências, parcial assimétrico, sentido contrário, cruzamento, paralelas,
segmentos, pausas, saltos, duplicatas, ordem, qualidade, curvas/retorno/oito e
50.000 pontos. Integração cobre fila, filtros, propriedade, privacidade,
agregado de dez contas/revogação, GiST, carga crescente, backfill, regiões IBGE,
grupos, reprocessamento, lease vencido e processamento concorrente idempotente.

Uma execução PostgreSQL concorrente com o navegador excedeu o timeout do teste
anterior de 30 tentativas de login; a regressão completa foi repetida isoladamente
e passou. A execução completa inicial de Chrome revelou a corrida entre
respostas na Parte 14; ela foi corrigida, e os dois testes de comparação e os
três novos de reconhecimento passaram juntos depois da correção. A preparação
dos testes também passou a aguardar os próprios trabalhos da fila quando vários
arquivos compartilham o esquema. Não se removeu proteção ou teste para aprovar.

Capturas em 320/360/375/390/430/1440 px estão em
`.local/screenshots/similarity-*.png`, com inspeção visual do mapa/trecho comum,
marcadores e tabela móvel. O teste verifica ausência de overflow. O mapa-base
dos testes é sintético, com MapLibre/WebGL reais; não é homologação de GPS físico.
Nenhum aparelho Android/iPhone foi declarado validado.

## N. Limitações

- Sem corpus real representativo para calibrar falsos positivos/negativos; os
  limiares são conservadores e sustentados pelos conjuntos sintéticos executados.
- Sem map matching ou discriminação certificada de vias sobrepostas em níveis.
- Limites de candidatos/tempo podem omitir pares e são sinalizados no status.
- Município exige cobertura integral por polígono; trajetos entre municípios e
  fora da base importada podem ficar sem metadados regionais.
- A comunidade publica agregados regionais, sem geometria pública do percurso.
- Reconhecimento novo exige conexão; Histórico/Replay locais seguem disponíveis.
- Android/iPhone físicos e medições de memória/energia permanecem pendentes.
- Inclinação dinâmica permanece indisponível no esquema anterior.
- O alerta de bundle MapLibre acima de 500 kB continua no build existente.

## O. Preparação para a Parte 16

IDs estáveis da sessão e do dispositivo, timestamps originais, intervalos ativos
e tempos relativos de sensores foram preservados. São pontos de integração
futuros para mídia local com associação/offset explícitos e tratamento de pausas.
As referências geográficas têm versão e não substituem a linha do tempo original.
Não foram implementados vídeo, overlays, MP4, feed, rankings, XP ou gamificação.
**A Parte 16 não foi iniciada.**
