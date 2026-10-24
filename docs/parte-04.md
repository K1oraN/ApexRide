# Etapa 1 — Parte 04 de 23

Data: 23/10/2026. Módulo de Garagem implementado no monorepositório existente.
Sem deploy ou implementação da Parte 05.

## A. Funcionalidades

Cadastro, listagem real, detalhes, edição, fotos opcionais com envio/substituição/
remoção, definição de principal, exclusão confirmada por arquivamento e estado
vazio. A seção Minha Garagem do perfil mostra as mesmas motos persistidas.
Dados, principal e preferências de privacidade usam PostgreSQL real.

Sessão e CSRF da Parte 03 são reutilizados. Propriedade é validada em todas
as operações pessoais. Fotos públicas acompanham imediatamente a visibilidade
do perfil; fotos privadas só são lidas pelo proprietário autenticado.

## B. Principais arquivos

| Caminho                                                                   | Finalidade                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `database/migrations/002_motorcycles.sql`                                 | Tabelas, FKs, validações e índices                                   |
| `apps/api/src/modules/motorcycles/routes.ts`                              | API, propriedade, transações e principal                             |
| `apps/api/src/modules/motorcycles/validation.ts`                          | Validação de campos, UUID e limite de upload                         |
| `apps/api/src/modules/motorcycles/photos.ts`                              | Sanitização, adaptador local e limpeza durável                       |
| `apps/api/src/modules/auth/session.ts`                                    | Auxiliares existentes de sessão e CSRF extraídos para uso comum      |
| `apps/api/src/modules/auth/routes.ts`                                     | Reutiliza auxiliares sem mudar contratos de conta                    |
| `apps/api/src/app.ts`, `config/env.ts`                                    | Registro do módulo, CORS DELETE e diretório privado configurável     |
| `apps/web/src/pages/GaragePage.tsx`                                       | Listagem, detalhes, cadastro, edição e confirmação de exclusão       |
| `apps/web/src/garage/*`                                                   | Estado compartilhado, cards, fotos e seção do perfil                 |
| `apps/web/src/services/motorcycles.ts`, `services/auth.ts`                | Serviço real e envio binário pela sessão existente                   |
| `apps/web/src/App.tsx`, `pages/CommunityPage.tsx`                         | Rotas protegidas e integração ao perfil                              |
| `apps/web/src/styles/garage.css`, `styles/account.css`                    | Estilos derivados dos tokens e correção de overflow com nomes longos |
| `apps/api/test/motorcycles.postgres.test.ts`, `motorcycle-photos.test.ts` | Banco, segurança, concorrência, imagens e armazenamento              |
| `apps/web/e2e/garage.spec.ts`, `src/services/motorcycles.test.ts`         | Chrome real, mobile, rede e cliente HTTP                             |
| `apps/api/test/postgres-runner.ts`, `browser-runner.ts`                   | Execução isolada de banco e diretório de imagens                     |
| `.env.example`, `README.md`, `docs/garagem.md`, `docs/progresso.md`       | Configuração, operação e controle de entrega                         |

Dependência nova: `sharp` 0.35.5, fixada no manifesto e lockfile. Não houve troca
de biblioteca visual, autenticação ou estrutura do monorepositório.

## C. Banco

`002_motorcycles.sql`: `motorcycles` referenciando `users`, índice por proprietário
ativo e índice único parcial de principal. `motorcycle_photo_cleanup` registra
arquivos pendentes; os binários ficam no filesystem. Migração aplicada no
PostgreSQL 17 local existente, sem reset de dados. Reexecução idempotente também
é coberta pela suíte real. A migração `001_auth.sql` foi preservada.

Escritas usam transação e lock do proprietário; cadastros/trocas simultâneos não
geram duas principais. Excluir arquiva os dados e promove uma substituta; os
IDs permanecem disponíveis para referências históricas futuras.

## D. API

Implementados os oito endpoints solicitados de cadastro/consulta/edição/
exclusão/principal/fotos, mais `GET /api/motorcycles/:id/photo`,
`GET /api/motorcycles/primary` e `GET /api/users/:username/motorcycles`.
A [tabela de contratos](garagem.md#api) documenta método, acesso e comportamento.
URLs físicas, referências de arquivo, e-mails e segredos não são expostos no DTO.

## E. Fotografias

JPEG/PNG/WebP de até 5 MiB, assinatura verificada e conteúdo decodificado,
limite de 40 MP, orientação corrigida, redução a até 1600 × 1600 e WebP
qualidade 82. EXIF/GPS, XMP, ICC e dados adicionais são descartados.
SVG, HEIC sem conversão, imagens inválidas e animações são rejeitados.

Diretório privado persistente `.local/motorcycle-photos`, configurável por
`MOTORCYCLE_STORAGE_DIR`. Leitura passa pelo backend com privacidade atual e
`no-store`. A fila no PostgreSQL retenta exclusões físicas e recolhe uploads
interrompidos; fotos antigas são preservadas caso uma substituição falhe.
`PhotoStorage` permite adicionar adaptador de objetos privado futuramente.

## F. Validação executada

| Verificação                             | Resultado                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm check`                            | Passou: TypeScript API/web, lint sem avisos, formatação, testes e builds      |
| `pnpm test` (dentro de check)           | 63 passaram: 41 API e 22 frontend; testes PostgreSQL executados separadamente |
| `pnpm test:postgres`                    | 79 passaram: 38 de autenticação e 41 de Garagem, PostgreSQL real              |
| `pnpm --filter @apex-ride/web test:e2e` | 19 passaram no Chrome com API, banco e imagens reais                          |
| `pnpm db:migrate`                       | Aplicada no banco local e reexecutada sem alteração de dados existentes       |

Total: 161 cenários aprovados entre as três suítes. Os testes de banco são
omitidos intencionalmente na suíte padrão sem `TEST_DATABASE_URL`; foram
executados pelo runner com esquemas temporários separados, preservando o
esquema da aplicação. O runner de navegador também isola e remove seu
diretório temporário de fotos.

Cobertura: campos ausentes/vazios/inválidos, limites, persistência, edição sem
duplicar, isolamento entre usuários, sessão expirada, CSRF/origem, principal
concorrente, restrição única no banco, promoção e estado vazio, fotos JPEG/PNG/
WebP reais, falsificação de MIME, corrupção, 5 MB, 40 MP, EXIF/GPS/orientação,
privacidade após mudança, substituição/remoção, falha de armazenamento,
retentativa durável e proteção de referências ainda vinculadas.

No Chrome: fluxo completo da Garagem, perfil sincronizado, foto privada sem
acesso anônimo, recuperação de falha de upload sem segundo cadastro, rejeição
clara de HEIC e recuperação de listagem após erro de rede. Regressões de login,
perfil, privacidade, logout, telas aprovadas e navegação também passaram.

Garagem vazia, formulário, detalhes, edição, lista e perfil verificados em
320, 360, 375, 390 e 430 px, incluindo nomes extensos. As telas anteriores
continuam verificadas também em 768 e 1440 px. Capturas em
`.local/screenshots/parte04-{vazia,formulario,detalhes,lista}-{largura}.png`.
Foi feita inspeção visual das capturas mobile. Não houve teste em hardware
Android ou iPhone físico.

## G. Interface e preservação

Cabeçalho, navegação de cinco itens, Ride central, cores, tipografia, painéis e
componentes aprovados permanecem. As mudanças de produto se limitam à Garagem
e à seção correspondente no perfil. Estilos usam os tokens existentes.
Um ajuste mínimo de `min-width` no container do cabeçalho permite que nomes
longos encolham, corrigindo overflow detectado em 375 px sem redesenho.
Cards truncam textos extensos e os detalhes apresentam os valores completos.

Não há números fictícios de desempenho, rotas, potência ou atividades nas motos.
Home, Explorar, painel Ride e restante da comunidade não receberam novas
funcionalidades. Nenhuma imagem pessoal é substituída por moto fictícia.

## H. Pendências e limites

- PostGIS continua ausente no cluster PostgreSQL local, conforme a Parte 03.
  Esta etapa usa PostgreSQL sem recursos geográficos; não alterou essa pendência
  e não simulou sucesso da verificação PostGIS.
- Não há conversão HEIC, catálogo externo, infraestrutura de nuvem ou deploy.
- Fotos usam seletor do navegador. A disponibilidade de galeria/câmera depende
  do sistema; compatibilidade em hardware móvel físico ainda não foi exercitada.
- O adaptador local exige diretório persistente privado e compartilhado se
  houver várias instâncias. Backup, ACLs e armazenamento de produção devem ser
  definidos ao preparar a infraestrutura de publicação.
- Cadastro e upload são requisições separadas: se a foto falhar, a moto continua
  cadastrada e o formulário informa o erro e permite reenviar sem duplicá-la.
- Sem API em execução, exclusões físicas pendentes aguardam a próxima
  inicialização. A fila evita perda dessas pendências e permite acompanhamento.
- As pendências anteriores de SMTP e documentos definitivos não foram alteradas.

## I. Preparação para a Parte 05

`motorcycleService.primary()` consulta a principal e `list()` oferece a coleção
própria. Os UUIDs e o arquivamento permitem futuras referências estáveis. Uma
próxima parte poderá apresentar a seleção e associar uma moto ao Ride sem
reescrever a Garagem. Não foram criados GPS, sessões de telemetria, velocidade,
mapas reais, atividades, rankings ou tabelas desses módulos.
