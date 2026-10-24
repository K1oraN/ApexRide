# Sensores de movimento — Parte 07

Implementação `motion-1`, de 23/10/2026. Não há homologação física nem precisão
metrológica declarada. Não implementa GPS Assistido, velocidade inercial,
0–100/100–0, voltas, vídeo, Bluetooth, rankings ou sincronização offline.

## APIs e permissões

`MotionCapture` usa `DeviceMotionEvent` e, opcionalmente,
`DeviceOrientationEvent`. Detectar construtores não comprova hardware ou
recebimento de dados. A interface distingue autorização, espera, funcionamento,
dados insuficientes, negativa, indisponibilidade e interrupção.

Somente **Ativar Sensores**, acionado pelo usuário, inicia os pedidos. Quando
existem, ambos os métodos `requestPermission()` são chamados sincronamente no
mesmo gesto, antes de aguardar suas promessas. Negativa de movimento não é
contornada; negativa/ausência de orientação não impede coletar movimento.
Os listeners só são instalados após permissão. Respostas tardias após parar são
ignoradas. Sem métodos de permissão, receber eventos continua obrigatório.

HTTPS (ou localhost seguro) é obrigatório. A captura verifica a política de
acelerômetro quando `permissionsPolicy`/`featurePolicy` existe. O servidor web
que hospedar o app deve permitir os recursos necessários na própria origem:
`Permissions-Policy: accelerometer=(self), gyroscope=(self)`.
Magnetômetro não é obrigatório. Políticas de giroscópio/orientação bloqueadas
podem produzir campos nulos; eles impedem calibração/G, sem interromper GPS.
Não foi configurada hospedagem nem feito deploy.

Referência normativa: [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/).
Os dados são processados pelo navegador/SO e não são apresentados como dados
brutos dos chips. A implementação segue os eixos padronizados; diferenças reais
entre aparelhos/navegadores precisam ser homologadas. Nenhum Android ou iPhone
físico foi utilizado nesta entrega. Os cenários iPhone simulam o contrato de
autorização no Chrome/jsdom, não representam testes do Safari real.

## Leituras e tempo

`RawMotion` mantém sequência, horário de recepção em época, recepção monotônica,
timestamp original do evento, aceleração linear (m/s²), aceleração incluindo
gravidade (m/s²), velocidade angular (graus/s), orientação relativa/absoluta
quando disponível, intervalo informado e ângulo da tela. Campos incompletos ou
não finitos permanecem `null`. Orientação tem sua própria idade; após 1,5 s
deixa de acompanhar a amostra de movimento. Alpha ausente não impede calibração.

No giroscópio, `[beta,gamma,alpha]` corresponde às rotações em `[X,Y,Z]` do
aparelho. Os ângulos de orientação não são usados diretamente como inclinação.
Não há integração ilimitada do giroscópio. Nenhum dado ausente vira zero.

Eventos repetidos, fora de ordem, negativos, não finitos ou incompatíveis com
os relógios de recepção são rejeitados. Aceitam-se timestamps relativos à origem
de performance ou legados em época, com desvio inferior a 1,5 s. Intervalos são
calculados com `performance.now()`, em vez de confiar no `event.interval`.

Ao receber o primeiro GPS utilizável, o controlador existente cria a sessão.
Nesse momento a telemetria registra uma âncora monotônica e a diferença entre
o relógio de época e `startedAt` do GPS. `relativeMs` usa essa âncora;
ajustes posteriores do relógio civil não unem períodos separados. Na API,
`startedAt + relativeMs` precisa pertencer a um intervalo ativo. Não existe
associação artificial de sensores à posição de um ponto GPS. O timestamp original
do evento é salvo separadamente; não é coordenada geográfica.

## Montagem e calibração

Referencial destro da moto: **X para a frente, Y para a esquerda, Z para cima**.
Referencial do telefone: X para a direita da tela, Y para o topo, Z saindo da tela.
Suportam-se duas montagens, sempre rígidas, tela para cima, até 45° da horizontal:

- `top-forward`: topo do aparelho apontado à frente da moto.
- `right-forward`: borda direita apontada à frente da moto.

Não se promete suporte a posições arbitrárias ou celular em pé. A identificação
é uma seleção confirmada pelo usuário, não uma inferência baseada somente na tela.
O usuário confirma suporte sem folgas e moto parada/vertical; estabilidade dos
sensores não comprova verticalidade nem imobilidade. Se o GPS disponível indicar
mais de 1 km/h, a calibração é bloqueada.

Uma janela de três segundos aceita até uma leitura a cada 40 ms (máximo 151),
com pelo menos 40 amostras e extensão de 2,4 s. Os critérios são:

- Aceleração linear, gravidade e giroscópio completos e finitos.
- Intervalos entre amostras de até 250 ms.
- Módulo da gravidade média dentro de 0,8 m/s² de 9,80665.
- Bias linear médio de até 0,3 m/s²; cada aceleração de até 0,5 m/s².
- Velocidade angular de até 3 graus/s e desvio da gravidade até 0,35 m/s².
- Tela sem mudança; beta/gamma presentes não podem variar mais de 2°.

Falha não cria referência válida. Pode-se tentar novamente antes da atividade.
O vetor vertical normalizado vem da gravidade média estacionária. Projeta-se o
eixo de montagem no plano perpendicular à vertical, normaliza-se o vetor à frente
e calcula-se a esquerda por `cima × frente`. As três linhas formam uma base
ortonormal de transformação do aparelho para a moto. Subtrai-se o bias linear
estacionário antes de projetar a aceleração. Com tela horizontal, `top-forward`
transforma `(x,y,z)` em `(y,-x,z)`; `right-forward` em `(x,y,z)`.
Testes usam vetores conhecidos e montagem com inclinação de 30°.

A referência expira após dez minutos antes de iniciar. Troca de montagem,
retirada de confirmações, mudança do ângulo da tela, ocultação/interrupção de
sinal e velocidade angular acima de 200 graus/s invalidam a calibração.
São indicadores conservadores: mudança de tela pode invalidar sem mudança física.
Movimentar o suporte suavemente com a tela travada pode ser indistinguível de
movimentar a moto; **não há detecção garantida de retirada do suporte**.
Não se recalibra nem se redefine zero automaticamente durante a sessão.
Se houver perda, o Ride continua com GPS; calibra-se antes da próxima atividade,
após parar. A validade final e os parâmetros ficam associados à atividade.

## Filtragem, G e qualidade

Só a aceleração linear fornecida pelo navegador é usada para força G. Se estiver
ausente, não se tenta remover a gravidade aparente durante curvas: G fica
indisponível. Gravidade serve para calibração estacionária. O giroscópio precisa
continuar disponível e com valores finitos. Orientação relativa é capturada,
mas não é necessária para G com montagem rígida explicitamente definida/calibrada.

O processamento usa mediana de três leituras e passa-baixas de primeira ordem
com `alpha=dt/(150+dt)`, em milissegundos. Recomeça a cada segmento, com
aquecimento de 400 ms. Sinal fora da faixa neutra de ±0,15 m/s² precisa persistir
por 200 ms. Divergência instantânea acima de 8 m/s² em relação à mediana,
aceleração total acima de 3 G, ausência de giroscópio ou valores não finitos são
rejeitados. Lacuna de 1,5 s invalida a referência e separa segmentos. Limiares são
iniciais documentados; vibrações persistentes/aliasing ainda podem afetar estimativas.
Não existe precisão percentual inventada.

`a_long = dot(aceleração_linear - bias, eixo_frente)`

`G_aceleração = max(0, a_long) / 9,80665`

`G_frenagem = max(0, -a_long) / 9,80665`

Zero é exibido somente quando o sinal é válido e representa ausência de
aceleração/frenagem. Sem dados válidos, os valores e máximos são `null` e a
interface mostra `—`. As qualidades são `limited`, `invalid`, `uncalibrated`
ou `interrupted`. `limited` significa estimativa do navegador com montagem
calibrada, não medição certificada. Máximos usam somente amostras selecionadas
válidas; o servidor os recalcula a partir da mesma série.

## Inclinação

**Inclinação dinâmica indisponível em motion-1.** Não há evidência física
suficiente para atribuir ao ângulo do telefone a inclinação real da moto durante
curvas. Aceleração lateral pode afetar a fusão do SO. Não se utiliza beta/gamma
diretamente nem se apresenta número fictício. A API rejeita inclinação numérica
nesta versão. Máximos e médias E/D permanecem `null`, inclusive na persistência.

`benchLean` verifica somente a matemática de rotação relativa de bases em
bancada (`atan2(cima_atual·esquerda_referência, cima_atual·cima_referência)`),
esquerda positiva. Testes de ±30°/zero não homologam inclinação dinâmica.
Uma versão futura homologada deverá calcular médias separadas, ponderadas pelo
tempo válido de cada lado fora de faixa neutra, sem retas, pausas ou sinal ausente.
Nenhuma média desse tipo é publicada nesta versão.

## Sessões, desempenho e persistência

Integração pelo `RideController` da Parte 06. Sensores podem ser autorizados na
preparação, mas só registram série com sessão GPS real em andamento.
Durante pausa monitoram continuidade/montagem sem registrar amostras nem atualizar
estatísticas. Retomada aguarda GPS e abre novo segmento. Finalização remove
listeners/timers e congela os dados no payload do resumo. Descarte limpa buffers;
nenhum POST ocorre antes de **Salvar atividade**. Sair da preparação encerra
sensores; navegar durante sessão preserva coleta. Logout/conta trocada interrompe
captura. Suspensão invalida referência; não há promessa de execução com tela bloqueada.

Processamento fora dos componentes. Série/interface selecionadas no máximo a cada
200 ms (até 5 Hz); somente os componentes de sensores assinam essa atualização.
Mapa e velocímetro não recebem uma renderização por evento. Não há novas
bibliotecas pesadas, workers ou mudanças no serviço GPS.

Persistem-se **estimativas filtradas selecionadas**, não eventos completos:
sequência original, tempo relativo, timestamp original, segmento, longitudinal,
G aceleração/frenagem, inclinação nula, qualidade e origem. Leituras originais
não são sobrescritas; o último `RawMotion` e a janela temporária são separados
do resultado processado. Não há histórico bruto completo em memória/banco.
Picos menores que filtros/janelas e movimentos entre seleções podem não aparecer
no máximo: ele é o máximo sustentado da série processada de até 5 Hz.

Limites: 18.000 amostras (cerca de uma hora a 5 Hz), 2.000 lacunas e no máximo
32 MiB por requisição incluindo GPS. Ao atingir buffer, o histórico de sensores
para, `truncated=true` é salvo e há aviso de histórico incompleto no painel/resumo.
GPS continua independente. Não há descarte silencioso das amostras já selecionadas.
A janela de calibração tem limite de 151 leituras; fora dela somente a última
leitura original e três valores do filtro são retidos.

Migração aditiva `004_motion.sql`: `ride_motion` (FK única da atividade,
calibração JSON, versão, estatísticas recalculadas, lacunas e incompletude) e
`ride_motion_samples` (FK em cascata, índices únicos por sequência/tempo).
Tabelas anteriores e checksums são preservados.

`POST /api/rides` recebe `motion` opcional pelo contrato existente. Valida
autenticação/CSRF/origem, propriedade da moto, base ortonormal destra, datas,
períodos ativos, números finitos, sinais, fórmula de G, sequência, segmentos,
volume e versão. Dados são normalizados antes do hash de idempotência. Série e
GPS são gravados em lotes na mesma transação. Conteúdo diferente com a mesma
chave retorna 409. Em erro, rollback remove atividade, GPS e sensores.
`GET /api/rides/:id` retorna movimento só ao proprietário; atividades antigas
retornam `motion:null`. Visibilidade pública não publica séries detalhadas.

## Homologação física pendente

Em **um Android e um iPhone**, registrar para cada execução:

| Campo                                | Registro a preencher |
| ------------------------------------ | -------------------- |
| Modelo / SO / navegador / versão     | Pendente             |
| APIs / campos presentes / permissões | Pendente             |
| Frequência observada e intervalos    | Pendente             |
| Montagem e suporte                   | Pendente             |
| Calibração / motivo de rejeição      | Pendente             |
| Métricas suportadas e limitações     | Pendente             |
| Erros / data / responsável           | Pendente             |

1. Abrir em HTTPS; verificar ausência de coleta automática e funcionamento GPS
   sem sensores, com negativa de permissão e sem eventos utilizáveis.
2. Com aparelho preso em suporte estável e moto parada/vertical, autorizar,
   confirmar condições e calibrar. Verificar estabilidade, G próximo de zero,
   ausência de máximos falsos e comportamento com pequenas vibrações.
3. Parar coleta; confirmar ausência de listeners ativos. Repetir em ambas as
   montagens e testar calibração instável, pausa, retomada, tela oculta e rotação
   da tela. Nenhuma perda pode apagar o GPS da atividade.
4. Em bancada apropriada, usar ângulos conhecidos/suporte seguro para comparar
   orientação capturada com referência independente. A função de bancada não
   ativa indicadores de inclinação na sessão de produção.
5. Validar salvar/consultar a própria atividade e descarte, inclusive falha de
   rede. Confirmar avisos de dados insuficientes/histórico incompleto.
6. Teste dinâmico fica pendente em ambiente seguro/controlado, com referência
   independente. Não testar acelerações/frenagens extremas ou manobras arriscadas.
   Testes estacionários não comprovam precisão em movimento. Manter G como
   estimativa limitada e inclinação indisponível enquanto não houver evidência.

O [relatório da Parte 07](parte-07.md) registra os comandos realmente executados.
A estrutura temporal e `longitudinal` normalizado ficam disponíveis para estudo
futuro de fusão com GPS, sem estimar velocidade nesta parte.
