# Apex Ride — Etapa 05: Ride e Telemetria

Base consultada: GitHub `K1oraN/ApexRide`, branch `main`, commit `7987b4c6a77cf5bddd2d37d279ca7cf570c613f1` (Etapa 04 já publicada).

## Escopo realizado

- Velocímetro central redesenhado, com arco gradiente, marcações e tipografia de leitura rápida. Valor continua ligado aos dados de GPS/velocidade assistida do app; quando indisponível, mostra `—`.
- Painel de estado de Ride com tempo ativo real e diferenciação entre preparação, espera de GPS, gravação e pausa.
- Barra de estado para GPS, sensores e vídeo alimentada pelos controladores existentes. Não inventa precisão, satélites ou resolução da câmera.
- Cartões de velocidade média e máxima, indicadores estimados de aceleração/frenagem quando compatíveis com o modo, distância e tempo em movimento.
- Grupos de força G e inclinação com visual mais legível. Ângulos sem algoritmo validado continuam `—`.
- Controles de pausar, continuar e finalizar mantidos com callbacks originais do `RidePage`. A mudança é somente visual nos controles, não no ciclo de vida de gravação.
- Melhorias de layout responsivo para menu Ride, escolha de moto/modo, mapa e painel de vídeo existentes.
- Não foram alterados endpoints, tabelas, migrações, políticas de GPS, armazenamento de vídeo ou algoritmos de velocidade.

## Arquivos completos para substituir

```text
apps/web/src/ride/RideDashboard.tsx
apps/web/src/components/telemetry/Speedometer.tsx
apps/web/src/styles/apex-stage-05.css   (novo)
```

`RideDashboard.tsx` importa diretamente `../styles/apex-stage-05.css`. Não é necessário editar `main.tsx` ou apagar CSS de etapas anteriores.

## Importante sobre o mockup

O desenho de referência mostra números como 118 km/h, 12 satélites, duas câmeras e inclinações de 38°/42°. Eles são **exemplos visuais**, não leituras de uma moto real. Esta etapa **não** injeta tais números no sistema. O software atual não fornece contagem confiável de satélites, cálculo homologado de ângulo de inclinação ou gravação simultânea de duas câmeras. A câmera continua conforme as permissões e capacidades reais do aparelho. A gravação contínua em segundo plano não é garantida por navegadores móveis.

## Instalação no Windows

1. Faça uma cópia de segurança de seus arquivos locais. Se houver mudanças locais após o último commit, salve-as antes de substituir. Confira `git status`.
2. Extraia o ZIP; copie apenas as pastas `apps` e `docs` para `D:\Projetos\ApexRide` (ou copie somente os três arquivos indicados acima). A pasta `referencias` serve para comparação, não é asset público.
3. Execute os testes a seguir:

```powershell
cd D:\Projetos\ApexRide
pnpm exec prettier --write apps/web/src/ride/RideDashboard.tsx apps/web/src/components/telemetry/Speedometer.tsx apps/web/src/styles/apex-stage-05.css
pnpm typecheck
pnpm lint
pnpm build
```

### Iniciar o projeto (sem Docker)

O PostgreSQL correto é o runtime na pasta `.local`, porta `55432`, e **não** o serviço Windows na porta `5432`. Se o banco ainda estiver parado:

```powershell
cd D:\Projetos\ApexRide
& ".\.local\postgres-runtime\bin\pg_ctl.exe" start -D ".\.local\postgres-auth\data" -l ".\.local\postgres-auth\server.log" -o "-p 55432 -h 127.0.0.1"
pnpm db:migrate
pnpm dev
```

Se o banco já estiver em execução, não repita `pg_ctl start`. Não há uma nova migração nesta etapa; o comando continua incluído no seu procedimento habitual. Deixe o terminal do `pnpm dev` aberto.

Acesse: `http://127.0.0.1:5173/ride` após autenticar.

### Testes manuais sugeridos

1. **Preparação:** abra `/ride`, confirme que o velocímetro mostra `—` sem leitura e os estados GPS/sensores/vídeo correspondem ao aparelho. Escolha uma moto.
2. **GPS:** ative a prévia em dispositivo físico compatível, permita localização, verifique atualização de precisão; ao perder sinal, não deve manter falsa disponibilidade.
3. **Ride:** parado e em local seguro, inicie, pause, retome e finalize. Confira tempo ativo vs. tempo pausado. **Nunca teste interações enquanto pilota.**
4. **Sensores:** confira que G avançado depende de calibração válida; inclinações continuam indisponíveis.
5. **Vídeo:** confira estados desativado, prévia, gravação e pausa conforme recursos do navegador; não devem aparecer duas câmeras fictícias.
6. **Responsividade:** F12 → visualização 360, 390, 430, 768 e 1280 px. Não deve haver scroll horizontal do painel nem texto na vertical.
7. **Regressão:** `/ride/sessoes`, `/ride/circuitos`, `/ride/telemetria`, `/ride/videos` e `/ride/estudio` devem continuar funcionando. Garagem, autenticação e exploração não foram modificadas.
8. **Etapa 04:** verifique após os testes que rotas publicadas e privadas continuam com suas permissões. A Etapa 05 não as altera.

### Enviar para GitHub depois dos testes

```powershell
cd D:\Projetos\ApexRide
git status
git add apps/web/src/ride/RideDashboard.tsx
git add apps/web/src/components/telemetry/Speedometer.tsx
git add apps/web/src/styles/apex-stage-05.css
git add docs/ETAPA_05_RIDE_TELEMETRIA.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(ride): etapa 05 painel premium de telemetria"
git push origin main
```

Nunca envie `.env`, `.local`, fotos privadas ou dados do banco. Antes do `git push`, confira que está na branch `main` e que não existem conflitos com outro trabalho.

### Encerrar

No terminal do `pnpm dev`, `Ctrl+C`. Depois, se desejar desligar o PostgreSQL local:

```powershell
& ".\.local\postgres-runtime\bin\pg_ctl.exe" stop -D ".\.local\postgres-auth\data" -m fast
```

## Validações realizadas na preparação deste ZIP

- Conferência da HEAD da branch `main` via GitHub antes do desenvolvimento.
- Dois arquivos TSX passaram pela análise de sintaxe do compilador TypeScript (`transpileModule`), sem erros.
- CSS passou pelo parser `tinycss2` sem erros de sintaxe.
- **Não executado**: `pnpm typecheck`, `pnpm lint`, `pnpm build`, testes end-to-end e leitura GPS/câmera em aparelhos reais. Esses testes dependem do projeto e do ambiente local do usuário.

## Próxima etapa

**Etapa 06: Garagem** — destaque visual da moto ativa, cards de veículos, ficha técnica, documentos/manutenção e regras de exclusão. O catálogo técnico das 1.097 motos continua uma frente de curadoria separada.
