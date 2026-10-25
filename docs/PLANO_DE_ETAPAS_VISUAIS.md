# Apex Ride — plano mestre das telas e funcionalidades

**Referência de código:** repositório `K1oraN/ApexRide`, branch `main`, commit consultado `7c669ec844653f782da9a4ef3571de3289324e05`.
**Banco original:** PostgreSQL próprio na pasta `.local`, iniciado por `pg_ctl`, endereço `127.0.0.1:55432`. **Não usar Docker ou o PostgreSQL do Windows em `5432` para este projeto.**

## Regra de execução em todas as etapas

1. Ler o `main` **mais recente** no GitHub e comparar com arquivos locais; não sobrescrever código mais novo sem revisão.
2. Trabalhar por tela/fluxo, usando as imagens em `referencias/` como direção visual (não como screenshots falsos da aplicação).
3. Entregar **ZIP único com arquivos completos** e caminhos relativos à raiz do Apex Ride; não snippets/diffs soltos.
4. Incluir `LEIA_PRIMEIRO.md` com instruções de cópia, verificações e comandos para executar o sistema.
5. Executar, quando houver ambiente disponível, `pnpm typecheck`, `pnpm lint`, `pnpm build` e testes afetados. Se o build local não estiver acessível, registrar expressamente essa limitação.
6. Somente após validação, preparar commit/push no GitHub. Verificar branch/commits remotos novamente antes de continuar a etapa seguinte.
7. Proteger dados: jamais enviar `.env`, `.local`, senhas ou informações privadas ao GitHub. Fazer backup antes de migrações irreversíveis.

## Imagens reunidas e correspondência

| Imagem | Seção | Resultado esperado |
|---|---|---|
| `01_apresentacao.png` | Landing | Banner de motociclista na estrada, recursos, chamadas claras de cadastro |
| `02_login.png` | Entrar | Hero, campos amplos e botão vermelho destacado |
| `03_cadastro.png` | Criar conta | Campos, feedback de validação e aceite de termos |
| `04_inicio.png` | Dashboard | Hero, status, moto principal, KPIs e atividades reais |
| `05_explorar_planejar.png` | Explorar | Mapa, busca de endereços, paradas, cálculo de rota, controles evidentes |
| `06_ride_telemetria.png` | Ride | Velocímetro, sensores, vídeo quando suportado e controles do Ride |
| `07_comunidade_feed.png` | Comunidade | Feed, imagens de postagens e atalhos, menu de perfil e sair |
| `08_rankings.png` | Ranking | Brasil, estado, cidade, estilo e cilindrada; cartões e posições |
| `09_garagem.png` | Garagem | Seletor de motos, hero, ficha, manutenção e exclusão |
| `extra_01_inicio.png` | Início | Referência aprovada anterior |
| `extra_02_explorar.png` | Explorar | Referência aprovada anterior |
| `extra_03_modo_misto.png` | Ride | Referência aprovada anterior |
| `extra_04_perfil_comunidade.png` | Perfil/Comunidade | Referência aprovada anterior |

As imagens são **conceitos visuais**, não provas de que APIs, GPS, câmeras ou valores demonstrados estejam funcionando. **Nenhum dado de desempenho é inventado.**

## Etapas propostas

### 01 — Identidade visual e Início (pacote presente)
- Refinar shell, navbar, cartões, identidade preto/vermelho, hierarquia visual e responsividade.
- Aproximar dashboard de `04_inicio.png` com foto, slogan, status real, garagem real, métricas reais, histórico e atalhos.
- Sem alteração do banco ou rotas de API.

### 02 — Página pública, Login e Cadastro
- Aproximar de `01`, `02` e `03`: hero cinematográfico, campos acessíveis, senha, erros e CTA.
- Não prometer indicador de senha disponível sem validação real.
- Testes de login, cadastro, recuperação de senha e mobile.

### 03 — Explorar, busca de endereço e navegação
- Aproximar de `05` e `extra_02`: mapa, campo de pesquisa e botões Buscar/Limpar, lista e reordenação de paradas.
- Resolver o `503` de geocodificação via configuração legítima de `GEOCODING_MAPTILER_KEY` e `GEOCODING_AUTHORIZED=true`.
- Resolver os `503` em `/api/routes/calculate` e `/api/routes/directions` com OSRM funcional (serviço externo ou próprio, com política/limites apropriados).
- Nunca simular rota rodoviária com linha reta quando um provedor falhar.

### 04 — Percursos: publicação e acesso
- Privado, público, seguidores e grupo: implementar **API, banco e UI** com autorização por destinatário.
- Publicação de percursos comuns sem aprovação prévia; moderação e denúncias continuam disponíveis.
- Evitar vazamento de GPS privado em prévias, pesquisa, favoritos, grupos ou perfis.

### 05 — Ride e Telemetria
- Aproximar de `06` e `extra_03`: velocímetro, cartões, vídeo, geolocalização e botões Pausar/Finalizar.
- Preservar medição real, limitações de sensores e modo offline; jamais exibir 118 km/h ou métricas fictícias como telemetria real.

### 06 — Garagem, ficha técnica e manutenção
- Aproximar de `09`: abas visuais de motos, imagem real ou placeholder, ficha técnica, documentos e notas.
- Vincular corretamente versão/ano e catálogo com fontes; não inventar valores inexistentes.
- Implementar exclusão solicitada com confirmação e regras de integridade (histórico de Rides, documentos, fotos e vínculos).

### 07 — Comunidade e postagens
- Aproximar de `07`: feed visual, posts, comentários, mídia, eventos e menu global.
- Excluir conteúdos do usuário sem perder auditoria necessária; separar ocultação pública de remoção de mídia.
- Grupos acessíveis pelo menu Mais opções; a aba Comunidade permanece focada em feed, ranking e eventos.

### 08 — Rankings por localização e motocicleta
- Aproximar de `08`: Brasil, estados, municípios, categoria/estilo, cilindrada, filtros proporcionais.
- Resolver backend de classificação e regras de opt-in/privacidade sem restaurar formulário extenso na tela.
- **Não incentivar disputa de velocidade em vias públicas**; priorizar XP, exploração, distância, missões e circuitos fechados verificados quando disponíveis.

### 09 — Perfil, grupos, missões e acabamento de navegação
- Integrar perfil, meus grupos, missões/conquistas, configurações e sair à navegação.
- Aproveitar `extra_04_perfil_comunidade.png`; eliminar seções redundantes.

### 10 — Auditoria visual, acessibilidade e testes end-to-end
- Verificar fluxos autenticado/visitante, 320/375/430/768/1280 px, teclado, foco, contraste, mensagens de erro, telas vazias e carregamento.
- Revisar PDFs/artefatos externos se houver; corrigir CSS legado conflitante.
- Comparar lado a lado imagens de referência e capturas reais do navegador.

## Critérios de aceite para cada etapa

- ZIP copiável sem renomear diretórios.
- Arquivos completos com mudanças apenas do escopo da etapa.
- Página funcional não depende de dados demo para fingir comportamento.
- TypeScript, lint e build do projeto verificados pelo usuário no Windows (ou pela automação de CI, se disponível).
- Commit GitHub registrado e `main` sincronizada **antes de avançar**.
