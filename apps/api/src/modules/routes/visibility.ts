/**
 * A regra de leitura e aplicada no SQL para impedir vazamento de geometria,
 * pontos de parada e metadados de percursos nao autorizados.
 * O primeiro parametro em SELECTs de rotas e o UUID do visitante (ou NULL).
 */
export const routeReader = (viewer = '$1') => `(
  r.owner_id=${viewer}::uuid
  OR (
    r.status='approved'
    AND EXISTS (
      SELECT 1 FROM users ru
      WHERE ru.id=r.owner_id AND ru.account_status='active'
    )
    AND NOT EXISTS (
      SELECT 1 FROM social_blocks rb
      WHERE (rb.blocker_id=r.owner_id AND rb.blocked_id=${viewer}::uuid)
         OR (rb.blocker_id=${viewer}::uuid AND rb.blocked_id=r.owner_id)
    )
    AND (
      r.visibility='public'
      OR (
        r.visibility='followers'
        AND EXISTS (
          SELECT 1 FROM social_follows sf
          WHERE sf.follower_id=${viewer}::uuid
            AND sf.followed_id=r.owner_id AND sf.status='approved'
        )
      )
      OR (
        r.visibility='group'
        AND EXISTS (
          SELECT 1 FROM groups g
          JOIN group_memberships gm ON gm.group_id=g.id
          WHERE g.id=r.group_id AND g.status='active'
            AND gm.user_id=${viewer}::uuid AND gm.status='active'
            AND NOT EXISTS (
              SELECT 1 FROM group_member_restrictions gr
              WHERE gr.group_id=g.id AND gr.user_id=gm.user_id
                AND gr.restriction_type IN ('ban','remove','suspend')
                AND gr.revoked_at IS NULL
                AND (gr.expires_at IS NULL OR gr.expires_at>now())
            )
        )
      )
    )
  )
)`;

export const publicRouteReader = (viewer = '$1') =>
  `r.status='approved' AND r.visibility='public' AND ${routeReader(viewer)}`;
