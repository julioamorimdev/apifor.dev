# apiforDEV — Superfície de API

> Como a GUI lê/escreve. Decisões: REST/JSON `/v1` · JWT access+refresh · SSE p/ leitura ao vivo + REST p/ ações · cursor + envelope de erro · **dois canais** (REST ao cérebro + IPC local ao daemon) · Stripe Checkout hospedado.

---

## 0. Convenções

- **Base:** `https://api.apifor.dev/v1`
- **Auth:** `Authorization: Bearer <access_jwt>` (access ~15min). Refresh rotativo httpOnly em `/auth/refresh`.
- **Erro padrão:** `{ "error": { "code": "string", "message": "string", "details": {…} } }` + status HTTP adequado.
- **Paginação:** cursor — `?limit=50&cursor=…` → `{ "data": [...], "next_cursor": "…" }`.
- **Idempotência:** POST mutante aceita header `Idempotency-Key` (espelha at-least-once do protocolo).
- **Rate limit:** por org + por device; headers `RateLimit-*`. Limites menores no Free.
- **Realtime:** endpoints `…/stream` = **SSE** (`text/event-stream`). Resto é REST.

---

## 1. Dois canais (o que vai onde)

| Ação | Canal | Por quê |
|---|---|---|
| Login, dados de conta, billing, fila, tarefas, PRs, telemetria, config não-secreta | **REST → cérebro** | dado server-side, sincroniza |
| Ligar/parar/pausar worker | **IPC → daemon** (que então faz LeaseRequest ao cérebro) | ação local; lease validado server-side |
| Gravar/rotacionar **segredo** (valor) | **IPC → daemon** (grava no vault local) | valor nunca trafega à rede |
| Importar **KB** (arquivo) | **IPC → daemon** | arquivo fica local |
| Registrar **secret_ref** / **connection** (metadado) | **REST → cérebro** | só metadado |

> Regra: valor de credencial e código = IPC local. Tudo o mais = REST. Ver §17 p/ a superfície IPC.

---

## 2. Auth
| Método | Rota | Nota |
|---|---|---|
| POST | `/auth/login` | e-mail/senha → access+refresh |
| POST | `/auth/oauth/github` | "Continuar com GitHub" |
| POST | `/auth/refresh` | rotaciona refresh, novo access |
| POST | `/auth/logout` | revoga refresh (+ devices se pedido) |
| GET | `/auth/me` | usuário + orgs + plano |
| POST | `/auth/enroll` | emite enrollment token p/ o daemon (§ Protocolo 1) |

---

## 3. Org · Workspace · Membros · Perfis
| Método | Rota | Nota |
|---|---|---|
| GET / PATCH | `/orgs/:id` | dados da org (tela Organização) |
| GET | `/orgs/:id/members` | lista membros |
| POST | `/orgs/:id/members` | convidar (e-mail + tier + perfil) |
| PATCH / DELETE | `/orgs/:id/members/:mid` | muda tier/perfil / remove |
| GET POST | `/workspaces` | listar/criar ("Novo workspace") |
| GET PATCH DELETE | `/workspaces/:id` | |
| GET POST PATCH DELETE | `/profiles` | functional_profile (developer/qa/…) |

> `permission_tier` controla acesso aos próprios endpoints (RLS + checagem). `viewer` = read-only; `billing` só §4.

---

## 4. Billing — Assinatura · Uso · Faturas
| Método | Rota | Nota |
|---|---|---|
| GET | `/billing/subscription` | plano, status, seats, grace_until |
| POST | `/billing/checkout` | cria sessão Stripe Checkout (upgrade) → URL |
| POST | `/billing/portal` | abre Customer Portal (trocar cartão, cancelar) |
| GET | `/billing/usage` | worker-hours na semana, % cota, gasto |
| GET | `/billing/invoices` | tela Faturas (cursor) |
| GET | `/billing/invoices/:id` | + `pdf_url` |
| POST | `/webhooks/stripe` | **server-to-server** (não-GUI): assinatura/pagamento → atualiza subscription/invoice |

---

## 5. Config (tela Configuração)
| Método | Rota | Nota |
|---|---|---|
| GET PATCH | `/workspaces/:id/pool-config` | parallel_workers, timeout, retries, behavior, **merge_rules**, **limits** |
| GET POST PATCH DELETE | `/workspaces/:id/pinned-workers` | dedicados (máx 8) |
| GET POST PATCH DELETE | `/repositories` | metadado de repo |
| GET POST PATCH DELETE | `/agent-profiles` | "Modelos por agente" (coder/qa/reviewer) |
| GET POST PATCH DELETE | `/connections` | code/ci/observability/ai_engine — **metadado** |
| GET POST DELETE | `/secrets` | **secret_ref** só (nome/tipo/fingerprint). Valor via IPC (§17) |

> Limites/merge entram como JSONB dentro de `pool-config`. PATCH valida contra o plano (ex.: parallel_workers ≤ max_workers).

---

## 6. Workers runtime (tela Live)
| Método | Rota | Nota |
|---|---|---|
| GET | `/workers` | worker_instances + status |
| GET | `/workers/:id` | detalhe + current_step |
| GET | `/workers/stream` | **SSE** — progresso ao vivo |

> **Ligar/parar/pausar = IPC** (§17), não REST. REST só lê o estado runtime.

---

## 7. Fila · Tarefas · Steps
| Método | Rota | Nota |
|---|---|---|
| GET | `/tasks?status=queued` | tela Fila |
| GET POST | `/tasks` | listar (filtros) / criar tarefa |
| GET | `/tasks/:id` | detalhe |
| PATCH | `/tasks/:id` | prioridade / cancelar |
| GET | `/tasks/:id/steps` | "caminho percorrido" |
| GET | `/tasks/stream` | **SSE** — mudanças de status na fila |

---

## 8. Pull Requests · CI · QA
| Método | Rota | Nota |
|---|---|---|
| GET | `/pull-requests` | tela PRs (badge {{ nPrs }}) |
| GET | `/pull-requests/:id` | + ci/ai/human_review_status |
| POST | `/pull-requests/:id/approve` `/request-changes` `/merge` | ações de gate (respeita merge_rules) |
| GET | `/ci-runs` `/ci-runs/:id` | tela CI |
| GET | `/qa-reports` `/qa-reports/:id` | tela QA (cases, cobertura) |

---

## 9. Intervenção
| Método | Rota | Nota |
|---|---|---|
| GET | `/interventions` | pendentes ("Decisão necessária") |
| POST | `/interventions/:id/answer` | decisão + `salvar_memoria?` |
| POST | `/interventions/:id/fix-agent` | reabre com instruções ("Agente de correção") |
| GET | `/interventions/stream` | **SSE** |

---

## 10. Rotinas
| Método | Rota | Nota |
|---|---|---|
| GET POST PATCH DELETE | `/routines` | trigger schedule/event/manual + action |
| POST | `/routines/:id/run` | dispara manual |

---

## 11. Memória · Conhecimento
| Método | Rota | Nota |
|---|---|---|
| GET POST PATCH DELETE | `/memories` | escopo global/repo |
| GET DELETE | `/kb-documents` | **metadado**; arquivo importado via IPC (§17) |

---

## 12. Telemetria · Logs
| Método | Rota | Nota |
|---|---|---|
| GET | `/telemetry` | métricas agregadas |
| GET | `/telemetry/stream` | **SSE** |
| GET | `/logs?cursor=…` | tela Logs (cursor) |
| GET | `/logs/stream` | **SSE** — tail ao vivo |

---

## 13. Notificações
| Método | Rota | Nota |
|---|---|---|
| GET | `/notifications` | "{{ unreadCount }} novas" |
| POST | `/notifications/:id/read` · `/notifications/read-all` | "Marcar lidas" |
| GET | `/notifications/stream` | **SSE** |

---

## 14. Auditoria
| Método | Rota | Nota |
|---|---|---|
| GET | `/audit?cursor=…` | trilha (filtros: ator/ação/alvo) |
| POST | `/audit/export` | **Enterprise** — gera export (CSV/JSON) |

---

## 15. Conta · Devices · Suporte
| Método | Rota | Nota |
|---|---|---|
| GET PATCH | `/account` | perfil, senha |
| GET | `/account/devices` | installs/executores ativos |
| DELETE | `/account/devices/:id` | **revoga cert do device = kill-switch** |
| POST | `/support/tickets` | "Abrir chamado" (tela Ajuda) |

---

## 16. Cloud · Web
| Método | Rota | Nota |
|---|---|---|
| GET POST DELETE | `/cloud/instances` | **add-on** Team/Ent — managed workers (regiões, vCPU) |
| GET | `/cloud/usage` | vCPU/metered |
| (Web) | `/web/*` | tela Web — escopo a definir |

---

## 17. IPC local (GUI ↔ daemon, no mesmo host)

Canal local (Unix socket / named pipe), autenticado por token de processo. **Nunca exposto à rede.**

| Comando IPC | Efeito |
|---|---|
| `worker.start { workspace, source }` | daemon faz `LeaseRequest` ao cérebro → liga worker |
| `worker.stop / worker.pause { worker_id }` | controla worker local |
| `secret.put { name, value }` | grava no **vault local** cifrado; registra `secret_ref` no cérebro (sem valor) |
| `secret.rotate / secret.delete` | idem |
| `kb.import { file, category }` | copia arquivo p/ store local; registra metadado no cérebro |
| `connection.test { id }` | testa credencial localmente |
| `daemon.status` | estado do executor, leases, worker-hours locais |

> Tudo que toca **valor de credencial** ou **arquivo/código** passa só por aqui. O cérebro recebe apenas o metadado correspondente via REST.

---

## 18. A confirmar (operacional)
- TTL exato do access JWT (sugestão 15min) e do refresh (sugestão 30d rotativo).
- Schema OpenAPI completo (gerar a partir deste mapa).
- Escopo da tela **Web** (automação web? webhooks de entrada?).
- Formato do export de auditoria (CSV/JSON/SIEM).
- Limites de rate por plano (números).
