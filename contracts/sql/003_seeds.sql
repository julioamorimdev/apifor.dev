-- apifor.dev — seeds (catálogo de planos + perfis globais)

BEGIN;

-- ── plan_catalog (preços em USD-cents; NULL = ilimitado / sob consulta) ──
INSERT INTO plan_catalog (id, price_cents, currency, max_workers, lease_ttl_min, weekly_worker_hours, max_members, limits) VALUES
  ('free',        0,    'usd', 1,    240,  36,   1,    '{"workspaces":1,"managed_cloud":false}'),
  ('pro',         2000, 'usd', 4,    NULL, NULL, 1,    '{"workspaces":1,"managed_cloud":false}'),
  ('team',        3000, 'usd', 20,   NULL, NULL, 10,   '{"workspaces":"multi","rbac":true,"managed_cloud":"addon"}'),
  ('enterprise',  NULL, 'usd', NULL, NULL, NULL, NULL, '{"workspaces":"isolated","sso":true,"audit":"deep","managed_cloud":"addon","per_worker_billing":true}')
ON CONFLICT (id) DO NOTHING;

-- ── functional_profile globais (org_id NULL) ──
INSERT INTO functional_profile (id, org_id, key, label, defaults) VALUES
  ('prof_seed_developer', NULL, 'developer', 'Developer', '{"home":"tasks","routes":["intervencao","qa"]}'),
  ('prof_seed_qa',        NULL, 'qa',        'QA',        '{"home":"qa","routes":["qa","ci"]}'),
  ('prof_seed_reviewer',  NULL, 'reviewer',  'Reviewer',  '{"home":"prs","routes":["prs","intervencao"]}'),
  ('prof_seed_devops',    NULL, 'devops',    'DevOps',    '{"home":"cloud","routes":["cloud","ci","telemetria"]}')
ON CONFLICT (id) DO NOTHING;

-- ── agent_profile globais (org_id NULL) ──
INSERT INTO agent_profile (id, org_id, key, label, model, instructions, capabilities) VALUES
  ('agp_seed_coder',    NULL, 'coder',    'Coder',    'claude_opus',   'Implementa a tarefa e abre PR.',        '{"open_pr":true,"merge":false,"review":false}'),
  ('agp_seed_qa',       NULL, 'qa',       'QA',       'claude_sonnet', 'Escreve e roda testes, relata cobertura.', '{"open_pr":false,"merge":false,"review":false,"test":true}'),
  ('agp_seed_reviewer', NULL, 'reviewer', 'Reviewer', 'claude_sonnet', 'Revisa o código (segunda IA) e aprova ou pede mudanças.', '{"open_pr":false,"merge":false,"review":true}')
ON CONFLICT (id) DO NOTHING;

COMMIT;
