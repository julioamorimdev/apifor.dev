# apiforDEV — Arquitetura de Comercialização

> Orquestrador de workers de IA que codam: fila de tarefas → workers isolados → PR → CI/QA → merge.
> Estado atual do repo: apenas mockups de UI (`.dc.html`, runtime de design React). Sem backend real.
> Este doc define a arquitetura para transformar os mockups em produto comercializável (Free / Pro / Team / Enterprise).

## 1. Princípio central: split control plane / data plane

Decisão de negócio do fundador: **IA e conexões configuradas localmente; o "cérebro" do orquestrador (o que decide o que vai ser feito) mora numa API backend na cloud.**

Isso é exatamente o padrão **control plane / data plane** usado por GitHub Actions self-hosted runners, GitLab runners, Temporal, Buildkite, Depot, Coder/Daytona.

```
┌─────────────────────────── CLOUD (SaaS) ───────────────────────────────┐
│  CONTROL PLANE = "o cérebro"                                            │
│  • Orquestrador: decide o que fazer, prioriza fila, despacha tarefas    │
│  • Planner (relay): pede LLM ao agente local, consome plano estruturado │
│  • Policy engine: regras de merge, retries, gates, QA                   │
│  • Lease manager: emite/renova licença de worker (← trava de plano)     │
│  • Auth, billing, audit, multi-tenancy, telemetria agregada            │
│  • NÃO guarda: chaves de IA, tokens de git, segredos, código-fonte     │
└────────────────────────────────┬───────────────────────────────────────┘
                                  │  WebSocket/gRPC outbound (mTLS)
                                  │  desce: "rode passo X" / "planeje #42"  │
                                  │  sobe: status, logs, plano estruturado  │
┌────────────────────────────────┴── MÁQUINA / INFRA DO USUÁRIO ──────────┐
│  DATA PLANE = "o agente local" (1 binário / daemon)                     │
│  • Recebe ordens do cérebro, executa workers em containers isolados     │
│  • Guarda LOCAL: chaves Anthropic, tokens GitHub, segredos, código     │
│  • Faz as chamadas de IA com a chave DO USUÁRIO (BYO key)              │
│  • Sobe só metadados/status/logs — nunca segredo nem código bruto      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Por que esse split sustenta o negócio
1. **Trava de licença natural.** Worker local é inútil sozinho — só age quando o cérebro despacha. Não dá pra "destravar" pirateando o cliente porque a decisão é server-side.
2. **Custo de IA não é da empresa.** Free user traz a própria chave; o trabalho caro (Opus gerando código) roda na grana dele.
3. **Segurança vendável.** "Suas chaves e seu código nunca tocam nosso servidor" = argumento forte pra Enterprise.

## 2. Decisões travadas

- **Cérebro = policy + relay.** O cérebro decide com lógica determinística; quando precisa de LLM pra planejar, manda o agente local chamar a IA com a chave do user. Custo de inferência da empresa ≈ zero.
- **Workers rodam local no Free/Pro; cloud gerenciada é add-on pago no Team/Enterprise** (metered por vCPU/worker — a tela `Cloud` já existe nos mockups).
- **Distribuição = app desktop instalável** (Linux/Win/Mac), com **Tauri (Rust)**. O app não é só front: é GUI (dashboard React em webview) **+ executor local embutido**.
- **Executor = daemon/serviço de fundo.** Sobrevive ao fechar a janela e roda headless em VM ("deixar rodando"). Modelo Docker Desktop: GUI + daemon. O installer registra o serviço (systemd / Windows Service / launchd).

### Relay de planejamento (como o cérebro decide sem ter a chave nem o código)
```
Cérebro: "planejar tarefa #42" → manda PROMPT TEMPLATE + refs de contexto (sem código)
  → Agente local: preenche template com código/contexto real → chama Anthropic c/ chave do user
  → Agente local: devolve PLANO ESTRUTURADO (passos, arquivos, decisão) — não o código bruto
  → Cérebro: consome plano → despacha passos → aplica gates/merge rules
```
Ganho duplo: inferência sempre na conta do user **e** código nunca sai da máquina dele.

## 3. Planos como trava técnica (núcleo da monetização)

Tudo gira em torno de **worker lease**: licença temporária que o cérebro emite e sem a qual o worker local não recebe tarefa.

| Plano | Preço | Workers | Lease TTL | Worker-h/sem | Membros | Extras |
|---|---|---|---|---|---|---|
| **Free** | US$ 0 | 1 | 4h (manual) | **36h** | 1 | BYO key, 1 workspace, worker local |
| **Pro** | US$ 20/mês | até 4 | ilimitado (auto) | ilimitado | 1 | sem limite de horas, worker local |
| **Team** | US$ 30/assento | até 20 | ilimitado (auto) | ilimitado | até 10 | workspaces, RBAC, cloud workers (add-on) |
| **Enterprise** | sob consulta | ilimitado | ilimitado (auto) | ilimitado | ilimitado | cobrança/worker, audit fundo, SSO/SAML, early access, cloud workers |

Mecânica de enforcement (tudo server-side, não-patchável no cliente):
- Worker local só recebe tarefa segurando lease válido.
- **Free:** lease com TTL = 4 horas, `auto_renew=false`. Expirou → cérebro para de despachar → worker ocioso até reativação manual.
- **Pro+:** `auto_renew=true`, renova via heartbeat.
- **Limite de workers:** cérebro recusa emitir lease N+1.
- **Enterprise por-worker:** cada lease ativo emite evento de billing (metered).

## 4. Control plane — componentes
- **API Gateway** — REST p/ dashboard + gRPC/WS p/ agentes locais.
- **Orchestrator core** — máquina de estado da tarefa (fila→atribuída→rodando→PR→QA→merge). Recomendado: **Temporal** ou engine de workflow durável (long-running, retry, timeout — bate com a tela de Limites).
- **Lease/Quota service** — emite leases, conta workers, aplica plano.
- **Billing** — Stripe (assinatura Pro/Team + metered por-worker/vCPU no Enterprise).
- **Identity** — auth, orgs, workspaces, RBAC, SSO/SAML (Enterprise).
- **Audit log** — append-only; raso no Team, fundo/exportável no Enterprise.
- **Telemetria** — só agregados/metadados, nunca código.

## 5. Data plane — app desktop (GUI + executor local)

O usuário instala o **app apifor.dev** na máquina/VM e deixa rodando. Precisa estar online; login validado pelo backend. O app tem duas partes no mesmo pacote:

### 5a. GUI (Tauri + webview React)
- Dashboard (as telas `.dc.html` portadas pra React).
- Faz login → backend valida → libera UI.
- Conversa com o daemon local via IPC e com o backend via HTTPS.

### 5b. Executor local (daemon/serviço de fundo)
- Roda **independente da janela** (systemd / Windows Service / launchd). Headless em VM.
- **Secret vault local** — chaves cifradas em repouso (libsecret/Keychain/DPAPI). Nunca sobem.
- **Container runtime** — cada tarefa isolada (mockup já prevê "Isolamento por container").
- **Conector de IA** — chamada Anthropic com a chave do user (relay de planejamento + execução).
- **Conectores** — Git/GitHub, CI, observability (tela Config → Conexões).
- **Túnel outbound** — só conexão de saída ao cérebro, mTLS, sobrevive a NAT/firewall.
- **Recebe ordens, não decide.** Qual agente chamar, quando planejar, merge → tudo vem do cérebro.

### 5c. Split de config (quem guarda o quê)
| Dado | Onde mora |
|---|---|
| Conta, workspaces, membros, plano | Server DB |
| Parametrizações **não-secretas** (nº workers, merge rules, foco, limites, lista de repos por nome) | Server DB |
| Critérios de decisão / qual agente / política | Server (cérebro) |
| **Segredos**: chave IA, tokens git, secrets, .env | **Local (vault cifrado)** |
| Código-fonte, contexto, output bruto | **Local** |

Regra: server guarda *o que* e *como decidir*; local guarda *com que credencial* e *o código*.

### 5d. Kill-switch / checagem de sessão
- Heartbeat executor→cérebro a cada ~60s; cérebro responde com lease válido ou nega.
- Sessão inválida / plano cancelado / não-logado → cérebro **para de despachar** + UI trava.
- **Janela de graça** (5–10 min) pra não matar tarefa por blip de rede. Após a graça sem heartbeat válido → **pausa graceful** (não perde estado), retoma ao relogar.
- Free: heartbeat carrega o TTL de 4 horas; expirou → para, exige reativação manual.
- Offline total = sem cérebro = sem trabalho novo (by design — é a trava).

## 6. Multi-tenancy (Team/Enterprise)
Modelo: `Org → Workspaces → Members(RBAC) → Workers/Repos`. Já há seletor de workspace + tela Organização.
- Free/Pro: org de 1 workspace.
- Team: vários membros, 1+ workspaces.
- Enterprise: workspaces isolados + cobrança/worker + audit fundo + SSO.
Postgres com Row-Level Security por `org_id`.

## 7. Economia
| | Custo da empresa | Receita |
|---|---|---|
| Free | só dispatch (centavos) | 0 — funil |
| Pro | dispatch | US$ 20/mês |
| Team | dispatch + multi-tenant | US$ 30/assento/mês |
| Enterprise | dispatch + cloud workers (se add-on) | base anual + metered/worker + vCPU |

Free sustentável: inferência e compute são do user. Margem vem do cérebro (barato) e dos add-ons gerenciados (metered).

## 8. Stack recomendada
- **Control plane (cérebro):** Go (orquestrador) ou TS/NestJS. Postgres (RLS multi-tenant). Temporal p/ workflows. Redis p/ fila/realtime. gRPC/NATS p/ agentes.
- **App desktop:** **Tauri (Rust)**. Webview carrega o dashboard React (os `.dc.html` portados). Executor = sidecar Rust (ou Go) rodando como serviço de fundo, registrado pelo installer (systemd/Windows Service/launchd).
- **Dashboard:** os `.dc.html` viram React real (o runtime já é React) reaproveitando os design tokens do CSS atual.
- **Billing:** Stripe.
- **Infra inicial:** 1 região, Postgres gerenciado, deploy Fly/Render/AWS.

## 9. Roadmap de migração dos mockups
1. **Modelar dados** a partir das telas (workers, tarefas, PRs, leases, planos, conexões, segredos, memória/KB). As telas já definem ~todo o schema.
2. **Control plane MVP:** auth + orgs + lease service + orchestrator (fila→tarefa→status). Sem QA/CI ainda.
3. **Agente local MVP:** binário que autentica, segura lease, roda 1 worker em container, chama IA com chave local, reporta status.
4. **Dashboard real:** portar telas Dashboard/Fila/Live/Config para Next.js ligado à API.
5. **Billing:** Stripe + enforcement de plano (limite de workers, TTL de lease do Free).
6. **Team/Enterprise:** workspaces, RBAC, audit, cloud workers add-on, SSO.

## 10. Riscos / pontos de atenção
- **Confiança no cliente:** agente local pode ser inspecionado. Nunca confie em enforcement local — toda trava de plano fica no cérebro (lease/dispatch). ✓ já é o caso.
- **Resiliência offline:** se o cérebro cai, workers param. Definir comportamento (graceful pause + retomada por heartbeat).
- **Segurança do túnel:** mTLS + rotação de credencial do agente. Comprometer um agente não pode dar acesso a outro tenant.
- **Abuso do Free:** múltiplas contas free p/ contornar TTL. Mitigar com fingerprint de device + limite por conta/email/cartão.
- **Latência do relay de planejamento:** round-trip cérebro↔agente↔LLM. Cachear planos e contexto; manter prompts templatizados enxutos.
