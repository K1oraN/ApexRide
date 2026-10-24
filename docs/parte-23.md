# RELATÓRIO FINAL DE HOMOLOGAÇÃO DO APEX RIDE — VERSÃO CANDIDATA A LANÇAMENTO

**Data: 23/10/2026. Decisão: NO-GO para produção.** A conclusão desta auditoria
local não equivale à aprovação do produto para uso real. Não foram realizados
deploy, alteração de DNS, configuração de servidor remoto ou migração produtiva.
O envio autorizado ao GitHub é versionamento do código, separado da publicação
da aplicação.

## Escopo e método

Foram lidos o pedido da Parte 23, README, arquitetura, progresso, relatórios e
manuais das entregas anteriores, manifests/scripts, migrações e implementação
dos módulos. Foram preservados o monorepo, frameworks, design Racing Tech,
cinco abas e contratos de autorização. Não foram adicionadas funcionalidades
de produto, dados demonstrativos de produção ou uma sexta aba.

O repositório foi encontrado sem commits e sem remoto configurado; os arquivos
locais anteriores foram tratados como material existente do usuário. O README
foi atualizado e seu conteúdo anterior preservado em
[histórico de entregas](historico-entregas.md). A pedido do proprietário, a
licença autoral é proprietária; os termos dos componentes externos foram
preservados em `THIRD_PARTY_NOTICES.md` e `docs/licenses/`.

Evidências são proporcionais ao ambiente: testes unitários, injeção Fastify,
PostgreSQL/PostGIS reais e Chrome desktop automatizado. GPS, sensores, câmera
e mapas são controlados nos cenários descritos; não há evidência física Android
ou iPhone. Não foram copiadas bases de usuários reais para os testes.

## Resultado dos oito blocos

| Bloco               | Entrega                                                                                      | Conclusão                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 23A Inventário      | Estrutura, contratos, banco, testes e 23 partes em [matriz](qa-matriz.md)                    | Concluído no repositório local                              |
| 23B Correções       | CORS de produção, correlação/headers, telemetria fictícia da Home, textos e corrida de teste | Correções pequenas com regressão                            |
| 23C QA funcional    | Check, PG e Chrome, incluindo erro/offline/revogação                                         | Resultados e exceções abaixo                                |
| 23D Segurança       | Autorização direta entre contas, privacidade, MFA, consentimentos e auditoria                | Cobertura automatizada delimitada; sem pentest independente |
| 23E Mobile/hardware | Viewports e APIs controladas; [matriz física](qa-mobile.md)                                  | Homologação física pendente                                 |
| 23F Performance     | Build/bundles, cenários de volume e tempos locais                                            | Sem prova de escala ou experiência móvel real               |
| 23G Operação        | Ensaio de restauração e [runbook](qa-operacao.md)                                            | Infra/backup/rollback produtivos pendentes                  |
| 23H Homologação     | Defeitos, limites, jornadas, decisão e evidências                                            | Auditoria entregue; lançamento bloqueado                    |

## Ambiente e comandos

Workspace Windows, Node 24.16.0, pnpm 10.34.7, PostgreSQL local 17 e PostGIS 3.6.2.
Docker não estava disponível no PATH; Compose foi inspecionado, sem execução
nesta rodada. Dependências instaladas pelo lockfile congelado. API testada sem
portas por injeção e, no E2E, com servidor real isolado e preview do build.

| Verificação                            | Resultado                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`       | Aprovado; lockfile sem resolução nova                                                                                |
| `pnpm check`                           | Tipos, lint sem avisos, formatação, testes padrão e builds aprovados na rodada de código                             |
| Testes padrão                          | **671 aprovados: 260 API + 411 web**; 365 testes PG ignorados nessa execução e avaliados separadamente               |
| `pnpm test:postgres`                   | Fechamento: **365 aprovados em 12 suítes**. Inicial: 360 aprovados e cinco timeouts; repetição isolada: 59 aprovados |
| Chrome / Playwright                    | **80 cenários distintos aprovados**, consolidados entre rodada geral e repetições; detalhes no fechamento            |
| `pnpm test:recovery`                   | **Aprovado**: 32 migrações, 93 tabelas, uma foto e autorização pós-restauração                                       |
| `pnpm audit --json`                    | **Zero vulnerabilidades conhecidas reportadas** em 396 dependências consultadas; não é prova de ausência de falhas   |
| Formatação e checks documentais finais | Executados após fechamento dos documentos; evidência local correspondente                                            |

Logs desta etapa ficam em `.local/parte23-*` e não são enviados ao GitHub.
Resultados sanitizados e sem credenciais são transcritos neste relatório.
Repetições não devem ser somadas como cenários novos.

### Falhas iniciais e tratamento

A rodada PG inicial encontrou cinco timeouts de teste de 5 s, em similaridade
(dois) e comunidade (três). Consultas e checkpoint apresentavam espera por WAL/IO
no host local durante sobreposição de rodadas. O checkpoint observado durou
cerca de 405 s e sincronizou 73.248 arquivos. Não foi demonstrado erro de
algoritmo desses casos; eles exigiram repetição isolada. Os limites da aplicação
e as assertions foram preservados.

O E2E de evento privado recarregava a conta destinatária antes de confirmar a
resposta POST de cancelamento. A espera foi adicionada e a suíte repetida;
continuou exigindo estado cancelado e negação de GPS social. Não foi removida
a verificação de privacidade para tornar o teste verde.

## Correções verificáveis

| ID    | Prioridade | Mudança / efeito                                                                                    | Regressão                                                             |
| ----- | ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| QA-01 | P1         | Parser recusa origem HTTP/mista em CORS de produção                                                 | Env aceita HTTPS e rejeita HTTP/mista; tipos/testes                   |
| QA-02 | P2         | UUID de correlação, `X-Request-Id`, headers seguros e códigos no handler central                    | ID externo ignorado, IDs distintos, erro sem segredo e Chrome headers |
| QA-03 | P1         | Home não apresenta velocidade, G, curva, duração ou distância fictícios; mapa estático identificado | Chrome Início e sete viewports; componentes Racing Tech preservados   |
| QA-04 | P3         | Aviso de pré-lançamento e fallback administrativo em português                                      | Tipos/build/navegação                                                 |
| QA-05 | P2         | Teste espera resposta de cancelamento antes da leitura por outra conta                              | Events E2E                                                            |

Reprodução, causa, arquivos, solução e pendências completas:
[registro de defeitos](qa-defeitos.md). Não houve migração de produto nem
reescrita dos coletores, cálculo, autenticação ou sistema administrativo.

Também foram corrigidos **QA-07** (assertion de cargo/remoção no E2E de grupos), **QA-08** (checksum CRLF/LF de migrações, sem aceitar SQL adulterado) e **QA-09** (handler final do Vite sobrescrevendo no-store). Há três regressões unitárias de migração e comprovação em PostgreSQL real. Os arquivos e causas estão no registro central.

## Jornadas e integrações

| Jornada                                                | Evidência automatizada                                            | Limite da aprovação                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| 1 Conta → Garagem → Ride → Histórico                   | auth/garage/rides/history PG e E2E                                | Fluxos controlados; não uma pilotagem real                    |
| 2 Calibração → Assistido → Misto/Pista → Replay        | Motion/speed/telemetry e replay unitários/E2E                     | Hardware simulado; inclinação dinâmica indisponível           |
| 3 Offline → salvar → reabrir → sincronizar             | IndexedDB/controller/sync e offline E2E                           | Fechamento/recarga controlados; quota/evicção física pendente |
| 4 Rota → plano → Ride → comparar/similar               | Routes/comparison/similarity PG e E2E                             | OSRM externo real/certificação de circuito pendentes          |
| 5 Câmera → segmentos → playback → overlay/export       | Video/overlay unitários e E2E com frames incorporados             | Câmera controlada e Chrome desktop; codecs móveis pendentes   |
| 6 Post → foto → curtir/comentar/seguir → resumo seguro | Social PG/E2E, fotos reais sintéticas e revogação                 | Sem carga/comunidade de produção                              |
| 7 Grupo → convite/pedido → aprovação → post/moderação  | Groups PG/E2E e políticas de mídia                                | Papéis e acessos diretos testados; operação humana pendente   |
| 8 Evento → presença → mapa → Ride                      | Events PG/E2E                                                     | Presença/Ride não acionam GPS social automaticamente          |
| 9 Consentir → autorizado → revogar → interromper       | Live controller e events PG/E2E com duas contas                   | TTL/rede/suspensão simulados; transmissão física pendente     |
| 10 Ride válido → XP → conquista/nível → ranking        | Gamification PG/E2E e ledger/idempotência                         | Ranking voluntário; sem competição pública de velocidade      |
| 11 Denúncia → caso → decisão → auditoria/recurso       | Admin PG/E2E, MFA e testes de papéis                              | Recuperação e operação de equipe não homologadas              |
| 12 Dados privados → acesso de outra conta → negação    | PG auth/garage/rides/history/social/groups/events/admin; recovery | Cobertura por cenários, sem atestado universal de segurança   |

As suítes também cobrem concorrência/idempotência, exclusões/tombstones,
privacidade em resumos, revogação de ranking/compartilhamentos e rollback
transacional de ações administrativas. Banco de teste recebe fixtures
sintéticas com usuários comuns, privados, bloqueios e papéis administrativos,
sem criar uma conta administrativa padrão na aplicação.

## Segurança e privacidade

| Área          | Evidência / conclusão                                                                                     | Limitação                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Autenticação  | Senhas protegidas, cookie de sessão, origem/CSRF/rate limit, expiração/revogação em PG                    | SMTP/cookie atrás do proxy HTTPS real pendentes                |
| BOLA/IDOR     | Moto, Ride/GPS, post/foto, grupo, evento, live e administração acessados diretamente por contas distintas | Não é enumeração exaustiva de todos os estados possíveis       |
| Administração | MFA TOTP, sessão privilegiada, RBAC por ação, auditoria e bloqueio de acesso geral a GPS/vídeo            | Recuperação operacional/chave, retenção e revisão independente |
| Localização   | DTO público sem trilha bruta; GPS social exige consentimento, público, expiração/revogação e sem backlog  | Dispositivos reais e domínio produtivo pendentes               |
| SQL/entradas  | Consultas parametrizadas, allowlists e validação; transações/constraints                                  | Sem pentest independente ou fuzzing exaustivo                  |
| XSS/mídia     | Saída React escapada, teste XSS, fotos reencodificadas, autorização de mídia/no-store                     | CSP da hospedagem completa e conteúdo real não auditados       |
| SSRF/externos | Roteador configurado no servidor; cliente não escolhe host arbitrário                                     | Egress, DNS e serviço OSRM produtivos não verificados          |
| Logs/segredos | Redaction, URLs sem query nos logs de requisição, headers e correlação do servidor                        | Retenção/centralização/acesso a logs precisam de operação      |
| Dependências  | Audit sem achados conhecidos na consulta desta data                                                       | Advisory não cobre código próprio, dados ou infraestrutura     |

Não foram rotacionados segredos, impressos valores de `.env` nem incluídos
tokens ou coordenadas privadas nos relatórios. Fixtures de GPS são sintéticas.
Não foram realizadas varreduras contra produção ou serviços externos de terceiros.

## Banco e recuperação

As 32 migrações foram aplicadas em banco vazio pelo ensaio e pelas suítes,
com checksum e transação. A reaplicação com dados e no banco restaurado
preservou contagens/hashes. PostgreSQL/PostGIS, SRID 4326, índices, constraints
e autorização pós-restauração foram verificados com dados sintéticos.

No ensaio local, o dump levou **566 ms**, a restauração **1.346 ms** e a
preparação/verificação até gerar o resumo **10.325 ms**. Esses valores não
incluem o tempo de limpeza posterior, que aguardou checkpoint do host local.
Não são RPO/RTO de produção. Arquivo restaurado conferido por SHA-256 e
conteúdo de 93 tabelas, além dos bytes da foto. Não foram restaurados roles/ACLs,
backups reais, storage remoto ou WAL/PITR; a política produtiva permanece aberta.

Não se executaram migrações no banco do produto nesta etapa: os testes usaram
esquemas/bancos temporários. Não foi ensaiado rollback de aplicação em produção.
Veja [runbook](qa-operacao.md) para backup, migração, promoção e compatibilidade.

## Interface, acessibilidade e performance

Sem redesenho: cores/tokens, navegação, mapa/velocímetro e composição existentes
foram preservados. E2E de interface verifica overflow, erros, imagens e navegação
em 320/360/375/390/430/768/1440 px. Mapas e gráficos têm os rótulos existentes;
o QA adicional verifica link de salto, foco e navegação por teclado sob
preferência de movimento reduzido.

Não foi alegada conformidade integral WCAG 2.2 AA: falta auditoria assistiva,
contraste completa, teclado virtual/safe areas em aparelhos e cotejo atual com
as quatro referências originais. Capturas do build existem localmente em
`.local/screenshots`; não foram fabricadas imagens de celular real.

O build preserva aviso de chunk GPS/MapLibre acima de 500 kB: aproximadamente
**1.059 kB (288 kB gzip)**; chunk inicial aproximadamente **369 kB (112 kB gzip)**.
Não se suprimiu o aviso nem se reestruturou o bundle apenas para aprovar QA.
Orçamentos iniciais propostos para acompanhamento: JS inicial até 150 kB gzip
e mapa/GPS até 320 kB gzip; ambos dependem de confirmação no dispositivo-alvo.

Os testes existentes incluem replay de **50.000 pontos** em 50 páginas, remoção
do mapa ao sair e paginação administrativa com **3.000 contas sintéticas**.
Isso não comprova escalabilidade produtiva. O QA adicional registra tempos de
Início/Ride/Comunidade em Chrome desktop/loopback, viewport 390×844, sem
throttling e mapa simulado, em `.local/parte23-frontend-performance.json`.
Não foram medidos INP/LCP/CLS de campo, bateria, aquecimento ou carga sustentada
de produção. Não há alegação de milhares de usuários simultâneos.

## Compatibilidade e preparação operacional

**Não testado em aparelho real:** Android intermediário/superior, iPhone Safari
e PWA instalada. Edge/Firefox/Safari desktop também não foram homologados.
A [matriz mobile](qa-mobile.md) mantém esses resultados como não testados.
Instalar PWA não garante GPS/câmera em segundo plano ou armazenamento permanente.

Os healthchecks existentes diferenciam processo de consulta ao PostGIS, mas
não verificam todas as dependências/migrações. Alertas, certificados, domínio,
SMTP, armazenamento externo, volume, rotação/recuperação de segredos e rollback
precisam de preparação operacional. Não foi apresentada política escrita como
prova de adequação jurídica. Não há aceites de risco residual registrados.

## Decisão fundamentada

| Critério           | Situação para lançamento                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Ride / integridade | Código e cenários automatizados operacionais; uso real prolongado não comprovado          |
| Offline            | Recuperação/fila/sync automatizados; quota/evicção e PWA física pendentes                 |
| GPS / sensores     | Algoritmos e fallback testados por simulação; hardware não homologado                     |
| Privacidade        | Políticas negativas/positivas testadas por API; operação e revisão independente pendentes |
| Backend / banco    | Build e regressões locais; migração/recuperação sintéticas verificadas                    |
| Administração      | MFA/RBAC/auditoria automatizados; procedimentos de recuperação/operação pendentes         |
| Backup             | Ensaio local aprovado; agendamento, retenção, cópia externa e RPO/RTO pendentes           |
| Android / iPhone   | Não testado em aparelho real                                                              |
| Bloqueios          | BL-01 a BL-04 impeditivos; BL-05 a BL-09 exigem avaliação e evidências                    |

**NO-GO.** Não foi confirmado P0 novo nos cenários executados, mas existem
bloqueios P1 de compatibilidade essencial, recuperação/operação e preparação
jurídica. Não há evidência suficiente para recomendar GO ou CONDITIONAL GO.
Resolver os bloqueios, executar a matriz física e operacional, revisar os
resultados e obter aceite explícito dos responsáveis antes de nova decisão.
Mesmo um futuro GO exigirá autorização separada para deploy.

## Fechamento das execuções

- Fechamento PG no código final: **365/365 aprovados**, 12 suítes; rodada anterior isolada social/similaridade: 59/59.
- Chrome geral: **74 aprovados, dois falharam e um não executado** após a falha da suíte serial de grupos. Eventos repetidos: 4/4; grupos repetidos: 3/3; QA adicional final: 3/3. Total **80 cenários distintos aprovados**, sem somar repetições.
- QA adicional detectou no-store sobrescrito pelo Vite; a primeira execução teve dois aprovados/uma falha. Após corrigir preview.headers, os três passaram.
- Tipos/lint/formatação/testes/build finais: **671 testes padrão aprovados**, sendo 260 API e 411 web; testes PG executados separadamente.
- Recuperação final: **32 migrações, 93 tabelas, uma foto**, recibo CRLF normalizado e checksum adulterado recusado. Execução e limpeza concluídas com código zero.
- Regressão offline após corrigir os headers de preview: **3/3 aprovados**, incluindo shell offline, recuperação e sincronização sem duplicatas.
- **1.116 cenários automatizados distintos aprovados** (671 padrão + 365 PG + 80 Chrome), além das verificações do runner de recuperação. Não inclui teste físico.
- Capturas Início 390/1440 px e Ride 320 px inspecionadas visualmente; não houve cotejo com as referências originais indisponíveis. Chrome desktop instalado: **155.0.8059.85**.

Evidências sanitizadas: [recuperação](qa-evidence/recovery.json), [tempos frontend](qa-evidence/frontend-performance.json), [consulta de dependências](qa-evidence/dependency-audit.json). Logs de execução privados continuam em .local/parte23-*.

Última medição de DOMContentLoaded: Início 114 ms, Ride 108 ms e Comunidade 45 ms; FCP do Início não disponível nessa amostra, Ride 488 ms e Comunidade 88 ms. São amostras locais únicas, sem orçamento de experiência móvel comprovado.

As falhas iniciais permanecem documentadas. Aprovações consolidadas não representam ausência de defeitos nem autorização de lançamento.
