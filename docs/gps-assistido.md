# GPS Assistido Automático — Parte 08

**Interface da Etapa 5:** a escolha fica em **GPS Puro ou Assistido** durante
o preparo, em cartões de escolha, e na página interna de Telemetria durante pausa/preparação. O seletor
em Configurações também fica bloqueado enquanto a sessão estiver gravando ou
aguardando GPS. O estimador e o contrato `speed-1` não foram alterados.

Implementação de 23/10/2026. Estimativa experimental para apresentação de velocidade,
sem certificação de precisão e sem homologação física Android/iPhone. Não implementa
tempos de aceleração/frenagem, voltas, vídeos, rankings ou outras funções da Parte 09.

## Operação e preferências

Em Ride ou Configurações, **Velocidade da telemetria** permite escolher
**GPS Assistido Automático** (padrão) ou **GPS Puro**. A conta salva a escolha no
PostgreSQL; ela é retornada no login e na restauração de sessão. O visitante pode
alternar durante a prévia, mas precisa entrar na conta para persistir a escolha.
Falhas temporárias nunca gravam outra preferência. GPS Puro manual permanece
selecionado até uma nova escolha explícita.

A mudança funciona antes e durante o Ride, sem recriar watchPosition, listeners,
trajeto, duração ou identidade da sessão. O estado inercial é descartado e aguarda
nova referência. Configure antes de se deslocar. A assistência utiliza as permissões
e a calibração opcionais da Parte 07; nenhuma permissão é pedida automaticamente.
É possível começar e terminar normalmente apenas com GPS.

## Serviços reutilizados e limites conhecidos

Foram inspecionados README, progresso, `GpsPreview`, `GeolocationWatch`,
`RideController`, `MotionCapture`, `MotionProcessor`, calibração, velocímetro,
contrato compartilhado e rotas autenticadas. Há um único GPS, já com validação de
posição, mapa e segmentos. A Parte 05 fornece velocidade direta em m/s; não havia
estimativa de velocidade por deslocamento utilizável. Por isso GPS sem velocidade
continua indisponível, mesmo com posição válida no mapa.

A Parte 07 entrega aceleração linear do navegador, transformada na base da moto,
com bias estacionário, mediana e filtro temporal. Sua qualidade é `limited`, não
uma garantia metrológica. A Parte 08 acrescenta um consumidor interno do sinal
processado antes da seleção de 5 Hz para persistência de G. Não altera a fórmula,
estatísticas ou os dados originais de G e não utiliza aceleração com gravidade como
substituto da aceleração linear.

Somente sinais `browser-linear`, longitudinais não nulos e finitos, com calibração
válida, passam para a assistência. Como proteção adicional, exige rotação total até
10 °/s, aceleração lateral até 1 m/s², vertical até 1,5 m/s² e diferença entre
longitudinal instantânea transformada e filtrada até 1,5 m/s². Esses critérios são
conservadores e podem impedir a assistência em curvas, irregularidades e vibração.
Os limites estão no adaptador `services/motion/telemetry.ts`; os do estimador estão
em `SPEED_CONFIG` e podem ser injetados em testes. Alterações devem ser versionadas
e revalidadas em conjunto com o contrato do servidor.

## Modelo matemático e sincronização

O algoritmo `speed-1` é independente do React. Trabalha em m/s, m/s² e segundos.
Com duas amostras longitudinais válidas e consecutivas, usa integração trapezoidal:

```text
dt = (t_sensor_atual - t_sensor_anterior) / 1000
v_prevista = max(0, min(100, v_anterior + (a_anterior + a_atual) / 2 × dt))
v_corrigida = max(0, v_prevista + 0,8 × (v_GPS - v_prevista_no_horário_GPS))
v_km/h = 3,6 × v_m/s
```

O GPS é a referência principal. Não existe acréscimo fixo de velocidade, modelo por
cilindrada ou ajuste aprendido de bias durante o movimento. Bias é o da calibração
estacionária existente. Correções frequentes pelo GPS, horizonte curto e limites de
divergência restringem a deriva. Não se registra suavização ou animação como medição.

GPS usa timestamp epoch. No recebimento, calcula-se a idade com Date.now e mapeia-se
a referência para performance.now: `t_GPS_mono = mono_recebimento − idade_GPS`.
Movimento usa eventTimestamp original: a origem mais próxima de performance.now
ou do epoch recebido determina a conversão para tempo monotônico. Um evento antigo
não se torna recente apenas por ter sido recebido agora. Duplicados e eventos fora
de ordem são rejeitados, e nenhum intervalo é integrado duas vezes.

Um histórico limitado a 256 estados inerciais permite interpolar a previsão no
horário do GPS recebido com atraso de até 350 ms. Compara-se essa previsão à leitura
GPS e aplica-se a correção ao estado corrente, preservando a variação inercial já
integrada após a medição. Não há extrapolação retrospectiva sem histórico. Quando
não há suporte temporal suficiente, a referência é reinicializada pelo GPS. Atraso
GPS maior que 350 ms mantém GPS Puro até uma nova referência adequada.

## Critérios configurados e fallback

| Critério                               | Valor inicial e comportamento                           |
| -------------------------------------- | ------------------------------------------------------- |
| Referência GPS apresentável            | Idade até 3.000 ms; depois velocidade indisponível      |
| Horizonte inercial                     | Até 2.000 ms desde o horário da referência GPS          |
| Sensor recente/intervalo contínuo      | Até 350 ms; lacuna não é integrada                      |
| Aceleração longitudinal admitida       | Módulo até 8 m/s², além dos critérios da Parte 07       |
| Velocidade plausível                   | 0 a 100 m/s; proteção técnica, sem promessa de precisão |
| Salto de velocidade GPS                | Rejeitado acima de 15 m/s² entre referências próximas   |
| Resíduo GPS versus previsão sustentada | Acima de 3 m/s reinicializa e suspende assistência      |
| Desvio acumulado versus último GPS     | Acima de 5 m/s suspende assistência                     |
| Ganho da correção complementar         | 0,8 para a referência GPS                               |

O validador de posição da Parte 05 também continua ativo. Boa precisão horizontal
não comprova precisão de velocidade; não é atribuída uma porcentagem de confiança.
O navegador não fornece necessariamente incerteza de velocidade. Os valores acima
são decisões de engenharia testadas com dados sintéticos, não limites universais.

Falha, dados contraditórios ou calibração perdida suspendem assistência e informam
o motivo. A recuperação exige referência GPS recente e novo sinal válido; erro
excessivo aguarda o próximo GPS consistente. Se GPS falta brevemente mas a referência
ainda é recente, o horizonte limita a assistência. Um erro explícito do serviço GPS
suspende a inércia de forma conservadora; a última velocidade direta pode permanecer
apresentável até o limite de idade, sem fingir uma medição nova. Nenhum sinal sustenta
integração ilimitada. Ausência de velocidade é `null`, mostrada como **—**, nunca zero.

## Reconhecimento conservador de parada

Apenas no modo assistido, uma parada exige simultaneamente:

- Pelo menos 2 s de aceleração longitudinal válida e quieta, módulo até 0,1 m/s².
- Referências GPS recentes e consecutivas até 0,15 m/s.
- Âncora espacial estável por pelo menos 2 s, variação até 1 m, precisão até 10 m.
- Continuidade do GPS e dos sensores, sem interrupção ou perda de calibração.

O zero validado é identificado por `stationary`; não modifica a velocidade GPS,
pontos, distância ou estatísticas. Nova aceleração remove esse zero. Não há regra
de zerar toda velocidade abaixo de 4 km/h. Movimento lento sem todas essas evidências
é preservado. Movimento extremamente lento abaixo da resolução dos sensores ainda
pode ser confundido com parada e precisa de validação física. GPS Puro nunca aplica
essa transformação. A distância mantém o mecanismo de âncoras da Parte 06.

## Estados e apresentação

O velocímetro circular e sua escala, cores, tipografia, cards, mapa, cabeçalho e
navegação foram preservados. Um texto discreto sob o valor identifica:

- GPS Assistido ativo · estimativa.
- GPS Puro selecionado.
- GPS Puro automático.
- GPS aguardando.
- Dados desatualizados.
- Erro de sensores · GPS Puro.

Internamente ficam disponíveis fonte, preferência, timestamp, idade da referência,
calibração, disponibilidade longitudinal, estado, motivo do fallback, parada e versão.
A indicação visual não representa precisão certificada. Somente o consumidor do
velocímetro assina o fluxo de velocidade; não provoca render da página ou mapa por
amostra de acelerômetro. Atualização visual normal limitada a 10 Hz, com atualização
imediata em transições GPS/modo. Cálculos processam o sinal validado disponível.

## Sessões, métricas e recursos

Passeio, Pista e Misto usam exatamente o mesmo estimador e critérios. Pausa suspende
integração e gravação; retomada limpa a referência e aguarda GPS/sensores. Trocar modo
não interrompe o Ride. Página oculta/interrupção invalidam ou reavaliam calibração
pelas regras da Parte 07 e eliminam integração contínua. Não integra todo o intervalo
de suspensão. Finalizar congela a série; descartar apaga seus buffers. O timer de
velocidade existe somente durante prévia GPS ativa ou sessão em andamento e é
liberado ao pausar/finalizar/desconectar. Nenhum novo listener nativo foi adicionado.

Distância e média continuam calculadas com GPS e tempo ativo. A máxima consolidada
usa `reliableSpeed` da Parte 06 e nunca os picos inerciais. As séries originais de GPS
e movimento permanecem disponíveis separadamente.

## Persistência e privacidade

Migração aditiva `005_assisted_speed.sql`: `users.speed_mode`, padrão `assisted`, e
`rides.speed_processing` JSONB opcional. Não modifica migrações anteriores. Reutiliza
autenticação, guarda de origem/CSRF, conta e tela de configurações. PATCH
`/api/users/me/telemetry` salva somente o enum `speedMode`. Login e `/api/auth/me`
retornam `telemetry.speedMode`. Perfis públicos não retornam essa configuração.

POST `/api/rides` aceita opcionalmente `speedProcessing` no mesmo fluxo transacional
e hash idempotente. Cada amostra contém tempo relativo monotônico, `gpsTimestamp`
referenciando um ponto já salvo, velocidade apresentada em m/s, fonte, estado,
motivo e parada; a versão fica no envelope. Velocidade GPS original é recuperada do
ponto referenciado, evitando duplicar a série GPS. A estimativa fica distinguível
por `source=assisted`. Não há envio contínuo ao backend.

Seleção nominal de 1 Hz, mais transições de fonte/estado/motivo/parada com timestamps
distintos; não se salva cada render ou cada evento de sensor. Máximo de 18.000
registros; ao atingir o limite, `truncated=true` e aviso no painel/resumo, preservando
os registros anteriores. O histórico temporal de fusão tem limite independente de
256 estados. O payload completo continua limitado a 32 MiB. Não há truncamento
silencioso nem crescimento indefinido.

A quantização entre os relógios não pode colocar uma amostra antes do GPS que ela
referencia: o timestamp relativo respeita esse limite causal. Ao finalizar, a série
é conferida contra os pontos efetivamente aceitos e os períodos ativos consolidados.
Registros sem referência persistível ou fora desses períodos são omitidos com
`truncated=true`; GPS e sensores originais permanecem preservados.

O servidor valida versão, enums, tipos, finitude, limites, ordem estrita, referências
GPS existentes, idade, períodos ativos, coerência fonte/estado/valor e divergência
admitida. Normaliza campos e recalcula as métricas apenas com GPS. Não considera o
cliente uma fonte certificada. O detalhe é exclusivo do proprietário, tanto para
atividade pública quanto privada. Listagens não expõem séries. GPS antigo sem o
campo continua válido; consultas retornam `speedProcessing=null`. Nenhuma publicação,
ranking ou compartilhamento automático é realizado.

## Simulações e verificações

Os testes determinísticos incluem aceleração, frenagem, intervalos irregulares,
parada, movimento lento, entradas inválidas, duplicação, ordem temporal, calibração,
perda de sensores/GPS, correção, deriva, horizonte, preferência e reinicialização.
Também verificam sessão nos três modos, pausa/retomada/descarte, memória limitada,
relógio civil alterado, API, banco real, privacidade e regressão da interface.

Série ideal de 9 s, passo de 50 ms, GPS a 1 Hz: 10→13 m/s durante 3 s com a=1 m/s²,
3 s constantes e 3 s com a=−1 m/s². Resultados calculados sobre amostras disponíveis:

| Atraso GPS | Erro absoluto máximo | Erro absoluto médio | Amostras assistidas / disponíveis |
| ---------- | -------------------- | ------------------- | --------------------------------- |
| 0 ms       | 0,012400 m/s         | 0,006638 m/s        | 181 / 181                         |
| 100 ms     | 0,100000 m/s         | 0,015915 m/s        | 179 / 179                         |
| 250 ms     | 0,250000 m/s         | 0,038342 m/s        | 176 / 176                         |
| 500 ms     | 1,450000 m/s         | 0,618421 m/s        | 0 / 171; GPS Puro                 |

Sem ruído, erro de montagem ou latência adicional do filtro da Parte 07: não são
resultados físicos nem demonstram precisão real. Atrasos altos mantêm o fallback
e podem mostrar atraso do próprio GPS. Casos são reproduzíveis no teste
`services/speed/estimator.test.ts`; o teste integrado atravessa também a filtragem
real da Parte 07. Comandos e resultados finais estão no [relatório](parte-08.md).

## Roteiro físico Android/iPhone — pendente

Nenhum modelo de telefone está homologado nesta entrega. Chrome desktop, jsdom,
GPS emulado e gesto de permissão iPhone simulado validam software, não hardware.
Testar Chrome em Android e Safari em iPhone por HTTPS. Para cada execução registrar:

| Campo                                                    | Registro a preencher |
| -------------------------------------------------------- | -------------------- |
| Modelo, SO e navegador com versão                        | Pendente             |
| Montagem fixa, orientação, permissões e calibração       | Pendente             |
| Cadência real/irregularidade GPS e sensores, latências   | Pendente             |
| GPS Puro, Assistido, fontes e motivos de fallback        | Pendente             |
| Oscilação parado, movimento lento, viés e correções      | Pendente             |
| Pausa, retomada, tela oculta/bloqueada, rotação, negação | Pendente             |
| Referência independente, erro, atraso e variabilidade    | Pendente             |

Primeiro, aparelho fixado e moto parada/vertical: autorizar, calibrar, observar
GPS Puro, assistência, oscilações e ausência de aceleração inventada. Verificar
zero validado e indisponibilidade separadamente. Verificar preferência após recarga
e que sensores negados não bloqueiam mapa/sessão.

Depois, trajeto de baixa velocidade, seguro e legalmente permitido, aparelho bem
fixado, sem interação durante condução, sem aceleração brusca, frenagem de emergência
ou busca de máxima. Definir o modo antes de conduzir. Comparar séries com referência
independente confiável quando disponível; não considerar velocímetro da moto uma
referência exata. Registrar sinais e versão, ausência de dados, instantes de correção,
erro e atraso observados. Validar movimento lento, vibração e curvas para garantir
que a assistência suspenda adequadamente quando necessário.

Sem referência independente, registrar comportamento e limitações sem declarar
melhora de precisão. Montagem que se move lentamente, ruído persistente e compensação
imperfeita de gravidade pelo SO podem escapar aos filtros. Se assistência piorar o
resultado, usar GPS Puro. Não garantir execução com tela bloqueada ou frequência
mínima de sensores. Homologar cada conjunto de aparelho/navegador/condição somente
após evidências suficientes; não generalizar melhora para todos os celulares.
