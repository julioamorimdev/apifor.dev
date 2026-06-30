-- 007: documentação — adiciona o tipo de conexão 'docs' (Confluence, GitHub
-- Wiki, Notion). Idempotente: roda sempre.
ALTER TYPE connection_type ADD VALUE IF NOT EXISTS 'docs';
