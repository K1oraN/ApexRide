-- Parte 21. Fatos privados; nenhuma coordenada é copiada para classificações.
CREATE TABLE xp_rules (
 code text NOT NULL, version integer NOT NULL CHECK(version>0), description text NOT NULL,
 xp_amount integer NOT NULL CHECK(xp_amount BETWEEN 0 AND 10000),
 daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 1 AND 100), enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY(code,version)
);
INSERT INTO xp_rules VALUES
 ('first_ride',1,'Primeira atividade válida',100,1,true),
 ('ride',1,'Atividade elegível salva',20,3,true),
 ('first_route',1,'Primeira rota distinta elegível',40,1,true),
 ('route',1,'Nova rota distinta elegível',25,2,true),
 ('event',1,'Participação verificada em evento',30,2,true),
 ('exploration',1,'Conquista de exploração',50,2,true),
 ('community',1,'Conquista de participação',40,2,true);
CREATE TABLE xp_level_config (
 version integer PRIMARY KEY, thresholds integer[] NOT NULL, extension_step integer NOT NULL CHECK(extension_step>0), activated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO xp_level_config(version,thresholds,extension_step) VALUES(1,ARRAY[0,100,250,450,700,1000,1350,1750,2200,2700],550);
CREATE TABLE leaderboard_seasons (
 id text PRIMARY KEY, name text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('scheduled','active','closed','archived')),
 rules_version integer NOT NULL DEFAULT 1, revision integer NOT NULL DEFAULT 1,
 closed_at timestamptz, CHECK(ends_at>starts_at)
);
CREATE TABLE xp_ledger (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 rule_code text NOT NULL, rule_version integer NOT NULL, source_type text NOT NULL,
 source_id text NOT NULL, occurrence_key text NOT NULL, generation integer NOT NULL CHECK(generation>0),
 xp_delta integer NOT NULL CHECK(xp_delta BETWEEN -10000 AND 10000 AND xp_delta<>0),
 status text NOT NULL CHECK(status IN ('granted','reversal')), reason text NOT NULL,
 reversal_of_id bigint UNIQUE REFERENCES xp_ledger(id),
 season_id text REFERENCES leaderboard_seasons(id), category text NOT NULL DEFAULT 'Não classificada',
 displacement_band text NOT NULL DEFAULT 'unknown', effective_at timestamptz NOT NULL,
 actor text NOT NULL DEFAULT 'gamification-v1', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,occurrence_key,generation), FOREIGN KEY(rule_code,rule_version) REFERENCES xp_rules(code,version),
 CHECK((status='reversal' AND xp_delta<0 AND reversal_of_id IS NOT NULL) OR (status='granted' AND xp_delta>0 AND reversal_of_id IS NULL))
);
CREATE INDEX xp_ledger_user ON xp_ledger(user_id,id DESC);
CREATE INDEX xp_ledger_season ON xp_ledger(season_id,user_id,category,displacement_band);
CREATE TABLE user_progress (
 user_id uuid PRIMARY KEY REFERENCES users(id), lifetime_xp bigint NOT NULL DEFAULT 0 CHECK(lifetime_xp BETWEEN 0 AND 9007199254740991),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gamification_projection_cursor (user_id uuid PRIMARY KEY REFERENCES users(id),last_ledger_id bigint NOT NULL);
CREATE TABLE gamification_jobs (
 user_id uuid PRIMARY KEY REFERENCES users(id), revision bigint NOT NULL DEFAULT 1,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gamification_jobs_due ON gamification_jobs(available_at,user_id);
CREATE TABLE gamification_ride_facts (
 ride_id uuid PRIMARY KEY REFERENCES rides(id), user_id uuid NOT NULL REFERENCES users(id),
 state text NOT NULL CHECK(state IN ('eligible','pending','ineligible','revoked')),
 reason text NOT NULL, route_key text, circuit boolean NOT NULL DEFAULT false,
 category text NOT NULL, displacement_band text NOT NULL,
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX gamification_facts_user ON gamification_ride_facts(user_id,state,route_key);
CREATE TABLE gamification_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 source_type text NOT NULL, source_id text NOT NULL, reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','rejected')),
 actor text, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX gamification_review_pending ON gamification_reviews(user_id,source_type,source_id) WHERE status='pending';
CREATE TABLE gamification_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),
 actor text NOT NULL,action text NOT NULL,source_id text,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gamification_ride_decisions (
 ride_id uuid PRIMARY KEY REFERENCES rides(id),eligible boolean NOT NULL,actor text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_attendance (
 event_id uuid NOT NULL REFERENCES social_events(id), user_id uuid NOT NULL REFERENCES users(id),
 verified_by uuid NOT NULL REFERENCES users(id), verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz, reason text NOT NULL, PRIMARY KEY(event_id,user_id), CHECK(user_id<>verified_by)
);
CREATE TABLE achievement_definitions (
 code text PRIMARY KEY, name text NOT NULL, description text NOT NULL, category text NOT NULL,
 icon text NOT NULL DEFAULT 'award', metric text NOT NULL, target integer NOT NULL CHECK(target>0),
 version integer NOT NULL DEFAULT 1, reward_rule text, enabled boolean NOT NULL DEFAULT true
);
INSERT INTO achievement_definitions(code,name,description,category,metric,target,reward_rule) VALUES
 ('first_ride','Primeiros passos','Salve uma atividade elegível.','Atividades','rides',1,NULL),
 ('five_rides','Caminho construído','Registre cinco atividades elegíveis, no seu ritmo.','Atividades','rides',5,NULL),
 ('ten_rides','Experiência compartilhada','Registre dez atividades elegíveis.','Atividades','rides',10,NULL),
 ('first_bike','Minha primeira moto','Cadastre sua primeira moto na garagem.','Garagem','bikes',1,NULL),
 ('first_route','Explorador','Conclua uma rota distinta aprovada.','Exploração','routes',1,NULL),
 ('three_routes','Novos Horizontes','Conheça três rotas distintas aprovadas.','Exploração','routes',3,'exploration'),
 ('five_routes','Além do habitual','Conheça cinco rotas distintas aprovadas.','Exploração','routes',5,'exploration'),
 ('first_event','Participante','Participe de um evento com presença verificada.','Comunidade','events',1,'community'),
 ('three_events','Comunidade Ativa','Participe de três eventos com presença verificada.','Comunidade','events',3,'community'),
 ('group_ride','Explorador em Grupo','Participe de um passeio com presença verificada.','Comunidade','groupRides',1,NULL),
 ('first_circuit','Vivência de pista','Registre participação válida em circuito fechado verificado.','Circuitos','circuits',1,NULL);
CREATE TABLE user_achievements (
 user_id uuid NOT NULL REFERENCES users(id), achievement_code text NOT NULL REFERENCES achievement_definitions(code),
 current_value integer NOT NULL CHECK(current_value>=0), status text NOT NULL CHECK(status IN ('locked','unlocked','revoked')),
 unlocked_at timestamptz, awarded_version integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,achievement_code)
);
ALTER TABLE social_posts ADD COLUMN achievement_code text REFERENCES achievement_definitions(code);
CREATE TABLE personal_challenges (
 user_id uuid NOT NULL REFERENCES users(id), code text NOT NULL REFERENCES achievement_definitions(code),
 baseline integer NOT NULL, target integer NOT NULL CHECK(target>0),
 status text NOT NULL CHECK(status IN ('active','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, PRIMARY KEY(user_id,code)
);
CREATE TABLE leaderboard_participation (
 user_id uuid PRIMARY KEY REFERENCES users(id), opted_in boolean NOT NULL DEFAULT false,
 show_progress boolean NOT NULL DEFAULT false, show_achievements boolean NOT NULL DEFAULT false,
 circuit_opt_in boolean NOT NULL DEFAULT false, state text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '',
 region_changed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state IN ('','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 CHECK(length(city)<=80), CHECK(city='' OR state<>'')
);
CREATE TABLE leaderboard_scores (
 season_id text NOT NULL REFERENCES leaderboard_seasons(id), user_id uuid NOT NULL REFERENCES users(id),
 category text NOT NULL, displacement_band text NOT NULL, kind text NOT NULL,
 score bigint NOT NULL CHECK(score BETWEEN 0 AND 9007199254740991), computed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(season_id,user_id,category,displacement_band,kind)
);
CREATE INDEX leaderboard_participation_region ON leaderboard_participation(state,lower(city),user_id) WHERE opted_in;
CREATE INDEX leaderboard_scores_order ON leaderboard_scores(season_id,kind,category,displacement_band,score DESC,user_id);
CREATE FUNCTION gamification_enqueue() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE who uuid;
BEGIN
 IF TG_TABLE_NAME='rides' OR TG_TABLE_NAME='motorcycles' THEN who:=NEW.owner_id;
 ELSE who:=NEW.user_id; END IF;
 INSERT INTO gamification_jobs(user_id) VALUES(who) ON CONFLICT(user_id) DO UPDATE SET revision=gamification_jobs.revision+1,available_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER gamification_rides AFTER INSERT OR UPDATE ON rides FOR EACH ROW EXECUTE FUNCTION gamification_enqueue();
CREATE TRIGGER gamification_motorcycles AFTER INSERT OR UPDATE ON motorcycles FOR EACH ROW EXECUTE FUNCTION gamification_enqueue();
CREATE TRIGGER gamification_attendance AFTER INSERT OR UPDATE ON event_attendance FOR EACH ROW EXECUTE FUNCTION gamification_enqueue();
CREATE FUNCTION gamification_event_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO gamification_jobs(user_id) SELECT user_id FROM event_attendance WHERE event_id=NEW.id
 ON CONFLICT(user_id) DO UPDATE SET revision=gamification_jobs.revision+1,available_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER gamification_event AFTER UPDATE OF status ON social_events FOR EACH ROW EXECUTE FUNCTION gamification_event_changed();
CREATE FUNCTION gamification_route_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE gamification_ride_facts f SET evaluated_at='epoch' FROM rides r WHERE r.id=f.ride_id AND r.route_id=NEW.id;
 INSERT INTO gamification_jobs(user_id) SELECT DISTINCT owner_id FROM rides WHERE route_id=NEW.id
 ON CONFLICT(user_id) DO UPDATE SET revision=gamification_jobs.revision+1,available_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER gamification_route AFTER UPDATE OF status,verification ON routes FOR EACH ROW EXECUTE FUNCTION gamification_route_changed();
INSERT INTO gamification_jobs(user_id) SELECT id FROM users;
CREATE FUNCTION gamification_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'XP ledger is append only'; END $$;
CREATE TRIGGER xp_immutable BEFORE UPDATE OR DELETE ON xp_ledger FOR EACH ROW EXECUTE FUNCTION gamification_ledger_immutable();
