# apiforDEV — Roadmap de Construção

> Estratégia: **walking skeleton** — primeiro a fatia mais fina ponta a ponta, depois engrossa.
> Cérebro = **Go**. Executor = **Rust/Tauri**. Dashboard = **React/Next** (portado dos `.dc.html`).
> Cada marco tem: objetivo, entregas, critério de saída (demoável). Telas portadas sob demanda por marco.

---

## M0 — Fundação & tooling
**Objetivo:** terreno pronto pra construir sem retrabalho.
- Monorepo: `cerebro/` (Go), `executor/` (Rust), `dashboard/` (Next), `contracts/` (já existe).
- Codegen do `apifor.proto` p/ Go **e** Rust.
- Runner de migrations (aplica `sql/001..003`).
- Dev local: docker-compose com Postgres; `make dev`.
- CI: lint + test + build dos 3 alvos.

**Saída:** `make dev` sobe Postgres migrado + os 3 serviços vazios compilando.

---

## M1 — Walking skeleton (espinha e2e) ★ derisca o difícil
**Objetivo:** provar a arquitetura inteira numa fatia fina.
- **Cérebro:** login→JWT; gRPC server; `Enroll` emite cert de device (mTLS); handler do `Stream`.
- **Executor:** enroll (gera CSR, guarda chave local); abre stream mTLS; heartbeat 60s.
- **Lease:** `LeaseRequest`→`LeaseGranted` (sem checagem de plano ainda — hardcode).
- **Dispatch:** cérebro manda 1 tarefa fake → executor roda step no-op → `StepCompleted` → grava no DB.
- **UI mínima:** tela Login + Live mostrando o worker e o status da tarefa via SSE.

**Saída:** logar na GUI → ligar worker → ver 1 tarefa fake rodar e completar ao vivo. Stream+mTLS+lease validados.

---

## M2 — Worker real + relay de planejamento
**Objetivo:** worker faz trabalho de verdade com chave/credencial local.
- **Executor:** isolamento por container; workdir real; **vault local** cifrado; chamada Anthropic com chave do user.
- **Relay:** `RequestPlan` (template+refs) → executor preenche local + chama LLM → `PlanResult` (só plano).
- **Tarefa real:** clona repo (conexão GitHub), agente coda, abre PR.
- **Config + IPC:** `pool_config`, `repository`, `connection`, `secret_ref`; canal **IPC** (`secret.put`, `kb.import`).
- Telas: Configuração (Workers/Repos/Conexões/Segredos), Tarefas, Fila.

**Saída:** criar tarefa real num repo → worker local planeja (chave do user) → abre PR de verdade.

---

## M3 — Plano & enforcement (monetização) ★ trust-critical
**Objetivo:** as travas que sustentam o modelo de negócio.
- **plan_catalog enforce:** `max_workers`, lease TTL 4h Free (não-renovável), `auto_renew` Pro+.
- **Worker-hours:** `usage_event` ledger + `worker_hours_counter`; bloqueio 36h/sem no Free.
- **Kill-switch:** validação de sessão/cert no heartbeat; **graça 5min** → pausa graceful; revogar device.
- **Billing:** Stripe Checkout + Portal + webhooks; `subscription` com dunning (past_due→grace 7d→rebaixa Free).
- Telas: Assinatura, Uso, Faturas.

**Saída:** Free para em 4h e em 36h/sem; upgrade via Stripe libera 4 workers; cancelar rebaixa após 7 dias. Tudo server-side.

---

## M4 — Pipeline completo (gates de qualidade)
**Objetivo:** do código ao merge com os papéis e portões.
- **Steps reais:** plan/exec/test/review/merge; `agent_profile` (coder/qa/reviewer) com modelo por agente.
- **Merge rules:** exigir CI verde / revisão IA / revisão humana; estratégia (squash/merge/rebase); auto-merge.
- **Intervenção:** `InterventionRequest`→humano decide→`AnswerIntervention`→retoma; salvar memória.
- **Reconciliação:** `TaskStateSnapshot` no reconnect.
- Telas: PRs, CI, QA, Intervenção, Logs, Telemetria.

**Saída:** tarefa percorre plan→exec→test→review→merge respeitando os gates; humano destrava quando o worker pergunta.

---

## M5 — Multi-tenant & Team
**Objetivo:** habilitar o plano Team.
- **Orgs/Workspaces/Membership:** RBAC (owner/admin/member/billing/viewer) + `functional_profile` (dev/qa/…); convites.
- **Rotinas:** trigger schedule/event/manual + ação.
- **Memória & KB:** escopo global/repo; import via IPC; consulta pelos agentes.
- **Notificações** (SSE).
- Telas: Organização, Rotinas, Ajuda/Suporte.

**Saída:** time de N membros com papéis, workspaces compartilhados, rotinas automáticas rodando.

---

## M6 — Enterprise & hardening
**Objetivo:** vender Enterprise e aguentar produção.
- **Cloud workers gerenciados** (add-on): provisiona instâncias, `managed_vault_secret` (KMS), cobrança metered vCPU/worker.
- **SSO/SAML**; **auditoria aprofundada** + export.
- **Rate limits por plano**; observabilidade do cérebro; verificação de RLS; load test do stream.
- Security review completo (mTLS, vault, kill-switch, isolamento).
- Telas: Cloud, Auditoria.

**Saída:** conta Enterprise com SSO, cloud workers cobrados por uso, trilha de auditoria exportável.

---

## M7 — Empacotamento & launch
**Objetivo:** distribuível e vendável.
- Installer Tauri (Linux/Win/Mac) que **registra o serviço de fundo** (systemd/Service/launchd).
- Onboarding, páginas de preço, docs, auto-update.
- Beta fechado → GA.

**Saída:** baixar, instalar, deixar rodando na VM, usar Free; converter pra Pro no app.

---

## Sequência & dependências
```
M0 → M1 → M2 → M3 ┐
              └ M4 ┴→ M5 → M6 → M7
```
- M1 é pré-requisito de tudo (a espinha).
- M3 (enforcement/billing) pode correr em paralelo a M4 após M2.
- Tela **Web** do nav: escopo indefinido — encaixar quando esclarecido.

## Princípios
- Toda trava de plano nasce no cérebro; nunca confiar no cliente.
- Cada marco termina **demoável** e testável, não só "código pronto".
- Portar telas `.dc.html` só quando o marco precisa delas.
