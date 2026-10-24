# Telemetria avançada — Parte 09

Implementação experimental para análise pessoal. Nenhum aparelho físico foi
homologado. Resultados sintéticos validam o software, não a precisão real.

## Configuração dos modos

`packages/ride-core/modes.js` e seu contrato TypeScript são a configuração central
consumida pelo Ride, resumo, processamento e API. Os serviços existentes de GPS,
sensores, calibração e sessões continuam compartilhados.

| Recurso                                           | Passeio | Pista | Misto |
| ------------------------------------------------- | ------- | ----- | ----- |
| GPS, mapa, moto, distância, velocidades e tempos  | Sim     | Sim   | Sim   |
| GPS Assistido automático ou GPS Puro selecionável | Sim     | Sim   | Sim   |
| G longitudinal e inclinação disponível            | Ocultos | Sim   | Sim   |
| Eventos passivos, gráficos e resumo técnico       | Não     | Sim   | Sim   |
| Preparação de contratos de voltas                 | Não     | Sim   | Não   |
| Competição / publicação de desempenho             | Não     | Não   | Não   |

Misto funciona em ruas e estradas para análise pessoal. Selecionar Pista não
comprova presença em circuito fechado; competição permanece desabilitada.
Sensores continuam opcionais inclusive no GPS Assistido, que usa seu fallback
original quando necessário. Inclinação dinâmica permanece **indisponível** no
processador `motion-1`; máximas e médias E/D são desconhecidas, nunca zeros.

## Fontes e tempos

Os eventos integrados nesta versão usam **medições GPS independentes**, com o
timestamp original de cada posição. Não usam as atualizações de 10 Hz do
velocímetro como se fossem novas medições. Isso evita transformar velocidade
GPS repetida ou previsão inercial sem confirmação GPS em resolução temporal
artificial. O uso de GPS Assistido pelo velocímetro não muda essa base dos eventos.

O contrato distingue `gps-direct`, `gps-position` e `assisted`. Derivação por
posições exige intervalo curto, boa precisão e deslocamento superior às
incertezas horizontais; não comprova parada. Mudança de origem interrompe a
observação; nesta integração eventos completos exigem GPS direto. O detector
rejeita entrada assistida sem calibração; nenhuma estimativa assistida isolada
completa eventos. O gráfico assistido usa a série real `speedProcessing`,
identificada separadamente, sem alegar precisão superior ao GPS Puro.

Tempos dos eventos são epoch em ms. A duração deriva de diferenças entre esses
instantes, não de contadores React. Timestamps fora de ordem são rejeitados e
não podem recuar a referência do detector. Pausas e trocas de modo interrompem
eventos; o tempo pausado nunca é incluído numa duração válida.

## Parada e parâmetros

`STOP_RULES` centraliza os parâmetros geométricos da Parte 08, também importados
pelo estimador existente: velocidade ≤ 0,15 m/s, pelo menos 2 s de leituras
consecutivas, raio de 1 m e precisão horizontal ≤ 10 m. A confirmação GPS pura
dispensa sensores. A confirmação assistida da Parte 08 mantém sua exigência
adicional de aceleração longitudinal quieta. Um zero isolado, uma pausa manual,
uma leitura nula ou perda de sinal nunca comprovam parada.

`EVENT_RULES` contém limites configuráveis de engenharia, sujeitos à validação
física, sem significado de margem de erro experimental:

| Parâmetro                                   | Padrão                                         |
| ------------------------------------------- | ---------------------------------------------- |
| Limiar                                      | 100 / 3,6 m/s                                  |
| Histerese de rearme / reversão              | 2 / 3,6 m/s                                    |
| Intervalo máximo contínuo                   | 1.500 ms                                       |
| Intervalo máximo no cruzamento              | 1.250 ms                                       |
| Precisão horizontal admitida em movimento   | 20 m                                           |
| Variação máxima de velocidade               | 15 m/s²                                        |
| Velocidade máxima admissível                | 100 m/s, mesma regra básica existente          |
| Amostras mínimas por evento                 | 5                                              |
| Janela máxima de observação                 | 120 s                                          |
| Eventos armazenados por sessão              | 1.000, com indicação de limite                 |
| Interrupções de processamento / preferência | 2.000; exceder desabilita resultados avançados |

## Detector 0–100

Estados explícitos: aguardando parada, movimento iniciado, observação, limiar
atingido e resultado estimado/inconclusivo/rejeitado. A condição estacionária
sustentada arma uma única observação quando surge movimento. A última leitura
estacionária é a estimativa conservadora de início, com resolução limitada pela
cadência GPS; não se afirma medir o instante exato de saída.

O cruzamento ascendente de 100 usa interpolação linear entre duas medições
adjacentes elegíveis. Uma segunda medição independente em pelo menos 100 km/h
confirma o cruzamento. O fim estimado continua sendo o instante interpolado,
sem incluir o atraso dessa confirmação. A duração é fim menos início.

Sessões abaixo do limiar não recebem tempo. Reversão significativa, nova parada,
fim de sessão, pausa, troca de modo, fonte alterada ou lacuna encerram o candidato
como inconclusivo. Velocidade impossível ou tempo inconsistente geram rejeição.

## Detector 100–0

Estados explícitos: aguardando velocidade adequada, desaceleração identificada,
observação, parada detectada, parada confirmada e resultado. O rearme exige uma
leitura ≥ 102 km/h. O cruzamento descendente identificável de 100 km/h inicia o
candidato, interpolando somente pontos próximos. Oscilações pequenas ao redor de
100 não rearmam outro evento.

A conclusão exige a parada sustentada descrita acima. O fim estimado é a primeira
leitura da janela estacionária confirmada, sem acrescentar seus 2 s de confirmação.
Frenagem revertida, zero isolado, perda de sinal e pausa não produzem tempos válidos.
Distância de frenagem não foi adicionada.

## Qualidade, estatísticas e força G

Cada evento tem ID determinístico por sessão/tipo/início, intervalo, duração
opcional, estado, motivo, versão `events-1`, método `adjacent-linear-estimate`,
fontes, número de amostras, maior intervalo e resolução de apresentação. Todos
permanecem experimentais. Não há margem de erro inventada.

A interface mostra segundos inteiros quando o maior intervalo é ≥ 500 ms;
amostras mais próximas permitem décimos. A duração interna em ms preserva o
cálculo e não significa precisão física em milissegundos. Interpolação é sempre
identificada como estimativa. Só `estimated` participa da contagem e melhor
resultado pessoal; inconclusivos/rejeitados conservam motivo e duração nula.

Força G e estatísticas usam os valores processados da Parte 07. Uma passagem
linear associa amostras longitudinais `limited` / `browser-linear` ao intervalo
de cada evento, registrando pico, início/fim das amostras, calibração e qualidade.
Não usa aceleração lateral nem gravidade como aceleração longitudinal. Não há
força G sem amostras válidas. Estatísticas de G/inclinação continuam em
`ride_motion.stats`, sem cópia paralela nos novos resumos.

## Gráficos e desempenho

Gráficos SVG leves usam os painéis, tokens e cores existentes. Velocidade GPS e
assistida são séries selecionáveis distintas. G longitudinal usa sinal positivo
para aceleração e negativo para frenagem. Inclinação conserva indisponibilidade.
Eixo X usa tempo decorrido em segundos desde o início (incluindo pausas);
eixo Y informa km/h, G ou graus. Eventos marcam os intervalos observados.

Dados nulos/inválidos, segmentos diferentes e intervalos excessivos interrompem
a linha. Ausência não vira zero. A redução conserva extremos por janela, início,
fim e identidade dos segmentos, limitando cada série a 600 pontos. Dados salvos
permanecem completos dentro dos limites das Partes 06–08. No Ride os gráficos
usam as últimas 600 amostras disponíveis; o resumo usa o histórico consolidado.
Detalhes técnicos ficam recolhidos durante a atividade. Não há cronômetro,
desafio, contagem regressiva ou botão para executar manobras.

O detector processa cada posição incrementalmente em O(1), sem listener nativo
novo. Consolidação e associação com sensores ocorrem uma vez ao finalizar e na
validação da API, fora do render. Listas individuais têm páginas de 20 eventos.
Falha avançada não impede GPS/mapa; em caso de falha, resultados avançados não
consolidados ficam indisponíveis. Descarte limpa os buffers sem enviar atividade.

## API, banco e privacidade

O contrato opcional `RidePayload.telemetry` preserva clientes/atividades antigos.
`POST /api/rides` valida primeiro GPS, intervalos, sensores e série assistida.
Depois reconstrói todos os eventos e estatísticas usando o mesmo algoritmo,
rejeitando duração, qualidade, ID, fonte, resumo ou volta adulterados. Interrupções
de preferência/processamento são declarações limitadas, ordenadas e dentro da
sessão; nunca certificam o que ocorreu fisicamente. Uma interrupção registrada no
mesmo ms de uma posição já recebida aplica-se após essa posição.

Migração aditiva `006_advanced_telemetry.sql`: `rides.telemetry_summary` guarda
versão, contagens/melhores tempos, interrupções e contexto futuro de voltas;
`ride_performance_events` guarda os eventos individuais. FK com cascade impede
órfãos, chave por sessão/ID e unicidade por sessão/tipo/início impedem duplicatas;
checks validam tipo, estado, duração e intervalo. Índice cobre sessão/tempo.
Sessão, pontos, sensores, velocidade e eventos são gravados na mesma transação.
Hash normalizado e trava existentes preservam idempotência e retornam 409 para
outra requisição com a mesma chave.

Login, CSRF/origem e propriedade da moto/sessão permanecem obrigatórios. Detalhe
de atividade, coordenadas e eventos são restritos ao proprietário mesmo com
visibilidade pública. A listagem não retorna eventos. Nenhum envio ocorre antes
de Salvar. Repetir após resposta perdida confirma o mesmo salvamento.
Não há rankings, XP por velocidade ou compartilhamento automático.
Limites existentes: 32 MiB por requisição, 50.000 posições, 18.000 amostras por
série processada, 48 horas. Checar integridade de dados do navegador não certifica
sensores, trajeto ou contexto de circuito.

`LapContext` prepara ID de circuito, referência de largada/chegada e `FutureLap`
com sequência, início/fim, duração e validação. Hoje IDs são nulos e voltas vazias,
validados pela API. Reconhecimento, direção de cruzamento, qualidade GPS e
intervalos mínimos serão tratados na Parte 11.

## Validação em Android e iPhone — pendente

Nenhuma medição foi homologada para uso público. Preencher um registro por aparelho:

| Campo      | Registrar                                                        |
| ---------- | ---------------------------------------------------------------- |
| Aparelho   | Fabricante/modelo, Android/iOS, versão e navegador               |
| Permissões | HTTPS, localização, movimento/orientação, aceita/negada          |
| Montagem   | Suporte, orientação, estabilidade e calibração                   |
| Frequência | Intervalos reais GPS/sensores, interrupções, tela bloqueada      |
| Qualidade  | Precisão reportada, origem, fallback e calibração perdida        |
| Eventos    | Aceitos, inconclusivos, rejeitados, motivo e série original      |
| Referência | Equipamento/procedimento e comparação temporal autorizada        |
| Limitações | Aquecimento, bateria, background, falhas, resultados divergentes |

1. Em repouso, verificar permissões, calibração, zeros falsos e perda de GPS.
2. Validar com séries sintéticas e registros anteriores de ambiente controlado;
   confrontar tempos com equipamento de referência e conservar os dados originais.
3. Em deslocamento cotidiano permitido, observar somente funcionamento básico,
   pausas, retomada, mapas e consumo. Não executar manobras de desempenho.
4. Qualquer validação dinâmica de 0–100/100–0 deve ocorrer exclusivamente em local
   apropriado/autorizado, com equipe, procedimentos seguros e equipamento de referência.
5. Testar troca GPS Puro/Assistido, sensores negados, tela oculta/bloqueada,
   chamada, reload, falta de internet e erro de salvamento. Confirmar ausência
   de pontes em lacunas e duplicatas em nova tentativa.
6. Manter indisponível/inconclusivo/experimental onde a qualidade não sustenta
   resultado. Só revisar o estado experimental após evidências físicas.

## Preparação para Parte 10 — sem implementação offline

O payload versionado já separa GPS original, sensores, velocidade processada,
interrupções, eventos e intervalos por UUID da sessão. Uma etapa futura poderá
persistir esses contratos numa fila local transacional com versão, proprietário,
chave idempotente, estado de envio e confirmação do servidor; revalidar acesso e
reenviar o mesmo payload após reconexão. Será necessário tratar migração local,
limites, exclusão/privacidade, recuperação após reload e confirmação perdida.
Nada disso foi implementado nesta parte: buffers continuam somente em memória.
