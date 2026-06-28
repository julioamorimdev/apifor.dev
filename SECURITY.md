# Segurança — apifor.dev (review M6.2)

Review da postura de segurança das partes trust-critical: mTLS, vault, kill-switch,
isolamento multi-tenant, billing e o canal cérebro↔executor.

## Modelo & fronteira

Split **control plane (cérebro, cloud)** / **data plane (executor, máquina do user)**.
A fronteira de privacidade é a invariante central:

| Fica **local** (nunca trafega ao cérebro) | Vai ao cérebro |
|---|---|
| Chave de IA e segredos (vault cifrado) | `secret_ref` (nome/tipo/fingerprint) |
| Código-fonte; prompt preenchido | Plano estruturado; branch + url do PR |
| Conteúdo da KB | `kb_document` (metadado) |
| Token GitHub (no clone/push local) | — |

## Superfícies endurecidas

- **mTLS real (M3.2a)** — CA própria; Enroll assina CSR (chave privada nunca sai);
  stream gRPC autenticada pelo **serial do cert** do peer. gRPC só aceita certs
  assinados pela CA (`VerifyClientCertIfGiven` + `ClientCAs`).
- **Kill-switch** — revogar o device exclui o serial da query de auth → reconexão
  negada; o reaper corta os leases ativos (`LEASE_REVOKED`+`STOP_WORKER`).
- **Vault** — XChaCha20-Poly1305, nonce aleatório por segredo; chave-mestra em
  `vault.key` (0600). Valores nunca em claro nem na rede.
- **RBAC (M5.1)** — papéis owner/admin/member/billing/viewer por capacidade
  (read/write/manage/billing), aplicados **server-side**; isolamento por org em toda
  query (`WHERE org_id = $jwt_org`).
- **`REQUIRE_AUTH` (M6.2)** — fecha o fallback dev "demo owner": com
  `REQUIRE_AUTH=true`, rotas protegidas exigem JWT (401 sem token); públicas só
  `login/register/ca/healthz/metrics/webhook`.
- **Rate limit por plano (M6.1)** — janela/min por org (Free 60 · Pro 300 · Team 1000).
- **Auditoria (M6.1)** — escritas sensíveis no `audit_log` (ator do JWT) + export CSV
  com neutralização de injeção de fórmula.
- **Webhook Stripe** — verificação **HMAC-SHA256 real** (esquema do Stripe) com
  tolerância de timestamp; sem segredo configurado → 400 (sem bypass).
- **Defensivas** — SQL 100% parametrizado; JWT com **alg pinning** (HMAC); guards de
  path traversal (`..`) em refs/exec/merge; sanitização do nome no `kb.import`.

## Lacunas conhecidas / pendências (produção)

| Item | Estado | Plano |
|---|---|---|
| **Enforcement de RLS (reads)** | ✅ **Feito (M6.3)** — os reads do REST passam pela role **`apifor_app`** (não-superuser) com `app.current_org` setado por transação (`SET LOCAL`); as policies do `002_rls.sql` isolam de fato (query sem `WHERE org_id`). Provado: `apifor_app` sem org → 0 linhas. | — |
| **Enforcement de RLS (creates do REST)** | ✅ **Feito (M6.4)** — os creates do REST (task/repo/secret/memory/kb/routine/workspace/membro/`RegisterOrg`) gravam via `apifor_app` com contexto de org; o `WITH CHECK` das policies **bloqueia gravação cross-tenant**. Provado: contexto=A, `INSERT org_id=B` → *row-level security policy violation*. | — |
| **Enforcement de RLS (updates/deletes do REST)** | ✅ **Feito (M6.5)** — `SetPlan`/`RevokeDevice`/`RemoveMember`/`DeleteMemory`/`DeleteRoutine`/`SetRoutineEnabled`/`Approve`+`RejectHumanReview` rodam via `apifor_app` com contexto de org; o `USING` das policies bloqueia update/delete cross-tenant. Provado: contexto=B, `DELETE` de linha da org A → *DELETE 0*. | — |
| **Runtime sem superuser** | ✅ **Feito (M6.5)** — o cérebro não conecta mais como `postgres`. Pool primário (pipeline + workers cross-org) usa **`apifor_worker`** (`NOSUPERUSER`, `BYPASSRLS`); só o `migrate` (DDL) usa `postgres`. | — |
| **Pipeline writes (gRPC)** | `SaveExecResult`/`SetCIResult`/`MarkMerged`/`FailTask` seguem no pool `apifor_worker` (BYPASSRLS) — org derivada do **device autenticado por mTLS**, não de input do user. | Opcional: contexto de org explícito também no caminho gRPC. |
| **Credenciais demo** | ✅ **Gate** — `SEED_DEMO=false` não cria o usuário/org demo (catálogos vêm da migration; register segue OK). Avisa se demo+`REQUIRE_AUTH` convivem. `JWT_SECRET` padrão ainda avisa no boot. | Em produção: `SEED_DEMO=false` + `JWT_SECRET` forte. |
| **`REQUIRE_AUTH`** | default **off** (demos funcionam sem token). | Ligar (`REQUIRE_AUTH=true`) em produção. |
| **IPC** | ✅ **Feito** — Unix socket **0600** + **token de processo** (`ipc.token` 0600, gerado na 1ª subida); toda chamada exige o token (barra outros processos locais). A CLI lê o token do keystore; chamada sem/errado → rejeitada. | — |
| **SSE + auth** | `EventSource` não envia header `Authorization`; streams ficam fora do gate. | Token via query/cookie httpOnly para streams. |
| **Cloud workers / SSO-SAML** | Não implementados (infra/IdP externos). | M6.2+ com provider real. |
| **Renovação de cert / graça 5min** | Parciais. | Renovação antes de expirar; pausa graceful no heartbeat ausente. |

## Checklist de produção

- [ ] `JWT_SECRET` forte (≥ 32 bytes aleatórios) · [ ] `REQUIRE_AUTH=true`
- [x] Seed demo gateável (`SEED_DEMO=false`) · [ ] `STRIPE_WEBHOOK_SECRET` configurado
- [x] Enforcement de RLS (reads/creates/updates/deletes via `apifor_app`; runtime sem superuser) · [ ] CA/`vault.key` em KMS/secret store
- [ ] TLS no HTTP REST (hoje só o gRPC é mTLS; o REST/SSE é texto) · [ ] mTLS bootstrap sem `GET /v1/ca` em claro
