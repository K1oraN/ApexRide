import type { Row } from './service';
export type Input = {
  key: string;
  label: string;
  type?: string;
  options?: [string, string][];
  required?: boolean;
  value?: string;
};
export type Action = {
  label: string;
  path: string;
  fields: Input[];
  extra?: Row;
  critical?: boolean;
};
const reason: Input = {
  key: 'reason',
  label: 'Justificativa e política aplicada',
  type: 'textarea',
  required: true,
};
const uid: Input = { key: 'userId', label: 'ID da conta', required: true };
export function actions(
  section: string,
  row: Row | null,
  permissions: string[],
): Action[] {
  const id = row?.id ?? row?.ride_id,
    version = Number(row?.version ?? 1),
    out: Action[] = [];
  const add = (permission: string, action: Action) => {
    if (permissions.includes('admin.' + permission)) out.push(action);
  };
  if (section === 'users' && id) {
    add('users.restrict', {
      label: 'Advertir',
      path: `/admin/users/${id}/warn`,
      fields: [
        reason,
        { key: 'policyCode', label: 'Código da política', required: true },
      ],
    });
    add('users.restrict', {
      label: 'Restringir funcionalidade',
      path: `/admin/users/${id}/restrict`,
      fields: [
        reason,
        { key: 'policyCode', label: 'Código da política', required: true },
        {
          key: 'scope',
          label: 'Funcionalidade',
          options: [
            ['posts', 'Publicações'],
            ['comments', 'Comentários'],
            ['groups', 'Criar grupos'],
            ['events', 'Organizar eventos e GPS social'],
            ['rankings', 'Rankings'],
            ['social_gps', 'GPS social'],
          ],
        },
        {
          key: 'expiresAt',
          label: 'Expira em',
          type: 'datetime-local',
          required: true,
        },
      ],
    });
    add('users.suspend', {
      label: 'Suspender conta',
      path: `/admin/users/${id}/suspend`,
      critical: true,
      extra: { confirm: 'SUSPENDER' },
      fields: [
        reason,
        { key: 'policyCode', label: 'Código da política', required: true },
        {
          key: 'expiresAt',
          label: 'Expira em (vazio para prazo indeterminado)',
          type: 'datetime-local',
        },
      ],
    });
    add('users.suspend', {
      label: 'Restaurar medida',
      path: `/admin/users/${id}/restore`,
      critical: true,
      fields: [
        { key: 'sanctionId', label: 'ID da medida', required: true },
        reason,
      ],
    });
  }
  if (section === 'reports' && id) {
    const resource = String(row?.target_type),
      resourcePermission =
        resource === 'group'
          ? 'admin.groups.moderate'
          : resource === 'event'
            ? 'admin.events.moderate'
            : 'admin.content.moderate';
    const decisions: [string, string][] = [
      ['dismiss', 'Sem violação / arquivar'],
      ['waiting', 'Solicitar informações'],
      ['escalate', 'Encaminhar caso'],
    ];
    if (
      ['post', 'comment', 'photo', 'group', 'event'].includes(resource) &&
      permissions.includes(resourcePermission)
    )
      decisions.push(
        [
          'hide',
          resource === 'event'
            ? 'Remover evento da descoberta'
            : resource === 'group'
              ? 'Suspender grupo'
              : 'Ocultar conteúdo',
        ],
        [
          'remove',
          resource === 'event'
            ? 'Cancelar evento e revogar GPS social'
            : resource === 'group'
              ? 'Arquivar grupo'
              : 'Remover conteúdo',
        ],
        ['restore', 'Restaurar divulgação / conteúdo elegível'],
      );
    const author = String(
      row?.authorId ??
        (['profile', 'group_member'].includes(String(row?.target_type))
          ? row?.target_id
          : '') ??
        '',
    );
    add('users.restrict', {
      label: 'Advertir autor no caso',
      path: '/admin/users/{userId}/warn',
      fields: [
        { ...uid, value: author },
        reason,
        { key: 'policyCode', label: 'Código da política', required: true },
      ],
      extra: { caseId: id },
    });
    add('users.restrict', {
      label: 'Restringir autor no caso',
      path: '/admin/users/{userId}/restrict',
      fields: [
        { ...uid, value: author },
        reason,
        { key: 'policyCode', label: 'Código da política', required: true },
        {
          key: 'scope',
          label: 'Funcionalidade',
          options: [
            ['posts', 'Publicações'],
            ['comments', 'Comentários'],
          ],
        },
        {
          key: 'expiresAt',
          label: 'Expira em (máximo sete dias para moderador)',
          type: 'datetime-local',
          required: true,
        },
      ],
      extra: { caseId: id },
    });
    add('reports.review', {
      label: 'Atribuir caso',
      path: `/admin/reports/${id}/assign`,
      fields: [
        { key: 'assignedTo', label: 'ID do revisor', required: true },
        reason,
      ],
      extra: { version },
    });
    add('reports.review', {
      label: 'Registrar decisão',
      path: `/admin/reports/${id}/resolve`,
      fields: [
        {
          key: 'action',
          label: 'Decisão',
          options: decisions,
        },
        {
          key: 'reasonCode',
          label: 'Código da política / motivo',
          required: true,
        },
        {
          key: 'explanation',
          label: 'Fundamentação da decisão',
          type: 'textarea',
          required: true,
        },
      ],
      extra: { version },
    });
    add('reports.review', {
      label: 'Reabrir caso',
      path: `/admin/reports/${id}/reopen`,
      fields: [reason],
      extra: { version },
    });
  }
  if (section === 'appeals' && id)
    add('reports.review', {
      label: 'Revisar recurso',
      path: `/admin/appeals/${id}/resolve`,
      critical: true,
      fields: [
        {
          key: 'decision',
          label: 'Resultado',
          options: [
            ['upheld', 'Manter decisão'],
            ['overturned', 'Reverter decisão'],
          ],
        },
        reason,
      ],
    });
  if (['groups', 'events'].includes(section) && id)
    add(section === 'groups' ? 'groups.moderate' : 'events.moderate', {
      label: 'Aplicar decisão',
      path: `/admin/${section}/${id}/decision`,
      critical: true,
      extra: { confirm: 'CONFIRMAR' },
      fields: [
        {
          key: 'action',
          label: 'Medida',
          options:
            section === 'groups'
              ? [
                  ['hide', 'Suspender grupo'],
                  ['remove', 'Arquivar grupo'],
                  ['restore', 'Restaurar grupo'],
                ]
              : [
                  ['hide', 'Remover da descoberta'],
                  ['cancel', 'Cancelar e revogar GPS social'],
                  ['restore', 'Restaurar divulgação'],
                ],
        },
        reason,
      ],
    });
  if (['routes', 'circuits'].includes(section) && id) {
    add('routes.review', {
      label: 'Revisar publicação',
      path: `/admin/routes/${id}/decisions`,
      critical: true,
      fields: [
        {
          key: 'action',
          label: 'Decisão',
          options: [
            ['approve', 'Aprovar publicação'],
            ['reject', 'Rejeitar / solicitar correções'],
            ['archive', 'Arquivar'],
          ],
        },
        reason,
      ],
      extra: { version },
    });
    if (row?.kind === 'circuit' || section === 'circuits') {
      add('circuits.verify', {
        label: 'Verificar circuito para pista',
        path: `/admin/routes/${id}/decisions`,
        critical: true,
        fields: [
          reason,
          {
            key: 'evidence',
            label:
              'Evidência de instalação fechada autorizada (mínimo 30 caracteres)',
            type: 'textarea',
            required: true,
          },
          {
            key: 'closedVenue',
            label: 'Revisei instalação fechada, geometria, linha e sentido',
            type: 'checkbox',
            required: true,
          },
        ],
        extra: { version, action: 'verify' },
      });
      add('circuits.verify', {
        label: 'Suspender verificação',
        path: `/admin/circuits/${id}/suspend-verification`,
        critical: true,
        fields: [reason],
        extra: { version },
      });
    }
  }
  if (section === 'gamification') {
    if (id)
      add('xp.review', {
        label: 'Concluir revisão da anomalia',
        path: `/admin/gamification/anomalies/${id}/review`,
        fields: [
          {
            key: 'status',
            label: 'Conclusão',
            options: [
              ['resolved', 'Análise concluída'],
              ['rejected', 'Sinalização descartada'],
            ],
          },
          reason,
        ],
      });
    add('xp.adjust', {
      label: 'Solicitar compensação de XP',
      path: '/admin/gamification/adjustments/request',
      critical: true,
      fields: [
        { key: 'ledgerId', label: 'ID do lançamento original', required: true },
        reason,
      ],
    });
    add('xp.adjust', {
      label: 'Revisar conquista',
      path: '/admin/gamification/users/{userId}/achievements',
      critical: true,
      fields: [
        uid,
        { key: 'code', label: 'Código da conquista', required: true },
        {
          key: 'action',
          label: 'Decisão',
          options: [
            ['revoke', 'Suspender elegibilidade pública'],
            ['restore', 'Restaurar'],
            ['reprocess', 'Reprocessar'],
          ],
        },
        reason,
      ],
    });
  }
  if (section === 'rankings') {
    add('rankings.manage', {
      label: 'Revisar entrada de ranking',
      path: '/admin/rankings/entries/{userId}/decision',
      critical: true,
      fields: [
        uid,
        {
          key: 'season',
          label: 'Temporada (AAAA-MM)',
          required: true,
          value: String(row?.id ?? ''),
        },
        {
          key: 'action',
          label: 'Decisão',
          options: [
            ['suspend', 'Suspender entrada'],
            ['restore', 'Restaurar'],
            ['reprocess', 'Reprocessar projeção'],
          ],
        },
        reason,
      ],
    });
    add('rankings.manage', {
      label: 'Revisar resultado de pista',
      path: '/admin/rankings/results/{rideId}/decision',
      critical: true,
      fields: [
        { key: 'rideId', label: 'ID da atividade', required: true },
        {
          key: 'state',
          label: 'Estado',
          options: [
            ['review', 'Em revisão'],
            ['invalid', 'Invalidar'],
            ['restore', 'Restaurar'],
          ],
        },
        reason,
      ],
    });
  }
  if (section === 'approvals' && id)
    out.push({
      label: 'Revisar aprovação',
      path: `/admin/approvals/${id}/review`,
      critical: true,
      extra: { confirm: 'CONFIRMAR' },
      fields: [
        {
          key: 'decision',
          label: 'Decisão',
          options: [
            ['approve', 'Aprovar e executar'],
            ['reject', 'Recusar'],
          ],
        },
        reason,
      ],
    });
  if (section === 'operators')
    add('roles.manage', {
      label: 'Gerenciar papel',
      path: '/admin/operators/{userId}/roles',
      critical: true,
      fields: [
        { ...uid, value: String(id ?? '') },
        {
          key: 'role',
          label: 'Papel',
          options: [
            ['moderator', 'Moderador'],
            ['platform', 'Administrador da plataforma'],
            ['route_reviewer', 'Revisor de rotas'],
            ['integrity', 'Analista de integridade'],
            ['auditor', 'Auditor de segurança'],
            ['superadmin', 'Superadministrador (segunda aprovação)'],
          ],
        },
        {
          key: 'action',
          label: 'Operação',
          options: [
            ['grant', 'Conceder'],
            ['revoke', 'Revogar'],
          ],
        },
        reason,
      ],
    });
  if (section === 'roles' && row?.code)
    add('roles.manage', {
      label: 'Solicitar alteração de permissões',
      path: `/admin/roles/${row.code}/permissions`,
      critical: true,
      fields: [
        {
          key: 'permissions',
          label: 'Permissões explícitas (separadas por vírgula)',
          type: 'textarea',
          required: true,
          value: Array.isArray(row.permissions)
            ? row.permissions.join(', ')
            : '',
        },
        reason,
      ],
    });
  if (section === 'security')
    add('sessions.revoke', {
      label: 'Revogar sessões comprometidas',
      path: '/admin/security/revoke',
      critical: true,
      fields: [uid, reason],
    });
  if (section === 'incidents') {
    add('incidents.manage', {
      label: 'Registrar incidente',
      path: '/admin/security/incidents',
      fields: [
        { key: 'category', label: 'Categoria', required: true },
        {
          key: 'severity',
          label: 'Gravidade',
          options: [
            ['low', 'Baixa'],
            ['medium', 'Média'],
            ['high', 'Alta'],
            ['critical', 'Crítica'],
          ],
        },
        {
          key: 'description',
          label: 'Descrição mínima, sem segredos ou coordenadas',
          type: 'textarea',
          required: true,
        },
      ],
    });
    if (id)
      add('incidents.manage', {
        label: 'Atualizar incidente',
        path: `/admin/security/incidents/${id}/decision`,
        fields: [
          {
            key: 'status',
            label: 'Próxima etapa',
            options: [
              ['analysis', 'Em análise'],
              ['containment', 'Contenção'],
              ['correction', 'Correção'],
              ['verification', 'Verificação'],
              ['closed', 'Encerrado'],
            ],
          },
          {
            key: 'containment',
            label: 'Ações e verificação',
            type: 'textarea',
            required: true,
          },
        ],
        extra: { version },
      });
  }
  if (section === 'privacy' && id)
    add('privacy.requests', {
      label: 'Tratar solicitação',
      path: `/admin/privacy/${id}/decision`,
      critical: true,
      fields: [
        {
          key: 'status',
          label: 'Próxima etapa',
          options: [
            ['verifying', 'Verificar identidade'],
            ['processing', 'Em processamento'],
            ['completed', 'Concluída'],
            ['rejected', 'Recusada'],
          ],
        },
        {
          key: 'identityVerified',
          label: 'Identidade verificada pelo procedimento operacional',
          type: 'checkbox',
        },
        {
          key: 'resolution',
          label: 'Resposta e providências reais',
          type: 'textarea',
          required: true,
        },
      ],
      extra: { version },
    });
  if (section === 'settings' && id)
    add('settings.manage', {
      label: 'Versionar orientação de suporte',
      path: '/admin/settings',
      critical: true,
      fields: [
        {
          key: 'reportNotice',
          label: 'Orientação exibida na área de medidas e recursos',
          type: 'textarea',
          required: true,
          value: String((row?.settings as Row)?.reportNotice ?? ''),
        },
        reason,
      ],
      extra: { version: Number(id) },
    });
  return out;
}
