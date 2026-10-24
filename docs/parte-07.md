# Parte 07 — Sensores, calibração e telemetria

Entrega de 23/10/2026, restrita à Parte 07. Sem deploy e sem implementação da
Parte 08. [Manual técnico e homologação física](sensores.md).

## A. Recursos implementados

Detecção, autorização explícita, captura pelas APIs do navegador compatível,
aceleração linear/com gravidade, giroscópio, orientação relativa/absoluta quando
presente, normalização de nulos, timestamps e interrupções. Calibração estacionária,
transformação de eixos, força G longitudinal estimada, qualidade e máximos da série
selecionada integrados às sessões, painel e resumo. Recepção de hardware real
em Android/iPhone continua pendente de teste físico.

## B. Principais arquivos

- `apps/web/src/services/motion/`: captura, tipos, normalização, calibração,
  processamento, telemetria e testes.
- `apps/web/src/ride/controller.ts`, `MotionPreparation.tsx`,
  `MotionForceCards.tsx`, `useMotion.ts`, `RideSummary.tsx`.
- `apps/web/src/pages/RidePage.tsx`, `styles/ride-session.css`.
- `packages/ride-core/motion.js`, `motion.d.ts`, contrato opcional em `index.d.ts`.
- `apps/api/src/modules/rides/motion-validation.ts`, `validation.ts`, `routes.ts`.
- `database/migrations/004_motion.sql` e testes de API/PostgreSQL/navegador.
- `README.md`, `docs/progresso.md`, este relatório e `docs/sensores.md`.

## C–F. Calibração e processamento

Tela para cima, até 45° da horizontal; topo ou borda direita à frente. Confirmações
de suporte fixo/moto parada e vertical. Janela de 3 s, mínimo 40 leituras/2,4 s,
com avaliação de gravidade, aceleração, giroscópio, continuidade e orientação.
Instabilidade/ausência de dados impede referência válida, sem bloquear GPS.

Eixos X frente, Y esquerda, Z cima; base ortonormal por gravidade estacionária e
eixo de montagem projetado. Mediana de três, passa-baixas de 150 ms, aquecimento de
400 ms, persistência de sinal de 200 ms e faixa neutra de 0,15 m/s².
`G=max(0,±a_long)/9,80665`. Máximos somente da série processada válida. Não há
fallback com gravidade aparente, integração de velocidade ou precisão certificada.
G depende de aceleração linear e giroscópio presentes.

Inclinação dinâmica indisponível, com máximos/médias nulos. Rotação relativa de
bancada tem testes matemáticos de sinais/zero sem habilitar indicador em produção.
A implantação dessa infraestrutura não equivale à homologação física.

## G–H. Banco e interface

Migração aditiva `004_motion.sql` aplicada ao banco local. Cria `ride_motion` e
`ride_motion_samples`, ligadas à sessão por FKs; não recria tabelas anteriores.
Contrato opcional no POST existente, validação, transação, rollback e idempotência
incluem sensores. Consultas detalhadas continuam exclusivas do proprietário.
Atividades GPS antigas continuam consultáveis.

Design Racing Tech, cards, mapa, GPS, velocímetro, ícones e navegação preservados.
Somente preparação/permissões/calibração e métricas do resumo foram acrescentadas;
os cards de G previstos receberam resultados. Atualização de sensores limitada
aos próprios componentes; mapa/velocímetro não renderizam a cada evento.
Pausas não atualizam estatísticas, retomadas separam segmentos, finalizar encerra
listeners e descartar apaga buffers sem gravar. GPS funciona sem sensores.

## I. Verificações

Comandos executados na raiz com `npx --yes pnpm@10.34.7`:

| Comando                            | Resultado                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `check`                            | TypeScript, lint, formatação, 209 testes unitários/contratos e build aprovados |
| `test:postgres`                    | 95 cenários aprovados com PostgreSQL/PostGIS reais                             |
| `--filter @apex-ride/web test:e2e` | 32 cenários aprovados no Chrome, em cinco arquivos isolados                    |
| `db:migrate`                       | Migração 004 aplicada ao banco local, preservando as anteriores                |
| `db:check`                         | PostgreSQL e PostGIS confirmados pela API local em 3001                        |

**336 cenários distintos aprovados**: 127 web, 82 API/contratos, 95 banco e
32 navegador. A suíte padrão ignora os testes que exigem banco; eles foram
executados separadamente contra o PostgreSQL real. Incluem limite de 18.000
amostras persistidas sem truncamento, rollback de falha em sensor, privacidade,
idempotência e compatibilidade com atividades GPS. Teste de limite em memória
também confirma o aviso explícito de histórico incompleto.

A regressão inicial revelou seletores de status GPS ambíguos e espera por imagens
lazy fora da tela. Os testes agora delimitam o status GPS e carregam imagens antes
das capturas completas. O executor de navegador isola cada arquivo em novo esquema,
preservando o limite de cadastro por IP da API; a proteção não foi enfraquecida.
Uma repetição concorrente com o Chrome excedeu o timeout de 5 s em um teste de
autenticação; a execução isolada final aprovou os 95 cenários em 21,10 s.
Os seis testes de Ride também foram repetidos com sucesso após o build final.
`db:check` precisou da API local iniciada, encerrada após a verificação. O build
mantém o aviso de chunk acima de 500 kB, associado ao mapa; não impediu a compilação.

Inspeção visual das capturas de preparação/calibração/resumo em
`.local/screenshots/`: sem overflow de 320 a 1440 px; a preparação calibrada
também foi testada em 320, 390, 430 e 1440 px. Android/iPhone físicos não foram
testados. Capturas de referência: `motion-calibrated-320.png`,
`ride-preparation-390.png` e `ride-summary-390.png`.

## J. Limitações

Nenhum dispositivo físico homologado; permissão iPhone simulada em Chrome/jsdom.
APIs/valores variam por navegador, SO e política de permissões. G permanece
estimativa limitada; ausência de aceleração linear/giroscópio impede cálculo.
Ruído persistente e processamento do SO podem afetar sinais. Montagem movida
lentamente não é detectável com garantia. Interrupção/tela oculta/rotação e
movimentos incompatíveis invalidam referência; não há recalibração em movimento.

Seleção até 5 Hz, 18.000 amostras e 2.000 lacunas; ao atingir limite, histórico
incompleto é informado e persistido. Máximos da série filtrada sustentada, não
máximos brutos. Dados temporários somente em memória até salvar. Inclinação
dinâmica, máximos e médias laterais indisponíveis. Homologação Android/iPhone e
precisão dinâmica pendentes conforme roteiro do manual. Análise pessoal sem desafios.

## K. Preparação para a Parte 08

`longitudinal` normalizado, sequência, versão, timestamps original/relativo e
segmentos permitem estudo futuro da relação temporal com GPS. Nenhuma fusão,
interpolação de velocidade ou GPS Assistido implementado. Parte 08 não iniciada.
