# Garagem — operação e contratos

A Parte 04 usa as contas da Parte 03, o pool PostgreSQL e os componentes
existentes. Não há catálogo externo, segundo login ou dados demonstrativos
como motocicletas pessoais.

## Instalação local

Na raiz, com Node 24 e o PostgreSQL configurado no `.env` existente:

```powershell
npx --yes pnpm@10.34.7 install --frozen-lockfile
npx --yes pnpm@10.34.7 db:migrate
npx --yes pnpm@10.34.7 dev
```

Abra <http://127.0.0.1:5173/garagem>, entre e cadastre sua moto. A primeira
torna-se principal. Sem login, essa entrada apresenta somente convite para
autenticação; cadastro, detalhes e edição são páginas protegidas.

## Dados e consistência

`002_motorcycles.sql` cria:

- `motorcycles`: UUID, `owner_id` ligado a `users`, marca, modelo, ano,
  `displacement_cc`, referência/bytes/dimensões da foto, `is_primary`, datas de
  criação/atualização e `archived_at`. Nenhum binário é guardado no banco.
- `motorcycle_photo_cleanup`: referência interna, data para nova tentativa,
  contador de tentativas e data de criação. Registra exclusões físicas pendentes
  e uploads ainda não vinculados.

Marca: 1 a 60 caracteres Unicode; modelo: 1 a 100. Textos são normalizados,
aparados e não aceitam caracteres de controle. Ano inteiro de 1885 (primeiros
veículos motorizados dessa época) até o ano atual + 1; em 2026, máximo 2027.
Cilindrada inteira de 1 a 10000 cc, faixa ampla para pequenas motos e
construções especiais, sem antecipar categorias de rankings. Frontend e
backend validam os limites; o banco também restringe os dados.

Toda alteração deriva o proprietário da sessão. Transações bloqueiam o
registro de `users` do proprietário antes de modificar motos; cadastro e troca
de principal concorrentes são serializados. Um índice único parcial impede
duas principais ativas por usuário. A primeira moto ativa é a principal;
ao arquivá-la, a mais antiga restante (desempate por UUID) é promovida. Sem
motos, a principal é `null`.

Excluir preenche `archived_at`, retira a moto das consultas de garagem,
desmarca principal e remove a referência/foto. UUID e dados cadastrais
permanecem para futuras referências históricas. Não existe restauração por
esta API. A FK do proprietário usa `RESTRICT`, evitando órfãos. Não há tabela
de sessões de Ride ou manutenção.

## API

Prefixo `/api`. Respostas JSON usam `status: "ok"` com `motorcycle` ou
`motorcycles`, conforme a operação. O DTO contém somente `id`, `brand`, `model`,
`year`, `displacementCc`, `isPrimary`, `photoUrl`, `createdAt` e `updatedAt`.
`photoUrl` é um caminho relativo à base da API (`/motorcycles/:id/photo`),
jamais um caminho físico. Sem foto, vale `null`.

| Método | Caminho                        | Acesso e comportamento                                     |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| GET    | `/motorcycles`                 | Sessão; todas as motos ativas próprias, principal primeiro |
| GET    | `/motorcycles/primary`         | Sessão; principal própria ou `null`                        |
| POST   | `/motorcycles`                 | Sessão + CSRF; cadastra, responde 201                      |
| GET    | `/motorcycles/:id`             | Sessão; detalhes da própria moto                           |
| PATCH  | `/motorcycles/:id`             | Sessão + CSRF; atualização parcial dos quatro campos       |
| DELETE | `/motorcycles/:id`             | Sessão + CSRF; arquiva e promove substituta se necessário  |
| PATCH  | `/motorcycles/:id/primary`     | Sessão + CSRF; define principal                            |
| POST   | `/motorcycles/:id/photo`       | Sessão + CSRF; corpo binário, envia/substitui foto         |
| DELETE | `/motorcycles/:id/photo`       | Sessão + CSRF; remove foto                                 |
| GET    | `/motorcycles/:id/photo`       | Proprietário autenticado ou perfil público e conta ativa   |
| GET    | `/users/:username/motorcycles` | Coleção pública; somente perfil público e conta ativa      |

Cadastro recebe `{brand, model, year, displacementCc}`. PATCH aceita parte
desses campos; objetos vazios e propriedades adicionais são rejeitados.
`ownerId`, `isPrimary` e referências de armazenamento nunca são campos de
escrita do cliente. Os dois endpoints públicos não expõem identificadores de
sessão, e-mail ou `owner_id`.

Escritas usam cookie da Parte 03, `X-Apex-Request: 1`,
`X-CSRF-Token` obtido no login ou `/auth/me`, e validação de origem. A API
aceita CORS DELETE para as origens explícitas já configuradas. Não há tokens
em localStorage. Erros 401 encerram o estado de sessão pelo mecanismo existente;
400 informa validação; 403 indica CSRF/origem; 404 cobre moto inexistente,
alheia, arquivada ou perfil privado; 413 informa o limite; 503 indica falha
temporária sem revelar detalhes internos.

## Upload, privacidade e armazenamento

POST recebe o próprio arquivo como corpo, com `Content-Type: image/jpeg`,
`image/png` ou `image/webp` (também suporta `application/octet-stream`). Não
usa multipart ou base64. Limite: **5 × 1024 × 1024 bytes**. HEIC/HEIF não tem
conversão; SVG e formatos não aprovados são rejeitados. A validação não confia
no nome ou MIME: verifica assinatura e decodifica completamente o conteúdo.

Sharp **0.35.5** limita a entrada a 40 megapixels, rejeita imagens corrompidas
e animações, aplica orientação e reduz para até 1600 × 1600 sem ampliar.
Reencodifica em WebP, qualidade 82, removendo EXIF (inclusive GPS), XMP, ICC e
conteúdo extra. O original nunca é persistido. Transparência de PNG é mantida.
Referências técnicas: [entrada e limites do Sharp](https://sharp.pixelplumbing.com/api-constructor/)
e [operações de imagem](https://sharp.pixelplumbing.com/api-operation/).

`LocalPhotoStorage` usa por padrão `<raiz>/.local/motorcycle-photos`, ignorado
pelo Git e fora do frontend, código público e build. `MOTORCYCLE_STORAGE_DIR`
altera o destino para um caminho absoluto privado e dedicado. A configuração
recusa as pastas de código do projeto. Nomes internos são UUID + `.webp`,
escritos sem sobrescrever e sem usar o nome original. Não há endpoint estático
nem execução de arquivos enviados. Preserve esse diretório ao reiniciar a API.

Cada GET consulta sessão opcional, proprietário, estado da conta e privacidade
atual. Uma URL obtida quando o perfil era público deixa de conceder acesso
quando passa a privado. O proprietário continua autorizado via cookie; outra
conta e visitante recebem 404. Fotos usam `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` e tipo fixo
WebP. A versão na URL serve apenas para atualizar a imagem na interface,
sem conceder autorização. Conteúdo já recebido por um visitante antes da
mudança de privacidade não pode ser retirado do dispositivo dele.

Antes de gravar um upload, o backend registra sua referência na fila durável,
com vencimento em uma hora. Só remove essa pendência na mesma transação que
vincula a imagem à moto. Isso permite recolher arquivos de uploads
interrompidos entre filesystem e banco. Falha de escrita/vínculo antecipa a
limpeza e preserva a foto anterior. Substituição, remoção e arquivamento
enfileiram a referência anterior na mesma transação da alteração.

A limpeza executa na inicialização, a cada minuto e após alterações de foto,
até 25 itens por rodada. Usa locks `SKIP LOCKED`, verifica se a referência
ainda está em uso e nunca apaga arquivos vinculados. Falhas incrementam
`attempts` e tentam novamente após cinco minutos. As pendências sobrevivem
ao reinício; com a API parada, aguardam sua próxima execução. Observe
pendências antigas em `motorcycle_photo_cleanup` durante a operação local.

`PhotoStorage` define `put`, `get` e `remove`, permitindo substituir o adaptador
local por armazenamento de objetos sem alterar formulários, autorização ou
regra de principal. Para essa adoção futura, o bucket deverá ser privado e
o backend continuar autorizando leituras. Várias instâncias da API precisam
compartilhar o armazenamento; diretórios independentes não são suportados.
Nenhum serviço de nuvem ou deploy foi configurado.

## Frontend e evolução

`GarageProvider` mantém uma listagem compartilhada com o perfil e ignora
respostas antigas ou de outra conta. Alterações recarregam essa listagem.
`motorcycles.ts` usa o cliente de sessão existente também para arquivos binários.
Listagem, detalhes e formulário apresentam carregamento, erros e nova tentativa.

O formulário preserva o ID após salvar os dados: se a foto falhar, tentar de
novo atualiza a mesma moto. O envio fica bloqueado durante processamento.
Fotografia é opcional, com ícone padrão quando ausente e prévia local quando
selecionada. O arquivo vem do seletor do sistema, sem pedir permissão
permanente de câmera. Excluir exige confirmação e permite cancelar.

`motorcycleService.primary()` e `list()` já permitem que uma parte futura
carregue a principal e ofereça outra seleção. A arquitetura de arquivamento
permite referenciar o UUID original em atividades futuras. Não foi criada
associação com Ride, GPS, mapas ou telemetria.

Testes e limitações verificadas estão no [relatório da Parte 04](parte-04.md).
