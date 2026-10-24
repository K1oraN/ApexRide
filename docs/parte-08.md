# Parte 08 — GPS Assistido Automático

Entrega de 23/10/2026, restrita à Parte 08 de 23. [Manual técnico, fórmulas,
limites, simulações e roteiro físico](gps-assistido.md). Sem deploy ou funções
da Parte 09.

## A. Funcionalidades implementadas

GPS Assistido Automático como preferência inicial; GPS Puro manual nas configurações
da conta e preparação do Ride, inclusive durante uma sessão. Preferência persistida
por usuário e respeitada após recarga/login. Fallback conserva a escolha armazenada.
Sinal longitudinal filtrado real, validação, previsão curta, correção GPS, controle
de deriva e parada conservadora. Leituras indisponíveis são nulas, sem inventar zero.
GPS sem velocidade mantém mapa e sessão, mas não gera estimativa por posição.

## B. Principais arquivos

| Arquivos                                                                                                                                       | Responsabilidade                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/src/services/speed/estimator.ts`                                                                                                     | Matemática, tempo, validação, fallback e estados                    |
| `apps/web/src/services/speed/telemetry.ts`                                                                                                     | Consumo dos fluxos existentes, buffers e série selecionada          |
| `apps/web/src/services/motion/telemetry.ts`                                                                                                    | Adaptador conservador do longitudinal processado, sem novo listener |
| `apps/web/src/ride/SpeedDisplay.tsx`, `SpeedSettings.tsx`                                                                                      | Velocímetro existente e seleção de preferência                      |
| `apps/web/src/ride/controller.ts`, `RideProvider.tsx`, `RideSummary.tsx`                                                                       | Ciclo de vida, conta e salvamento                                   |
| `apps/web/src/pages/RidePage.tsx`, `AccountPage.tsx`                                                                                           | Integração nas páginas existentes                                   |
| `apps/web/src/components/telemetry/Speedometer.tsx`                                                                                            | Identificação discreta da fonte e acessibilidade                    |
| `apps/web/src/services/auth.ts`, `apps/api/src/modules/auth/session.ts`, `routes.ts`                                                           | Preferência autenticada, enum e CSRF                                |
| `packages/ride-core/speed.js`, `speed.d.ts`, `index.d.ts`, `package.json`                                                                      | Contratos opcionais e limites de armazenamento                      |
| `apps/api/src/modules/rides/speed-validation.ts`, `validation.ts`, `routes.ts`                                                                 | Validação e transação no endpoint existente                         |
| `database/migrations/005_assisted_speed.sql`                                                                                                   | Colunas aditivas de preferência e série processada                  |
| Testes em `services/speed/`, `controller.test.ts`, `apps/api/test/speed.test.ts`, `rides.postgres.test.ts`, `e2e/rides.spec.ts`, `gps.spec.ts` | Matemática, integração, banco e navegador                           |
| `README.md`, `docs/progresso.md`, `gps-assistido.md`, este relatório, README de migrações                                                      | Documentação e estado da entrega                                    |

## C. Algoritmo

Integração trapezoidal `v += (a_anterior+a_atual)/2 × dt`, em m/s, limitada a valores
não negativos. Correção complementar de ganho 0,8 com GPS como referência principal.
Histórico inercial limitado a 256 estados para comparação no timestamp de GPS atrasado.
Conversão entre epoch/performance e proteção causal contra quantização dos relógios.
Lacunas não são integradas; trocas de modo e sessão descartam previsão anterior.
Não há acréscimo de 3/4 km/h ou inferência por cilindrada.

Horizonte de 2 s, GPS direto apresentável até 3 s, sensor/atraso admitido até 350 ms,
aceleração até 8 m/s², divergência acumulada de 5 m/s e resíduo de correção de 3 m/s.
Critérios configuráveis e conservadores, sem garantia universal. Modelo, fórmulas,
interpolação, parada e tabela completa no manual.

## D. Confiança

Assistência exige longitudinal transformado/filtrado `browser-linear`, calibração
válida, continuidade, limites de rotação/lateral/vertical/vibração e GPS recente.
Ausência, inconsistência, calibração perdida ou deriva suspendem a assistência.
O retorno exige referência e sinal adequados. Estados distintos para Assistido,
Puro selecionado, Puro automático, aguardando, desatualizado e erro de sensores.
Fonte, idade, motivo, calibração, disponibilidade, timestamp e versão são explícitos.
Sem porcentagem de confiança inventada ou alegação de precisão certificada.

## E. Interface

O mesmo velocímetro SVG, escala, cores, tipografia, mapa, navegação de cinco itens,
botão Ride e cards foram mantidos. Apenas seleção no painel de preparação e em
Configurações e estado discreto sob o velocímetro. Render de velocidade isolado
do mapa/página; frequência normal de apresentação até 10 Hz. Não há animação que
registre valores intermediários artificiais. Capturas móveis e desktop utilizadas
para conferir a integração e ausência de overflow.

## F. Sessões

Mesmo serviço para Passeio, Pista e Misto. Pausar interrompe integração e gravação;
retomar exige novas referências sem integrar a pausa. Finalizar congela série e
libera timer; descartar limpa os buffers. Mudança de preferência preserva sessão,
pontos, duração, GPS e listeners. Distância/média/máxima consolidadas permanecem GPS.

## G. Banco e API

Migração aditiva `005_assisted_speed.sql` aplicada localmente por `db:migrate`.
`users.speed_mode` guarda a preferência; `rides.speed_processing` JSONB opcional
guarda série processada, sem duplicar pontos GPS. POST de atividade, transação,
hash idempotente e acesso exclusivo do proprietário foram reutilizados.
GPS original é obtido pelo timestamp referenciado. Séries antigas sem campo continuam
válidas. Limite de 18.000 amostras: 1 Hz nominal e transições; histórico incompleto
é informado e persistido. Validação final exclui amostras sem referências aceitas
ou fora dos períodos ativos com indicação explícita de histórico incompleto.

## H. Testes realmente executados

| Comando com `npx --yes pnpm@10.34.7` | Resultado                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `check`                              | TypeScript, lint, formatação, 285 testes unitários/contratos e build aprovados |
| `test:postgres`                      | 98 cenários aprovados com PostgreSQL/PostGIS reais                             |
| `--filter @apex-ride/web test:e2e`   | 33 cenários aprovados no Chrome, com API e banco reais                         |
| `db:migrate`                         | Migração 005 aplicada localmente, anteriores preservadas                       |

Suíte padrão: 178 web e 107 API; testes com banco são executados separadamente.
Total de **416 cenários distintos aprovados**. Após o build final, os sete cenários
de Ride foram repetidos com sucesso. Capturas de assistência ativa em
`.local/screenshots/speed-assisted-{320,390,430,1440}.png` confirmam a integração
da fonte no velocímetro existente; as capturas de 320 e 390 px foram inspecionadas.
Cobertura nova: sinal positivo/negativo/nulo, irregularidade, atrasos, origens de
timestamp, duplicação/ordem, correção sincronizada, deriva, parada/movimento lento,
preferências, memória, relógio civil alterado e fluxo real de sensores. Banco confirma
preferência por conta, autorização/CSRF, persistência separada, idempotência e rollback.

Na simulação ideal de 9 s descrita no manual, erro máximo de 0,0124 / 0,1 / 0,25 m/s
com atrasos de GPS de 0 / 100 / 250 ms. Com atraso de 500 ms a assistência permaneceu
suspensa, erro máximo do GPS Puro de 1,45 m/s. Resultados sintéticos não validam precisão
real nem incluem ruído/erro do aparelho.

A validação inicial de navegador identificou um teste sem GPS contínuo após o
aquecimento de sensores e quantização de 1 ms que podia gerar amostra anterior à
referência GPS. O teste fornece GPS a 1 Hz e o registro respeita causalidade; há teste
de regressão específico. O build mantém o aviso já existente de chunk acima de 500 kB
associado ao mapa. Nenhuma dependência foi acrescentada.

## I. Limitações e validação física

Android e iPhone físicos não foram testados; nenhum aparelho homologado. Simulação
de permissão Safari em Chrome não equivale a teste em Safari real. APIs, frequência,
gravidade compensada e ruído variam com aparelho/SO. O filtro da Parte 07 introduz
latência própria. Curvas, vibração e movimento do suporte podem desabilitar assistência
ou produzir erros não detectados. Movimento extremamente lento pode ser indistinguível
de parada. Não há promessa de melhora em todos os celulares, tela bloqueada ou
telemetria profissional. Roteiro seguro e campos de registro no manual.

## J. Preparação para a Parte 09

Versão, fonte, timestamps relativos, referências GPS originais, calibração, qualidade
dos sensores, segmentos e limites de validade permitem estudar séries sincronizadas
posteriormente. A série processada de 1 Hz mais transições é voltada a análise/replay;
sozinha não serve para cronometrar aceleração/frenagem com precisão. A Parte 09 deverá
definir aquisição, sincronização, validação e critérios próprios sobre os dados
adequados, sem confundir estimativas com medições certificadas. Não foram implementados
0–100, 100–0, voltas, vídeos ou funções sociais.
