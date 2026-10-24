# Etapa 6 de 14 — Garagem premium e catálogo brasileiro

Implementação local em 24/10/2026 sobre a base `9c98fd2`. Não houve deploy, alteração da VPS ou início da Etapa 7. As etapas anteriores permanecem documentadas.

## A. Diagnóstico anterior

A Garagem existente já possuía CRUD com sessão/CSRF, PostgreSQL, UUID estável, proprietário, moto principal, arquivamento e fotografia pessoal processada. Home, perfil, preparação do Ride e Histórico usavam essa mesma identidade. Faltavam catálogo técnico com procedência, cilindrada decimal/elétrica, registros privados persistentes e organização por visão geral/ficha/atividades/manutenção. O card antigo de detalhes compartilhava estilos com o perfil.

## B. Redesign premium

`GaragePremium` conserva o header e as cinco abas do design system. Título Minha Garagem, busca pessoal, adicionar moto, cards compactos selecionáveis, destaque da principal com fotografia real, marca/modelo em branco/vermelho e ficha resumida. Selecionar um card consulta outra moto sem mudar a principal. Arquivadas ficam em consulta separada.

`GarageHero` reutiliza a imagem pessoal com ampliação e placeholder honesto. `GarageDetails` organiza Visão geral, Ficha técnica, Atividades, Manutenção e Registros pessoais em navegação interna, sem acrescentar abas inferiores. Cadastros e registros usam campos e diálogos existentes. Instruções extensas ficam no tópico Garagem do Guia, acessível pelo único menu Mais opções.

## C. Catálogo brasileiro

Entidades separadas de marca, modelo, ano-modelo/versão e revisão. Busca real no PostgreSQL, normalizada por acentos/caixa, prefixo e nome compacto; paginação de versões e facetas, sem baixar o catálogo inteiro no cliente. Escolha guiada preenche os dados pessoais somente por ação do usuário; cadastro manual fica disponível mesmo se a consulta falhar.

Cobertura inicial comprovada: **2 marcas, 3 famílias, 7 versões/ano, todas parciais**. Uma ficha possui 21 campos, o que não a torna completa. Veja [modelagem, fontes e operação](../catalogo-motos.md) e [matriz de cobertura](../catalogo-cobertura.csv). Sem alegação de catálogo nacional completo.

## D. Fichas técnicas

`CatalogSheet` apresenta valores originais, unidade e fonte por campo. Ausências aparecem como Não informado. Cada fonte guarda título, URL, consulta, publicação conhecida e escopo brasileiro por ano/versão. A moto aponta para uma revisão específica. Rascunho não substitui revisão pública anterior; revisão publicada não reescreve vínculos pessoais.

cv, hp e kW são distintos; conversões secundárias aproximadas seguem NIST. Torque N·m/kgf·m, massa seca/em ordem de marcha, rotação, medidas e tanque mantêm semântica própria. Não há comparação técnica automática entre versões diferentes. Campos elétricos estão previstos; nenhum modelo elétrico foi inserido sem fonte brasileira verificada.

## E. Cadastro manual

Preservado para marcas/modelos fora da base. `year` continua ano-modelo; fabricação é opcional separada. Combustão exige 1–10000 cc com até duas casas quando propulsão explícita; elétrica exige cilindrada nula. Cliente antigo sem propulsão conserva validação inteira. O vínculo exato exige marca/modelo/ano/versão/propulsão compatíveis e cilindrada quando conhecida pela fonte. Desvincular mantém os dados pessoais e registra nova identidade histórica.

## F. Fotografias

Reutilizados upload próprio, limite 5 MB, validação pelo conteúdo, decodificação/reencodificação WebP, remoção de metadados e fila durável de limpeza. Não há imagem técnica oficial distribuída. Fotos pessoais continuam autenticadas ou públicas somente conforme a política existente de perfil e bloqueios; armazenamento físico não é publicado diretamente. URLs usam controle de cache existente. Ao arquivar, a fotografia é removida conforme contrato anterior; UUID e registros permanecem. Uma fotografia por moto, sem galeria múltipla nesta etapa.

## G. Manutenção

CRUD privado real com título, data, odômetro declarado, custo em centavos, oficina, notas, próxima data/quilometragem planejada. Registro, edição e exclusão lógica preservam revisões de auditoria. Controle otimista rejeita versão defasada com 409. Busca percorre registros no servidor, com tipo e paginação de 20. Não há diagnóstico mecânico, recomendação ou notificação automática.

## H. Odômetro

Leituras informadas pelo proprietário registram data, valor e origem. Não são calculadas somando Rides. Leitura menor exige referência à última e motivo; cria outro registro preservando a anterior. Leituras não podem ser editadas/apagadas pela API. A leitura mais recente para correção é independente da página/filtro visual. Distância e tempo do Apex Ride usam somente sessões salvas da moto, sem estimativa de painel.

## I. Seguro e documentação

Registros opcionais: seguradora, cobertura declarada, início/fim; documentação com vencimento e situação declarada; notas, lembretes e modificações/acessórios. Tudo privado, ligado ao proprietário atual da sessão. Não são aceitos campos de placa, RENAVAM, apólice, número de documento ou anexos digitalizados. Não há verificação automática de vigência/regularidade. Dados declarados não geram selo de segurança ou validade jurídica.

## J. Histórico

UUID da moto permanece. Estatísticas filtram `motorcycleId`; detalhes abrem Histórico/Replay existentes. Cada edição cadastral gera snapshot de identidade com instante de vigência. Ao salvar uma atividade, o servidor escolhe a identidade válida no início, congelando versão/revisão/categoria quando disponíveis. Edição ou arquivamento posterior não altera o snapshot salvo.

A identidade inicial de motos anteriores à Etapa 6 começa no instante da migração, sem retroagir à criação da moto. O teste de upgrade verifica também fotos, principal e snapshots antigos intactos. Para atividade cujo início anteceda a primeira identidade conhecida, o servidor mantém o fallback atual explicitamente com `identityAtStartVerified=false`; não afirma reconstrução histórica. `historicalFallback=false` conserva a semântica anterior de nova gravação. Snapshots antigos não são reescritos. A regra anterior que impede novo envio associado a moto já arquivada continua; arquive após sincronizar atividades pendentes. Transferência de propriedade e restauração de arquivadas não foram adicionadas.

## K. Ride e Home

GarageProvider permanece fonte única de motos/principal. Primeira moto vira principal; troca e promoção ao arquivar mantêm transação serializada e índice único. Home reflete a principal após atualização. Preparação usa escolha existente; consultar cards ou alterar principal não troca identidade de um Ride em curso. Displays de Home, resumo, perfil, comparação e feed aceitam cilindrada nula/decimal. Cache básico do aparelho continua sem fotografias ou registros privados. Falha de conexão mantém cópia com indicação e ação de tentar novamente.

## L. Banco, APIs e segurança

Migrações incrementais `034_garage_catalog.sql` e `035_catalog_initial_br.sql`; originais 001–033 intactas. Criadas oito tabelas de catálogo/identidade/registros e revisões, categorias, índices e permissão `admin.catalog.curate`. `displacement_cc` passa de inteiro para numeric(8,2) nullable com restrição por propulsão. Índice de comparação usa numeric para preservar decimais. Novos campos da moto são aditivos; nenhuma moto pessoal é removida ou substituída.

Contratos de catálogo e curadoria em [catálogo](../catalogo-motos.md). Curadoria exige RBAC, CSRF, conta ativa/verificada e MFA recente; transação revalida direitos e grava auditoria. Não há editor visual administrativo nesta entrega.

| API privada `/api`                            | Contrato                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /motorcycles?archived=true`              | Lista própria arquivada; padrão continua somente ativas                   |
| `GET /motorcycles/:id?archived=true`          | Consulta própria arquivada; sem flag mantém 404 anterior                  |
| `POST/PATCH /motorcycles[/:id]`               | Campos antigos e propulsão/fabricação/versão/vínculo de catálogo          |
| `GET /motorcycles/:id/records?kind=&q=&page=` | Registros próprios, 20 por página, `hasMore`; leitura arquivada permitida |
| `POST /motorcycles/:id/records`               | `{kind,data}`; retorna registro persistido e revisão 1                    |
| `PATCH /motorcycles/:id/records/:recordId`    | `{revision,data}`; controle de concorrência                               |
| `DELETE /motorcycles/:id/records/:recordId`   | `{revision}`; exclusão lógica auditada                                    |

Mutações exigem sessão e CSRF; moto de outra conta retorna 404. Corpo estrito rejeita campos imprevistos. Textos são limitados e renderizados como texto pelo React. Arquivadas são somente leitura. DTO público mantém campos básicos anteriores e não expõe fabricação, versão/vínculo privado ou registros. Nenhum registro entra no feed, ranking, perfil público, cache offline ou service worker. Privacidade da foto continua dinâmica. Queries usam parâmetros SQL; facetas interpolam apenas constantes internas enumeradas.

Aplicar localmente com `pnpm db:migrate` após backup; não aplicar banco de produção nesta tarefa. Reversão de aplicação deve manter o schema ampliado: elétrica e cilindrada decimal tornam inadequado voltar cegamente ao cliente antigo. Não há down migration destrutiva.

## M. Testes

Validações executadas: `pnpm check` passou (tipos, lint, formatação, 286 testes API + 509 web = **795 unitários**, builds API/web). Os testes de banco aparecem como ignorados nesse comando por projeto e foram executados separadamente: `pnpm test:postgres` passou **374/374**; o teste adicional de atualização `pnpm --filter @apex-ride/api test:postgres test/garage-upgrade.postgres.test.ts` passou **1/1**, totalizando **375 casos distintos de integração**. O runner padrão já inclui esse novo arquivo nas próximas execuções.

`pnpm test:recovery`, com binários locais PostgreSQL, passou: **35 migrações, 101 tabelas, hashes, índices, restrições, PostGIS 3.6.2, autorização e bytes de mídia** após backup/restauração. Ensaio sintético local; não representa RPO/RTO de produção. A regressão completa de navegador tem resultado registrado abaixo ao concluir. Logs locais: `.local/refinamento6-check.log`, `refinamento6-postgres-all.log`, `refinamento6-e2e-focused.log`, `refinamento6-e2e-all.log` e `refinamento6-recovery.log`.

Testes novos cobrem unidades, fonte/data/campo inválidos, identidade manual/elétrica, variantes sem mistura de anos, vínculo exato, registros de todos os tipos, correção de odômetro, isolamento, concorrência, arquivamento, curadoria/MFA e snapshot válido no início do Ride. E2E cobre versão real, upload, busca pessoal, múltiplas motos, registros persistentes após recarga e ausência de overflow em oito larguras. Testes anteriores de foto/principal/privacidade continuam.

Falhas encontradas e corrigidas durante desenvolvimento: DTO de detalhes omitia novos campos, estilos antigos escondiam imagens dos tiles, comparação direta no teste esperava inteiro em coluna agora numeric, fixtures de cadastro inválidas e seletores E2E de status ambíguos. Truncamento de usuários em teste administrativo também limpa revisões ligadas por FK; a fixture de curadoria agora cria sua própria versão sintética. Nenhum dado sintético foi inserido nas migrações públicas.

## N. Capturas reais

Em `.local/screenshots/refinamento6`, geradas pelo Playwright contra API e PostgreSQL isolados. Oito larguras: 320, 360, 375, 390, 430, 768, 1024 e 1440 px. Estados: vazia, consulta de catálogo, principal com três motos, formulário de manutenção, manutenção persistida, seguro privado, ficha com fontes, cadastro manual elétrico, cópia local e arquivada com manutenção preservada. Conta e registros são fixtures identificadas como teste; a fotografia é asset já existente enviado pelo fluxo real. As outras motos usam placeholder, sem foto fictícia associada a modelo.

Galeria `comparacao.html` agrupa as capturas e as oito referências fornecidas. Conferência humana assistida das capturas verifica hierarquia, imagens, fontes, campos e diálogo; verificações de overflow e cinco abas também são automatizadas. Desktop Chrome local não substitui aparelhos físicos.

## O. Fidelidade visual

Preservados paleta escura/vermelha, tipografia esportiva, destaque fotográfico, bordas arredondadas, cards técnicos e navegação inferior. Sem moldura de iPhone, horário fictício, Lucas/nível de exemplo ou indicadores de manutenção inventados. O catálogo usa CB 650R 2026 E-Clutch, distinto da 2023 da referência; não se copiam os números da imagem. Mobile distribui motos em duas colunas para evitar rolagem lateral; desktop usa linha de cards. Seguro/manutenção/notas ficam em detalhes, sem despejar dados privados na primeira tela. A fotografia pessoal pode ter enquadramento diferente. A ficha parcial possui indicação explícita.

## P. Pendências

Ampliar fontes brasileiras por versão/ano; completar campos ausentes; homologar interface e câmera/fotos em Android/iPhone reais; avaliar licenças antes de importações em massa; eventual editor visual de curadoria, galeria múltipla, restauração e notificações de lembrete são evoluções não entregues. Sem integração com seguradoras, Detran ou assistência mecânica. Não há catálogo nacional completo nem garantia física do navegador em segundo plano. Advertência anterior de tamanho do chunk do mapa persiste, sem bloquear build.

## Q. Arquivos modificados

Inventário completo desta etapa em [etapa-06-arquivos.txt](etapa-06-arquivos.txt). Componentes reaproveitados: GarageProvider/context, MotorcyclePhoto, formulário e upload existentes, Header/BottomNav, Button/ChoiceSelect/Combobox/Dialog/SearchInput, autenticação, RBAC/MFA, Histórico, estatísticas, Replay e cache básico do dispositivo. Componentes novos: GaragePremium/GarageHero, GarageDetails/PrivateRecords/RecordForm, CatalogPicker, CatalogSheet/CatalogPage e conversões de unidades.

## R. Preparação para Etapa 7

Perfil e comunidade continuam consumindo somente DTO público anterior. Identidade pessoal, ficha técnica pública e registros privados possuem contratos separados. As novas referências podem ser usadas conscientemente na próxima etapa, sem publicar dados privados ou alterar snapshots. **A Etapa 7 não foi iniciada.**
