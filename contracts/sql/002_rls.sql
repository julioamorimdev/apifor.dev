-- apifor.dev — Row-Level Security
-- App seta por conexão/request:  SET app.current_org = 'org_…';
-- app_user e plan_catalog ficam FORA do RLS (globais).

BEGIN;

-- helper: org corrente (NULL-safe)
CREATE OR REPLACE FUNCTION current_org() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_org', true), '') $$;

-- ── tabelas com coluna org_id direta ──
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'workspace','membership','subscription','usage_event','worker_hours_counter','invoice',
    'repository','pinned_worker','worker_instance','lease','routine','task','pull_request',
    'qa_report','secret_ref','connection','managed_vault_secret','memory','kb_document',
    'audit_log','notification','device'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY org_isolation ON %I USING (org_id = current_org()) WITH CHECK (org_id = current_org());', t);
  END LOOP;
END $$;

-- ── org: isola pelo próprio id ──
ALTER TABLE org ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_self ON org USING (id = current_org()) WITH CHECK (id = current_org());

-- ── tabelas com seed global (org_id NULL visível a todos; escrita só na própria org) ──
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['functional_profile','agent_profile']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY tenant_rw  ON %I USING (org_id = current_org()) WITH CHECK (org_id = current_org());', t);
    EXECUTE format('CREATE POLICY global_read ON %I FOR SELECT USING (org_id IS NULL);', t);
  END LOOP;
END $$;

-- ── filhas sem org_id direta: isolam via pai ──
ALTER TABLE pool_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_workspace ON pool_config
  USING (EXISTS (SELECT 1 FROM workspace w WHERE w.id = pool_config.workspace_id AND w.org_id = current_org()))
  WITH CHECK (EXISTS (SELECT 1 FROM workspace w WHERE w.id = pool_config.workspace_id AND w.org_id = current_org()));

ALTER TABLE step ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_task ON step
  USING (EXISTS (SELECT 1 FROM task t WHERE t.id = step.task_id AND t.org_id = current_org()))
  WITH CHECK (EXISTS (SELECT 1 FROM task t WHERE t.id = step.task_id AND t.org_id = current_org()));

ALTER TABLE ci_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY via_pr ON ci_run
  USING (EXISTS (SELECT 1 FROM pull_request p WHERE p.id = ci_run.pr_id AND p.org_id = current_org()))
  WITH CHECK (EXISTS (SELECT 1 FROM pull_request p WHERE p.id = ci_run.pr_id AND p.org_id = current_org()));

COMMIT;
