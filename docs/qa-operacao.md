# Preparação operacional e recuperação — Parte 23

Data da auditoria: 23/10/2026. **Não há autorização de deploy de produção.**

## Ambiente reproduzível

Use Node 24.16.x e pnpm 10.34.7; `package.json` e `pnpm-lock.yaml` são as fontes
de versão. Instale com `pnpm install --frozen-lockfile`. Copie `.env.example`
para `.env`, configure uma senha local e a URL correspondente, sem versionar o
arquivo. O Vite só publica variáveis `VITE_`; senhas, SMTP, banco, MFA e token de
roteamento são exclusivos do servidor.

O Compose existente oferece PostgreSQL 17/PostGIS 3.6, volume persistente,
SCRAM, healthcheck e porta publicada exclusivamente em loopback. Docker não
estava disponível nesta auditoria; foi usado o PostgreSQL local já existente,
com PostGIS 3.6.2. Não foi criado outro Compose nem modificado o serviço local.

```sh
pnpm db:up
pnpm db:check
pnpm db:migrate
pnpm dev
```

Os runners PostgreSQL e Chrome criam esquemas aleatórios e arquivos sintéticos,
aplicam migrações e limpam apenas seus próprios recursos. `TEST_DATABASE_URL`
deve apontar para um **banco de homologação dedicado**, com CREATE SCHEMA, PostGIS
e sem dados de produção. Os runners antigos usam `DATABASE_URL` como fallback:
não os execute com uma conexão de produção. Execute testes de banco, navegador
e recuperação sequencialmente para evitar contenção de WAL/DDL e falsos timeouts.

```sh
pnpm check
pnpm test:postgres
pnpm --filter @apex-ride/web test:e2e
pnpm test:recovery
pnpm audit --json
```

`check` inclui tipos, lint, formatação, testes padrão e build. Os testes
PostgreSQL ignorados nessa suíte **não** são aprovações; exigem a rodada separada.
O E2E usa Chrome instalado, build estático, portas 3002/5174 e API real de teste;
mapas/hardware são simulados nos cenários indicados. Não é homologação de celular.

## Ensaio de recuperação implementado

`pnpm test:recovery` recusa `NODE_ENV=production`, hosts fora de loopback e TLS
diferente do modo local. Precisa de CREATE DATABASE e ferramentas `pg_dump` /
`pg_restore` compatíveis com o servidor; `PG_BIN_DIR` pode indicar a pasta dos
executáveis. As credenciais são passadas por ambiente, sem URL na linha de comando.

O runner cria exclusivamente bancos `qa23_source_<uuid>` e `qa23_restore_<uuid>`
com `template0`, aplica as 32 migrações, cadastra duas contas sintéticas, uma moto,
uma fotografia e um Ride privado pela API. Reaplica as migrações com dados,
faz dump custom e copia a mídia de teste. Restaura em outro banco, compara hashes
e contagens das 93 tabelas de aplicação, bytes da foto, constraints validadas,
índices válidos e SRID 4326; reaplica migrações e verifica leitura permitida ao
titular e negada à outra conta. Limpa os bancos e diretórios criados por essa
execução. Resumo sanitizado em `.local/parte23-recovery.json`.

Este ensaio não usa o banco real como origem do backup. Não valida roles/ACLs
(dump com `--no-owner --no-acl`), WAL/PITR, disaster recovery remoto, criptografia,
agendamento, retenção ou tempo de recuperação de produção. A mídia social usa o
mesmo princípio de volume privado, mas o ensaio utiliza uma foto de Garagem.

## Política de backup a aprovar antes do lançamento

| Item           | Preparação necessária                                                   | Estado                   |
| -------------- | ----------------------------------------------------------------------- | ------------------------ |
| Escopo         | Banco, mídias privadas, configurações/segredos por mecanismo separado   | Pendente em produção     |
| Frequência/RPO | Proprietário deve definir perda máxima aceitável e frequência/PITR      | Não definido             |
| RTO            | Definir prazo e testar com volume representativo em host de recuperação | Não definido             |
| Destino        | Armazenamento externo criptografado, acesso mínimo, cópia independente  | Não configurado          |
| Retenção       | Aprovar prazos e expurgo com política de dados                          | Não definida             |
| Alertas        | Falha, atraso, integridade, espaço e teste periódico de restauração     | Não configurados         |
| Mídias         | Snapshot consistente com banco; nunca expor diretório como estático     | Ensaio sintético parcial |

Para uma restauração operacional: suspender escritas/filas, preservar o estado
atual, restaurar **em um novo banco/volume**, verificar versão de PostGIS e
migrações, integridade e autorização com contas de homologação, e só então
aprovar a troca de conexão. Nunca testar restauração sobrescrevendo produção.
Cookies/sessões recuperados podem exigir revogação conforme o incidente.

## Configuração de produção

- Usar `NODE_ENV=production`, HTTPS na origem web e em todas as origens CORS
  explícitas; HTTP de produção agora é recusado pelo parser. Restringir ao domínio
  real, sem curingas. CORS não substitui sessão, CSRF e autorização por recurso.
- Cookies de produção usam `__Host-apex_session`, Secure, HttpOnly, SameSite e
  caminho raiz. Proxy e domínio precisam ser validados em homologação HTTPS.
- Banco remoto exige TLS `verify-full`, CA confiável e conta de aplicação com
  privilégios mínimos. Criar/migrar com identidade operacional separada; revisar
  privilégios exigidos pelos triggers e rotinas administrativas antes de reduzir.
- SMTP real, remetente validado, entrega/recuperação de senha e documentos finais
  precisam de teste. Valores `prelaunch-draft` são recusados em produção; alterar
  o texto da versão não comprova revisão jurídica.
- Gerar/proteger `ADMIN_MFA_KEY` no gerenciador de segredos e seguir
  [provisionamento administrativo](admin-provisionamento.md). Não existe admin
  padrão; sem chave configurada, MFA não fica operacional.
- Guardar fotos em volume privado persistente; autenticação ocorre em cada leitura.
  Vídeos, exports e atividades locais pendentes vivem no aparelho: backup do servidor
  não os recupera. Orientar cópias originais e limitações de quota/evicção.
- Configurar OSRM próprio/contratado para roteamento por vias; ausência tem fallback
  explícito de indisponibilidade, sem inventar rota. Validar provedor de mapas,
  atribuições, capacidade, disponibilidade e tratamento de dados externos.
- Não há WebSocket no GPS social atual: usa consultas autenticadas a cada 5 s,
  TTL 30 s e revogação. WSS não se aplica à implementação encontrada.

## Hospedagem, cabeçalhos e atualização

O build gera assets e `sw.js`; Vite preview é ferramenta local, não servidor
recomendado de produção. Proxy definitivo deve encaminhar `/api` ao Fastify,
servir SPA para rotas web e replicar no `/admin` CSP, `no-store`, `nosniff`,
`no-referrer` e proteção contra frames já verificadas no preview.
API recebe `X-Request-Id` gerado pelo servidor, `nosniff`, `no-referrer` e
`no-store`, inclusive em erros. O identificador permite correlacionar suporte
com logs sem publicar stack/credenciais. Erros lançados pelo handler central
incluem código `HTTP_<status>`; algumas respostas explícitas mantêm contratos
legados. Não interpretar uma mensagem humana como código de autorização.

Validar CSP da aplicação inteira em homologação com mapas, fontes, blobs, câmera
e exportação; a política do `/admin` não comprova cobertura das outras páginas.
Certificado, renovação e redirecionamento HTTPS não foram configurados.
HSTS/preload só deve ser ativado após aprovação do domínio e de seus subdomínios.

O Service Worker armazena apenas arquivos do shell da mesma origem. APIs,
fotos privadas, tiles externos e vídeos não entram nessa lista. Uma versão nova
aguarda o fechamento das abas antigas, sem `skipWaiting`; manter assets antigos
disponíveis durante atualização e não limpar IndexedDB para forçar um upgrade.

## Observabilidade e incidentes

Existem logs estruturados, redaction de cookies/Authorization/CSRF e remoção de
query string no serializador de requisição. Erros de pool e falhas de workers
produzem eventos técnicos; não registrar corpos de requisição, senhas, MFA,
tokens, coordenadas, fotografias ou vídeos. Logs também precisam de retenção e
controle de acesso; o endereço IP é metadado pessoal e deve ser tratado como tal.

`/api/health` comprova processo ativo; `/api/health/db` consulta PostGIS e retorna
503 genérico em falha. Eles não verificam automaticamente todas as migrações,
SMTP, armazenamento, fila ou domínio. O balanceador deve combinar as sondagens
com verificação de versão/migrações e dependências no procedimento de promoção.

Monitoramento contínuo, coleta central, dashboards, responsáveis e alertas ainda
não estão configurados. Antes de liberar, definir alertas para indisponibilidade,
5xx/latência, saturação do pool, idade de jobs, falhas de sincronização/storage,
backup atrasado e anomalias de acesso administrativo. Os limiares devem ser
medidos no ambiente-alvo. Não há escala de milhares de usuários comprovada.
Siga [incidentes e privacidade](admin-incidentes.md) para triagem e contenção.

## Promoção e rollback

1. Identificar commit/build imutável, versão anterior e responsáveis.
2. Executar checks e E2E em homologação separada, validar HTTPS/SMTP/mapas/mídia,
   completar testes físicos e resolver os bloqueios do relatório.
3. Criar backup consistente, testar a restauração e registrar RPO/RTO aceitos.
4. Revisar migrações e compatibilidade. As 32 migrações têm checksum e são
   transacionais; a aplicação antiga pode ser incompatível com schema novo.
5. Obter autorização explícita para a publicação. Upload ao GitHub não a substitui.
6. Executar migração/promover artefatos por procedimento aprovado; acompanhar
   erros, fila, autenticação, Ride e autorização com verificação sanitizada.
7. Em incidente, suspender escritas se houver risco de integridade; restaurar o
   binário anterior somente após validar sua compatibilidade com o schema.
   Se exigir recuperar banco/mídia, usar restauração em novo ambiente e reconciliar
   escritas ocorridas após o backup, com decisão formal sobre perda de dados.

**Rollback de aplicação/produção não foi ensaiado.** Não existem migrações down
validadas. Não apagar tabelas para retornar à versão anterior; a restauração
sintética realizada não comprova rollback completo de uma implantação.

## Políticas e responsabilidades pendentes

Revisar termos, privacidade, comunidade/moderação, conteúdo enviado, uso de
localização temporária, fotos/vídeos de terceiros, solicitações de titulares,
retenção e segurança de pilotagem. Definir canal de suporte, encarregado/contato,
responsáveis por incidentes e recuperação administrativa. Se menores forem
permitidos, analisar salvaguardas específicas antes da liberação. A auditoria
técnica e os arquivos de licença não certificam conformidade jurídica.
