# Registro — Etapa 1 / Parte 01

Data: **22/10/2026** (America/Sao_Paulo).

Estado: **implementação entregue; validação integral do banco pendente por falta
de Docker neste ambiente**. A Parte 02 não foi iniciada. Não há funcionalidades
de negócio, alterações no design aprovado, deploy ou serviços externos criados.

## Decisões e alterações

- A pasta existente `D:\Projetos\ApexRide` estava vazia. Ela foi usada como raiz
  do monorepositório `apex-ride`, sem criar um diretório aninhado adicional.
- Git inicializado, sem commit ou remoto. `.env`, dependências e builds ignorados.
- pnpm workspaces com versões fixas, lockfile e instalação reproduzível.
- Node 24 LTS, TypeScript 6.0.3, React 19, Vite 8, Fastify 5 e `pg` 8.
  O TypeScript atende aos peer dependencies do typescript-eslint instalado.
- Node lê e valida o `.env` sem dependência adicional. Um `.env` local foi criado
  com senha gerada, sem impressão ou inclusão no Git; `.env.example` é público.
- API modular com saúde de processo e banco, CORS explícito, logs básicos,
  mensagens de erro sem credenciais, pool com timeouts e encerramento em onClose.
- TLS com certificado validado para banco remoto; conexão sem TLS limitada a
  loopback. Parâmetros na URL não podem sobrescrever opções do driver.
- Compose PostgreSQL 17/PostGIS 3.6 com SCRAM, volume persistente, porta local
  55432 e SQL idempotente da extensão. Essa porta evita interferir com o
  PostgreSQL 17 já instalado na máquina, que não contém PostGIS.
- React com página técnica, cliente HTTP, hook com cancelamento e timeout,
  viewport e CSS mínimo. `App.tsx` reserva a composição do futuro roteamento;
  nenhuma biblioteca de navegação ou PWA foi adicionada antecipadamente.
- ESLint, Prettier, TypeScript e Vitest com testes independentes de banco externo.
- Scripts de desenvolvimento, builds, verificações, banco e diagnóstico real do
  PostgreSQL/PostGIS através da API.
- No Windows, o script conjunto usa `pnpm -r --parallel dev`, sem aspas simples
  incompatíveis com o cmd. A API usa `node --watch --import tsx`: o `tsx watch`
  não iniciou o servidor no comando paralelo desta máquina, apesar de funcionar
  isoladamente. A versão final do comando conjunto foi executada com sucesso.

## Verificações executadas

| Verificação                                      | Resultado observado                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Instalação por `npx --yes pnpm@10.34.7 install`  | Aprovada; dependências instaladas                                |
| Reinstalação com `--frozen-lockfile`             | Aprovada; lockfile consistente                                   |
| `pnpm typecheck`                                 | Aprovado em web e API; erro inicial no tipo do handler corrigido |
| `pnpm lint`                                      | Aprovado sem avisos                                              |
| `pnpm test`                                      | 35 testes aprovados: 23 API/ambiente e 12 frontend               |
| `pnpm build`                                     | Aprovado em web e API                                            |
| `pnpm dev`                                       | Vite em 5173 e API em 3001, confirmados por HTTP                 |
| Frontend HTML e módulo TSX transformado          | Ambos HTTP 200                                                   |
| `GET /api/health` direto                         | HTTP 200 com `status=ok` e serviço correto                       |
| `GET /api/health` pelo proxy em 5173             | HTTP 200 com resposta real da API                                |
| CORS real                                        | Origem localhost permitida; origem externa sem autorização CORS  |
| API compilada com `node apps/api/dist/server.js` | Inicializou e respondeu HTTP 200                                 |
| `GET /api/health/db` com pool real               | HTTP 503 com corpo genérico, como esperado sem banco disponível  |
| `pnpm db:check` com serviços web/API ativos      | Código 1; não declarou banco saudável sem confirmação            |
| `pnpm db:up`                                     | Não executável: comando Docker não instalado/disponível          |
| `.env` e artefatos de build no `.gitignore`      | Confirmado por `git check-ignore`                                |

O comando agregado `pnpm check` também foi executado e aprovado integralmente:
tipos, lint, formatação, 35 testes e builds. A senha e a URL do banco locais foram
comparadas com os arquivos gerados do frontend, sem imprimir seus valores;
nenhuma credencial foi encontrada no build web. Ao final, o comando `dev` foi
encerrado por Ctrl+C e as portas dos servidores foram confirmadas livres.

Os testes automatizados cobrem ambiente inválido, CORS, saúde da API, sucesso e
falha do serviço de banco, erros internos sem detalhes, fechamento das conexões,
validação HTTP, cancelamento e estados da página técnica. Sucesso de banco nos
testes usa dublê injetado e **não comprova** PostgreSQL/PostGIS real. A aplicação
fora dos testes utiliza exclusivamente o pool real.

Não havia navegador disponível no conector de automação. A página React foi
validada em jsdom, e frontend/proxy/API foram verificados por HTTP real. Não foi
realizada inspeção visual em navegador ou alegada validação visual do design.

## Pendência para concluir os critérios integrais

Disponibilizar Docker com Compose v2 e iniciar seu mecanismo. Então, com o `.env`
local configurado, executar:

```powershell
pnpm db:up
pnpm dev
# Em outro terminal:
pnpm db:check
Invoke-RestMethod http://127.0.0.1:3001/api/health/db
```

Esperado: código zero no diagnóstico e HTTP 200 com `database=connected` e
`postgis=enabled`. Até isso ocorrer, a inicialização da imagem, execução do SQL,
persistência do volume e conexão real PostgreSQL/PostGIS **não estão validadas**.
Nenhum PostgreSQL existente, serviço do sistema ou banco pessoal foi alterado.

## Preparação para a Parte 02

Disponíveis: `apps/web/src/App.tsx`, `pages/`, `components/`, `hooks/`, `services/`,
`styles/` e configuração Vite. O design aprovado poderá ser implementado nesses
locais quando a Parte 02 for solicitada e suas referências forem fornecidas.
Backend e banco permanecem separados e prontos para evolução por módulos e
migrações, sem contratos de negócio antecipados.
