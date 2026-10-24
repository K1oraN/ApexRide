CREATE TABLE admin_ranking_entries(user_id uuid NOT NULL REFERENCES users(id),season_id text NOT NULL REFERENCES leaderboard_seasons(id),reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,season_id));
ALTER TABLE moderation_decisions ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
