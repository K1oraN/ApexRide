# Operação de moderação

Abra `/admin/reports`. A prioridade inicial é alta somente para denúncias de
dados pessoais ou conteúdo perigoso; os demais casos começam normais. A prioridade
organiza análise e não comprova culpa. Cada denúncia existente gera um caso, com
backfill dos registros anteriores. Duplicação por denunciante/recurso continua
impedida pelas restrições existentes.

Assuma ou designe o caso, abra a evidência delimitada, verifique a política e
registre decisão fundamentada. Estados: aberta, em análise, encaminhada,
aguardando informações, resolvida, encerrada sem violação e reaberta. A versão
do caso evita decisões simultâneas contraditórias. IDs de operação impedem
reaplicar a mesma decisão. Recarregue após conflito.

Posts e comentários podem ser ocultados, removidos logicamente e restaurados.
Fotos são bloqueadas por referência, inclusive miniaturas e acesso por URL
anterior. Só WebP reencodificado pelo serviço social existente é servido como
evidência. A evidência de foto é vinculada ao caso/post específico e auditada;
não há acesso a diretórios de mídia nem vídeos locais. Não modifique textos do
autor. A remoção do post não remove Ride, moto ou pontos GPS.

Grupos privados mantêm autorização de membro no feed comum. O painel lista
somente metadados operacionais e abre o conteúdo específico denunciado quando
atribuído; não concede propriedade ou acesso global ao grupo. Intervenção global
arquiva/suspende o grupo pelo domínio existente, preserva proprietário e membros
e gera decisão visível ao responsável.

Eventos podem sair da descoberta ou ser cancelados. Cancelar revoga sessões de
GPS social e elimina posições efêmeras na mesma transação. O consentimento antigo
não volta quando uma pessoa retorna ao evento. Cancelamento permanece terminal;
restaurar divulgação não reativa evento cancelado nem compartilhamentos. Em uma
revisão de cancelamento, registre a providência adequada e, se necessário, oriente
a criação de novo evento com novos consentimentos. Não existe ativação de GPS
em nome de outra pessoa.

Em `/admin/users`, registre advertência, restrição por funcionalidade ou suspensão,
sempre com política e justificativa. Restrições temporárias precisam de prazo
futuro válido. O backend aplica expiração por consulta ao relógio do banco, mesmo
com frontend fechado. Sanções de conta revogam sessões; as APIs comuns e os
domínios de publicação também aplicam as restrições. A conta pode autenticar
novamente para consultar medidas/recorrer; as demais funções continuam bloqueadas.
Não remova históricos GPS nem alegue exclusão remota de vídeos do aparelho.

O titular consulta `/perfil/medidas`: medidas, decisões pertinentes, recursos e
solicitações de privacidade. A identidade do denunciante não é entregue. Recursos
são únicos por decisão/titular e precisam de outro operador para a revisão.
Reversões exigem também a permissão do domínio afetado; decisões posteriores não
podem ser apagadas por reversão de um caso antigo. Não há e-mails automáticos de
decisão: a comunicação ocorre na área protegida da conta.

Conquistas e suspensões de entrada de ranking geram decisões consultáveis pelo
titular. Compensações de XP usam a fila de aprovação; o original permanece no
ledger. Nenhuma anomalia de GPS ou sincronização offline gera banimento automático.
