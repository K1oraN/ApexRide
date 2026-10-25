# ETAPA 02 — Direção visual e testes de aceitação

**Ponto de partida:** screenshots gerados `01_apresentacao.png`, `02_login.png` e `03_cadastro.png`. O aplicativo real contém conteúdos e restrições distintas das telas conceituais; sua integridade prevalece.

## 01. Apresentação (`/`)

- Aparência noturna preto/carvão com vermelho Apex, fotografia existente ao fundo, gradientes para leitura e título forte em itálico.
- Botões principais (criar conta e recursos), menu responsivo e âncoras já existentes preservados.
- Recursos com cartões de proporção uniforme e foco/hover perceptíveis, inclusive em celular.
- CTA e rodapé mantêm acesso à informação e legislação atual.

## 02. Entrar (`/entrar`)

- Fotografia em seção hero e formulário com caixas amplas, ícones, senhas visíveis/ocultas, CTA vermelho e ação secundária de cadastro.
- Login real por e-mail ou usuário, senha, retorno à rota anterior e tratamento de falhas do servidor preservados.
- Link de recuperação e reenvio de confirmação permanecem disponíveis.

## 03. Cadastro (`/cadastro`)

- Mesma linguagem visual; campos de nome, usuário, e-mail, senha e confirmação distribuídos em cartões legíveis.
- Senha mínima **15 caracteres conforme implementação**, e não 6 como num conceito ilustrativo.
- Termos, política, aceite e possíveis avisos preliminares preservados integralmente.
- Não há indicador de usuário disponível, pois não foi criada consulta de disponibilidade no backend.

## 04. Recuperação e confirmação

- As telas `/recuperar-senha` e links de redefinição/confirmação herdam a estética, sem mudança nos tokens, validações ou endpoints.

## Testes manuais recomendados

1. 320/375/430 px: rolagem vertical natural, sem campo cortado e sem texto vertical ou sobreposto.
2. 768/1024/1440 px: hero e formulário em proporção adequada, botões dimensionados, menu acessível.
3. Teclado: foco visível, `Tab`, `Enter` e menu, teclado virtual no celular.
4. Login com credenciais válidas, erro para credenciais erradas (não usar senhas reais em capturas).
5. Cadastro com senhas divergentes, tamanho abaixo de 15, aceite obrigatório, carregamento legal e feedback de sucesso.
6. Envio da recuperação em configuração ativa; quando desativada, mensagem real apropriada.
7. Navegação após autenticação volta para o caminho correto; sem loops.
8. Respeitar `prefers-reduced-motion` e contraste mínimo de textos e placeholders.

## O que não faz parte desta etapa

Nenhum dado da tela de referência é inserido como falso usuário ou resultado de autenticação. Não cria endpoints, imagens novas de fundo, migrações, credenciais ou fontes externas. As cenas usam `/assets/profile-cover.webp` existente.

Próxima etapa: **03 — Explorar, busca de endereços e navegação com OSRM/geocodificação reais**.
