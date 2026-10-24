# Autenticação, perfis e privacidade — Parte 03

## Atualização — refinamento, Etapa 1

A raiz agora é pública e o painel começa em `/app`. As cinco abas e demais
páginas internas exigem sessão antes de montar o layout. Login e cadastro usam
telas independentes do aplicativo; o cadastro inicial não solicita cidade/UF.
O endpoint de login mantém `{ email, password }` e aceita, em `email`, o endereço
ou username (sem diferenciar maiúsculas). Erros de credenciais são genéricos.
O retorno validado preserva query/fragmento e rejeita destinos externos.
Username e e-mail compartilham o limite de tentativas da conta. A configuração
pública informa `passwordRecoveryAvailable`; sem SMTP habilitado, a tela de
recuperação avisa que o envio está indisponível e não simula e-mail externo.

Após recarga, perfil em cache não autoriza acesso: `/auth/me` precisa confirmar
a sessão. Falhas temporárias mantêm os dados locais e oferecem nova tentativa;
401/logout retiram acesso sem excluir atividades/vídeos. Recuperação e SMTP
mantêm os contratos reais abaixo. Veja [relatório da Etapa 1](refinamento/etapa1-acesso.md).
O restante deste manual preserva o histórico e os contratos da Parte 03.

## Executar

1. Configure PostgreSQL conforme `.env.example`, mantendo `.env` fora do Git.
2. Suba o banco e execute `pnpm db:migrate` na raiz.
3. Execute `pnpm dev`, usando a origem definida em `AUTH_WEB_ORIGIN`.
4. Abra `/cadastro`, crie a conta e entre em `/entrar`.

O frontend usa `/api` com cookies e proxy Vite no desenvolvimento/preview.
Na hospedagem futura, prefira frontend e API na mesma origem HTTPS. Origens
separadas devem ser permitidas explicitamente em `CORS_ORIGINS`, enviar
credenciais e permanecer compatíveis com cookies SameSite=Lax. Não há wildcard
nem desativação da validação TLS do PostgreSQL/SMTP.

## Banco e migrações

| Tabela              | Finalidade e restrições                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `users`             | UUID, nome, username, e-mail normalizado, hash Argon2id, estado ativo/desativado, datas, verificação e versões/data de aceite |
| `profiles`          | UUID, FK única de usuário, biografia, cidade, UF e referência opcional para avatar futuro                                     |
| `privacy_settings`  | FK/PK de usuário, perfil e atividades futuras públicos inicialmente                                                           |
| `user_sessions`     | UUID, FK, SHA-256 do segredo, expiração, revogação, criação e último uso                                                      |
| `account_tokens`    | UUID, FK, propósito restrito, SHA-256 do segredo, validade e uso único                                                        |
| `auth_rate_limits`  | Chave SHA-256 de categoria/IP ou identidade, tentativas e expiração                                                           |
| `schema_migrations` | Criada pelo executor; versão, checksum e aplicação                                                                            |

`001_auth.sql` adiciona índices únicos em `lower(username)` e `lower(email)`,
além de índices de segredo, usuário e expiração. Perfis e preferências têm
integridade referencial e unicidade por proprietário. Nenhuma tabela de módulos
futuros foi criada. A migração não exclui dados anteriores nem modifica PostGIS.

O executor aplica SQL em ordem lexical, numa transação com advisory lock.
Reexecução não repete SQL. Checksum divergente impede aplicação: crie uma nova
migração para evoluir o esquema; não edite migrações aplicadas. O servidor não
migra automaticamente na inicialização.

Username é persistido em minúsculas: 3–30 letras ASCII, números ou sublinhado.
E-mail é aparado e convertido em minúsculas; pontos e sufixos `+` são preservados.
Nome aceita 2–60 letras Unicode, marcas, números e pontuação simples de nomes.
Bio: 300 caracteres; cidade: 80; UF: lista brasileira. Cidade/UF são opcionais.

## Endpoints

Respostas de conta usam `Cache-Control: no-store`. Sucessos: `status: ok`;
erros: `status: error` e `message`, sem detalhes internos.

| Método e rota                    | Acesso e conteúdo                                                             |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/auth/config`           | Público: versões/links jurídicos e política de verificação                    |
| `POST /api/auth/register`        | Público: cria usuário, perfil e preferências atomicamente; 201                |
| `POST /api/auth/login`           | Público: valida credenciais; cookie, usuário e CSRF                           |
| `GET /api/auth/me`               | Sessão: usuário próprio e CSRF para restauração                               |
| `POST /api/auth/logout`          | Sessão + CSRF: revoga sessão atual e limpa cookie                             |
| `POST /api/auth/password/forgot` | Público: recuperação com resposta genérica 202                                |
| `POST /api/auth/password/reset`  | Público: token + nova senha; revoga sessões                                   |
| `POST /api/auth/email/resend`    | Público: reenvio genérico 202 para conta elegível                             |
| `POST /api/auth/email/verify`    | Público: confirma token exclusivo de e-mail                                   |
| `GET /api/users/me`              | Sessão: mesmos dados próprios da restauração                                  |
| `PATCH /api/users/me`            | Sessão + CSRF: nome, username, biografia, cidade e UF                         |
| `PATCH /api/users/me/password`   | Sessão + CSRF + senha atual: troca senha e encerra todas as sessões           |
| `GET /api/users/me/privacy`      | Sessão: preferências próprias e localização ao vivo desativada                |
| `PATCH /api/users/me/privacy`    | Sessão + CSRF: visibilidades do perfil e atividades futuras                   |
| `GET /api/users/:username`       | Público: campos permitidos de perfil público; privado/inexistente retorna 404 |

Todos os POST/PATCH exigem `X-Apex-Request: 1`, incluindo login/recuperação.
Escritas autenticadas também exigem `X-CSRF-Token`, obtido de login ou `/me`.
Clientes precisam de cookie jar e desses cabeçalhos. Origens enviadas devem
pertencer à lista configurada. Códigos: 400 validação, 401 sessão/credenciais,
403 origem/CSRF, 404 indisponível, 409 conflito, 429 limite e 500 erro interno.

Campos inesperados são rejeitados. Um ID enviado pelo cliente nunca determina
o proprietário. Não há lista pública de usuários nem rotas administrativas.
`/api/health` e `/api/health/db` preservam os contratos da Parte 01.

## Cadastro e aceite

O frontend valida os campos, confirmação da senha e aceite; o servidor valida
novamente e exige as versões jurídicas correntes. Confirmação da senha não é
enviada nem armazenada. Após criar a conta, o usuário é orientado a entrar.

`AUTH_REQUIRE_EMAIL_VERIFICATION=false` permite login imediato, mantendo
`emailVerified=false` até confirmação. Com `true`, cadastro envia confirmação
e login usa erro genérico até verificação. Reenvio e confirmação foram testados.
Tokens de confirmação e recuperação não podem ser utilizados entre propósitos.

Não foram inventados documentos jurídicos. `prelaunch-draft` registra ciência
preliminar somente para testes, com aviso e página `/documentos`. Antes de
publicar, o responsável deve fornecer e revisar Termos de Uso/Política de
Privacidade, definir versões e publicar seus links. Produção recusa versões
preliminares e exige URLs HTTPS configuradas. Checkbox não implica conformidade
à LGPD.

## Senhas, sessões e proteção

- Senhas de 15–128 caracteres, sem composição arbitrária; espaços/Unicode
  preservados, sem trim ou truncamento.
- Argon2id assíncrono nativo do Node 24, formato PHC: 64 MiB, 3 passagens,
  paralelismo 1, salt aleatório de 16 bytes e resultado de 32 bytes. Medir esses
  parâmetros novamente na infraestrutura de publicação.
- Login inexistente também executa Argon2id para reduzir diferenças observáveis.
- Sessão: 32 bytes aleatórios em base64url; somente SHA-256 no banco. Login
  emite nova sessão e revoga a anterior enviada pelo mesmo navegador. Outros
  dispositivos permanecem ativos até logout, expiração ou alteração de senha.
- Cookie HttpOnly, Path=/, SameSite=Lax, Secure em HTTPS. Produção utiliza
  `__Host-apex_session`, sem Domain. HTTP local utiliza `apex_session`.
- Expiração absoluta: 168 horas, configurável de 1–720. Último uso atualizado
  no máximo a cada 5 minutos. Cada chamada protegida verifica sessão no banco,
  revogação, prazo, conta ativa e política de confirmação.
- CSRF: HMAC-SHA-256 com segredo da sessão e rótulo exclusivo; comparação em
  tempo constante. Frontend guarda CSRF apenas em memória e restaura via `/me`.
  Nenhum token de autenticação vai ao localStorage.
- Logout revoga antes de retornar e limpa cookie. Troca/redefinição de senha
  revoga todas as sessões e tokens de recuperação pendentes.
- SQL parametrizado; transações/bloqueios nas operações críticas evitam uso
  concorrente de tokens e login com senha antiga após redefinição.
- Logs omitem bodies, cookies, credenciais, CSRF e query strings. Objetos de
  erros externos não são enviados ao cliente ou serializados nos logs.

Limites no PostgreSQL, compartilhados entre processos: login 30/IP e
10/endereço por 15 minutos; cadastro 8/IP por hora; recuperação/reenvio 8/IP e
3/endereço por 15 minutos; reset/verificação 15/IP por 15 minutos; troca de
senha 5/usuário por 15 minutos. Excesso por endereço em envio mantém 202 genérico;
excesso por IP retorna 429. As janelas expiram sem bloqueio permanente.
Fastify não confia em `X-Forwarded-For` por padrão. Antes de introduzir proxy,
configure somente proxies conhecidos e revise os limites operacionais.

## Recuperação e SMTP

Tokens têm segredo de 32 bytes, hash persistido, prazo de 30 minutos e uso único.
Nova emissão invalida tokens anteriores do mesmo propósito. Links usam
fragmento `#token=...`, retirado do histórico pela tela após leitura. O segredo
não vai na query string, logs de acesso ou resposta pública. Redefinição atualiza
senha e revoga sessões atomicamente.

Recuperação/reenvio respondem antes do SMTP, evitando que a latência de entrega
revele a existência da conta. Tarefas são acompanhadas para encerramento gracioso.
Não há fila durável: interrupção forçada pode perder um envio; o usuário pode
pedir novo link. Falhas produzem evento genérico e invalidam o token correspondente.

`MAIL_MODE=test` utiliza `TestMailer` em memória, sem envio externo. A suíte
injeta esse provedor e lê a mensagem dentro do processo de testes para usar o
link real. Não há mailbox HTTP nem logs de tokens. Produção recusa esse modo.

| Variável                           | Uso                                                                  |
| ---------------------------------- | -------------------------------------------------------------------- |
| `MAIL_MODE`                        | `smtp` real; `test` exclusivamente local/testes                      |
| `MAIL_FROM`                        | Remetente autorizado pelo provedor                                   |
| `SMTP_HOST`, `SMTP_PORT`           | Servidor e porta; padrão 587                                         |
| `SMTP_SECURE`                      | `true`: TLS implícito, geralmente 465; `false`: STARTTLS obrigatório |
| `SMTP_USER`, `SMTP_PASS`           | Credenciais do backend; ambos ou nenhum conforme serviço             |
| `AUTH_WEB_ORIGIN`                  | Origem confiável dos links; HTTPS em produção                        |
| `AUTH_REQUIRE_EMAIL_VERIFICATION`  | Exigir confirmação antes do login                                    |
| `AUTH_SESSION_HOURS`               | Expiração absoluta da sessão                                         |
| `TERMS_URL`, `PRIVACY_URL`         | Documentos revisados; HTTPS em produção                              |
| `TERMS_VERSION`, `PRIVACY_VERSION` | Versões registradas no aceite                                        |

Não existe fallback de SMTP para envio fictício em produção. TLS valida
certificados. Antes do lançamento, validar entrega real, remetente/domínio,
SPF/DKIM/DMARC e links na origem definitiva. SMTP externo não foi configurado
nem testado nesta entrega. Credenciais permanecem somente no backend, sem `VITE_`.

## Perfil, privacidade e próximas integrações

O perfil próprio contém identificação e e-mail. Perfil público retorna apenas
displayName, username, biography, city, state e avatarRef (padrão nulo).
Perfil privado retorna 404 mesmo para outros usuários autenticados; proprietário
continua usando `/me`. E-mail, hashes, tokens, IDs internos e preferências nunca
são retornados no endpoint público.

Perfil/atividades futuras começam públicos. Preferências são persistidas;
nenhuma atividade é criada. Localização ao vivo é sempre `false`, sem campo
editável. Não são solicitados GPS, câmera, microfone ou contatos. E-mail é
somente leitura na interface e rejeitado em PATCH até existir alteração segura.

Avatar padrão reutiliza o componente existente; `avatar_ref` prepara integração
futura, sem upload nesta parte. Estatísticas indisponíveis aparecem com travessão
e XP com “em breve”. Garagem, conquistas, posts, grupos e ranking preservam a
composição e são exemplos identificados, sem atribuição à conta.

Na Parte 04, o backend deverá obter o proprietário da sessão validada e vincular
motocicletas por FK para `users.id`, sem confiar em userId enviado pelo cliente.
A garagem visual já existe. Nenhuma operação ou tabela de motos foi antecipada.

## Pendências antes do lançamento

Definir rotina para remover limites expirados, tokens usados/expirados e sessões
revogadas/expiradas conforme retenção aprovada; índices já existem. Limpeza de
sessão não deve remover usuários.

Acesso e correção dos campos implementados já estão em `/me`. Antes do lançamento,
definir canal de atendimento e implementar exportação/exclusão autenticadas,
confirmação apropriada, tratamento de backups/retenção e registro de solicitações,
com revisão jurídica/de privacidade. Esses mecanismos não foram simulados por
botões. Rever também HTTPS, conta PostgreSQL restrita, proxy, backups e e-mail.

Referências técnicas consultadas:

- [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- [OWASP — CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [Node.js 24 — Crypto/Argon2](https://nodejs.org/download/release/v24.18.0/docs/api/crypto.html).
- [Nodemailer — SMTP](https://nodemailer.com/smtp).
