CREATE TABLE users (
  id uuid PRIMARY KEY,
  display_name varchar(60) NOT NULL,
  username varchar(30) NOT NULL CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  email varchar(254) NOT NULL CHECK (email = lower(btrim(email))),
  password_hash text NOT NULL,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','disabled')),
  email_verified_at timestamptz,
  terms_version varchar(100) NOT NULL,
  privacy_version varchar(100) NOT NULL,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  biography varchar(300) NOT NULL DEFAULT '',
  city varchar(80) NOT NULL DEFAULT '',
  state char(2) NOT NULL DEFAULT '' CHECK (state IN ('','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  avatar_ref text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_visibility text NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public','private')),
  activity_visibility text NOT NULL DEFAULT 'public' CHECK (activity_visibility IN ('public','private')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX user_sessions_expiry_idx ON user_sessions(expires_at);
CREATE TABLE account_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('password_reset','email_verify')),
  secret_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_tokens_user_purpose_idx ON account_tokens(user_id,purpose);
CREATE INDEX account_tokens_expiry_idx ON account_tokens(expires_at);
-- Compartilhado entre processos, sem armazenar IP/e-mail em texto puro.
CREATE TABLE auth_rate_limits (
  key_hash char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
