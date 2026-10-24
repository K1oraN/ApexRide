# Matriz administrativa — Parte 22

As permissões persistem em `admin_role_permissions`. A API consulta novamente
essa fonte em cada operação e dentro de cada transação privilegiada. O indicador
`administrativeAccess` no DTO da própria conta serve somente para renderizar o
link; não concede autoridade. A lista antiga `route_moderators` não autoriza APIs
nem abre rascunhos privados.

| Papel                                    | Permissões iniciais                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Superadministrador (`superadmin`)        | Todas as permissões administrativas explícitas                                                                                              |
| Administrador da plataforma (`platform`) | Dashboard; leitura de contas; advertências/restrições/suspensões; denúncias e decisões; conteúdos; grupos; eventos; privacidade; incidentes |
| Moderador (`moderator`)                  | Dashboard; fila de denúncias; evidência de caso atribuído; decisões de conteúdo; advertências e restrições limitadas                        |
| Revisor (`route_reviewer`)               | Dashboard; revisão de rotas; verificação de circuitos                                                                                       |
| Integridade (`integrity`)                | Dashboard; revisão de XP/anomalias; solicitação/aprovação de compensações; conquistas e rankings                                            |
| Auditor (`auditor`)                      | Dashboard; auditoria; segurança/incidentes em leitura; segunda aprovação de mudanças críticas de acesso                                     |

O auditor possui **`admin.roles.approve`**, separado de `admin.roles.manage`.
Pode revisar pedido de superadministrador ou de alteração da matriz feito por
gestor autorizado. Não pode solicitar concessões, alterar seu próprio papel,
aprovar acesso para si ou aplicar sanções por esse privilégio. Isso permite a
segunda aprovação sem exigir dois superadministradores previamente existentes.

Permissões disponíveis:

```text
admin.dashboard.read       admin.users.read           admin.users.restrict
admin.users.suspend        admin.reports.read         admin.reports.review
admin.content.moderate     admin.groups.moderate      admin.events.moderate
admin.routes.review        admin.circuits.verify      admin.xp.review
admin.xp.adjust            admin.rankings.manage      admin.audit.read
admin.security.read        admin.roles.manage         admin.roles.approve
admin.settings.manage      admin.privacy.requests     admin.incidents.manage
admin.sessions.revoke
```

Restrições de contexto adicionais:

- Moderadores consultam o conteúdo específico dos casos atribuídos. Veem
  metadados mínimos de casos sem responsável para assumi-los; não podem abrir
  outro caso atribuído. Supervisores podem supervisionar a fila completa.
- Moderadores não suspendem contas e só restringem posts/comentários por até
  sete dias, com caso atribuído que identifique o autor. Contas com papel
  administrativo precisam perder seus papéis antes de sanções comuns.
- Ninguém administra seus próprios privilégios, conteúdo ou XP por esses fluxos.
  Um recurso exige outro revisor e a permissão do domínio afetado.
- Verificar circuito exige `admin.routes.review` e `admin.circuits.verify`, versão
  atual, geometria válida, linha, sentido, confirmação e evidência textual de
  instalação fechada autorizada. Publicação simples não verifica pista.
- Toda compensação de XP exige duas pessoas autorizadas, inclusive valores
  pequenos. O aprovador também não pode ser o beneficiário da alteração.
- Alterar a matriz e conceder/revogar superadministrador exigem duas pessoas.
  Papel raiz, papéis do solicitante/aprovador e último superadministrador
  efetivo têm proteções adicionais. Pedidos expiram em 24 horas e executam uma vez.

Nenhuma permissão dessa matriz abre GPS privado, posição social individual,
vídeos locais ou garagem privada. Não existe exportação administrativa em massa.
