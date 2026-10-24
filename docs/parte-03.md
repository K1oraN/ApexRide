# Etapa 1 — Parte 03 de 23

Data: 23/10/2026. Sistema real de contas, sessões, perfis e privacidade.
Implementação concluída no projeto existente, sem deploy ou avanço à Parte 04.
Pendências de publicação e da extensão PostGIS estão discriminadas abaixo.

## A. Implementação

Cadastro PostgreSQL transacional, login Argon2id, sessões revogáveis com cookies,
restauração após recarga, logout, recuperação de senha, confirmação opcional de
e-mail, edição do próprio perfil, troca de senha e preferências de privacidade.
CSRF, rate limits persistentes, validação e autorização são executados no backend.
Nenhuma conta de demonstração substitui o banco real.

## B. Principais arquivos

| Arquivos                                                                 | Responsabilidade                                                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/api/src/modules/auth/routes.ts`                                    | Endpoints, autorização, sessões e transações                     |
| `apps/api/src/modules/auth/security.ts`                                  | Argon2id, aleatoriedade, hashes e CSRF                           |
| `apps/api/src/modules/auth/validation.ts`                                | Validação e erros controlados                                    |
| `apps/api/src/modules/auth/mail.ts`                                      | SMTP configurável e provedor de testes                           |
| `apps/api/src/config/env.ts`, `app.ts`, `database.ts`                    | Configuração, CORS/cookies, pool compartilhado e logs protegidos |
| `apps/api/src/migrate.ts`, `migrate-cli.ts`                              | Executor versionado/idempotente                                  |
| `database/migrations/001_auth.sql`                                       | Esquema e índices de conta                                       |
| `apps/web/src/services/auth.ts`, `auth/*`                                | Cliente HTTP, estado e proteção de páginas                       |
| `apps/web/src/pages/AuthPage.tsx`, `AccountPage.tsx`                     | Formulários de conta, perfil e privacidade                       |
| `apps/web/src/components/AccountFields.tsx`, `styles/account.css`        | Campos acessíveis e estilos nos tokens existentes                |
| `apps/web/src/App.tsx`, `components/Layout.tsx`, `components/ui.tsx`     | Rotas, identidade real e avatar padrão                           |
| `apps/web/src/pages/CommunityPage.tsx`, `HomePage.tsx`                   | Perfil real, estados legítimos e entrada nas ações pessoais      |
| `apps/api/test/auth.postgres.test.ts`                                    | Testes funcionais/de segurança com PostgreSQL real               |
| `apps/api/test/postgres-runner.ts`, `browser-runner.ts`                  | Execução e isolamento dos esquemas de testes                     |
| `apps/web/src/services/auth.test.ts`, `e2e/auth.spec.ts`                 | Cliente e fluxo real no Chrome                                   |
| `.env.example`, `README.md`, `docs/autenticacao.md`, `docs/progresso.md` | Operação, contratos, pendências e controle                       |

Dependências adicionadas com versão fixa: `@fastify/cookie` 11.1.3,
`nodemailer` 10.2.0 e `@types/nodemailer` 8.0.2. Versões anteriores não foram
alteradas. Argon2id utiliza o Node 24 já definido pelo projeto.

## C. Banco

Migração `001_auth.sql`: `users`, `profiles`, `privacy_settings`, `user_sessions`,
`account_tokens` e `auth_rate_limits`. Executor cria `schema_migrations` com
checksum. UUIDs, FKs, unicidade sem distinção de caixa e índices de usuário/expiração.
Nenhuma estrutura de módulos futuros foi criada.

Migração executada e reexecução testada com PostgreSQL 17 real. Testes usam
esquemas aleatórios temporários e os removem ao terminar, preservando o esquema
da aplicação. Não houve reset de volume ou exclusão de dados existentes.

## D. API

Todos os endpoints solicitados de `/api/auth/*` e `/api/users/*`, mais
`/api/auth/config`, `/api/auth/email/verify` e `/api/auth/email/resend`.
A [tabela completa](autenticacao.md#endpoints) documenta acesso, HTTP e cabeçalhos.
Sessão HttpOnly + CSRF para escrita autenticada; queries parametrizadas e
propriedade derivada do usuário validado.

## E. Resultados executados

| Verificação                             | Resultado                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                        | Passou em API e web                                                                                             |
| `pnpm lint`                             | Passou, sem avisos                                                                                              |
| `pnpm format:check`                     | Passou                                                                                                          |
| `pnpm test`                             | 52 passaram: 33 API/configuração e 19 frontend; 38 PostgreSQL ficam fora desta execução sem `TEST_DATABASE_URL` |
| `pnpm test:postgres`                    | 38 passaram com PostgreSQL real                                                                                 |
| `pnpm build`                            | Passou em API e web                                                                                             |
| `pnpm --filter @apex-ride/web test:e2e` | 16 passaram no Chrome com API e PostgreSQL reais                                                                |
| `pnpm db:migrate`                       | Aplicada; reexecução preserva dados                                                                             |
| `pnpm db:check`                         | Falhou: extensão PostGIS ausente no cluster local; endpoint técnico preservado                                  |

São 106 cenários aprovados entre as três suítes. Os testes PostgreSQL omitidos
na execução padrão foram executados explicitamente por `test:postgres`.

A suíte real cobre validação, unicidade, hash/persistência, cookies, restauração,
expiração, conta desativada, logout, limites IP/conta, CSRF/origem, propriedade,
edição, exposição pública/privada, padrão de atividades, localização desativada,
tokens inválidos/expirados/usados, recuperação concorrente, falha de e-mail,
resposta sem aguardar SMTP, confirmação opcional e revogação após senha nova.

No Chrome: cadastro, senha divergente, login, cookie inacessível a JavaScript,
ausência de tokens no localStorage, recarga, edição, persistência da privacidade,
consulta pública bloqueada e logout. Telas existentes: 320, 360, 375, 390, 430,
768 e 1440 px. Formulários novos: 320, 390 e 768 px; edição/privacidade também
percorridas em 320 px. Não foi utilizado dispositivo móvel físico.

Capturas inspecionadas: `.local/screenshots/parte03-cadastro-{320,390,768}.png`
e `parte03-perfil-320.png`, sem credenciais ou tokens visíveis.

## F. Interface e preservação

Login, cadastro, recuperação, redefinição, confirmação, edição e privacidade
usam API real e os tokens visuais existentes. Cabeçalho e Perfil/Comunidade
usam identificação real e avatar padrão. Áreas pessoais são protegidas;
apresentação, Explorar e prévias continuam públicas. Iniciar Ride pela home pede
login quando deslogado; Ride continua uma prévia sem gravação.

Os cinco itens de navegação foram preservados. Componentes, identidade, logo,
paleta e estilos anteriores não foram substituídos. Estatísticas pessoais não
recebem números fictícios. Garagem, conquistas, publicações, comunidades,
rankings, rotas, mapas e telemetria permanecem demonstrativos identificados.

## G. Limitações e operação local

- Configurar e validar SMTP externo, remetente e domínio. O provedor de testes
  funcionou sem expor tokens por HTTP. Não houve entrega real de e-mail.
- Fornecer/revisar Termos de Uso e Política de Privacidade definitivos. Aceite
  preliminar não representa adequação à LGPD.
- Implementar/revisar exportação, exclusão e atendimento aos direitos do titular
  antes do lançamento público, conforme o manual.
- Definir HTTPS, conta de banco restrita, proxy, backups e limpeza de expirados
  na operação final. Não houve deploy.
- Envios assíncronos não têm fila durável; reinício forçado pode exigir reenvio.
- Docker indisponível. Foi usada a instalação PostgreSQL 17 existente para
  iniciar outro cluster, restrito a loopback, na porta 55432. O serviço existente
  na porta 5432 não foi alterado. PostGIS não está instalado nesse cluster:
  a verificação completa da Parte 01 permanece pendente.

O banco de desenvolvimento foi migrado e está em
`D:\Projetos\ApexRide\.local\postgres-auth\data`, ignorado pelo Git. As credenciais
vieram do `.env` existente, sem impressão ou versionamento. O arquivo temporário
de senha do initdb foi removido. Para reiniciar/parar somente esse cluster,
preservando dados:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D 'D:\Projetos\ApexRide\.local\postgres-auth\data' -l 'D:\Projetos\ApexRide\.local\postgres-auth\server.log' -o '-p 55432 -h 127.0.0.1' -w start
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D 'D:\Projetos\ApexRide\.local\postgres-auth\data' -m fast -w stop
```

Para adotar o Compose original, primeiro pare esse cluster para liberar 55432;
então execute `pnpm db:up` e `pnpm db:migrate`. Os armazenamentos são distintos;
dados de um cluster não são automaticamente copiados para o outro.

## H. Preparação para a Parte 04

O usuário já possui UUID, perfil, sessão verificável e preferências persistidas.
O módulo futuro deverá obter o proprietário da sessão no backend e vincular
suas motocicletas por FK, sem confiar em IDs do cliente. A garagem visual
permanece provisória. Nenhum cadastro de motos, telemetria, atividade ou
comunidade real foi antecipado.
