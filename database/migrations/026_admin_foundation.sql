-- Parte 22A: permissões explícitas; nenhuma conta recebe papéis automaticamente.
CREATE TABLE admin_permissions(code text PRIMARY KEY);
INSERT INTO admin_permissions SELECT 'admin.'||p FROM unnest(ARRAY[
 'dashboard.read','users.read','users.restrict','users.suspend','reports.read','reports.review',
 'content.moderate','groups.moderate','events.moderate','routes.review','circuits.verify',
 'xp.review','xp.adjust','rankings.manage','audit.read','security.read','roles.manage',
 'settings.manage','privacy.requests','incidents.manage','sessions.revoke']) p;
CREATE TABLE admin_roles(code text PRIMARY KEY,name text NOT NULL,enabled boolean NOT NULL DEFAULT true);
INSERT INTO admin_roles VALUES ('superadmin','Superadministrador',true),('platform','Administrador da plataforma',true),
 ('moderator','Moderador de conteúdo',true),('route_reviewer','Revisor de rotas e circuitos',true),
 ('integrity','Analista de integridade',true),('auditor','Auditor de segurança',true);
CREATE TABLE admin_role_permissions(role_code text REFERENCES admin_roles(code),permission_code text REFERENCES admin_permissions(code),PRIMARY KEY(role_code,permission_code));
INSERT INTO admin_role_permissions SELECT 'superadmin',code FROM admin_permissions;
INSERT INTO admin_role_permissions SELECT 'platform',code FROM admin_permissions WHERE code IN ('admin.dashboard.read','admin.users.read','admin.users.restrict','admin.users.suspend','admin.reports.read','admin.reports.review','admin.content.moderate','admin.groups.moderate','admin.events.moderate','admin.privacy.requests','admin.incidents.manage');
INSERT INTO admin_role_permissions SELECT 'moderator',code FROM admin_permissions WHERE code IN ('admin.dashboard.read','admin.reports.read','admin.reports.review','admin.content.moderate','admin.users.restrict');
INSERT INTO admin_role_permissions SELECT 'route_reviewer',code FROM admin_permissions WHERE code IN ('admin.dashboard.read','admin.routes.review','admin.circuits.verify');
INSERT INTO admin_role_permissions SELECT 'integrity',code FROM admin_permissions WHERE code IN ('admin.dashboard.read','admin.xp.review','admin.xp.adjust','admin.rankings.manage');
INSERT INTO admin_role_permissions SELECT 'auditor',code FROM admin_permissions WHERE code IN ('admin.dashboard.read','admin.audit.read','admin.security.read');
CREATE TABLE admin_user_roles(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),role_code text NOT NULL REFERENCES admin_roles(code),granted_by uuid NOT NULL REFERENCES users(id),granted_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz);
CREATE UNIQUE INDEX admin_roles_active ON admin_user_roles(user_id,role_code) WHERE revoked_at IS NULL;
CREATE TABLE admin_mfa(user_id uuid PRIMARY KEY REFERENCES users(id),encrypted_secret text NOT NULL,confirmed_at timestamptz,last_counter bigint NOT NULL DEFAULT -1,enrollment_expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes');
CREATE TABLE admin_recovery_codes(user_id uuid REFERENCES users(id),code_hash text NOT NULL,used_at timestamptz,PRIMARY KEY(user_id,code_hash));
CREATE TABLE admin_sessions(session_id uuid PRIMARY KEY REFERENCES user_sessions(id),user_id uuid NOT NULL REFERENCES users(id),verified_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',revoked_at timestamptz);
CREATE INDEX admin_sessions_user ON admin_sessions(user_id) WHERE revoked_at IS NULL;
CREATE TABLE admin_bootstrap(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE admin_audit_logs(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES users(id),action text NOT NULL,resource_type text NOT NULL,resource_id text NOT NULL,permission_used text NOT NULL,outcome text NOT NULL CHECK(outcome IN ('allowed','denied')),reason_code text NOT NULL,correlation_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),previous_hash text NOT NULL DEFAULT '',entry_hash text NOT NULL DEFAULT '');
CREATE INDEX admin_audit_page ON admin_audit_logs(created_at DESC,id DESC);
CREATE INDEX admin_audit_actor ON admin_audit_logs(actor_id,id DESC);
CREATE INDEX admin_audit_resource ON admin_audit_logs(resource_type,resource_id,id DESC);
CREATE FUNCTION admin_audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(220026);
 SELECT entry_hash INTO NEW.previous_hash FROM admin_audit_logs ORDER BY id DESC LIMIT 1;
 NEW.previous_hash:=COALESCE(NEW.previous_hash,'');
 NEW.entry_hash:=encode(sha256(convert_to(jsonb_build_array(NEW.previous_hash,NEW.id,NEW.actor_id,NEW.action,NEW.resource_type,NEW.resource_id,NEW.permission_used,NEW.outcome,NEW.reason_code,NEW.correlation_id,NEW.created_at)::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
CREATE TRIGGER admin_audit_chain BEFORE INSERT ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION admin_audit_chain();
CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION gamification_ledger_immutable();
CREATE TRIGGER admin_audit_no_truncate BEFORE TRUNCATE ON admin_audit_logs FOR EACH STATEMENT EXECUTE FUNCTION gamification_ledger_immutable();
CREATE FUNCTION admin_revoke_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE admin_sessions SET revoked_at=now() WHERE user_id=NEW.user_id AND revoked_at IS NULL; RETURN NEW; END $$;
CREATE TRIGGER admin_role_changed AFTER INSERT OR UPDATE ON admin_user_roles FOR EACH ROW EXECUTE FUNCTION admin_revoke_sessions();
CREATE FUNCTION admin_credentials_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE admin_sessions SET revoked_at=now() WHERE user_id=NEW.id AND revoked_at IS NULL; RETURN NEW; END $$;
CREATE TRIGGER admin_credentials_changed AFTER UPDATE OF password_hash,account_status ON users FOR EACH ROW EXECUTE FUNCTION admin_credentials_changed();
CREATE INDEX admin_users_created ON users(created_at,id);
CREATE INDEX admin_sessions_activity ON user_sessions(last_used_at,user_id) WHERE revoked_at IS NULL;
