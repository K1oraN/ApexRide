# Gamificação — Parte 21

## Usar

Abra **Perfil** para consultar XP confirmado, nível e progresso. **Conquistas e
metas** mostra o catálogo, condições, progresso e estados reais. **Histórico de
XP** mostra concessões e compensações. **Comunidade → Rankings** reúne filtros,
temporadas, posicionamento e escolhas de divulgação. A área de Privacidade também
oferece essas escolhas. As cinco abas e o botão Ride foram preservados.

Nenhum saldo ou desbloqueio é calculado pelo navegador. Sem rede, as consultas
ficam indisponíveis; a interface não mantém rankings antigos como resultados
atuais. O aplicativo continua guardando sessões offline pelo fluxo anterior.

## Regras iniciais v1

| Regra                         |  XP | Limite                                    |
| ----------------------------- | --: | ----------------------------------------- |
| Primeira atividade elegível   | 100 | Um marco pessoal válido                   |
| Atividade elegível salva      |  20 | Três por dia de recebimento               |
| Primeira rota distinta        |  40 | Uma primeira rota válida                  |
| Outra rota distinta           |  25 | Duas novas rotas por dia de recebimento   |
| Presença verificada em evento |  30 | Dois eventos por dia de verificação       |
| Conquista de exploração       |  50 | Duas por dia do fato que atingiu o limiar |
| Conquista comunitária         |  40 | Duas por dia do fato que atingiu o limiar |

Valores e limites ficam em `xp_rules`, com versão, descrição e estado habilitado.
O dia é definido em `America/Sao_Paulo`. Velocidade, inclinação, força G,
aceleração, frenagem, potência da moto, likes, seguidores e GPS social não entram
no cálculo. Distância e duração são apenas critérios mínimos de qualidade,
sem multiplicadores. Os parâmetros são um balanceamento inicial de produto.

Uma primeira atividade GPS elegível recebe 100 + 20 XP. Se também concluir uma
primeira rota aprovada, recebe mais 40 XP. Uma mesma atividade nunca pontua
novamente por retentativa, sincronização ou troca de regra.

## Elegibilidade

O registro precisa estar salvo no backend e pertencer à conta. O servidor anterior
já normaliza e valida pontos, intervalos, timestamps e saltos GPS. A gamificação
exige pelo menos 60 segundos ativos, 100 metros e dez pontos; precisão média até
30 metros, cobertura GPS contínua de pelo menos 50% do tempo ativo e lacunas
dentro do segmento de até 30 segundos. Sessões sobrepostas plausíveis e registros
com inconsistência temporal ficam pendentes para revisão, sem bloquear a conta.

Dados insuficientes não pontuam. Exclusão revoga. A ausência de sensores ou de
GPS Assistido não impede uma atividade GPS válida. Atividade privada recebe XP
pessoal normalmente. Qualidade insuficiente preserva a sessão e cria registro de
revisão; nenhuma acusação automática de fraude é feita.

Exploração usa a **versão aprovada de rota** da Parte 11 e a conclusão calculada
no servidor pelo `RouteTracker` existente. Uma impressão da geometria, equivalente
também no sentido inverso, evita recompensar IDs diferentes com geometria igual.
Repetir a rota ou sua versão sem mudança geométrica não gera novas rotas.
Trajetos sem associação aprovada continuam disponíveis na Parte 15, mas não
recebem automaticamente XP de exploração nesta implementação. Variantes
geométricas quase iguais dependem da revisão das rotas; não há agrupamento
transitivo de trajetos para pontuar.

## Níveis e catálogo

Os limiares iniciais são 0, 100, 250, 450, 700, 1.000, 1.350, 1.750, 2.200 e
2.700 XP. Após o décimo nível, cada nível acrescenta inicialmente 550 XP; não
existe teto artificial no nível 10. `xp_level_config` versiona os limiares e o
incremento. Nível, próximo limiar e percentual derivam do saldo válido. O cálculo
recusa negativos, frações e overflow e respeita o teto de inteiros seguros.

| Código        | Conquista                 | Condição                                   | XP adicional |
| ------------- | ------------------------- | ------------------------------------------ | -----------: |
| first_ride    | Primeiros passos          | Uma atividade elegível                     |            0 |
| five_rides    | Caminho construído        | Cinco atividades elegíveis                 |            0 |
| ten_rides     | Experiência compartilhada | Dez atividades elegíveis                   |            0 |
| first_bike    | Minha primeira moto       | Primeiro cadastro válido na Garagem        |            0 |
| first_route   | Explorador                | Uma rota distinta concluída                |            0 |
| three_routes  | Novos Horizontes          | Três rotas distintas                       |           50 |
| five_routes   | Além do habitual          | Cinco rotas distintas                      |           50 |
| first_event   | Participante              | Uma presença verificada                    |           40 |
| three_events  | Comunidade Ativa          | Três presenças verificadas                 |           40 |
| group_ride    | Explorador em Grupo       | Um passeio com presença verificada         |            0 |
| first_circuit | Vivência de pista         | Uma sessão elegível em circuito verificado |            0 |

Conquistas de atividade, exploração, evento e circuito dependem dos fatos atuais:
perder a condição revoga o estado e compensa o prêmio correspondente. A data do
primeiro reconhecimento é preservada. A conquista de Garagem é um marco histórico:
arquivar a moto não elimina o cadastro histórico e não permite farmar XP, pois
esse marco não oferece pontos. Definições desabilitadas ficam indisponíveis.

Metas opcionais acompanham **uma próxima atividade**, **uma próxima rota distinta**
ou **um próximo evento verificado**, a partir do valor no momento da adesão.
Não há prazo, sequência diária, penalidade, recompensa extra ou editor de provas.
Cancelar preserva XP. Uma meta pode ser retomada após cancelamento com nova base.

## Eventos

Após o encerramento, outra pessoa autorizada da organização pode verificar a
presença de participante confirmado durante o evento, informando motivo. Na lista
de participantes, abra **Verificar participação efetiva**. A pessoa não pode
verificar a própria presença. A decisão pode ser revogada e restaurada, mantendo
o instante original de verificação para impedir transferência entre temporadas.

RSVP, convite, abrir mapa e ativar GPS social não comprovam presença. Eventos
cancelados não pontuam. Decisões deixam histórico em `event_actions` e em
`gamification_audit`, incluindo responsável e motivo. Não há garantia técnica
absoluta contra conluio entre organizador e participante; revisão humana e
restrições futuras pertencem à Parte 22.

## Temporadas e rankings

Meses de calendário com limites calculados pelo servidor em `America/Sao_Paulo`,
início inclusivo e término exclusivo. Estados: agendada, ativa, encerrada e
arquivada. O fechamento é idempotente e preserva XP histórico e níveis. O sistema
mantém o mês anterior, atual e próximo; meses existentes permanecem consultáveis.

**Política offline:** o mês de recebimento confirmado no backend determina a
temporada de uma nova sessão, inclusive quando foi gravada antes. A data enviada
pelo cliente nunca escolhe uma temporada encerrada. Para eventos, vale o instante
de verificação. Prêmios de conquistas usam o recebimento do fato que atingiu o
limiar. Registros anteriores à ativação da Parte 21 recebem apenas XP histórico.
O processamento não injeta novos prêmios em temporadas já fechadas.

Correções de concessões de uma temporada fechada geram compensações e incrementam
sua revisão pública. O checkpoint do ledger impede incrementar repetidamente
sem uma nova alteração. Não existe premiação financeira nem resultado imutável
certificado.

Rankings disponíveis: XP sazonal, participação comunitária e exploração.
Filtros: temporada, região do Brasil, UF, município, categoria e faixa de
cilindrada. Categorias reutilizam o mapeamento verificado da Parte 14; não se
deduz estilo pela cilindrada. A categoria/faixa da sessão é congelada na primeira
avaliação, usando a moto realmente associada e seu snapshot histórico. Eventos e
prêmios sem vínculo com moto ficam **Não classificada / Não informada**.

Participação começa desligada. Perfil precisa ser público e conta ativa; bloqueios
são reavaliados por consulta. Região é escolhida pelo usuário, sem coordenadas
ou inferência de residência. Alterações são permitidas a cada 30 dias; desativar
a participação mantendo a região atual sempre é possível. Classificações
regionais exigem pelo menos cinco pessoas elegíveis na seleção. Filtros restritos
sem esse número recebem mensagem, sem lista ou posição.

Empates compartilham a posição (`rank`); UUID estabiliza a ordem entre empates.
A lista retorna vinte pessoas por página, mais indicador de continuação. O
posicionamento é consultado no backend. Projeções indexadas evitam reler GPS ou
recalcular XP nacional. Contas com processamento pendente ficam temporariamente
fora da lista; no Perfil o processamento é indicado. Não há cache público.
Sair, tornar perfil privado ou bloquear alguém altera a autorização das próximas
consultas imediatamente, sem apagar progresso pessoal.

## Privacidade, circuitos e compartilhamento

Histórico de XP, origem, progresso detalhado de conquistas e análises de pista
exigem o proprietário. Ranking contém somente nome público, username, posição,
XP sazonal e região escolhida. O usuário pode autorizar separadamente XP/nível
e nomes de conquistas no perfil público; a resposta pública não contém datas
de desbloqueio, origem, nomes de eventos, grupos ou coordenadas.

**Compartilhar conquista** reutiliza o compositor social: texto editável, destino,
público, prévia e confirmação. O backend valida a conquista própria desbloqueada.
O post guarda o código seguro da conquista; nunca copia o fato privado que a
originou. A medalha é reavaliada na leitura e desaparece se for revogada. Legendas
escritas voluntariamente pelo usuário continuam sujeitas às regras sociais.

Circuitos exibem voltas pessoais recalculadas pelo detector anterior. Elegibilidade
considera circuito fechado verificado, versão atual, método GPS existente,
sessão Pista, conclusão da geometria, precisão média até 20 metros, lacunas até
cinco segundos e precisão da volta. Dados não comparáveis permanecem apenas
pessoais. Tempos aparecem como estimativas com uma casa decimal em segundos.

O consentimento técnico de circuitos é separado e começa desligado. A API
**não publica ranking competitivo**, nem experimental: falta homologar a precisão
real de smartphones e a comparabilidade. Retorna `official:false`,
`experimentalAvailable:false` e nenhuma entrada pública, mesmo com opt-in.
Autorizar não transforma uma volta em cronometragem oficial. Rotas de rua são
recusadas nesse endpoint. Não há XP por menor tempo ou maior velocidade.

## Operação e roteiro físico

```powershell
npx --yes pnpm@10.34.7 db:migrate
npx --yes pnpm@10.34.7 gamification:reconcile
```

A migração agenda contas existentes. O worker da API processa lotes de até cem
atividades por conta e vinte contas por rodada, com retentativa durável. O CLI
executa até cem rodadas por chamada e informa pendências. Pode ser retomado.
`gamification:reconcile --enqueue-all` agenda reconciliação dos fatos existentes;
não altera telemetria, duplica sessões nem muda a data de recebimento.

Android Chrome, Safari iPhone e desktop devem ser homologados com sessões
sintéticas ou dispositivos parados, nunca com condução arriscada:

1. Criar conta; Perfil deve mostrar nível 1 e zero XP, sem medalhas fictícias.
2. Registrar/salvar atividade elegível controlada; confirmar 120 XP, nível 2,
   progresso, histórico com 100 e 20 e conquista Primeiros passos.
3. Repetir o mesmo envio; saldo permanece igual. Descartar outra atividade não
   gera pontuação. Sensores desligados e atividade privada continuam elegíveis.
4. Salvar offline; confirmar mensagem de avaliação após sincronização, sem XP
   definitivo. Reconectar e sincronizar duas vezes; verificar concessão única.
5. Concluir três rotas aprovadas distintas; verificar progresso e Novos Horizontes.
   Repetir a rota não incrementa exploração. Testar desconexão e retentativa.
6. Confirmar RSVP; nenhum XP. Após evento controlado, outra pessoa da organização
   verifica a presença; confirmar 30 + 40. Revogar; conferir compensações.
7. Ativar ranking explicitamente em duas contas públicas; conferir posições e
   empate. Sair de uma; confirmar remoção e preservação do XP. Região com menos
   de cinco pessoas não publica classificação regional.
8. Testar perfil privado, bloqueios, conta distinta e saída/login. Nenhuma origem
   privada, evento ou ponto GPS deve aparecer por conquistas/rankings.
9. Compartilhar uma conquista: escolher público, revisar prévia e confirmar.
   Conferir que não houve publicação automática.
10. Excluir atividade; conferir compensação, nível recalculado, conquista
    reavaliada e impossibilidade de recriar a mesma sessão pela fila offline.
11. Abrir circuito verificado; confirmar resultados pessoais estimados e ausência
    de classificação pública/oficial. Não usar tempos de rua para este teste.
12. Conferir 320, 360, 375, 390, 430 e 1440 px, teclado, leitor de tela, foco,
    orientação, reconexão e cinco abas, mantendo velocímetro e Ride intactos.

Homologação física Android/iPhone, Safari real, sensores e GPS de aparelhos,
cronometragem profissional, carga nacional e revisão humana de eventos seguem
pendentes. Testes automatizados e limitações de execução estão no
[relatório da Parte 21](parte-21.md).
