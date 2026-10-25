-- Etapa 04: visibilidade por percurso e publicacao por seu proprietario.
-- Migração aditiva: nenhuma rota, histórico ou favorito e removido.
ALTER TABLE routes
  ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CONSTRAINT routes_visibility_check CHECK (visibility IN ('private','public','followers','group')),
  ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE RESTRICT;

ALTER TABLE routes
  ADD CONSTRAINT routes_visibility_group_consistency CHECK (
    (visibility='group' AND group_id IS NOT NULL) OR
    (visibility<>'group' AND group_id IS NULL)
  );

-- Aprovadas anteriormente permanecem acessiveis ao publico sem mudanca de estado.
-- Pendentes/rejeitadas/arquivadas permanecem privadas ate acao explicita do autor.
UPDATE routes SET visibility='public' WHERE status='approved';

CREATE INDEX routes_visibility_recent ON routes(visibility,status,created_at DESC,id);
CREATE INDEX routes_group_visibility ON routes(group_id,created_at DESC,id)
  WHERE status='approved' AND visibility='group';
CREATE INDEX routes_followers_visibility ON routes(owner_id,created_at DESC,id)
  WHERE status='approved' AND visibility='followers';
