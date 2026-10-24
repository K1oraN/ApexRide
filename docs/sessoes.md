# Sessões de pilotagem — Parte 06

**Interface atual, Etapa 5:** `/ride` separa preparação compacta, pilotagem e
resumo. `/ride/sessoes` reutiliza este Histórico; `/ride/circuitos` apresenta
voltas estimadas; `/ride/telemetria` recebe gráficos e eventos. Vídeo e sensores
ficam recolhidos e opcionais. Os contratos e cálculos descritos abaixo são
históricos; a persistência/recuperação evoluiu em [offline](offline.md).
Veja o [relatório atual](refinamento/etapa-05-ride-telemetria.md).

Implementação de 23/10/2026, exclusivamente Parte 06. Para usar, execute
`pnpm db:migrate`, `pnpm dev`, faça login e abra `/ride`. Cadastre uma moto na
Garagem se necessário. HTTPS é obrigatório no telefone; localhost é permitido
no computador. Não houve deploy.

## Arquitetura

| Arquivo/módulo                       | Responsabilidade                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/ride/controller.ts`    | Controlador externo ao ciclo de renderização, com estados, intervalos ativos, pontos, segmentos e envio único                            |
| `apps/web/src/ride/RideProvider.tsx` | Uma instância para toda a aplicação, assinatura React, atualização visual do relógio, aviso de fechamento e tratamento de troca de conta |
| `apps/web/src/ride/context.ts`       | Acesso ao controlador e snapshot com `useSyncExternalStore`                                                                              |
| `apps/web/src/ride/RideSummary.tsx`  | Resumo, mapa completo, escolha de visibilidade, salvamento e descarte                                                                    |
| `apps/web/src/services/rides.ts`     | Cliente autenticado dos três endpoints                                                                                                   |
| `packages/ride-core`                 | Contratos tipados e regras numéricas compartilhadas pelo navegador e API, sem dependências externas                                      |
| `apps/api/src/modules/rides`         | Validação, autorização, idempotência, cálculo de métricas e transação                                                                    |
| `database/migrations/003_rides.sql`  | Sessões e pontos geográficos                                                                                                             |

O provider fica dentro de Auth/Garage e acima das rotas. Reutiliza uma única
instância de `GpsPreview`, `GeolocationWatch`, validação da Parte 05 e o
controlador MapLibre existente. Navegar entre páginas não encerra a sessão nem
cria um segundo watch. Uma prévia sem sessão continua sendo encerrada ao sair do
Ride, preservando o comportamento anterior. Logout pausa a sessão e encerra o
GPS; os dados ficam em memória para o proprietário voltar. Outra conta não vê
o painel ou resumo dessa atividade e não pode salvá-la.

## Estados e transições

| Estado        | Ações permitidas                                                                          |
| ------------- | ----------------------------------------------------------------------------------------- |
| `preparation` | Prévia GPS opcional, escolha de moto/modo e início                                        |
| `waiting-gps` | Início ou retomada aguardando leitura nova; cancelar espera; finalizar se já havia sessão |
| `running`     | Registrar pontos, pausar ou finalizar                                                     |
| `paused`      | Retomar aguardando GPS ou finalizar                                                       |
| `finished`    | Revisar, escolher privacidade, salvar ou descartar                                        |
| `saving`      | Aguardar confirmação, bloqueando novos envios e descarte                                  |
| `saved`       | Confirmação real e preparação de novo Ride                                                |
| `discarded`   | Dados removidos; retorna à preparação                                                     |
| `error`       | Repetir preparação após falha inicial, ou repetir envio se existe resumo                  |

Entradas inválidas são ignoradas ou recebem mensagem; não existe uma segunda
sessão enquanto há uma atividade pendente. A espera de retomada ainda conta
como pausa. Negação do GPS no início leva a erro; na retomada mantém a pausa.
Cancelar uma confirmação nativa não altera o estado. Finalizar exige confirmação,
consolida dados e para GPS, sem requisição POST. Descartar também exige confirmação.

## Contrato e tempo

`RidePayload` contém `clientId` UUID aleatório, `motorcycleId`, modo
`passeio|pista|misto`, visibilidade `public|private`, `startedAt`, `endedAt`,
`intervals: [{start,end}]` e pontos ordenados. Proprietário vem da sessão
autenticada no servidor, nunca de um campo do corpo. No cliente ficam ainda
`ownerId`, a moto selecionada e o início do período ativo aberto.

Datas são timestamps Unix em milissegundos no contrato e `timestamptz` no banco.
A interface mostra a data na zona do aparelho, com formato pt-BR. Durações são
derivadas dos horários, não de segundos somados por um timer:

- Total = término − início.
- Ativo = soma dos períodos ativos fechados e do período aberto, quando presente.
- Pausado = total − ativo, incluindo a espera pela leitura de retomada.
- Valores visuais são limitados a zero ou mais. O término respeita também o
  último ponto e o último período fechado, evitando inversão após recuo do relógio.

O timer apenas solicita um novo snapshot; suspensões de JavaScript não reduzem
o tempo decorrido. Uma suspensão sem GPS não cria registros de percurso.
Uma sessão em andamento continua contando tempo ativo quando fica sem sinal;
somente pausa explícita suspende esse tempo. Mudanças manuais grandes no relógio
do dispositivo não são uma fonte de tempo confiável; o backend rejeita horários
inconsistentes ou futuros além da tolerância de cinco segundos.

## Pontos, filtros, distância e velocidade

Os limites da aquisição permanecem em `services/gps/config.ts`. As regras das
atividades são centralizadas em `packages/ride-core/index.js` (`RIDE_RULES`):

| Critério                         | Valor/regra                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Precisão horizontal aceitável    | Até 50 m                                                                                |
| Leitura desatualizada / lacuna   | 15 s                                                                                    |
| Salto incompatível               | Distância menos incertezas superior a 100 m/s × intervalo                               |
| Velocidade GPS máxima utilizável | 100 m/s, ou 360 km/h                                                                    |
| Pico de velocidade               | Variação superior a 15 m/s² entre leituras do mesmo trecho, separadas por menos de 15 s |
| Oscilação de posição             | Âncora com limiar `max(3 m, min(5 m, (precisão anterior + atual)/4))`                   |

A distância usa haversine, raio terrestre de 6.371.000 m e acumulador em metros.
A âncora não avança em pequenas oscilações; deslocamentos reais acumulados podem
ultrapassar o limiar. Não se soma distância entre segmentos. Esses limites são
heurísticas configuráveis no código, precisam de homologação física e não dão
garantia de exatidão ou de detecção de toda fraude GPS.

Pausas, perda de sinal, erros, leituras rejeitadas e ocultação da página quebram
o segmento. O primeiro ponto após uma interrupção é uma nova âncora. O backend
exige novo segmento após pausas/lacunas e verifica saltos mesmo entre segmentos,
impedindo que um número arbitrário de segmento legitime um salto instantâneo.

Velocidade atual vem exclusivamente de `coords.speed`, em m/s, convertida por
3,6. A máxima usa apenas velocidades GPS válidas e sem os picos descritos acima.
O valor original do ponto permanece armazenado, mesmo quando não contribui para
a máxima. Média = distância válida / tempo ativo; inclui paradas sem pausa.
Sem dados suficientes, mostra `—`. Velocidade nula não é substituída por uma
velocidade calculada entre pontos. Não existe acréscimo artificial de km/h,
fusão de sensores ou GPS Assistido.

## PostgreSQL e PostGIS

A migração 003 habilita PostGIS em `public`, caso necessário, e adiciona somente:

- `rides`: UUID, chave de idempotência por proprietário, hash do pedido,
  usuário/moto, modo, datas, tempos ativo/pausado, distância, velocidades,
  intervalos ativos JSONB para auditoria, visibilidade, conclusão e timestamps.
- `ride_points`: identidade, FK da atividade, ordem, `geography(Point,4326)`,
  horário original, precisão, velocidade original, direção, altitude, segmento,
  qualidade `accepted` e origem `browser-gps`.

Há índices por proprietário/data, unicidade `(owner_id,client_id)`, ordem única
dos pontos e índice espacial GiST. Usuário e moto usam `ON DELETE RESTRICT`.
O arquivamento da Garagem é preservado, mantendo sessões históricas. A cascata
dos pontos vale exclusivamente para remoção da própria sessão; não existe
endpoint de exclusão de atividades nesta parte.

Uma transação mantém o mesmo lock de proprietário usado pela Garagem, confirma
a propriedade/moto ativa, insere a sessão e grava pontos em lotes de mil. Falha
em qualquer lote desfaz tudo. Métricas enviadas pelo navegador são ignoradas:
o servidor recalcula com o núcleo compartilhado. Pontos estruturalmente
inconsistentes são rejeitados explicitamente, sem remoção silenciosa.

## API e autorização

| Endpoint                  | Resultado                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /api/rides`         | Corpo `RidePayload`; 201 com `{status,id,metrics}` após commit, 200 para repetição idêntica                             |
| `GET /api/rides?offset=0` | Até 50 atividades próprias, em ordem de início decrescente; campos resumidos, sem pontos; `offset`, `limit` na resposta |
| `GET /api/rides/:id`      | Registro e pontos ordenados somente para o proprietário                                                                 |

Todos exigem autenticação real e `Cache-Control: no-store`. POST exige CSRF e
origem autorizada. IDs inválidos ou de outro proprietário retornam 404; não há
consulta pública mesmo se a atividade estiver marcada como pública. Consultas
usam parâmetros. Logs não recebem corpo, coordenadas, cookies ou tokens.

O hash é calculado sobre um corpo normalizado. Duas requisições simultâneas
produzem um só registro. A mesma chave com outro conteúdo recebe 409. Uma
repetição confirmada funciona mesmo se a moto tiver sido arquivada depois.
Na primeira tentativa de envio o cliente congela o corpo, incluindo privacidade,
e reutiliza exatamente o mesmo payload após falha. Sucesso exige resposta do
servidor; uma conexão perdida após commit pode produzir um erro temporário
seguido de confirmação idempotente na tentativa seguinte.

A privacidade inicial respeita `user.privacy.activityVisibility`, com fallback
público. Marcar público não publica coordenadas, feeds, rankings ou rastreamento.
Uma futura divulgação de trajeto precisará proteger locais sensíveis.

## Limites de volume e falhas

POST aceita até **50.000 pontos**, **20 MiB**, **2.000 períodos ativos** e
**48 horas** de duração. A coleta encerra com mensagem ao alcançar os limites
de pontos/duração, preservando o que já foi registrado para resumo. Não há
truncamento do trajeto da sessão como ocorre na prévia limitada a 2.000 pontos.
Ao atingir o limite de períodos, o cliente mantém a pausa e oferece finalizar.
Pedido acima do limite recebe erro explícito (400 ou 413); nada é salvo
parcialmente. Para evoluir, será necessário protocolo de envio por lotes com
confirmação final e persistência local; isso não foi antecipado nesta parte.

Falha de conexão preserva todos os dados em memória e habilita tentar novamente.
Após resultado de envio desconhecido, descartar limpa apenas a cópia temporária:
uma gravação que já chegou ao servidor não é apagada. A confirmação explica essa
possibilidade. Não há fila offline, exportação ou recuperação após reload.

O aviso `beforeunload` existe durante toda atividade não confirmada. Navegadores
móveis podem ignorá-lo. Não se promete coleta em segundo plano ou tela bloqueada.
A localização do navegador pode usar outras fontes além de satélites. A região
visualizada é enviada ao provedor externo do mapa, como na Parte 05.

## Roteiro físico Android / iPhone — ainda pendente

Use Chrome no Android e Safari no iPhone, em HTTPS, com o telefone preso ou
transportado com segurança. Não é necessário pilotar.

1. Entre na conta, abra Ride e confirme a moto principal e os três modos.
2. Escolha outra moto, se houver. Selecione Passeio e toque em Iniciar Ride.
3. Autorize localização. Confirme que a atividade só começa com sinal utilizável.
4. Caminhe um trecho curto, conferindo percurso, velocidade, distância e duração.
5. Pare, pause, caminhe outro trecho e confira que tempo ativo e distância não crescem.
6. Retome e aguarde sinal. Confirme novo segmento sem linha ligando a pausa.
7. Abra Explorar e volte ao Ride. Confirme estado e uma única coleta.
8. Pare e finalize; cancele a confirmação uma vez e depois confirme.
9. Confira identificação, métricas, horários, início/fim e segmentos no resumo.
10. Escolha privado, salve e confira `GET /api/rides` e `GET /api/rides/:id` com a mesma conta.
11. Com outra conta, confirme 404 para o detalhe; repita também marcado público.
12. Repita o fluxo básico com Pista e Misto, caminhando, sem testes de alta velocidade.
13. Faça uma sessão para descartar e confira que não aparece na API.
14. Teste negar/reautorizar GPS, sinal fraco, suspensão/bloqueio e retorno. Confira
    lacunas; não espere reconstrução do trecho sem sinal.
15. Simule conexão indisponível após finalizar, tente salvar, restaure a conexão e
    repita. Verifique uma única atividade. Teste tentativa de reload com dados
    descartáveis e observe se o aparelho apresenta o aviso.

Anote dispositivo, sistema/navegador, permissões, condições de sinal, resultados
e diferenças entre percurso conhecido e estimativa. Nenhum teste físico de
pilotagem ou caminhada foi realizado nesta entrega.

## Evolução posterior

O controlador, o contrato e o processamento de métricas são separados da fonte
GPS. A Parte 07 poderá adicionar um módulo independente de sensores, com
permissões e amostras temporais próprias e migração versionada, correlacionando
dados pelo identificador da sessão. Esta parte não pede permissões de sensores,
não cria amostras inerciais e não implementa força G ou inclinação.
