-- apifor.dev — role dos workers/runtime (M6.5)
-- O cérebro deixa de rodar como superuser: o pool primário (writes do pipeline +
-- workers cross-org: reaper/scheduler/métricas/seed/login) passa a usar apifor_worker,
-- que é NOSUPERUSER mas BYPASSRLS (precisa varrer todas as orgs). Só o migrate (DDL)
-- segue como postgres. Reads e writes org-escopados do REST seguem no apifor_app (RLS).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apifor_worker') THEN
    CREATE ROLE apifor_worker LOGIN PASSWORD 'workerpw'
      NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO apifor_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apifor_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO apifor_worker;

COMMIT;
