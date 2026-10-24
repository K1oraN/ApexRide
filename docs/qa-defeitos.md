# Registro central de defeitos, riscos e bloqueios

23/10/2026. P0/P1 não são reduzidos para obter aprovação. **NO-GO** enquanto os
bloqueios de evidência física e operação não forem resolvidos e revistos.
Não foi confirmado P0 novo nos cenários executados; isso não atesta ausência
de vulnerabilidades. Os itens abaixo incluem defeitos reproduzidos e riscos
operacionais explicitamente diferenciados.

## Correções realizadas

### QA-01 — P1 — Origens HTTP aceitas na configuração de produção

- Módulo/arquivos: `apps/api/src/config/env.ts`, `test/env.test.ts`.
- Reprodução: chamar `parseEnv` com configuração produtiva válida e
  `CORS_ORIGINS=http://apex.example` ou lista mista HTTPS/HTTP.
- Esperado: rejeitar origem insegura antes de iniciar. Observado: era aceita.
- Causa: validação restringia protocolo/formato e curingas, sem exigir HTTPS
  nas origens CORS quando `NODE_ENV=production`.
- Solução mínima: exigir HTTPS nesse modo; desenvolvimento local permanece
  permitido. Não foi alterado domínio nem proxy real.
- Regressão: configuração HTTPS válida, HTTP e lista mista recusados; suíte env
  e `check` executados. Estado: **corrigido e testado**.

### QA-02 — P2 — Erros sem identificador utilizável pelo cliente

- Módulo/arquivos: `apps/api/src/app.ts`, `test/health.test.ts`.
- Reprodução: requisitar rota inexistente/erro interno; não havia cabeçalho de
  correlação para o suporte nem código consistente no handler central.
- Esperado: identificar requisição sem revelar stack, token ou conexão.
- Causa: logs tinham ID interno, mas respostas não o disponibilizavam.
- Solução: UUID gerado pelo servidor, `X-Request-Id` exposto pelo CORS e headers
  `no-store`, `nosniff`, `no-referrer` desde a entrada. Handler central e 404
  recebem código `HTTP_<status>`, preservando status/mensagem dos contratos.
- Regressão: ID externo forjado ignorado, IDs distintos, 404 seguro e erro 500
  sem segredo; Chrome verifica headers do preview/API. Respostas explícitas
  legadas não foram reescritas em massa. Estado: **corrigido no escopo descrito**.

### QA-03 — P1 — Telemetria fictícia na Home

- Módulo/arquivos: `pages/HomePage.tsx`, `components/telemetry/Metrics.tsx`,
  `components/maps/IllustrativeMap.tsx`, `e2e/interface.spec.ts`.
- Reprodução: abrir Início sem atividade: velocímetro, média/máxima, curva,
  frenagem, tempo e distância vinham de `demoTelemetry`.
- Esperado: não representar números fictícios como medições do motociclista.
- Causa: trecho visual remanescente da Parte 02 ainda era usado na Home.
- Solução: mostrar dados indisponíveis e “Inicie um Ride”, sem mudar componentes,
  cores, proporções ou cinco abas. Mapa estático passa a mostrar “Mapa ilustrativo”.
  Histórico real continua no componente existente; não foi criada outra fonte.
- Regressão: Chrome confirma velocímetro indisponível, inclinação indisponível,
  mapa identificado e cinco links; responsividade em sete larguras.
- Estado: **corrigido e testado**. Recursos visuais ilustrativos não são conteúdo
  da comunidade e mantêm identificação/procedência.

### QA-04 — P3 — Textos históricos/inválidos da interface

- Arquivos: `components/Layout.tsx`, `App.tsx`, `e2e/interface.spec.ts`.
- Reprodução: aviso global tratava módulos reais como futuros; carregamento de
  administração tinha `administra??o?`.
- Solução: “Pré-lançamento · homologação pendente” e português corrigido no fallback.
- Regressão: tipos/build e navegação/interface Chrome. Estado: **corrigido**.

### QA-05 — P2 — Corrida na verificação E2E de cancelamento de evento

- Arquivo: `apps/web/e2e/events.spec.ts`.
- Reprodução: confirmar cancelamento e recarregar imediatamente a segunda conta,
  sem aguardar a resposta da primeira; status anterior podia ser lido legitimamente.
- Esperado: conferir propagação após o servidor confirmar a operação.
- Causa: o teste confundia clique com conclusão da escrita assíncrona.
- Solução: armar espera da resposta POST `/cancel`, confirmar HTTP 200 e só então
  recarregar. Mantida a verificação de GPS social negado após cancelamento.
- Regressão: repetir arquivo de eventos isolado; resultado no relatório.
- Estado: **corrigido no teste**; não foi inferida uma falha de produto desse caso.

### QA-06 — P2 — Contenção no ambiente de regressão

- Evidência: primeira rodada PG teve 360 aprovações e cinco timeouts de teste
  (dois de similaridade, três sociais), com limite de 5 s. Rodadas independentes
  de navegador/recuperação disputaram o mesmo servidor durante parte da execução.
- Diagnóstico: atividades SQL observadas aguardavam WAL/IO; checkpoint local
  chegou a sincronizar 73.248 arquivos e durar aproximadamente 405 s. Isso é
  evidência do host local, não resultado de carga produtiva.
- Solução de execução: repetir suítes afetadas sem outras rodadas de banco em
  paralelo. Não ampliar timeouts de consulta, não retirar assertions nem mudar
  cálculo para mascarar falhas. Estado final e repetições no relatório.
- Arquivos de produto: nenhum modificado por esse diagnóstico.

## Correções adicionais do fechamento

### QA-07 — P2 — E2E de cargo/remoção de membro antecipava a persistência

- Arquivo: `apps/web/e2e/groups.spec.ts`.
- Reprodução: a verificação de “Moderador” encontrava o texto de uma opção do
  seletor antes de a escrita terminar; a outra conta recarregava com cargo antigo.
- Solução: conferir o parágrafo de cargo retornado pelo servidor, sem aceitar
  texto da opção; na remoção, aguardar resposta DELETE 200 antes de recarregar.
- Regressão: três cenários de grupos aprovados isoladamente, incluindo convite
  que havia sido ignorado após a primeira falha da suíte serial.
- Estado: **corrigido no teste**; as verificações negativas foram preservadas.

### QA-08 — P1 — Checksum de migração dependia de CRLF/LF

- Arquivos: `apps/api/src/migrate.ts`, `test/migrate.test.ts`,
  `test/recovery-runner.ts`, documentação de migrações.
- Reprodução: checksum SHA-256 de `001_auth.sql` aplicado com CRLF divergia do
  mesmo SQL após o Git normalizar para LF. Um clone poderia rejeitar o banco
  já migrado como se o SQL tivesse sido modificado.
- Esperado: aceitar finais de linha equivalentes e rejeitar conteúdo alterado.
- Causa: hash diretamente sobre bytes dependentes do sistema/check-out.
- Solução: armazenar hash LF e reconhecer recibos legados do mesmo SQL em CRLF,
  normalizando apenas o recibo na transação. Não reexecuta SQL aplicado nem muda
  `applied_at`; alteração real de conteúdo continua rejeitada.
- Regressão: três testes unitários (LF, CRLF e adulteração/rollback) e ensaio
  PostgreSQL real que altera um recibo sintético para CRLF, verifica normalização
  e depois verifica rejeição de checksum adulterado. Restauração repetida.
- Estado: **corrigido e testado**. Nenhum SQL aplicado foi reescrito.

### QA-09 — P2 — Vite sobrescrevia no-store do HTML administrativo

- Arquivos: `apps/web/vite.config.ts`, `e2e/qa.spec.ts`.
- Reprodução: GET `/admin` no preview recebia `Cache-Control: no-cache`, apesar
  de o middleware anterior definir `private, no-store`.
- Causa: handler final de HTML do Vite substituía o cabeçalho do middleware.
- Solução: definir `preview.headers` com `no-store`, respeitado pelo handler
  final. CSP e demais headers administrativos foram preservados. Isso prepara
  o preview local; a hospedagem produtiva ainda deve reproduzir a política.
- Regressão: QA Chrome aprovado com CSP/frame-ancestors, no-store administrativo,
  headers de API e correlação. Estado: **corrigido e testado**.

## Bloqueios operacionais e de evidência

| ID    | Prioridade / natureza                | Evidência / consequência                                                                                          | Condição para fechar                                                          | Estado                      |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- |
| BL-01 | P1 — evidência essencial             | Sem Android/iPhone reais; GPS, sensores, câmera, interrupções e quota não homologados                             | Executar matriz física, definir compatibilidade mínima e registrar resultados | Aberto, bloqueia GO         |
| BL-02 | P1 — operação / recuperação          | Só ensaio sintético local; política/backup remoto, RPO/RTO e rollback operacional não comprovados                 | Configurar, ensaiar e aprovar com responsáveis e volume representativo        | Aberto, bloqueia GO         |
| BL-03 | P1 — configuração operacional        | HTTPS/proxy/cookies/SMTP/volume/chave e monitoramento produtivos não verificados                                  | Homologar infraestrutura, alertas e recuperação de acesso                     | Aberto, bloqueia GO         |
| BL-04 | P1 — preparação jurídica/operacional | Documentos preliminares e regras de retenção/titulares/menores ainda dependem de aprovação                        | Revisar políticas, prazos e responsáveis; testar fluxo aplicável              | Aberto, bloqueia publicação |
| BL-05 | P2 — integração externa              | Sem homologação do OSRM/mapas para volume/domínio produtivos                                                      | Configurar e validar ou limitar publicamente recursos afetados                | Aberto                      |
| BL-06 | P2 — acessibilidade/visual           | Sem referências originais nesta rodada; sem auditoria TalkBack/VoiceOver/contraste completa                       | Revisão visual controlada e auditoria assistiva; corrigir achados             | Aberto                      |
| BL-07 | P2 — performance                     | Chunk GPS/MapLibre acima de 500 kB; sem LCP/INP/CLS de campo, carga real ou consumo móvel                         | Medir dispositivos/carga alvo e aprovar orçamentos                            | Aberto                      |
| BL-08 | P2 — segurança independente          | Regressões não equivalem a pentest; retenção/arquivo e recuperação administrativa exigem operação                 | Revisão independente e ensaios de revogação/recuperação                       | Aberto                      |
| BL-09 | P2 — dados legados                   | Migrações novas/reaplicadas/restauradas verificadas; upgrades de todas as bases antigas/IndexedDB não reencenados | Ensaiar com fixtures de versões anteriores sem dados pessoais reais           | Aberto                      |

Os riscos podem ser avaliados por recurso; nenhum aceite implícito foi registrado.
P1 de privacidade/integridade não pode ser tratado apenas como aviso cosmético.
O proprietário deve designar responsáveis e prazos; não foram inventados nomes,
datas de resolução, aceites de risco ou autorização de publicação.
