CREATE TABLE social_follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('pending','approved')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  approved_at timestamptz(3),
  PRIMARY KEY(follower_id,followed_id),
  CHECK(follower_id<>followed_id)
);
CREATE INDEX social_follows_received ON social_follows(followed_id,status,created_at DESC,follower_id);
CREATE INDEX social_follows_outgoing ON social_follows(follower_id,status,created_at DESC,followed_id);
CREATE TABLE social_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id)
);
CREATE INDEX social_blocks_reverse ON social_blocks(blocked_id,blocker_id);
CREATE TABLE social_posts (
  id uuid PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text varchar(2000) NOT NULL DEFAULT '',
  visibility text NOT NULL CHECK(visibility IN ('public','followers','private')),
  motorcycle_id uuid REFERENCES motorcycles(id) ON DELETE SET NULL,
  ride_id uuid REFERENCES rides(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','restricted','deleted')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  updated_at timestamptz(3) NOT NULL DEFAULT now(),
  deleted_at timestamptz(3)
);
CREATE INDEX social_posts_feed ON social_posts(created_at DESC,id DESC) WHERE status='published';
CREATE INDEX social_posts_author ON social_posts(author_id,created_at DESC,id DESC) WHERE status='published';
CREATE INDEX social_posts_public ON social_posts(created_at DESC,id DESC) WHERE status='published' AND visibility='public';
CREATE TABLE social_post_media (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  post_id uuid REFERENCES social_posts(id) ON DELETE CASCADE,
  file_ref text NOT NULL UNIQUE CHECK(file_ref ~ '^[a-f0-9-]{36}\.webp$'),
  thumbnail_ref text NOT NULL UNIQUE CHECK(thumbnail_ref ~ '^[a-f0-9-]{36}\.webp$'),
  position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 4),
  width integer NOT NULL CHECK(width>0), height integer NOT NULL CHECK(height>0),
  bytes integer NOT NULL CHECK(bytes>0),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE(post_id,position)
);
CREATE INDEX social_media_post ON social_post_media(post_id,position);
CREATE INDEX social_media_pending ON social_post_media(created_at) WHERE post_id IS NULL;
-- Registered before writing files; durable garbage collection survives process failure.
CREATE TABLE social_media_cleanup (
  file_ref text PRIMARY KEY CHECK(file_ref ~ '^[a-f0-9-]{36}\.webp$'),
  available_at timestamptz(3) NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX social_cleanup_due ON social_media_cleanup(available_at);
CREATE TABLE social_post_likes (
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz(3) NOT NULL DEFAULT now(), PRIMARY KEY(post_id,user_id)
);
CREATE TABLE social_post_comments (
  id uuid PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text varchar(1000) NOT NULL CHECK(length(btrim(text)) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','restricted','deleted')),
  created_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX social_comments_page ON social_post_comments(post_id,created_at DESC,id DESC) WHERE status='published';
CREATE TABLE social_reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  post_id uuid REFERENCES social_posts(id) ON DELETE RESTRICT,
  comment_id uuid REFERENCES social_post_comments(id) ON DELETE RESTRICT,
  profile_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(reason IN ('harassment','offensive','spam','fraud','personal_data','dangerous','other')),
  detail varchar(500) NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed')),
  created_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(post_id,comment_id,profile_id)=1)
);
CREATE UNIQUE INDEX social_reports_post ON social_reports(reporter_id,post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX social_reports_comment ON social_reports(reporter_id,comment_id) WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX social_reports_profile ON social_reports(reporter_id,profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX social_reports_pending ON social_reports(created_at) WHERE status='pending';

CREATE INDEX social_users_name ON users(lower(display_name) text_pattern_ops);
CREATE INDEX social_users_username ON users(lower(username) text_pattern_ops);
CREATE INDEX social_profiles_city ON profiles(lower(city) text_pattern_ops);
