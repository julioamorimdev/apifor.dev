-- apifor.dev — schema inicial (Postgres 15+)
-- IDs = ULID com prefixo de tipo, armazenados como text.
-- Tenancy = DB único + org_id + RLS (políticas em 002_rls.sql).
-- Config = híbrido: colunas quentes + JSONB.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────────────────────── ENUMS ─────────────────────────────
CREATE TYPE user_status        AS ENUM ('active','suspended');
CREATE TYPE org_plan           AS ENUM ('free','pro','team','enterprise');
CREATE TYPE permission_tier    AS ENUM ('owner','admin','member','billing','viewer');
CREATE TYPE membership_status  AS ENUM ('active','invited','removed');
CREATE TYPE subscription_status AS ENUM ('active','past_due','grace','canceled');
CREATE TYPE usage_event_type   AS ENUM ('worker_started','worker_stopped','lease_issued','lease_expired','task_dispatched');
CREATE TYPE worker_source      AS ENUM ('pool','pinned');
CREATE TYPE worker_host        AS ENUM ('local','cloud');
CREATE TYPE worker_status      AS ENUM ('idle','running','paused','stopped');
CREATE TYPE lease_end_reason   AS ENUM ('expired','stopped','killed','plan_block','hours_cap');
CREATE TYPE agent_model        AS ENUM ('claude_opus','claude_sonnet','claude_haiku');
CREATE TYPE task_source        AS ENUM ('manual','routine','intervention');
CREATE TYPE task_status        AS ENUM ('queued','assigned','planning','running','blocked','in_review','merged','failed','canceled');
CREATE TYPE step_type          AS ENUM ('plan','exec','test','review','merge','question');
CREATE TYPE step_status        AS ENUM ('pending','running','done','failed');
CREATE TYPE pr_status          AS ENUM ('open','ci_running','approved','changes_requested','merged','closed');
CREATE TYPE pr_ci_status       AS ENUM ('none','running','passed','failed');
CREATE TYPE ci_run_status      AS ENUM ('queued','running','passed','failed');
CREATE TYPE review_status      AS ENUM ('none','approved','changes');
CREATE TYPE merge_strategy     AS ENUM ('squash','merge','rebase');
CREATE TYPE routine_trigger    AS ENUM ('schedule','event','manual');
CREATE TYPE connection_type    AS ENUM ('code','ci','observability','ai_engine');
CREATE TYPE connection_status  AS ENUM ('ok','needs_setup','error');
CREATE TYPE secret_location    AS ENUM ('local','managed_vault');
CREATE TYPE memory_scope       AS ENUM ('global','repo');
CREATE TYPE memory_source      AS ENUM ('intervention','manual');
CREATE TYPE kb_category        AS ENUM ('doc','guide','spec','runbook','reference');
CREATE TYPE audit_actor        AS ENUM ('user','agent','system');

-- helper de timestamps
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ──────────────────────── 1. IDENTIDADE ────────────────────────
CREATE TABLE app_user (                          -- global, fora do RLS
  id            text PRIMARY KEY,                -- usr_…
  email         citext UNIQUE NOT NULL,
  name          text,
  password_hash text,
  oauth         jsonb NOT NULL DEFAULT '{}',
  status        user_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org (
  id            text PRIMARY KEY,                -- org_…
  name          text NOT NULL,
  owner_user_id text NOT NULL REFERENCES app_user(id),
  plan          org_plan NOT NULL DEFAULT 'free',
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE functional_profile (
  id         text PRIMARY KEY,                   -- prof_…
  org_id     text REFERENCES org(id) ON DELETE CASCADE,  -- NULL = seed global
  key        text NOT NULL,
  label      text NOT NULL,
  defaults   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace (
  id         text PRIMARY KEY,                   -- wsp_…
  org_id     text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name       text NOT NULL,
  initial    text,
  settings   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON workspace(org_id);

CREATE TABLE membership (
  id                    text PRIMARY KEY,        -- mbr_…
  org_id                text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id               text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  permission_tier       permission_tier NOT NULL DEFAULT 'member',
  functional_profile_id text REFERENCES functional_profile(id),
  workspace_access      jsonb NOT NULL DEFAULT '"all"',
  status                membership_status NOT NULL DEFAULT 'active',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- ──────────────────────── 2. BILLING & USO ────────────────────────
CREATE TABLE plan_catalog (                      -- global
  id                  org_plan PRIMARY KEY,
  price_cents         int,                       -- por assento (team); total (pro); NULL ent
  currency            text NOT NULL DEFAULT 'usd',
  max_workers         int,                        -- NULL = ilimitado
  lease_ttl_min       int,                        -- NULL = ilimitado
  weekly_worker_hours int,                        -- NULL = ilimitado
  max_members         int,                        -- NULL = ilimitado
  limits              jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE subscription (
  id                     text PRIMARY KEY,        -- sub_…
  org_id                 text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  plan                   org_plan NOT NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 subscription_status NOT NULL DEFAULT 'active',
  seats                  int NOT NULL DEFAULT 1,
  current_period_end     timestamptz,
  grace_until            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON subscription(org_id);

CREATE TABLE usage_event (                        -- ledger append-only
  id                 text PRIMARY KEY,            -- use_…
  org_id             text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id       text REFERENCES workspace(id) ON DELETE SET NULL,
  worker_instance_id text,
  lease_id           text,
  type               usage_event_type NOT NULL,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  meta               jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ON usage_event(org_id, occurred_at);

CREATE TABLE worker_hours_counter (               -- materializado
  org_id       text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  seconds_used bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(org_id, week_start)
);

CREATE TABLE invoice (
  id                text PRIMARY KEY,             -- inv_…
  org_id            text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  stripe_invoice_id text,
  amount_cents      int,
  currency          text NOT NULL DEFAULT 'usd',
  status            text,
  period_start      timestamptz,
  period_end        timestamptz,
  pdf_url           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON invoice(org_id);

-- ──────────────────────── 3. AGENTES ────────────────────────
CREATE TABLE agent_profile (
  id           text PRIMARY KEY,                  -- agp_…
  org_id       text REFERENCES org(id) ON DELETE CASCADE,  -- NULL = seed global
  key          text NOT NULL,
  label        text NOT NULL,
  model        agent_model NOT NULL DEFAULT 'claude_sonnet',
  instructions text,
  capabilities jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────── 4. WORKERS ────────────────────────
CREATE TABLE pool_config (
  id               text PRIMARY KEY,              -- pcfg_…
  workspace_id     text NOT NULL UNIQUE REFERENCES workspace(id) ON DELETE CASCADE,
  parallel_workers int NOT NULL DEFAULT 1,
  timeout_min      int,
  retries          int NOT NULL DEFAULT 2,
  agent_profiles   jsonb NOT NULL DEFAULT '[]',
  behavior         jsonb NOT NULL DEFAULT '{}',   -- isolamento_container, auto_merge…
  merge_rules      jsonb NOT NULL DEFAULT '{}',
  limits           jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE repository (
  id             text PRIMARY KEY,                -- repo_…
  org_id         text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name           text NOT NULL,
  provider       text NOT NULL DEFAULT 'github',
  external_id    text,
  default_branch text NOT NULL DEFAULT 'main',
  connection_id  text,
  settings       jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON repository(workspace_id);

CREATE TABLE pinned_worker (
  id               text PRIMARY KEY,              -- pwk_…
  org_id           text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id     text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  repo_id          text REFERENCES repository(id) ON DELETE SET NULL,
  focus            text,
  concurrency      int NOT NULL DEFAULT 1,
  agent_profile_id text REFERENCES agent_profile(id),
  settings         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pinned_worker(workspace_id);

CREATE TABLE worker_instance (
  id               text PRIMARY KEY,              -- wki_…
  org_id           text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id     text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  source           worker_source NOT NULL,
  pinned_worker_id text REFERENCES pinned_worker(id) ON DELETE SET NULL,
  host             worker_host NOT NULL DEFAULT 'local',
  status           worker_status NOT NULL DEFAULT 'idle',
  current_task_id  text,
  current_step     text,
  lease_id         text,
  last_heartbeat_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON worker_instance(workspace_id, status);

CREATE TABLE lease (
  id                 text PRIMARY KEY,            -- lse_…
  org_id             text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  worker_instance_id text NOT NULL REFERENCES worker_instance(id) ON DELETE CASCADE,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,                 -- NULL = sem TTL
  auto_renew         boolean NOT NULL DEFAULT false,
  ended_at           timestamptz,                 -- NULL = ativo
  end_reason         lease_end_reason
);
CREATE INDEX ON lease(worker_instance_id) WHERE ended_at IS NULL;

-- ──────────────────────── 5. TRABALHO ────────────────────────
CREATE TABLE routine (
  id             text PRIMARY KEY,                -- rtn_…
  org_id         text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id   text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name           text NOT NULL,
  trigger_type   routine_trigger NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}',
  action         jsonb NOT NULL DEFAULT '{}',
  enabled        boolean NOT NULL DEFAULT true,
  last_run_at    timestamptz,
  next_run_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task (
  id                 text PRIMARY KEY,            -- tsk_…
  org_id             text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id       text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  repo_id            text REFERENCES repository(id) ON DELETE SET NULL,
  title              text NOT NULL,
  description        text,
  source             task_source NOT NULL DEFAULT 'manual',
  routine_id         text REFERENCES routine(id) ON DELETE SET NULL,
  status             task_status NOT NULL DEFAULT 'queued',
  priority           int NOT NULL DEFAULT 0,
  agent_profile_id   text REFERENCES agent_profile(id),
  assigned_worker_id text REFERENCES worker_instance(id) ON DELETE SET NULL,
  blocked_reason     text,
  tokens_used        bigint NOT NULL DEFAULT 0,
  retries_count      int NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON task(workspace_id, status, priority DESC);

CREATE TABLE step (
  id          text PRIMARY KEY,                   -- stp_…
  task_id     text NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  idx         int NOT NULL,
  type        step_type NOT NULL,
  label       text,
  status      step_status NOT NULL DEFAULT 'pending',
  worker_id   text REFERENCES worker_instance(id) ON DELETE SET NULL,
  output      jsonb NOT NULL DEFAULT '{}',
  started_at  timestamptz,
  ended_at    timestamptz,
  UNIQUE(task_id, idx)
);

CREATE TABLE pull_request (
  id                  text PRIMARY KEY,           -- pr_…
  org_id              text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  task_id             text REFERENCES task(id) ON DELETE SET NULL,
  repo_id             text REFERENCES repository(id) ON DELETE SET NULL,
  number              int,
  url                 text,
  branch              text,
  status              pr_status NOT NULL DEFAULT 'open',
  ci_status           pr_ci_status NOT NULL DEFAULT 'none',
  ai_review_status    review_status NOT NULL DEFAULT 'none',
  human_review_status review_status NOT NULL DEFAULT 'none',
  merge_strategy      merge_strategy NOT NULL DEFAULT 'squash',
  merged_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pull_request(org_id, status);

CREATE TABLE ci_run (
  id          text PRIMARY KEY,                   -- ci_…
  pr_id       text NOT NULL REFERENCES pull_request(id) ON DELETE CASCADE,
  provider    text,
  url         text,
  status      ci_run_status NOT NULL DEFAULT 'queued',
  started_at  timestamptz,
  finished_at timestamptz,
  summary     jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE qa_report (
  id           text PRIMARY KEY,                  -- qa_…
  org_id       text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  task_id      text REFERENCES task(id) ON DELETE SET NULL,
  pr_id        text REFERENCES pull_request(id) ON DELETE SET NULL,
  repo_id      text REFERENCES repository(id) ON DELETE SET NULL,
  status       text,
  tests_total  int,
  tests_passed int,
  pending      int,
  coverage     numeric,
  duration_ms  int,
  scope        text,
  summary      text,
  cases        jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────── 6. CONEXÕES & SEGREDOS ────────────────────────
CREATE TABLE secret_ref (                         -- NUNCA o valor
  id          text PRIMARY KEY,                   -- sec_…
  org_id      text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text,
  fingerprint text,
  location    secret_location NOT NULL DEFAULT 'local',
  exists      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE connection (
  id            text PRIMARY KEY,                 -- con_…
  org_id        text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id  text REFERENCES workspace(id) ON DELETE CASCADE,
  type          connection_type NOT NULL,
  provider      text NOT NULL,
  label         text,
  scope         text,
  status        connection_status NOT NULL DEFAULT 'needs_setup',
  settings      jsonb NOT NULL DEFAULT '{}',
  secret_ref_id text REFERENCES secret_ref(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- vínculo tardio repository.connection_id → connection
ALTER TABLE repository
  ADD CONSTRAINT repository_connection_fk
  FOREIGN KEY (connection_id) REFERENCES connection(id) ON DELETE SET NULL;

CREATE TABLE managed_vault_secret (               -- só cloud workers add-on
  id            text PRIMARY KEY,
  org_id        text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  secret_ref_id text NOT NULL REFERENCES secret_ref(id) ON DELETE CASCADE,
  kms_key_id    text NOT NULL,
  ciphertext    bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────── 7. MEMÓRIA & KB ────────────────────────
CREATE TABLE memory (
  id           text PRIMARY KEY,                  -- mem_…
  org_id       text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  scope        memory_scope NOT NULL DEFAULT 'global',
  repo_id      text REFERENCES repository(id) ON DELETE CASCADE,
  instruction  text NOT NULL,
  source       memory_source NOT NULL DEFAULT 'manual',
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kb_document (
  id           text PRIMARY KEY,                  -- kb_…
  org_id       text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name         text NOT NULL,
  category     kb_category NOT NULL DEFAULT 'doc',
  file_ref     text,
  indexed      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────── 8. OPS ────────────────────────
CREATE TABLE audit_log (
  id          text PRIMARY KEY,                   -- aud_…
  org_id      text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  actor_type  audit_actor NOT NULL,
  actor_id    text,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log(org_id, occurred_at);

CREATE TABLE notification (
  id         text PRIMARY KEY,                    -- ntf_…
  org_id     text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type       text,
  title      text,
  body       text,
  link       text,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notification(user_id, read);

-- device (executor enrollment / mTLS)
CREATE TABLE device (
  id            text PRIMARY KEY,                 -- dev_…
  org_id        text NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  label         text,
  cert_serial   text,
  cert_expires_at timestamptz,
  revoked_at    timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON device(org_id);

-- triggers updated_at
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['app_user','org','functional_profile','workspace','membership',
    'subscription','agent_profile','pool_config','repository','pinned_worker','worker_instance',
    'routine','task','pull_request','secret_ref','connection']) LOOP
    EXECUTE format('CREATE TRIGGER %I_set_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

COMMIT;
