# apiforDEV — Schema de Dados

> Modelo de dados derivado das telas + `LOGICA-DE-NEGOCIO.md`.
> Cobre **server DB** (cérebro) e **local store** (executor). Pseudo-DDL; vira migração SQL depois.
> Status: espinha decidida (identidade, perfis, billing, workers, lease). Entidades de trabalho (task/PR/rotinas/QA/conexões) no próximo lote — ver §99.

---

## 0. Convenções

- **IDs:** ULID com prefixo de tipo. Ex.: `usr_01HZX…`, `wki_01HZX…`. Ordenável por tempo, sincroniza local↔server.
- **Tenancy:** DB único Postgres. Toda tabela de tenant tem `org_id` + **RLS** por `org_id`. (`user` e catálogos globais ficam fora do RLS.)
- **Config:** híbrido — colunas pros campos quentes (indexáveis/filtráveis) + `settings JSONB` pro resto (toggles de comportamento).
- **Timestamps:** toda tabela tem `created_at`, `updated_at` (UTC). Soft-delete via `deleted_at` onde fizer sentido.
- **Segredos:** server **nunca** guarda valor de credencial (só referência/metadado). Valor mora no vault local. Exceção: cloud workers gerenciados (Team/Ent add-on) → vault gerenciado separado.
- **Prefixos:** `usr org wsp mbr prof sub pln use inv agp pcfg pwk wki lse repo tsk stp pr qa ci rtn mem kb con sec aud ntf`.

---

## 1. Identidade & Tenancy

### user  (global, fora do RLS)
| col | tipo | nota |
|---|---|---|
| id | `usr_` ULID | PK |
| email | citext | único |
| name | text | |
| password_hash | text | null se só OAuth |
| oauth | JSONB | provedores ligados (GitHub…) |
| status | enum | active / suspended |
| created_at, updated_at | timestamptz | |

> Login validado pelo backend (cérebro). Sessão emite token usado no heartbeat do executor.

### org
| col | tipo | nota |
|---|---|---|
| id | `org_` ULID | PK |
| name | text | |
| owner_user_id | `usr_` | |
| plan | enum | free / pro / team / enterprise |
| settings | JSONB | preferências da org |
| created_at, updated_at | | |

> Free/Pro = org de 1 membro, 1 workspace. Toda conta tem uma org (mesmo individual) — simplifica o modelo.

### workspace
| col | tipo | nota |
|---|---|---|
| id | `wsp_` ULID | PK |
| org_id | `org_` | RLS |
| name, initial | text | initial = avatar (tela tem seletor de workspace) |
| settings | JSONB | |

### membership  (user ↔ org)
| col | tipo | nota |
|---|---|---|
| id | `mbr_` ULID | PK |
| org_id | `org_` | RLS |
| user_id | `usr_` | |
| permission_tier | enum | **owner / admin / member / billing / viewer** |
| functional_profile_id | `prof_` | null = sem perfil |
| workspace_access | JSONB | lista de `wsp_` ou "all" |
| status | enum | active / invited / removed |

> **Dois eixos:** `permission_tier` = acesso (governança); `functional_profile` = função (dev/QA/…). Ortogonais.

### functional_profile  (perfil humano — extensível por org)
| col | tipo | nota |
|---|---|---|
| id | `prof_` ULID | PK |
| org_id | `org_` | null = perfil global/seed |
| key | text | developer / qa / reviewer / devops / … |
| label | text | |
| defaults | JSONB | telas padrão, roteamento de Intervenção/QA, notificações |

> Seeds globais (developer, qa, reviewer, devops); org cria os próprios.

---

## 2. Plano, Billing & Uso

### plan_catalog  (global)
| col | tipo | nota |
|---|---|---|
| id | `pln_` | free/pro/team/enterprise |
| price_cents, currency | | Pro 2000 USD-cents; Team 3000/assento; Free 0; Ent null (sob consulta) |
| max_workers | int | 1 / 4 / 20 / null(∞) |
| lease_ttl_min | int | 240 (Free) / null(∞) |
| weekly_worker_hours | int | 36 (Free) / null(∞) |
| max_members | int | 1 / 1 / 10 / null(∞) |
| limits | JSONB | demais cotas/flags por plano |

> Catálogo em tabela (não hardcode) → muda preço/limite sem deploy.

### subscription
| col | tipo | nota |
|---|---|---|
| id | `sub_` ULID | PK |
| org_id | `org_` | RLS |
| plan | enum | espelha org.plan |
| stripe_customer_id, stripe_subscription_id | text | **Stripe = fonte de cobrança** |
| status | enum | active / past_due / **grace** / canceled |
| seats | int | Team |
| current_period_end | timestamptz | |
| grace_until | timestamptz | inadimplência: +7 dias antes de rebaixar pra Free |

> **Dunning:** `past_due` → `grace` (7 dias mantendo plano) → não pagou → rebaixa pra Free (org.plan=free). Dados preservados.

### usage_event  (ledger append-only — fonte de verdade do uso)
| col | tipo | nota |
|---|---|---|
| id | `use_` ULID | PK |
| org_id, workspace_id | | RLS |
| worker_instance_id | `wki_` | |
| lease_id | `lse_` | |
| type | enum | worker_started / worker_stopped / lease_issued / lease_expired / task_dispatched |
| occurred_at | timestamptz | |
| meta | JSONB | duração, motivo, etc |

> Append-only. Base do enforcement (36h/sem) e do metered Enterprise. Reportado ao Stripe como usage records.

### worker_hours_counter  (materializado — checagem rápida)
| col | tipo | nota |
|---|---|---|
| org_id | `org_` | PK parte |
| week_start | date | âncora semanal (ex. seg 00:00 UTC — *a confirmar*) |
| seconds_used | bigint | derivado do ledger; cacheado |

> Cérebro lê isto antes de emitir lease no Free. Reconstruível 100% do `usage_event`.

### invoice
| col | tipo | nota |
|---|---|---|
| id | `inv_` ULID | PK |
| org_id | | RLS |
| stripe_invoice_id | text | |
| amount_cents, currency, status | | espelho do Stripe p/ tela Faturas |
| period_start, period_end | | |
| pdf_url | text | |

---

## 3. Agentes (perfil de IA)

### agent_profile  (1ª classe — reusado por pool/pinned)
| col | tipo | nota |
|---|---|---|
| id | `agp_` ULID | PK |
| org_id | `org_` | null = seed global |
| key, label | text | coder / qa / reviewer / custom |
| model | enum | claude-opus / claude-sonnet / claude-haiku ("Modelos por agente") |
| instructions | text | prompt/diretrizes do agente |
| capabilities | JSONB | pode_mergear, só_revisa, pode_abrir_pr, … |

> "revisão IA" das merge rules = um worker com `agent_profile=reviewer`. Pipeline com papéis sai daqui.

---

## 4. Workers (definição × runtime)

### pool_config  (1 por workspace — config global do pool)
| col | tipo | nota |
|---|---|---|
| id | `pcfg_` ULID | PK |
| workspace_id | `wsp_` | único |
| parallel_workers | int | "Workers em paralelo" (≤ plano) |
| timeout_min | int | 15/30/45/60/null |
| retries | int | 1/2/3/5 |
| agent_profiles | JSONB | quais perfis o pool usa |
| behavior | JSONB | isolamento_container, auto_merge, … |
| merge_rules | JSONB | estratégia, exigir CI, exigir revisão IA, exigir humano, deletar branch |
| limits | JSONB | tokens/tarefa, PRs simultâneos, teto gasto, % cota, pausar_em_% |

> Pool = workers compartilhados; qualquer um pega qualquer tarefa de qualquer repo do workspace.

### pinned_worker  (dedicado — máx 8 por workspace)
| col | tipo | nota |
|---|---|---|
| id | `pwk_` ULID | PK |
| workspace_id | `wsp_` | |
| repo_id | `repo_` | repo dedicado |
| focus | text | "Foco" |
| concurrency | int | |
| agent_profile_id | `agp_` | |
| settings | JSONB | overrides |

> Máx 8 é limite de **config**; o nº de instâncias ATIVAS ainda respeita o teto do plano.

### worker_instance  (RUNTIME — segura lease, status live)
| col | tipo | nota |
|---|---|---|
| id | `wki_` ULID | PK |
| org_id, workspace_id | | RLS |
| source | enum | pool / pinned |
| pinned_worker_id | `pwk_` | null se pool |
| host | enum | local / cloud (add-on) |
| status | enum | idle / running / paused / stopped |
| current_task_id | `tsk_` | null |
| current_step | text | tela Live ("›{{ w.step }}") |
| lease_id | `lse_` | lease ativo |
| last_heartbeat_at | timestamptz | |

> Definição (pool_config/pinned_worker) = estável; instância = volátil. Telas Config vs Live.

### lease  (linha por ativação — histórico)
| col | tipo | nota |
|---|---|---|
| id | `lse_` ULID | PK |
| org_id | | RLS |
| worker_instance_id | `wki_` | |
| issued_at | timestamptz | |
| expires_at | timestamptz | issued + ttl (Free 4h; ∞ = null) |
| auto_renew | bool | false (Free) / true (Pro+) |
| ended_at | timestamptz | null = ativo |
| end_reason | enum | expired / stopped / killed / plan_block / hours_cap |

> Worker só recebe tarefa com lease ativo. Soma de `(ended_at−issued_at)` alimenta worker-hours.

---

## 5. Repositórios

### repository
| col | tipo | nota |
|---|---|---|
| id | `repo_` ULID | PK |
| org_id, workspace_id | | RLS |
| name | text | ex. core-gateway |
| provider | enum | github / gitlab / … |
| external_id | text | id no provider |
| default_branch | text | |
| connection_id | `con_` | qual conexão dá acesso |
| settings | JSONB | |

> Server guarda só metadado. Acesso real (token) = via conexão → valor no vault local.

---

## 6. Trabalho: Task → Step → PR

### task
| col | tipo | nota |
|---|---|---|
| id | `tsk_` ULID | PK |
| org_id, workspace_id, repo_id | | RLS |
| title, description | text | |
| source | enum | manual / routine / intervention |
| routine_id | `rtn_` | null se não veio de rotina |
| status | enum | queued / assigned / planning / running / blocked / in_review / merged / failed / canceled |
| priority | int | cérebro prioriza a fila |
| agent_profile_id | `agp_` | opcional (força um perfil) |
| assigned_worker_id | `wki_` | null na fila |
| blocked_reason | text | tela Intervenção ("Por que parou") |
| tokens_used | bigint | vs limite tokens/tarefa |
| retries_count | int | vs "tentativas antes de bloquear" |

### step  (task → steps, tabela — "caminho percorrido")
| col | tipo | nota |
|---|---|---|
| id | `stp_` ULID | PK |
| task_id | `tsk_` | |
| idx | int | ordem |
| type | enum | plan / exec / test / review / merge / question |
| label | text | tela Live/Intervenção |
| status | enum | pending / running / done / failed |
| worker_id | `wki_` | quem executou |
| output | JSONB | resultado/log curto |
| started_at, ended_at | | timeline |

### pull_request  (task → PR 1:N)
| col | tipo | nota |
|---|---|---|
| id | `pr_` ULID | PK |
| org_id, task_id, repo_id | | RLS |
| number, url | | |
| branch | text | |
| status | enum | open / ci_running / approved / changes_requested / merged / closed |
| ci_status | enum | none / running / passed / failed |
| ai_review_status | enum | none / approved / changes |
| human_review_status | enum | none / approved / changes |
| merge_strategy | enum | squash / merge / rebase |
| merged_at | timestamptz | |

> Gates de merge (pool_config.merge_rules) avaliam ci/ai/human_review_status antes de mesclar.

### ci_run
| col | tipo | nota |
|---|---|---|
| id | `ci_` ULID | PK |
| pr_id | `pr_` | |
| provider, url | | |
| status | enum | queued / running / passed / failed |
| started_at, finished_at | | |
| summary | JSONB | |

### qa_report  (tela QA)
| col | tipo | nota |
|---|---|---|
| id | `qa_` ULID | PK |
| task_id, pr_id, repo_id | | |
| status | text | headLabel |
| tests_total, tests_passed, pending | int | |
| coverage | numeric | |
| duration_ms | int | |
| scope, summary | text | "Escopo da tarefa", "Resumo do que a IA fez" |
| cases | JSONB | lista de casos |

---

## 7. Rotinas

### routine  (tela Rotinas)
| col | tipo | nota |
|---|---|---|
| id | `rtn_` ULID | PK |
| org_id, workspace_id | | RLS |
| name | text | |
| trigger_type | enum | **schedule / event / manual** |
| trigger_config | JSONB | cron expr **ou** {event: pr_merged\|ci_failed\|task_blocked, filtro} |
| action | JSONB | template de task a criar / pipeline a rodar |
| enabled | bool | |
| last_run_at, next_run_at | | next_run só p/ schedule |

---

## 8. Conexões & Segredos

### connection  (metadado server — sem valor)
| col | tipo | nota |
|---|---|---|
| id | `con_` ULID | PK |
| org_id, workspace_id | | RLS |
| type | enum | code / ci / observability / ai_engine |
| provider | text | github, anthropic, … |
| label, scope | text | |
| status | enum | ok / needs_setup / error |
| settings | JSONB | config **não-secreta** |
| secret_ref_id | `sec_` | aponta pro segredo |

### secret_ref  (referência server — NUNCA o valor)
| col | tipo | nota |
|---|---|---|
| id | `sec_` ULID | PK |
| org_id | | RLS |
| name | text | "Adicionar segredo" |
| type | text | api_key / token / … |
| fingerprint | text | hash curto p/ detectar rotação (não reversível) |
| location | enum | **local** (padrão) / **managed_vault** (cloud workers) |
| exists | bool | |

### managed_vault_secret  (server — só cloud workers add-on, opt-in)
| col | tipo | nota |
|---|---|---|
| id | ULID | PK |
| org_id, secret_ref_id | | RLS |
| kms_key_id | text | cifrado por KMS, isolado |
| ciphertext | bytea | |

> Caminho de exceção. Padrão = valor só no vault local; este existe apenas quando o user opta por cloud workers gerenciados.

---

## 9. Memória & Conhecimento

### memory  (instruções aprendidas)
| col | tipo | nota |
|---|---|---|
| id | `mem_` ULID | PK |
| org_id, workspace_id | | RLS |
| scope | enum | global / repo |
| repo_id | `repo_` | null se global |
| instruction | text | |
| source | enum | intervention / manual |
| created_by | `usr_`/`agp_` | |

> "Salvar na memória do worker" (tela Intervenção) reaproveita decisão em casos semelhantes.

### kb_document  (base de conhecimento)
| col | tipo | nota |
|---|---|---|
| id | `kb_` ULID | PK |
| org_id, workspace_id | | RLS |
| name | text | |
| category | enum | doc / guide / spec / runbook / reference |
| file_ref | text | path local / storage |
| indexed | bool | pronto p/ consulta dos agentes |

---

## 10. Ops: Auditoria & Notificações

### audit_log  (dedicado, append-only — retenção por plano)
| col | tipo | nota |
|---|---|---|
| id | `aud_` ULID | PK |
| org_id | | RLS |
| actor_type | enum | user / agent / system |
| actor_id | text | `usr_`/`agp_`/null |
| action | text | ex. worker.start, secret.create, merge.approve |
| target_type, target_id | | |
| before, after | JSONB | diff |
| ip | inet | |
| occurred_at | timestamptz | |

> Retenção: Free/Pro/Team curta; Enterprise longa + exportável.

### notification
| col | tipo | nota |
|---|---|---|
| id | `ntf_` ULID | PK |
| org_id, user_id | | |
| type, title, body | | |
| link | text | |
| read | bool | "{{ unreadCount }} novas" |

---

## 11. Local store (executor — fora do DB server)

Não é Postgres; é storage local cifrado no app desktop.

- **secret_vault:** `secret_ref.id → valor cifrado` (libsecret / Keychain / DPAPI). Nunca sobe.
- **connection_creds:** tokens reais das conexões (git/CI/IA).
- **workdirs:** clones de repo, contexto, output bruto das tarefas.
- **cache:** plano/contexto recentes p/ reduzir round-trip do relay.

> Mapeia `secret_ref` (server) → valor (local). Cérebro manda "use a conexão con_X"; executor resolve o valor localmente.

---

## 12. A confirmar (operacional, não bloqueante)
- Âncora do reset semanal de worker-hours (`week_start`).
- Algoritmo de fingerprint do `secret_ref` (ex.: HMAC-SHA256 truncado).
- Retenção exata do `audit_log` por plano (dias).
- Indexação da KB (full-text Postgres vs embeddings/vetor).
