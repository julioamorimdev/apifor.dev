// Package httpapi — REST/JSON + SSE p/ a GUI.
// M1: login, workers, tasks, SSE. M2.1: criar tarefa real (dispara relay), secret_ref.
package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/billing"
	"apifor.dev/cerebro/internal/db"
)

// Pusher empurra um comando ao executor conectado (implementado por grpcsrv.Hub).
type Pusher interface {
	Send(org string, env *apiforv1.Envelope) bool
}

type API struct {
	DB        *db.DB
	Auth      *auth.Auth
	Hub       Pusher
	CACertPEM []byte // cert público da CA (bootstrap mTLS via GET /v1/ca)
	// overrides de enforcement (espelham o reaper) p/ exibir cap/TTL efetivos em /v1/usage
	HoursCapOverrideSec int
	LeaseTTLOverrideSec int
	// M3.2b: Stripe / dunning
	StripeSecretKey     string
	StripeWebhookSecret string
	StripePrices        map[string]string // plano -> price id
	DunningGraceSec     int               // override da graça de 7d (p/ teste)
	PublicURL           string            // base p/ success/cancel/return
	// M6.1: observabilidade + rate limit
	metrics *Metrics
	rl      *RateLimiter
}

func (a *API) Routes() http.Handler {
	if a.metrics == nil {
		a.metrics = &Metrics{}
	}
	if a.rl == nil {
		a.rl = newRateLimiter(a.DB)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.health)
	mux.HandleFunc("/metrics", a.metricsHandler)               // observabilidade (Prometheus)
	mux.HandleFunc("/v1/audit", a.auditList)                   // GET trilha de auditoria (manage)
	mux.HandleFunc("/v1/audit/export", a.auditExport)          // GET export CSV (manage)
	mux.HandleFunc("/v1/ca", a.caCert) // bootstrap público da CA (mTLS)
	mux.HandleFunc("/v1/auth/login", a.login)
	mux.HandleFunc("/v1/auth/register", a.register)
	mux.HandleFunc("/v1/members", a.members)        // GET lista, POST adiciona (manage)
	mux.HandleFunc("/v1/members/", a.memberRemove)  // DELETE /{id} (manage)
	mux.HandleFunc("/v1/workspaces", a.workspaces)  // GET lista, POST cria (manage)
	mux.HandleFunc("/v1/me", a.me)                  // GET org/papel atual
	mux.HandleFunc("/v1/workers", a.workers)
	mux.HandleFunc("/v1/tasks", a.tasks)           // GET lista, POST cria (dispara relay)
	mux.HandleFunc("/v1/tasks/", a.taskSteps)      // GET /v1/tasks/{id}/steps
	mux.HandleFunc("/v1/secrets", a.secrets)       // GET lista, POST registra metadado
	mux.HandleFunc("/v1/repos", a.repos)           // GET lista, POST registra repositório
	mux.HandleFunc("/v1/prs", a.prs)               // GET lista pull requests
	mux.HandleFunc("/v1/interventions", a.interventions)       // GET gates aguardando humano
	mux.HandleFunc("/v1/interventions/", a.interventionAnswer) // POST /{taskID}/answer
	mux.HandleFunc("/v1/memories", a.memories)                 // GET lista, POST cria (write)
	mux.HandleFunc("/v1/memories/", a.memoryDelete)            // DELETE /{id}
	mux.HandleFunc("/v1/kb-documents", a.kbDocs)               // GET lista, POST metadado (IPC)
	mux.HandleFunc("/v1/routines", a.routines)                 // GET lista, POST cria (write)
	mux.HandleFunc("/v1/routines/", a.routineAction)           // POST /{id}/run|enable|disable, DELETE /{id}
	mux.HandleFunc("/v1/ci", a.ci)                             // GET ci_runs
	mux.HandleFunc("/v1/qa", a.qa)                             // GET qa_reports
	mux.HandleFunc("/v1/telemetry", a.telemetry)               // GET agregado
	mux.HandleFunc("/v1/usage", a.usage)           // GET uso vs limites do plano
	mux.HandleFunc("/v1/devices", a.devices)       // GET lista devices
	mux.HandleFunc("/v1/devices/", a.deviceRevoke) // POST /v1/devices/{id}/revoke (kill-switch)
	mux.HandleFunc("/v1/billing/plan", a.setPlan)         // POST troca de plano (dev)
	mux.HandleFunc("/v1/billing/checkout", a.checkout)    // POST cria Checkout (Stripe)
	mux.HandleFunc("/v1/billing/portal", a.portal)        // POST Customer Portal
	mux.HandleFunc("/v1/billing/webhook", a.webhook)      // POST eventos do Stripe (assinados)
	mux.HandleFunc("/v1/subscription", a.subscription)    // GET estado da assinatura
	mux.HandleFunc("/v1/invoices", a.invoices)            // GET faturas
	mux.HandleFunc("/v1/notifications", a.notifications)         // GET lista, POST marca lidas
	mux.HandleFunc("/v1/notifications/stream", a.notifStream)    // SSE de notificações
	mux.HandleFunc("/v1/workers/stream", a.stream)        // SSE
	return a.instrument(cors(mux))
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"service": "cerebro", "status": "ok", "milestone": "M3.2a"})
}

// caCert serve o cert público da CA (bootstrap do mTLS; o executor confia nele).
func (a *API) caCert(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/x-pem-file")
	_, _ = w.Write(a.CACertPEM)
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, 400, errBody("bad_request", "json inválido"))
		return
	}
	u, err := a.DB.FindUserByEmail(r.Context(), in.Email)
	if err != nil || u == nil || !auth.CheckPassword(u.Hash, in.Password) {
		writeJSON(w, 401, errBody("unauthorized", "credenciais inválidas"))
		return
	}
	role := u.Role
	if role == "" {
		role = "owner"
	}
	tok, err := a.Auth.Issue(u.ID, u.OrgID, role, 15*time.Minute)
	if err != nil {
		writeJSON(w, 500, errBody("internal", "falha ao emitir token"))
		return
	}
	writeJSON(w, 200, map[string]string{"access_token": tok, "org_id": u.OrgID, "role": role})
}

// register: cria user + org (Free) + membership owner. Onboarding self-service.
func (a *API) register(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password, Name, Org string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Email == "" || in.Password == "" {
		writeJSON(w, 400, errBody("bad_request", "email e password obrigatórios"))
		return
	}
	if exists, _ := a.DB.EmailExists(r.Context(), in.Email); exists {
		writeJSON(w, 409, errBody("conflict", "email já cadastrado"))
		return
	}
	hash, _ := auth.HashPassword(in.Password)
	orgName := in.Org
	if orgName == "" {
		orgName = in.Email + "'s org"
	}
	uid, oid, err := a.DB.RegisterOrg(r.Context(), in.Email, in.Name, hash, orgName)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	tok, _ := a.Auth.Issue(uid, oid, "owner", 15*time.Minute)
	writeJSON(w, 201, map[string]string{"access_token": tok, "org_id": oid, "role": "owner"})
}

// authz extrai (userID, orgID, role) do JWT. Sem token válido cai no demo (dev) como owner.
func (a *API) authz(r *http.Request) (userID, orgID, role string) {
	t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if c, err := a.Auth.Parse(t); err == nil && c.OrgID != "" {
		role = c.Role
		if role == "" {
			role = "member"
		}
		return c.Subject, c.OrgID, role
	}
	return db.DemoUserID, db.DemoOrgID, "owner"
}

func (a *API) orgFrom(r *http.Request) string { _, org, _ := a.authz(r); return org }

// can resolve o RBAC por capacidade.
func can(role, cap string) bool {
	switch cap {
	case "read":
		return true
	case "write": // criar tarefa, aprovar intervenção, segredos
		return role == "owner" || role == "admin" || role == "member"
	case "manage": // membros, workspaces, repos, kill-switch
		return role == "owner" || role == "admin"
	case "billing": // plano, checkout, portal
		return role == "owner" || role == "billing"
	}
	return false
}

// requireCap responde 403 e devolve false se o papel não tem a capacidade.
func (a *API) requireCap(w http.ResponseWriter, r *http.Request, cap string) bool {
	_, _, role := a.authz(r)
	if !can(role, cap) {
		writeJSON(w, 403, errBody("forbidden", "papel '"+role+"' sem permissão p/ '"+cap+"'"))
		return false
	}
	return true
}

// recordAudit registra uma ação na trilha de auditoria (ator = usuário do token).
func (a *API) recordAudit(r *http.Request, action, targetType, targetID string) {
	uid, org, _ := a.authz(r)
	a.DB.WriteAudit(r.Context(), org, "user", uid, action, targetType, targetID)
}

// metricsHandler — formato texto Prometheus.
func (a *API) metricsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	m := a.metrics
	fmt.Fprintf(w, "apifor_http_requests_total %d\n", m.requests.Load())
	fmt.Fprintf(w, "apifor_http_rate_limited_total %d\n", m.rateLimited.Load())
	fmt.Fprintf(w, "apifor_http_responses_total{class=\"2xx\"} %d\n", m.status2xx.Load())
	fmt.Fprintf(w, "apifor_http_responses_total{class=\"4xx\"} %d\n", m.status4xx.Load())
	fmt.Fprintf(w, "apifor_http_responses_total{class=\"5xx\"} %d\n", m.status5xx.Load())
	for k, v := range a.DB.GlobalCounts(r.Context()) {
		fmt.Fprintf(w, "apifor_%s %d\n", k, v)
	}
}

// auditList: GET trilha de auditoria (manage — sensível).
func (a *API) auditList(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	rows, err := a.DB.ListAudit(r.Context(), a.orgFrom(r), 200)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// auditExport: GET export CSV da trilha de auditoria (manage).
func (a *API) auditExport(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	rows, err := a.DB.ListAudit(r.Context(), a.orgFrom(r), 1000)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=audit.csv")
	fmt.Fprintln(w, "when,actor_type,actor_id,action,target_type,target_id")
	for _, x := range rows {
		fmt.Fprintf(w, "%v,%v,%v,%v,%v,%v\n", x["when"], x["actor_type"], x["actor_id"], x["action"], x["target_type"], x["target_id"])
	}
}

// me: org + papel do token atual.
func (a *API) me(w http.ResponseWriter, r *http.Request) {
	uid, org, role := a.authz(r)
	writeJSON(w, 200, map[string]string{"user_id": uid, "org_id": org, "role": role})
}

// members: GET lista; POST adiciona membro (manage). Não cria owner por aqui.
func (a *API) members(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "manage") {
			return
		}
		var in struct{ Email, Password, Name, Role string }
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Email == "" || in.Password == "" {
			writeJSON(w, 400, errBody("bad_request", "email e password obrigatórios"))
			return
		}
		switch in.Role {
		case "admin", "member", "billing", "viewer":
		default:
			writeJSON(w, 400, errBody("bad_request", "role: admin|member|billing|viewer"))
			return
		}
		hash, _ := auth.HashPassword(in.Password)
		id, err := a.DB.AddMember(r.Context(), a.orgFrom(r), in.Email, in.Name, hash, in.Role)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "member.add", "user", in.Email+" ("+in.Role+")")
		writeJSON(w, 201, map[string]any{"user_id": id, "role": in.Role})
		return
	}
	rows, err := a.DB.ListMembers(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) memberRemove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, 405, errBody("method", "use DELETE"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/members/")
	if err := a.DB.RemoveMember(r.Context(), a.orgFrom(r), id); err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"id": id, "removed": true})
}

// workspaces: GET lista; POST cria (manage).
func (a *API) workspaces(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "manage") {
			return
		}
		var in struct{ Name string }
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" {
			writeJSON(w, 400, errBody("bad_request", "name obrigatório"))
			return
		}
		id, err := a.DB.CreateWorkspace(r.Context(), a.orgFrom(r), in.Name)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListWorkspaces(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) workers(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListWorkers(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// tasks: GET lista; POST cria tarefa real e dispara o relay de planejamento.
func (a *API) tasks(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		a.createTask(w, r)
		return
	}
	rows, err := a.DB.ListTasks(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) createTask(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title  string   `json:"title"`
		Prompt string   `json:"prompt"`
		Refs   []string `json:"refs"`
		RepoID string   `json:"repo_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Title == "" {
		writeJSON(w, 400, errBody("bad_request", "title e prompt obrigatórios"))
		return
	}
	if !a.requireCap(w, r, "write") {
		return
	}
	taskID, dispatched, err := a.createAndPlan(r.Context(), a.orgFrom(r), in.Title, in.Prompt, in.Refs, in.RepoID)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "task.create", "task", taskID)
	writeJSON(w, 201, map[string]any{"id": taskID, "dispatched": dispatched})
}

// createAndPlan cria a tarefa e dispara o relay (template + refs; nunca código).
// Reusado pelo POST /v1/tasks e pelo run manual de rotina.
func (a *API) createAndPlan(ctx context.Context, org, title, prompt string, refs []string, repoID string) (string, bool, error) {
	taskID, err := a.DB.CreateRealTask(ctx, org, a.DB.FirstWorkspace(ctx, org), title, prompt, repoID)
	if err != nil {
		return "", false, err
	}
	// M5.3: injeta a memória da org no prompt de planejamento.
	planPrompt, nMem := a.DB.PromptWithMemory(ctx, org, repoID, prompt)
	if nMem > 0 {
		log.Printf("memória: %d instrução(ões) injetada(s) no plano de task=%s", nMem, taskID)
	}
	env := &apiforv1.Envelope{
		Type: apiforv1.MsgType_REQUEST_PLAN,
		Payload: &apiforv1.Envelope_RequestPlan{RequestPlan: &apiforv1.RequestPlan{
			TaskId: taskID, PromptTemplate: planPrompt, ContextRefs: refs,
		}},
	}
	dispatched := a.Hub.Send(org, env)
	if dispatched {
		_ = a.DB.SetTaskStatus(ctx, taskID, "planning")
		log.Printf("relay disparado: task=%s refs=%v", taskID, refs)
	} else {
		log.Printf("task %s criada mas nenhum executor conectado", taskID)
	}
	return taskID, dispatched, nil
}

// taskSteps: GET /v1/tasks/{id}/steps — plano estruturado já gravado.
func (a *API) taskSteps(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/tasks/")
	id := strings.TrimSuffix(path, "/steps")
	if id == "" || id == path { // não terminou em /steps
		writeJSON(w, 404, errBody("not_found", "rota inválida"))
		return
	}
	rows, err := a.DB.ListSteps(r.Context(), id)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// secrets: GET lista metadados; POST registra um secret_ref (sem valor).
func (a *API) secrets(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "write") {
			return
		}
		var in struct{ Name, Type, Fingerprint string }
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" {
			writeJSON(w, 400, errBody("bad_request", "name obrigatório"))
			return
		}
		id, err := a.DB.CreateSecretRef(r.Context(), a.orgFrom(r), in.Name, in.Type, in.Fingerprint)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListSecrets(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// repos: GET lista; POST registra um repositório (conexão de código + repository).
func (a *API) repos(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var in struct {
			Name          string `json:"name"`
			CloneURL      string `json:"clone_url"`
			DefaultBranch string `json:"default_branch"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" || in.CloneURL == "" {
			writeJSON(w, 400, errBody("bad_request", "name e clone_url obrigatórios"))
			return
		}
		if !a.requireCap(w, r, "manage") {
			return
		}
		if in.DefaultBranch == "" {
			in.DefaultBranch = "main"
		}
		org := a.orgFrom(r)
		id, err := a.DB.CreateRepo(r.Context(), org, a.DB.FirstWorkspace(r.Context(), org), in.Name, in.CloneURL, in.DefaultBranch)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "repo.create", "repository", in.Name)
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListRepos(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// prs: GET lista os pull requests abertos pelo executor.
func (a *API) prs(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListPRs(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// interventions: GET tarefas bloqueadas no gate de revisão humana.
func (a *API) interventions(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListInterventions(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// interventionAnswer: POST /v1/interventions/{taskID}/answer {decision: approve|reject}.
// approve -> aprova o gate humano e despacha o merge; reject -> falha a tarefa.
func (a *API) interventionAnswer(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/interventions/")
	taskID := strings.TrimSuffix(path, "/answer")
	if r.Method != http.MethodPost || taskID == "" || taskID == path {
		writeJSON(w, 404, errBody("not_found", "use POST /v1/interventions/{taskID}/answer"))
		return
	}
	if !a.requireCap(w, r, "write") {
		return
	}
	var in struct {
		Decision, Note string
		SaveMemory     bool `json:"save_memory"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	// M5.3: salvar a decisão como memória (reaproveita em casos similares).
	if in.SaveMemory && in.Note != "" {
		org := a.orgFrom(r)
		_, _ = a.DB.CreateMemory(r.Context(), org, a.DB.FirstWorkspace(r.Context(), org), "global", "", in.Note, "intervention")
	}
	switch in.Decision {
	case "approve":
		if err := a.DB.ApproveHumanReview(r.Context(), taskID); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.dispatchMerge(r.Context(), taskID)
		writeJSON(w, 200, map[string]any{"task_id": taskID, "decision": "approve", "merging": true})
	case "reject":
		if err := a.DB.RejectHumanReview(r.Context(), taskID, in.Note); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		writeJSON(w, 200, map[string]any{"task_id": taskID, "decision": "reject"})
	default:
		writeJSON(w, 400, errBody("bad_request", "decision: approve|reject"))
	}
}

// memories: GET lista; POST cria memória (write). scope global|repo.
func (a *API) memories(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "write") {
			return
		}
		var in struct {
			Scope       string `json:"scope"`
			RepoID      string `json:"repo_id"`
			Instruction string `json:"instruction"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Instruction == "" {
			writeJSON(w, 400, errBody("bad_request", "instruction obrigatória"))
			return
		}
		org := a.orgFrom(r)
		id, err := a.DB.CreateMemory(r.Context(), org, a.DB.FirstWorkspace(r.Context(), org), in.Scope, in.RepoID, in.Instruction, "manual")
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListMemories(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) memoryDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeJSON(w, 405, errBody("method", "use DELETE"))
		return
	}
	if !a.requireCap(w, r, "write") {
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/memories/")
	_ = a.DB.DeleteMemory(r.Context(), a.orgFrom(r), id)
	writeJSON(w, 200, map[string]any{"id": id, "removed": true})
}

// kbDocs: GET lista; POST registra metadado de KB (o arquivo fica LOCAL, via IPC).
func (a *API) kbDocs(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "write") {
			return
		}
		var in struct {
			Name     string `json:"name"`
			Category string `json:"category"`
			FileRef  string `json:"file_ref"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" {
			writeJSON(w, 400, errBody("bad_request", "name obrigatório"))
			return
		}
		org := a.orgFrom(r)
		id, err := a.DB.CreateKBDoc(r.Context(), org, a.DB.FirstWorkspace(r.Context(), org), in.Name, in.Category, in.FileRef)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListKBDocs(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// routines: GET lista; POST cria (write). Trigger schedule (interval_sec) ou manual.
func (a *API) routines(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "write") {
			return
		}
		var in struct {
			Name        string   `json:"name"`
			Trigger     string   `json:"trigger"`      // schedule|manual
			IntervalSec int      `json:"interval_sec"` // p/ schedule
			Title       string   `json:"title"`
			Prompt      string   `json:"prompt"`
			Refs        []string `json:"refs"`
			RepoID      string   `json:"repo_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" || in.Prompt == "" {
			writeJSON(w, 400, errBody("bad_request", "name e prompt obrigatórios"))
			return
		}
		if in.Trigger == "" {
			in.Trigger = "manual"
		}
		if in.Trigger == "schedule" && in.IntervalSec <= 0 {
			writeJSON(w, 400, errBody("bad_request", "schedule exige interval_sec > 0"))
			return
		}
		org := a.orgFrom(r)
		title := in.Title
		if title == "" {
			title = in.Name
		}
		id, err := a.DB.CreateRoutine(r.Context(), org, a.DB.FirstWorkspace(r.Context(), org), in.Name, in.Trigger, in.IntervalSec,
			db.RoutineAction{Title: title, Prompt: in.Prompt, Refs: in.Refs, RepoID: in.RepoID})
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListRoutines(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// routineAction: POST /v1/routines/{id}/{run|enable|disable}, DELETE /v1/routines/{id}.
func (a *API) routineAction(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/v1/routines/")
	parts := strings.SplitN(rest, "/", 2)
	id := parts[0]
	if id == "" {
		writeJSON(w, 404, errBody("not_found", "rota inválida"))
		return
	}
	org := a.orgFrom(r)
	if r.Method == http.MethodDelete {
		if !a.requireCap(w, r, "write") {
			return
		}
		_ = a.DB.DeleteRoutine(r.Context(), org, id)
		writeJSON(w, 200, map[string]any{"id": id, "deleted": true})
		return
	}
	if r.Method != http.MethodPost || len(parts) < 2 {
		writeJSON(w, 404, errBody("not_found", "use POST /v1/routines/{id}/{run|enable|disable}"))
		return
	}
	if !a.requireCap(w, r, "write") {
		return
	}
	switch parts[1] {
	case "run":
		o, wsp, act, err := a.DB.GetRoutineAction(r.Context(), id)
		if err != nil {
			writeJSON(w, 404, errBody("not_found", "rotina não encontrada"))
			return
		}
		if wsp == "" {
			wsp = a.DB.FirstWorkspace(r.Context(), o)
		}
		taskID, dispatched, _ := a.createAndPlan(r.Context(), o, act.Title, act.Prompt, act.Refs, act.RepoID)
		a.DB.CreateNotification(r.Context(), o, "routine", "Rotina disparada", act.Title, "/routines")
		writeJSON(w, 200, map[string]any{"task_id": taskID, "dispatched": dispatched})
	case "enable":
		_ = a.DB.SetRoutineEnabled(r.Context(), org, id, true)
		writeJSON(w, 200, map[string]any{"id": id, "enabled": true})
	case "disable":
		_ = a.DB.SetRoutineEnabled(r.Context(), org, id, false)
		writeJSON(w, 200, map[string]any{"id": id, "enabled": false})
	default:
		writeJSON(w, 404, errBody("not_found", "ação inválida"))
	}
}

// ci/qa/telemetry: telas read-only do M4.3.
func (a *API) ci(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListCI(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) qa(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListQA(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) telemetry(w http.ResponseWriter, r *http.Request) {
	row, err := a.DB.Telemetry(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, row)
}

// dispatchMerge empurra o step de merge ao executor (após aprovação humana).
func (a *API) dispatchMerge(ctx context.Context, taskID string) {
	tr, err := a.DB.GetTaskRepo(ctx, taskID)
	if err != nil || tr == nil || tr.CloneURL == "" {
		log.Printf("dispatchMerge: sem repo p/ task=%s", taskID)
		return
	}
	instr, _ := json.Marshal(map[string]any{
		"repo_url": tr.CloneURL, "base_branch": tr.DefaultBranch,
		"branch": "apifor/" + taskID, "change_request": tr.Prompt,
	})
	a.Hub.Send(tr.OrgID, &apiforv1.Envelope{
		Type: apiforv1.MsgType_DISPATCH_STEP,
		Payload: &apiforv1.Envelope_DispatchStep{DispatchStep: &apiforv1.DispatchStep{
			StepId: db.NewID("stp"), TaskId: taskID, Kind: apiforv1.StepKind_MERGE, Instructions: string(instr),
		}},
	})
	log.Printf("merge despachado após aprovação humana: task=%s", taskID)
}

// usage: uso atual vs limites do plano (server-side; o cliente não pode burlar).
func (a *API) usage(w http.ResponseWriter, r *http.Request) {
	org := a.orgFrom(r)
	pl, err := a.DB.GetPlanLimits(r.Context(), org)
	if err != nil || pl == nil {
		writeJSON(w, 500, errBody("internal", "sem plano"))
		return
	}
	active, _ := a.DB.ActiveLeaseCount(r.Context(), org)
	used, _ := a.DB.WeekSecondsUsed(r.Context(), org)

	capSec := 0
	if pl.WeeklyHours != nil {
		if a.HoursCapOverrideSec > 0 {
			capSec = a.HoursCapOverrideSec
		} else {
			capSec = *pl.WeeklyHours * 3600
		}
	}
	ttlSec := 0
	if pl.LeaseTTLMin != nil {
		if a.LeaseTTLOverrideSec > 0 {
			ttlSec = a.LeaseTTLOverrideSec
		} else {
			ttlSec = *pl.LeaseTTLMin * 60
		}
	}
	out := map[string]any{
		"plan":              pl.Plan,
		"active_workers":    active,
		"week_seconds_used": used,
		"week_cap_seconds":  capSec, // 0 = ilimitado
		"lease_ttl_seconds": ttlSec, // 0 = sem expiração
	}
	if pl.MaxWorkers != nil {
		out["max_workers"] = *pl.MaxWorkers
	} else {
		out["max_workers"] = nil
	}
	writeJSON(w, 200, out)
}

func (a *API) devices(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListDevices(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// deviceRevoke: POST /v1/devices/{id}/revoke — kill-switch (revoga o device).
func (a *API) deviceRevoke(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/v1/devices/")
	id := strings.TrimSuffix(path, "/revoke")
	if r.Method != http.MethodPost || id == "" || id == path {
		writeJSON(w, 404, errBody("not_found", "use POST /v1/devices/{id}/revoke"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	if err := a.DB.RevokeDevice(r.Context(), id); err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "device.revoke", "device", id)
	writeJSON(w, 200, map[string]any{"id": id, "revoked": true})
}

// setPlan: POST /v1/billing/plan {plan} — stand-in do Stripe no M3.1.
func (a *API) setPlan(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "billing") {
		return
	}
	var in struct{ Plan string }
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSON(w, 400, errBody("bad_request", "json inválido"))
		return
	}
	switch in.Plan {
	case "free", "pro", "team", "enterprise":
	default:
		writeJSON(w, 400, errBody("bad_request", "plano inválido"))
		return
	}
	if err := a.DB.SetPlan(r.Context(), a.orgFrom(r), in.Plan); err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "plan.change", "org", in.Plan)
	writeJSON(w, 200, map[string]any{"plan": in.Plan})
}

// ── M3.2b: billing ──

// checkout: cria sessão de Checkout no Stripe (ou stub se não configurado).
func (a *API) checkout(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "billing") {
		return
	}
	var in struct{ Plan string }
	_ = json.NewDecoder(r.Body).Decode(&in)
	if in.Plan != "pro" && in.Plan != "team" {
		writeJSON(w, 400, errBody("bad_request", "plano de checkout: pro|team"))
		return
	}
	org := a.orgFrom(r)
	if a.StripeSecretKey == "" {
		writeJSON(w, 201, map[string]any{
			"url": "stub://checkout?plan=" + in.Plan + "&org=" + org, "configured": false,
			"note": "STRIPE_SECRET_KEY ausente — webhook sintético ou /v1/billing/plan",
		})
		return
	}
	url, err := billing.Checkout(a.StripeSecretKey, a.StripePrices[in.Plan],
		a.PublicURL+"/usage", a.PublicURL+"/usage", org, in.Plan)
	if err != nil {
		writeJSON(w, 502, errBody("stripe", err.Error()))
		return
	}
	writeJSON(w, 201, map[string]any{"url": url, "configured": true})
}

// portal: cria sessão do Customer Portal p/ gerenciar a assinatura.
func (a *API) portal(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "billing") {
		return
	}
	org := a.orgFrom(r)
	sub, _ := a.DB.GetSubscription(r.Context(), org)
	if a.StripeSecretKey == "" || sub == nil {
		writeJSON(w, 201, map[string]any{"url": "stub://portal?org=" + org, "configured": false})
		return
	}
	url, err := billing.Portal(a.StripeSecretKey, sub.CustomerID, a.PublicURL+"/usage")
	if err != nil {
		writeJSON(w, 502, errBody("stripe", err.Error()))
		return
	}
	writeJSON(w, 201, map[string]any{"url": url, "configured": true})
}

// webhook: recebe eventos do Stripe (assinatura HMAC verificada) e aplica billing+dunning.
func (a *API) webhook(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	if err := billing.VerifyWebhook(body, r.Header.Get("Stripe-Signature"), a.StripeWebhookSecret, 5*time.Minute); err != nil {
		writeJSON(w, 400, errBody("bad_signature", err.Error()))
		return
	}
	var ev struct {
		Type string `json:"type"`
		Data struct {
			Object struct {
				ID                string            `json:"id"`
				Customer          string            `json:"customer"`
				Subscription      string            `json:"subscription"`
				ClientReferenceID string            `json:"client_reference_id"`
				AmountPaid        int               `json:"amount_paid"`
				Currency          string            `json:"currency"`
				HostedInvoiceURL  string            `json:"hosted_invoice_url"`
				Metadata          map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &ev); err != nil {
		writeJSON(w, 400, errBody("bad_request", "evento inválido"))
		return
	}
	o := ev.Data.Object
	org := o.Metadata["org_id"]
	if org == "" {
		org = o.ClientReferenceID
	}
	if org == "" {
		org, _ = a.DB.OrgByStripeCustomer(r.Context(), o.Customer)
	}
	if org == "" {
		writeJSON(w, 200, map[string]any{"received": true, "ignored": "sem org"})
		return
	}

	ctx := r.Context()
	switch ev.Type {
	case "checkout.session.completed":
		plan := o.Metadata["plan"]
		if plan == "" {
			plan = "pro"
		}
		_ = a.DB.UpsertSubscription(ctx, org, plan, o.Customer, o.Subscription)
		log.Printf("billing: checkout completo org=%s plano=%s", org, plan)
	case "invoice.payment_failed":
		gsec := a.DunningGraceSec
		if gsec <= 0 {
			gsec = 7 * 24 * 3600
		}
		_ = a.DB.SetSubscriptionPastDue(ctx, org, time.Now().Add(time.Duration(gsec)*time.Second))
		log.Printf("billing: pagamento falhou org=%s -> past_due (graça %ds)", org, gsec)
	case "invoice.payment_succeeded":
		_ = a.DB.SetSubscriptionActive(ctx, org)
		_ = a.DB.CreateInvoice(ctx, org, o.ID, o.AmountPaid, defCur(o.Currency), "paid", o.HostedInvoiceURL)
		log.Printf("billing: pagamento ok org=%s fatura=%s", org, o.ID)
	case "customer.subscription.deleted":
		_ = a.DB.DowngradeToFree(ctx, org)
		log.Printf("billing: assinatura cancelada org=%s -> Free", org)
	}
	writeJSON(w, 200, map[string]any{"received": true, "type": ev.Type})
}

func (a *API) subscription(w http.ResponseWriter, r *http.Request) {
	sub, err := a.DB.GetSubscription(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	if sub == nil {
		writeJSON(w, 200, map[string]any{"plan": "free", "status": "none"})
		return
	}
	out := map[string]any{"plan": sub.Plan, "status": sub.Status, "stripe_customer_id": sub.CustomerID}
	if sub.GraceUntil != nil {
		out["grace_until"] = sub.GraceUntil.UTC().Format(time.RFC3339)
	}
	writeJSON(w, 200, out)
}

func (a *API) invoices(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListInvoices(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func defCur(c string) string {
	if c == "" {
		return "usd"
	}
	return c
}

// notifications: GET lista (+ unread); POST marca todas como lidas.
func (a *API) notifications(w http.ResponseWriter, r *http.Request) {
	org := a.orgFrom(r)
	if r.Method == http.MethodPost {
		_ = a.DB.MarkNotificationsRead(r.Context(), org)
		writeJSON(w, 200, map[string]any{"read": true})
		return
	}
	rows, err := a.DB.ListNotifications(r.Context(), org)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows, "unread": a.DB.UnreadCount(r.Context(), org)})
}

// notifStream: SSE — empurra notificações + contagem não-lidas a cada 2s.
func (a *API) notifStream(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "sem streaming", 500)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	org := a.orgFrom(r)
	tick := time.NewTicker(2 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			rows, _ := a.DB.ListNotifications(r.Context(), org)
			b, _ := json.Marshal(map[string]any{"notifications": rows, "unread": a.DB.UnreadCount(r.Context(), org)})
			_, _ = w.Write([]byte("data: " + string(b) + "\n\n"))
			fl.Flush()
		}
	}
}

// SSE: empurra workers+tasks a cada 1s.
func (a *API) stream(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "sem streaming", 500)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	org := a.orgFrom(r)
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-tick.C:
			workers, _ := a.DB.ListWorkers(r.Context(), org)
			tasks, _ := a.DB.ListTasks(r.Context(), org)
			b, _ := json.Marshal(map[string]any{"workers": workers, "tasks": tasks})
			_, _ = w.Write([]byte("data: " + string(b) + "\n\n"))
			fl.Flush()
		}
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func errBody(code, msg string) map[string]any {
	return map[string]any{"error": map[string]string{"code": code, "message": msg}}
}
func cors(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}
