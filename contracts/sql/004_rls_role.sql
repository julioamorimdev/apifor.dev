-- apifor.dev — role da aplicação p/ ENFORCEMENT de RLS (M6.3)
-- O cérebro lê o REST por esta role (não-superuser => RLS aplica). Os workers
-- cross-org (reaper/scheduler/métricas) seguem na role superuser (bypassa RLS).
-- O isolamento dos reads passa a ser feito pelas policies do 002_rls.sql, com
-- a org corrente setada por transação: SELECT set_config('app.current_org', $org, true).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apifor_app') THEN
    CREATE ROLE apifor_app LOGIN PASSWORD 'apppw'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO apifor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apifor_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO apifor_app;

COMMIT;
