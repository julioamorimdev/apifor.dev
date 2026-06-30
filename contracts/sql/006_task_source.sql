-- 006: fonte de tarefas — adiciona o tipo de conexão 'tasks' (issues/PRs/MRs,
-- Jira, Trello). Idempotente: roda sempre (ALTER TYPE ... IF NOT EXISTS).
ALTER TYPE connection_type ADD VALUE IF NOT EXISTS 'tasks';
