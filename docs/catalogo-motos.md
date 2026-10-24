# Catálogo brasileiro de motocicletas — Etapa 6

Base progressiva de referências técnicas do mercado brasileiro, separada das motos pessoais. Não representa todas as motocicletas vendidas no Brasil. As migrações não cadastram motos nas contas dos usuários. Consulta das fontes: **24/10/2026**.

## Cobertura comprovada

**2 marcas, 3 famílias, 7 combinações de ano-modelo/versão, 7 fichas parciais, 0 completas, 0 aguardando revisão na base inicial.** A métrica `detailed=1` conta fichas com pelo menos 20 campos; não significa ficha completa. Todas as revisões iniciais são 1. Não há imagens de fabricantes distribuídas com o catálogo.

| Marca | Modelo      | Ano-modelo | Versão    | Campos com fonte | Situação |
| ----- | ----------- | ---------- | --------- | ---------------: | -------- |
| Honda | CB 650R     | 2024       | ABS       |               10 | Parcial  |
| Honda | CB 650R     | 2026       | E-Clutch  |               21 | Parcial  |
| Bajaj | Dominar 400 | 2025       | Padrão    |               18 | Parcial  |
| Honda | CG 160      | 2025       | Titan ABS |               11 | Parcial  |
| Honda | CG 160      | 2025       | Fan CBS   |               11 | Parcial  |
| Honda | CG 160      | 2025       | Start CBS |               11 | Parcial  |
| Honda | CG 160      | 2025       | Cargo CBS |               11 | Parcial  |

A [matriz CSV](catalogo-cobertura.csv) enumera os campos realmente preenchidos por versão. Categorias de referência: Street/Naked, Sport/Supersport, Touring, Sport Touring, Adventure, Trail, Dual Sport, Custom/Cruiser, Scooter, Motoneta/Cub, Off-road, Elétrica, Clássica/Retro e Outras. Uma categoria existente não indica cobertura de modelos nela. CB 650R possui categoria Street/Naked; CG e Dominar permanecem sem classificação curada. Não foi inferida classificação por cilindrada ou aparência.

## Procedência e escopo

- [Honda CB 650R 2024, comunicado oficial](https://prodsalaimp.honda.com.br/releases/honda-cb-650r-e-cbr-650r-2024-novas-opcoes-de-cores-e-acabamento-definem-nova-versao-da): publicado em 13/11/2023; informações do lançamento brasileiro. Dez campos, sem preencher cilindrada ou massa por dedução. O manual vinculado não foi obtido e não é citado como evidência.
- [Honda CB650R 2026, página oficial](https://www.honda.com.br/motos/street/naked/cb650r): versão E-Clutch brasileira, 21 campos; potência, torque e massa seca pertencem a essa versão. Não misturar com 2024. Data de publicação desconhecida.
- [Bajaj Dominar 400, ficha oficial 2025/2025](https://bajaj.com.br/wp-content/uploads/2025/04/ficha-tecnica-Dominar-400.pdf): 18 campos; cilindrada decimal e peso em ordem de marcha preservados. Não incorpora equipamentos da página atual de outro ano. Publicação desconhecida; o caminho do PDF não prova sua data.
- [Honda CG 160 2025, comunicado oficial](https://saladeimprensa.honda.com.br/releases/honda-cg-160-2025-nova-geracao-da-motocicleta-preferida-dos-brasileiros-traz-importantes): publicado em 22/10/2024; Titan ABS, Fan CBS, Start CBS e Cargo CBS. Potência/torque registrados **com gasolina**, inclusive nas versões flex, com escopo explícito. Massas e freios específicos de cada versão.
- [NIST SP 811, fatores de conversão](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9): conversões secundárias identificadas como aproximadas. cv métrico difere de hp mecânico.

Os fatos são transcritos em pequenos campos estruturados com atribuição. Não foram copiados manuais, fotografias, textos promocionais extensos ou bases de terceiros. Não há scraping automático nem alegação de licença ampla dos fabricantes. Uma importação em massa exige análise específica de direitos.

## Modelo, unidades e imutabilidade

Marca → família de modelo → ano-modelo/versão brasileira → revisões. A versão carrega propulsão e categoria; alterar sua identidade exige outra versão. Cada revisão guarda `specifications`, `sources`, situação `draft/reviewed`, motivo, data e curador quando operada pela API administrativa. O seed inicial tem `reviewed_by=NULL`: revisão técnica inicial do projeto, sem atribuir aprovação a fabricante ou administrador inexistente.

Cada campo usa `{value, unit, source}` com índice obrigatório de fonte contendo título, URL HTTPS, escopo, consulta e publicação quando conhecida. Campo ausente aparece como **Não informado**; não recebe zero ou dado de outro ano. Unidades explícitas: cc, cv/hp/kW, rpm, N·m/kgf·m, kg, mm, L. Elétricas admitem potência nominal, bateria, autonomia e recarga quando houver fonte. Massa seca e massa em ordem de marcha são campos distintos. Conversões não substituem o original: cv×0,73549875 e hp×0,7456998715822702 para kW; kgf·m×9,80665 para N·m.

A moto pessoal guarda `(catalog_variant_id, catalog_revision)`. Nova revisão não altera o vínculo salvo. O usuário pode trocar conscientemente a versão ou desvincular mantendo seus dados. Elétrica usa `displacementCc=null`; fabricação opcional é separada do ano-modelo.

## Busca e expansão

`GET /api/catalog/brands|models|years?q=&brand=&model=&page=`: 50 opções por página, `items`, `hasMore`, `page`. Combobox remoto aceita digitação para refinar marcas/modelos/anos. `GET /api/catalog/variants?q=&brand=&model=&year=&page=`: 20 resultados por página. Busca normaliza caixa/acentos, aceita prefixos e inclui modelo sem espaços (CB650R). Índice GIN de texto e índice modelo/ano. Não baixa toda a base no navegador. Ordenação estável, limite de página 1000 e busca de 100 caracteres. Facetas mostram até 50 opções e permitem refinar digitando; não possuem botão para carregar as próximas 50 no combobox.

`GET /api/catalog/variants/:id?revision=` retorna a revisão revisada indicada ou a última revisada; rascunho não esconde uma revisão pública anterior. `/api/catalog/coverage` retorna contagens reais. Categorias: `/api/catalog/categories`. Consultas públicas possuem limite por IP. Nenhuma rota pública retorna dados dos donos.

## Curadoria protegida

A operação implementada é API administrativa, **sem editor visual de curadoria nesta etapa**. `POST /api/admin/catalog/revisions` exige sessão, CSRF, conta ativa/verificada, permissão `admin.catalog.curate` e senha+MFA validados nos últimos cinco minutos. `catalog_curator` possui só essa permissão; `superadmin` também a recebe. Nenhum usuário ganha papel automaticamente. Concessões seguem o RBAC existente.

Corpo: `variantId`, `brandId`, `brand`, `modelId`, `model`, `year`, `versionName`, `propulsion`, `categoryId` nullable, `expectedRevision` (0 para nova versão), `status`, `changeNote`, `specifications`, `sources`. IDs de modelo/versão são UUIDs; marca usa slug. Fontes exigem escopo e consulta não futura; publicação não pode exceder consulta. Unidade inválida, fonte inexistente, número não positivo ou cilindrada em elétrica são rejeitados. A API valida formato/procedência declarada; não certifica automaticamente a veracidade de uma página.

Fluxo: conferir fonte primária brasileira e ano/versão → registrar rascunho com motivo → revisar campos → publicar nova revisão com contador esperado. Transação bloqueia versão, revalida permissão e controla concorrência; contador defasado responde 409. Auditoria registra ator/ação/recurso, com justificativa protegida separadamente. Revisões anteriores não são sobrescritas pela API. Rascunhos não aparecem ao usuário comum. Proprietários não editam fontes oficiais.

## Lacunas

Faltam marcas, anos, versões históricas, importadas e elétricas. Cadastro manual cobre essas motos sem inventar ficha. Fonte estrangeira não foi presumida equivalente ao modelo brasileiro. Expandir exige manuais/fichas oficiais por versão, atribuição e revisão de divergências, sem alterar motos pessoais ou Rides passados. Não há preços, recomendação mecânica automática ou integração FIPE.
