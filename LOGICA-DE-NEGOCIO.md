# apiforDEV — Lógica de Negócio

> Regras de negócio do produto. Complementa `ARQUITETURA.md` (que cobre o *como técnico*).
> Este doc cobre o *o quê e por quê*: planos, limites, travas, cobrança, estados.
> Itens marcados **[DEFINIR]** são valores ainda não fixados pelo fundador.

---

## 1. O que é o produto

apiforDEV é um **orquestrador de workers de IA que escrevem código**. O usuário cadastra repositórios e tarefas; o sistema dispara *workers* (agentes de IA isolados) que executam as tarefas, abrem Pull Requests, passam por CI/QA e fazem merge conforme as regras configuradas.

Modelo comercial: **freemium**. Gratuito para uso individual/casual com limitações; planos pagos Pro, Team e Enterprise.

---

## 2. Atores

| Ator | Descrição |
|---|---|
| **Usuário individual** | Conta única, 1 workspace. Free ou Pro. |
| **Membro de time** | Pertence a uma Org, opera dentro de workspaces conforme RBAC. |
| **Admin da Org** | Gere membros, workspaces, billing, políticas. |
| **Cérebro** | Backend SaaS que decide e despacha (não é pessoa, mas é o ator central de decisão). |
| **Executor local** | Daemon na máquina do usuário que executa as ordens com credenciais locais. |

---

## 3. Planos

| Critério | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| Preço | US$ 0 | **US$ 20/mês** | **US$ 30/assento/mês** | base anual + metered, **sob consulta** |
| Workers simultâneos | **1** | até **4** | até **20** | **ilimitado** |
| Tempo ligado (lease) | **4 horas**, depois para e exige religar | ilimitado | ilimitado | ilimitado |
| Renovação do worker | **manual** | automática | automática | automática |
| Worker-hours/semana | **36h** | ilimitado | ilimitado | ilimitado |
| Membros | 1 | 1 | até **10** | ilimitado |
| Workspaces | 1 | 1 | múltiplos | múltiplos isolados |
| Chave de IA | BYO (própria) | BYO | BYO | BYO ou gerenciada |
| Execução dos workers | local | local | local + cloud add-on | local + cloud add-on |
| Cobrança por worker | — | — | — | sim (metered) |
| Auditoria | básica | básica | intermediária | aprofundada / exportável |
| SSO/SAML | — | — | — | sim |
| Early access a features | — | — | — | sim |
| Suporte | comunidade | padrão | prioritário | dedicado/SLA |

> Preços em US$ (padrão de dev tools). Equivalente em R$ definido no checkout/gateway.
> **Enterprise:** base anual fixa + cobrança metered por worker ativo e por vCPU de cloud workers; valor fechado por venda ("Falar com vendas").

**Regra de ouro:** todo limite de plano é imposto **no cérebro (server-side)**. O executor local nunca decide se pode ou não — ele só age quando recebe ordem + lease válido. Patchear o cliente não destrava nada.

---

## 4. Worker e Lease (regra central)

**Worker** = um agente de IA executando tarefas, rodando em container isolado na máquina do usuário.

**Lease** = licença temporária que o cérebro emite para cada worker. **Sem lease válido, o worker não recebe tarefa.**

Propriedades do lease:
- `worker_id`, `org_id`, `workspace_id`
- `ttl` — validade
- `auto_renew` — true (Pro+) ou false (Free)
- `expires_at`

Emissão:
- Cérebro só emite o lease número N+1 se o plano permite N+1 workers. Caso contrário, recusa.
- Free: emite 1 lease, `ttl = 4 horas`, `auto_renew = false`.
- Pro: até 4 leases, `auto_renew = true`.
- Team: até 20 leases.
- Enterprise: ilimitado; **cada lease ativo gera evento de cobrança** (metered).

**Cota de worker-hours (semanal):** o cérebro acumula o tempo de worker ativo por semana.
- Free: teto de **36h/semana**. Atingiu → não emite novo lease até o reset semanal. (Soma-se ao TTL de 4h: o de 4h força presença; o de 36h limita volume total.)
- Pro/Team/Enterprise: **sem teto** de worker-hours.
- Reset: janela semanal corrida (ex.: segunda 00:00 UTC) **[confirmar âncora do reset]**.

---

## 5. Ciclo de vida do worker

```
[desligado] --usuário liga--> [solicita lease] --cérebro valida plano-->
   ├─ permitido --> [ativo: recebe tarefas] --heartbeat--> renova/expira
   └─ negado (limite/plano) --> [bloqueado: motivo exibido]

[ativo] --lease expira (Free, sem auto_renew)--> [pausado] --reativação manual--> [ativo]
[ativo] --heartbeat falha além da graça--> [pausa graceful] --reloga--> [ativo]
```

- **Free:** expirado o TTL de 4 horas → worker **pausa** → usuário precisa **religar manualmente** para novo lease (e novo ciclo de 4 horas).
- **Pro+:** lease renova sozinho via heartbeat; worker fica ligado indefinidamente.

---

## 6. Sessão, heartbeat e kill-switch

O usuário **precisa estar online e logado** para operar. Login validado pelo backend.

- Executor envia **heartbeat ao cérebro a cada ~60s**.
- Cérebro responde: lease válido (continua) ou negação (bloqueia).
- **Checagem regular de validade:** se a sessão/assinatura/plano deixar de ser válido, o cérebro **para de despachar** e a UI trava.
- **Janela de graça (5 min):** blip de rede não mata tarefa em andamento. Sem heartbeat válido após a graça → **pausa graceful** (preserva estado), retoma ao relogar.
- **Offline total = sem cérebro = sem trabalho novo.** É a trava, by design.

---

## 7. Quem decide vs quem executa

| Responsabilidade | Cérebro (cloud) | Executor (local) |
|---|---|---|
| O que fazer / priorizar fila | ✅ | — |
| Qual agente/modelo chamar | ✅ | — |
| Quando planejar | ✅ (pede) | executa a chamada |
| Política de merge / gates / retries | ✅ | aplica resultado |
| Emitir/renovar lease | ✅ | — |
| Rodar container isolado | — | ✅ |
| Chamar a IA com a chave do user | — | ✅ |
| Tocar git/CI/segredos/código | — | ✅ |

**Princípio:** cérebro guarda *o que* e *como decidir*; executor guarda *com que credencial* e *o código*.

---

## 8. Relay de planejamento (quem paga a IA)

Quando o cérebro precisa de saída de LLM para planejar uma tarefa:

```
Cérebro → manda prompt template + refs de contexto (sem código)
Executor → preenche com código/contexto real → chama Anthropic COM A CHAVE DO USER
Executor → devolve plano estruturado (passos, arquivos, decisão) — não o código bruto
Cérebro → consome o plano → despacha passos → aplica regras de merge
```

**Regra de negócio:** o custo de inferência é **sempre do usuário** (BYO key). A empresa só paga o despacho (barato). Por isso o Free é sustentável. Bônus: **o código nunca sai da máquina do usuário** — o cérebro só vê decisões/metadados.

---

## 9. Modelo de execução: local vs cloud gerenciada

- **Padrão (Free/Pro):** workers rodam na máquina/VM do usuário via executor local. Custo de compute = do usuário.
- **Add-on (Team/Enterprise):** a empresa oferece **workers gerenciados na nuvem** (a tela `Cloud` já existe). Cobrança **metered por vCPU/worker**. Nesse caso as credenciais necessárias passam a viver num vault gerenciado (caminho separado, opt-in).

---

## 10. Split de dados (server vs local)

| Dado | Server DB | Local (vault cifrado) |
|---|---|---|
| Conta, workspaces, membros, plano | ✅ | — |
| Parametrizações não-secretas (nº workers, merge rules, foco, limites, lista de repos por nome) | ✅ | — |
| Critérios de decisão / política | ✅ | — |
| Chave de IA, tokens git, secrets, .env | — | ✅ |
| Código-fonte, contexto, output bruto | — | ✅ |

Segredos são **criptografados e nunca exibidos novamente** após salvos (já refletido na tela Config → Segredos).

---

## 11. Limites e cotas (tela Config → Limites)

Aplicáveis conforme plano; o cérebro respeita ao despachar:

- **Workers em paralelo** — teto por plano (1 / 4 / 20 / ∞).
- **Worker-hours/semana** — Free: 36h; demais: ilimitado. Cérebro para de emitir lease ao atingir.
- **Timeout por tarefa** — 15/30/45/60 min ou sem limite; encerra e marca retry.
- **Tentativas antes de bloquear** — 1/2/3/5 retries; depois pede humano (Intervenção).
- **Limite por % de uso** — pausa ao atingir % da cota **semanal de worker-hours** do plano (50/70/80/90/100%). No Free a base é 36h; em planos ilimitados o controle vira opcional sobre o teto de gasto.
- **Teto mensal de gasto** — limite agregado de gasto de IA do usuário (dinheiro dele); pausa automática ao atingir.
- **Tokens por tarefa** — corta a tarefa se exceder.
- **PRs abertos simultâneos** — limite de PRs aguardando merge.

---

## 12. Fluxo de uma tarefa (com gates)

```
[fila] → cérebro prioriza → [atribuída a worker] →
[planejamento] (relay) → [execução] (container local) →
[PR aberto] → gates:
   ├─ CI verde?         (exigir CI verde: on/off)
   ├─ revisão IA aprova? (segunda IA: on/off)
   └─ revisão humana?    (bloqueia até humano: on/off)
→ [merge] (squash / merge commit / rebase) → [branch deletada (opcional)]

Falha/dúvida do worker → [Intervenção]: humano decide, pode salvar decisão na
memória do worker (reaproveita em casos semelhantes).
```

Comportamentos configuráveis (tela Config): isolamento por container, auto-merge quando aprovado, modelos por agente (Opus/Sonnet/Haiku), estratégia de merge, exigências de CI/revisão.

---

## 13. Multi-tenancy (Team/Enterprise)

Hierarquia: `Org → Workspaces → Membros (RBAC) → Workers/Repos`.

- **Free/Pro:** Org de 1 membro, 1 workspace.
- **Team:** múltiplos membros (até N), workspaces compartilhados, papéis (RBAC).
- **Enterprise:** workspaces isolados, membros ilimitados, SSO/SAML.

Memória e Base de Conhecimento são **compartilhadas pelos workers do pool** dentro do escopo (global ou por repositório).

---

## 14. Auditoria por plano

- **Free/Pro:** log básico de ações.
- **Team:** log intermediário (quem fez o quê no workspace).
- **Enterprise:** **auditoria aprofundada**, append-only, exportável, retenção estendida. Argumento de venda + compliance.

---

## 15. Anti-abuso (Free)

Risco: múltiplas contas Free para burlar o TTL de 4 horas / limite de 1 worker.

Mitigações:
- Fingerprint de device + limite por conta/email.
- Exigir verificação (email; opcionalmente cartão sem cobrança) para ativar worker.
- Rate limit de criação de conta por IP/fingerprint.
- Cérebro detecta padrões (mesmo device, várias contas) e bloqueia.

---

## 16. Matriz "o que trava quando"

| Situação | Efeito |
|---|---|
| Não logado / sessão inválida | Cérebro não despacha; UI trava. |
| Plano cancelado / inadimplente | Carência de 7 dias mantendo o plano (dunning); depois rebaixa pra Free (1 worker, TTL 4h, 36h/sem). Dados preservados. |
| Free, TTL 4 horas expirado | Worker pausa; exige religar manual. |
| Free, 36h/semana atingidas | Cérebro não emite novo lease até o reset semanal. |
| Tentou worker além do limite do plano | Cérebro recusa lease N+1; UI mostra upsell. |
| Atingiu % da cota / teto de gasto | Pausa automática de novos workers. |
| Heartbeat falha além da graça (5 min) | Pausa graceful; retoma ao relogar. |
| Offline | Sem trabalho novo; tarefas em curso pausam após graça. |

---

## 17. Parâmetros definidos

| Parâmetro | Valor |
|---|---|
| Lease TTL Free | 4 horas (religar manual) |
| Worker-hours Free | 36h/semana |
| Worker-hours Pro/Team/Ent | ilimitado |
| Janela de graça heartbeat | 5 min |
| Inadimplência | carência 7 dias → rebaixa pra Free |
| Membros Team | até 10 |
| Preço Pro | US$ 20/mês |
| Preço Team | US$ 30/assento/mês |
| Enterprise | base anual + metered (worker/vCPU), sob consulta |

### Ainda a confirmar (operacional, não bloqueante)
- Âncora do reset semanal das worker-hours (ex.: segunda 00:00 UTC).
- Conversão US$→R$ no checkout (câmbio fixo vs gateway).
- Duração do trial pago (se houver) antes de cair pra Free.
- Cobrança metered Enterprise: unidade exata (worker-hora ativa vs lease ativo vs vCPU-hora).
