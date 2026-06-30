// Package httpapi — REST/JSON + SSE p/ a GUI.
// M1: login, workers, tasks, SSE. M2.1: criar tarefa real (dispara relay), secret_ref.
package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
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
	// M6.2: segurança — exige JWT (fecha o fallback dev "demo owner")
	RequireAuth bool
	// SuperAdminEmails: lista de e-mails que recebem role "superadmin" no login.
	SuperAdminEmails []string
	// TokenTTL: validade do JWT emitido no login/register (0 = default 12h).
	TokenTTL time.Duration
	// AuthSidecarURL: base do sidecar que dirige o `claude setup-token` (OAuth
	// da assinatura). Vazio = recurso indisponível (502 nas rotas claude/*).
	AuthSidecarURL string
	// GitHubOAuthClientID: client id p/ o device-flow do GitHub (default: o
	// client público do gh CLI). Override via env GITHUB_OAUTH_CLIENT_ID.
	GitHubOAuthClientID string
	// device-flows do GitHub em andamento, por org.
	ghMu    sync.Mutex
	ghFlows map[string]*ghFlow
}

// ghFlow guarda o estado de um device-flow do GitHub p/ uma org.
type ghFlow struct {
	userCode  string
	verifyURI string
	status    string // pending | authorized | expired | denied | error
	login     string
	errMsg    string
	purpose   string // "code" (default) | "tasks" — onde gravar a conexão
}

// tokenTTL devolve a validade configurada ou o default (12h).
func (a *API) tokenTTL() time.Duration {
	if a.TokenTTL > 0 {
		return a.TokenTTL
	}
	return 12 * time.Hour
}

func (a *API) Routes() http.Handler {
	if a.metrics == nil {
		a.metrics = &Metrics{}
	}
	if a.ghFlows == nil {
		a.ghFlows = map[string]*ghFlow{}
	}
	if a.GitHubOAuthClientID == "" {
		a.GitHubOAuthClientID = "Iv1.b507a08c87ecfe98" // client público do gh CLI
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
	mux.HandleFunc("/v1/logs", a.logs)                         // GET feed de logs (steps)
	mux.HandleFunc("/v1/pool", a.pool)                         // GET config do pool / POST atualiza (manage)
	mux.HandleFunc("/v1/connections", a.connections)           // GET conexões / POST motor IA
	mux.HandleFunc("/v1/connections/claude/", a.claudeAuth)    // POST start|code|cancel (OAuth assinatura)
	mux.HandleFunc("/v1/connections/anthropic/test", a.anthropicTest) // POST valida API key
	mux.HandleFunc("/v1/connections/git", a.gitConnect)               // POST conecta (valida+grava) / DELETE desconecta
	mux.HandleFunc("/v1/connections/git/test", a.gitTest)             // POST valida token de código
	mux.HandleFunc("/v1/connections/code/repos", a.codeRemoteRepos)   // GET lista repositórios remotos da conta conectada
	mux.HandleFunc("/v1/connections/git/github/device", a.githubDeviceStart)  // POST inicia device-flow
	mux.HandleFunc("/v1/connections/git/github/device/status", a.githubDeviceStatus) // GET status do device-flow
	mux.HandleFunc("/v1/connections/tasks", a.tasksConnect)    // POST conecta fonte de tarefas / DELETE desconecta
	mux.HandleFunc("/v1/connections/tasks/test", a.tasksTest)  // POST valida credencial da fonte de tarefas
	mux.HandleFunc("/v1/connections/integration", a.integrationConnect)     // POST conecta CI/observabilidade / DELETE
	mux.HandleFunc("/v1/connections/integration/test", a.integrationTest)   // POST valida credencial CI/observabilidade
	mux.HandleFunc("/v1/connections/reuse", a.reuseConnection)              // POST reaproveita identidade (github/gitlab/bitbucket) em outra aba
	mux.HandleFunc("/v1/pinned-workers", a.pinnedWorkers)      // GET lista / POST cria (manage)
	mux.HandleFunc("/v1/pinned-workers/", a.pinnedWorkerByID)  // DELETE {id} (manage)
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
	// Superadmin — acesso global (role = "superadmin")
	mux.HandleFunc("/v1/admin/stats", a.adminStats)
	mux.HandleFunc("/v1/admin/orgs", a.adminOrgs)
	mux.HandleFunc("/v1/admin/orgs/", a.adminOrgAction) // GET /{id} (detalhe) | POST /{id}/plan|suspend|unsuspend
	mux.HandleFunc("/v1/admin/users", a.adminUsers)
	mux.HandleFunc("/v1/admin/users/", a.adminUserAction) // POST /{id}/suspend|activate
	mux.HandleFunc("/v1/admin/audit", a.adminAudit)       // GET trilha global
	mux.HandleFunc("/v1/admin/plans", a.adminPlans)       // GET catálogo + receita
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

func (a *API) isSuperAdmin(email string) bool {
	for _, e := range a.SuperAdminEmails {
		if strings.EqualFold(e, email) {
			return true
		}
	}
	return false
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
	if u.Status == "suspended" {
		writeJSON(w, 403, errBody("suspended", "conta suspensa — contate o administrador"))
		return
	}
	role := u.Role
	if role == "" {
		role = "owner"
	}
	// Superadmin: role override, org vazia (acessa todas as orgs)
	orgID := u.OrgID
	if a.isSuperAdmin(u.Email) {
		role = "superadmin"
		orgID = ""
	}
	tok, err := a.Auth.Issue(u.ID, orgID, role, a.tokenTTL())
	if err != nil {
		writeJSON(w, 500, errBody("internal", "falha ao emitir token"))
		return
	}
	writeJSON(w, 200, map[string]string{"access_token": tok, "org_id": orgID, "role": role})
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
	tok, _ := a.Auth.Issue(uid, oid, "owner", a.tokenTTL())
	writeJSON(w, 201, map[string]string{"access_token": tok, "org_id": oid, "role": "owner"})
}

// authz extrai (userID, orgID, role) do JWT. Sem token válido: cai no demo (dev) como
// owner SE RequireAuth=false; com RequireAuth=true devolve vazio (não autenticado).
// Superadmin: org="" é válido (acessa todas as orgs).
func (a *API) authz(r *http.Request) (userID, orgID, role string) {
	t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if c, err := a.Auth.Parse(t); err == nil && c.Subject != "" {
		role = c.Role
		if role == "" {
			role = "member"
		}
		return c.Subject, c.OrgID, role
	}
	if a.RequireAuth {
		return "", "", ""
	}
	return db.DemoUserID, db.DemoOrgID, "owner"
}

func (a *API) orgFrom(r *http.Request) string { _, org, _ := a.authz(r); return org }
func (a *API) wspFrom(r *http.Request) string  { return r.Header.Get("X-Workspace-ID") }

// can resolve o RBAC por capacidade.
func can(role, cap string) bool {
	if role == "superadmin" {
		return true // superadmin tem tudo
	}
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

// requireSuperAdmin responde 403 se não for superadmin.
func (a *API) requireSuperAdmin(w http.ResponseWriter, r *http.Request) bool {
	_, _, role := a.authz(r)
	if role != "superadmin" {
		writeJSON(w, 403, errBody("forbidden", "requer superadmin"))
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
		fmt.Fprintf(w, "%s,%s,%s,%s,%s,%s\n",
			csvField(x["when"]), csvField(x["actor_type"]), csvField(x["actor_id"]),
			csvField(x["action"]), csvField(x["target_type"]), csvField(x["target_id"]))
	}
}

// csvField cita o campo e neutraliza injeção de fórmula (=,+,-,@) no CSV.
func csvField(v any) string {
	s := fmt.Sprintf("%v", v)
	if s != "" && strings.ContainsAny(s[:1], "=+-@") {
		s = "'" + s
	}
	s = strings.ReplaceAll(s, `"`, `""`)
	return `"` + s + `"`
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
	rows, err := a.DB.ListWorkers(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
	rows, err := a.DB.ListTasks(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
			Provider      string `json:"provider"`
			LocalDir      string `json:"local_dir"`
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
		id, err := a.DB.CreateRepoFrom(r.Context(), org, a.DB.FirstWorkspace(r.Context(), org), in.Name, in.CloneURL, in.DefaultBranch, in.Provider, strings.TrimSpace(in.LocalDir))
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "repo.create", "repository", in.Name)
		writeJSON(w, 201, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListRepos(r.Context(), a.orgFrom(r), a.wspFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// prs: GET lista os pull requests abertos pelo executor.
func (a *API) prs(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListPRs(r.Context(), a.orgFrom(r), a.wspFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// interventions: GET tarefas bloqueadas no gate de revisão humana.
func (a *API) interventions(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListInterventions(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
		if err := a.DB.ApproveHumanReview(r.Context(), a.orgFrom(r), taskID); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.dispatchMerge(r.Context(), taskID)
		writeJSON(w, 200, map[string]any{"task_id": taskID, "decision": "approve", "merging": true})
	case "reject":
		if err := a.DB.RejectHumanReview(r.Context(), a.orgFrom(r), taskID, in.Note); err != nil {
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
	rows, err := a.DB.ListMemories(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
	rows, err := a.DB.ListKBDocs(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
	rows, err := a.DB.ListRoutines(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
	rows, err := a.DB.ListCI(r.Context(), a.orgFrom(r), a.wspFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) logs(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListLogs(r.Context(), a.orgFrom(r), a.wspFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// pool: GET config do pool; POST atualiza (liga/desliga, paralelo, retries, auto-merge).
func (a *API) pool(w http.ResponseWriter, r *http.Request) {
	org := a.orgFrom(r)
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "manage") {
			return
		}
		var c db.PoolCfg
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeJSON(w, 400, errBody("bad_request", err.Error()))
			return
		}
		if err := a.DB.UpdatePoolConfig(r.Context(), org, c); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "pool.update", "pool", "")
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	c, err := a.DB.GetPoolConfig(r.Context(), org)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, c)
}

func (a *API) connections(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "manage") {
			return
		}
		var body struct {
			Kind string `json:"kind"` // "subscription" | "api"
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, 400, errBody("bad_request", err.Error()))
			return
		}
		provider, label := "Claude (assinatura)", "Conta Claude.ai"
		if body.Kind == "api" {
			provider, label = "Anthropic API", "API key"
		} else {
			body.Kind = "subscription"
		}
		id, err := a.DB.SetAIEngine(r.Context(), a.orgFrom(r), body.Kind, provider, label)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "connection.ai_engine.set", "connection", id)
		writeJSON(w, 200, map[string]any{"id": id, "provider": provider, "kind": body.Kind})
		return
	}
	rows, err := a.DB.ListConnections(r.Context(), a.orgFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// claudeAuth dirige o OAuth da assinatura Claude via sidecar (`claude
// setup-token` num PTY). A conta = a org (um CLAUDE_CONFIG_DIR por org).
//   POST /v1/connections/claude/start  -> {url}      inicia, devolve URL de autorização
//   POST /v1/connections/claude/code   {code} -> {ok} envia o código colado; grava a conexão
//   POST /v1/connections/claude/cancel -> {ok}       aborta
func (a *API) claudeAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	if a.AuthSidecarURL == "" {
		writeJSON(w, 502, errBody("unavailable", "sidecar de OAuth Claude não configurado (AUTH_SIDECAR_URL)"))
		return
	}
	action := strings.TrimPrefix(r.URL.Path, "/v1/connections/claude/")
	org := a.orgFrom(r)

	switch action {
	case "start":
		st, body := a.sidecar(r.Context(), "POST", "/accounts/"+org+"/start", nil)
		writeJSONRaw(w, st, body)
	case "code":
		var in struct {
			Code string `json:"code"`
		}
		_ = json.NewDecoder(r.Body).Decode(&in)
		if strings.TrimSpace(in.Code) == "" {
			writeJSON(w, 400, errBody("bad_request", "código vazio"))
			return
		}
		payload, _ := json.Marshal(map[string]string{"code": in.Code})
		st, body := a.sidecar(r.Context(), "POST", "/accounts/"+org+"/code", payload)
		if st == 200 {
			// sucesso: registra/atualiza o motor de IA (assinatura) no banco
			if id, err := a.DB.SetAIEngine(r.Context(), org, "subscription", "Claude (assinatura)", "Conta Claude.ai"); err == nil {
				a.recordAudit(r, "connection.ai_engine.set", "connection", id)
			}
		}
		writeJSONRaw(w, st, body)
	case "cancel":
		st, body := a.sidecar(r.Context(), "POST", "/accounts/"+org+"/cancel", nil)
		writeJSONRaw(w, st, body)
	default:
		writeJSON(w, 404, errBody("not_found", "ação inválida"))
	}
}

// sidecar faz uma chamada HTTP ao auth-sidecar e devolve (status, corpo bruto).
func (a *API) sidecar(ctx context.Context, method, path string, body []byte) (int, []byte) {
	var rdr io.Reader
	if body != nil {
		rdr = strings.NewReader(string(body))
	}
	req, err := http.NewRequestWithContext(ctx, method, a.AuthSidecarURL+path, rdr)
	if err != nil {
		return 500, errJSON("internal", err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	cl := &http.Client{Timeout: 120 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		return 502, errJSON("unavailable", "sidecar inacessível: "+err.Error())
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out
}

// anthropicTest valida uma API key da Anthropic via GET /v1/models (barato,
// sem custo de tokens). A chave nunca é gravada nem logada aqui.
func (a *API) anthropicTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	var in struct {
		APIKey string `json:"api_key"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	key := strings.TrimSpace(in.APIKey)
	if key == "" {
		writeJSON(w, 400, errBody("bad_request", "api_key vazia"))
		return
	}
	req, err := http.NewRequestWithContext(r.Context(), "GET", "https://api.anthropic.com/v1/models?limit=1", nil)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	req.Header.Set("x-api-key", key)
	req.Header.Set("anthropic-version", "2023-06-01")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "message": "falha de rede: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 {
		writeJSON(w, 200, map[string]any{"ok": true, "message": "chave válida"})
		return
	}
	msg := "chave inválida"
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		msg = "chave inválida ou sem permissão"
	} else if resp.StatusCode == 429 {
		msg = "rate limit — tente de novo"
	} else {
		msg = "resposta inesperada da Anthropic (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
	}
	writeJSON(w, 200, map[string]any{"ok": false, "status": resp.StatusCode, "message": msg})
}

// providerLabels: nomes amigáveis dos providers de código.
var providerLabels = map[string]string{"github": "GitHub", "gitlab": "GitLab", "bitbucket": "Bitbucket"}

// validateGitToken valida o token contra a API do provider e devolve o
// identificador da conta (login/username). who vazio => inválido.
func (a *API) validateGitToken(ctx context.Context, provider, token, username string) (ok bool, who string, status int, msg string) {
	var url string
	hdr := map[string]string{}
	switch provider {
	case "github":
		url = "https://api.github.com/user"
		hdr["Authorization"] = "Bearer " + token
		hdr["Accept"] = "application/vnd.github+json"
		hdr["User-Agent"] = "apifor.dev"
	case "gitlab":
		url = "https://gitlab.com/api/v4/user"
		hdr["Authorization"] = "Bearer " + token
	case "bitbucket":
		if username == "" {
			return false, "", 400, "Bitbucket exige usuário + app password"
		}
		url = "https://api.bitbucket.org/2.0/user"
		hdr["Authorization"] = "Basic " + base64.StdEncoding.EncodeToString([]byte(username+":"+token))
	default:
		return false, "", 400, "provider inválido"
	}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, "", 500, err.Error()
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return false, "", 502, "falha de rede: " + err.Error()
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode != 200 {
		m := "token inválido ou sem permissão"
		if resp.StatusCode == 429 {
			m = "rate limit — tente de novo"
		}
		return false, "", resp.StatusCode, m
	}
	var u struct {
		Login       string `json:"login"`        // github
		Username    string `json:"username"`     // gitlab / bitbucket
		DisplayName string `json:"display_name"` // bitbucket
	}
	_ = json.Unmarshal(body, &u)
	who = u.Login
	if who == "" {
		who = u.Username
	}
	if who == "" {
		who = u.DisplayName
	}
	if who == "" {
		who = providerLabels[provider]
	}
	return true, who, 200, "conectado como " + who
}

type gitBody struct {
	Provider string `json:"provider"`
	Token    string `json:"token"`
	Username string `json:"username"`
}

// gitTest valida um token de código (GitHub/GitLab/Bitbucket) sem gravar nada.
func (a *API) gitTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	var in gitBody
	_ = json.NewDecoder(r.Body).Decode(&in)
	if strings.TrimSpace(in.Token) == "" {
		writeJSON(w, 400, errBody("bad_request", "token vazio"))
		return
	}
	ok, who, _, msg := a.validateGitToken(r.Context(), in.Provider, strings.TrimSpace(in.Token), strings.TrimSpace(in.Username))
	writeJSON(w, 200, map[string]any{"ok": ok, "who": who, "message": msg})
}

// gitConnect: POST valida + grava a conexão de código; DELETE desconecta.
func (a *API) gitConnect(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	org := a.orgFrom(r)
	if r.Method == http.MethodDelete {
		prov := strings.TrimSpace(r.URL.Query().Get("provider"))
		if _, ok := providerLabels[prov]; !ok {
			writeJSON(w, 400, errBody("bad_request", "provider inválido"))
			return
		}
		if err := a.DB.DeleteCodeProvider(r.Context(), org, prov); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "connection.code.delete", "connection", prov)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST/DELETE"))
		return
	}
	var in gitBody
	_ = json.NewDecoder(r.Body).Decode(&in)
	if _, ok := providerLabels[in.Provider]; !ok {
		writeJSON(w, 400, errBody("bad_request", "provider inválido"))
		return
	}
	if strings.TrimSpace(in.Token) == "" {
		writeJSON(w, 400, errBody("bad_request", "token vazio"))
		return
	}
	ok, who, _, msg := a.validateGitToken(r.Context(), in.Provider, strings.TrimSpace(in.Token), strings.TrimSpace(in.Username))
	if !ok {
		writeJSON(w, 200, map[string]any{"ok": false, "message": msg})
		return
	}
	label := who
	if in.Provider == "bitbucket" && in.Username != "" {
		label = in.Username
	}
	id, err := a.DB.SetCodeProviderToken(r.Context(), org, in.Provider, label, strings.TrimSpace(in.Token), strings.TrimSpace(in.Username), "token")
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "connection.code.set", "connection", id)
	writeJSON(w, 200, map[string]any{"ok": true, "who": who, "provider": in.Provider})
}

// remoteRepo é um repositório remoto da conta conectada (p/ o seletor de "Adicionar repositório").
type remoteRepo struct {
	FullName      string `json:"full_name"`
	CloneURL      string `json:"clone_url"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
}

// listRemoteRepos chama a API do provider (com o token guardado) e devolve os
// repositórios da conta. status != 200 sinaliza erro (msg explica).
func (a *API) listRemoteRepos(ctx context.Context, provider, token, username string) ([]remoteRepo, int, string) {
	client := &http.Client{Timeout: 20 * time.Second}
	get := func(url string, hdr map[string]string) ([]byte, int, string) {
		req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
		for k, v := range hdr {
			req.Header.Set(k, v)
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, 502, "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		if resp.StatusCode != 200 {
			return nil, resp.StatusCode, "o provider recusou a listagem de repositórios"
		}
		return body, 200, ""
	}
	switch provider {
	case "github":
		body, st, msg := get("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
			map[string]string{"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "apifor.dev"})
		if st != 200 {
			return nil, st, msg
		}
		var arr []struct {
			FullName string `json:"full_name"`
			CloneURL string `json:"clone_url"`
			Default  string `json:"default_branch"`
			Private  bool   `json:"private"`
		}
		_ = json.Unmarshal(body, &arr)
		out := make([]remoteRepo, 0, len(arr))
		for _, x := range arr {
			out = append(out, remoteRepo{x.FullName, x.CloneURL, x.Default, x.Private})
		}
		return out, 200, ""
	case "gitlab":
		body, st, msg := get("https://gitlab.com/api/v4/projects?membership=true&per_page=100&order_by=last_activity_at&simple=true",
			map[string]string{"Authorization": "Bearer " + token})
		if st != 200 {
			return nil, st, msg
		}
		var arr []struct {
			Path    string `json:"path_with_namespace"`
			HTTPURL string `json:"http_url_to_repo"`
			Default string `json:"default_branch"`
			Vis     string `json:"visibility"`
		}
		_ = json.Unmarshal(body, &arr)
		out := make([]remoteRepo, 0, len(arr))
		for _, x := range arr {
			out = append(out, remoteRepo{x.Path, x.HTTPURL, x.Default, x.Vis != "public"})
		}
		return out, 200, ""
	case "bitbucket":
		body, st, msg := get("https://api.bitbucket.org/2.0/repositories?role=member&pagelen=100&sort=-updated_on",
			map[string]string{"Authorization": "Basic " + base64.StdEncoding.EncodeToString([]byte(username+":"+token))})
		if st != 200 {
			return nil, st, msg
		}
		var wrap struct {
			Values []struct {
				FullName   string `json:"full_name"`
				IsPrivate  bool   `json:"is_private"`
				MainBranch struct {
					Name string `json:"name"`
				} `json:"mainbranch"`
				Links struct {
					Clone []struct {
						Name string `json:"name"`
						Href string `json:"href"`
					} `json:"clone"`
				} `json:"links"`
			} `json:"values"`
		}
		_ = json.Unmarshal(body, &wrap)
		out := make([]remoteRepo, 0, len(wrap.Values))
		for _, x := range wrap.Values {
			href := ""
			for _, c := range x.Links.Clone {
				if c.Name == "https" {
					href = c.Href
				}
			}
			out = append(out, remoteRepo{x.FullName, href, x.MainBranch.Name, x.IsPrivate})
		}
		return out, 200, ""
	}
	return nil, 400, "provider inválido"
}

// codeRemoteRepos: GET /v1/connections/code/repos?provider=X — lista os
// repositórios da conta de código conectada (usa o token guardado no connect).
func (a *API) codeRemoteRepos(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	provider := strings.TrimSpace(r.URL.Query().Get("provider"))
	if _, ok := providerLabels[provider]; !ok {
		writeJSON(w, 400, errBody("bad_request", "provider inválido"))
		return
	}
	org := a.orgFrom(r)
	token, username, err := a.DB.GetCodeAuth(r.Context(), org, provider)
	if err != nil || token == "" {
		writeJSON(w, 409, errBody("no_token", "reconecte esta fonte de código (em Conexões → Código) para listar os repositórios"))
		return
	}
	repos, st, msg := a.listRemoteRepos(r.Context(), provider, token, username)
	if st != 200 {
		writeJSON(w, st, errBody("provider_error", msg))
		return
	}
	writeJSON(w, 200, map[string]any{"repos": repos})
}

// githubDeviceStart inicia o OAuth device-flow do GitHub (igual `gh auth
// login`): pede um device/user code e dispara o polling em background.
func (a *API) githubDeviceStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	org := a.orgFrom(r)
	var startBody struct {
		Purpose string `json:"purpose"` // "code" (default) | "tasks" | "ci"
	}
	_ = json.NewDecoder(r.Body).Decode(&startBody)
	purpose := "code"
	if startBody.Purpose == "tasks" || startBody.Purpose == "ci" || startBody.Purpose == "docs" {
		purpose = startBody.Purpose
	}
	form := url.Values{"client_id": {a.GitHubOAuthClientID}, "scope": {"repo workflow"}}
	req, _ := http.NewRequestWithContext(r.Context(), "POST", "https://github.com/login/device/code", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		writeJSON(w, 502, errBody("unavailable", "falha ao contatar GitHub: "+err.Error()))
		return
	}
	defer resp.Body.Close()
	var dc struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&dc)
	if dc.DeviceCode == "" {
		writeJSON(w, 502, errBody("unavailable", "GitHub não retornou device_code"))
		return
	}
	if dc.Interval < 1 {
		dc.Interval = 5
	}
	if dc.ExpiresIn < 1 {
		dc.ExpiresIn = 900
	}
	a.ghMu.Lock()
	a.ghFlows[org] = &ghFlow{userCode: dc.UserCode, verifyURI: dc.VerificationURI, status: "pending", purpose: purpose}
	a.ghMu.Unlock()
	go a.pollGitHubDevice(org, dc.DeviceCode, dc.Interval, dc.ExpiresIn, purpose)
	writeJSON(w, 200, map[string]any{
		"user_code": dc.UserCode, "verification_uri": dc.VerificationURI,
		"interval": dc.Interval, "expires_in": dc.ExpiresIn,
	})
}

// pollGitHubDevice faz o polling do access_token até autorizar/expirar e, no
// sucesso, valida o token e grava a conexão de código (provider github).
func (a *API) pollGitHubDevice(org, deviceCode string, interval, expiresIn int, purpose string) {
	deadline := time.Now().Add(time.Duration(expiresIn) * time.Second)
	set := func(status, login, errMsg string) {
		a.ghMu.Lock()
		if f := a.ghFlows[org]; f != nil {
			f.status, f.login, f.errMsg = status, login, errMsg
		}
		a.ghMu.Unlock()
	}
	for time.Now().Before(deadline) {
		time.Sleep(time.Duration(interval) * time.Second)
		form := url.Values{
			"client_id":   {a.GitHubOAuthClientID},
			"device_code": {deviceCode},
			"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
		}
		req, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Accept", "application/json")
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			continue
		}
		var tok struct {
			AccessToken string `json:"access_token"`
			Error       string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&tok)
		resp.Body.Close()
		if tok.AccessToken != "" {
			ok, login, _, _ := a.validateGitToken(context.Background(), "github", tok.AccessToken, "")
			if ok {
				switch purpose {
				case "tasks":
					_, _ = a.DB.SetTaskSource(context.Background(), org, "github", login)
				case "ci":
					_, _ = a.DB.SetTypedConnection(context.Background(), org, "ci", "github_actions", login)
				case "docs":
					_, _ = a.DB.SetTypedConnection(context.Background(), org, "docs", "github_wiki", login)
				default:
					_, _ = a.DB.SetCodeProviderToken(context.Background(), org, "github", login, tok.AccessToken, "", "oauth")
				}
				set("authorized", login, "")
			} else {
				set("error", "", "token recebido mas inválido")
			}
			return
		}
		switch tok.Error {
		case "authorization_pending":
			// segue aguardando
		case "slow_down":
			interval += 5
		case "expired_token":
			set("expired", "", "código expirou — tente de novo")
			return
		case "access_denied":
			set("denied", "", "autorização negada")
			return
		}
	}
	set("expired", "", "tempo esgotado — tente de novo")
}

// githubDeviceStatus devolve o estado atual do device-flow da org.
func (a *API) githubDeviceStatus(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	org := a.orgFrom(r)
	a.ghMu.Lock()
	f := a.ghFlows[org]
	a.ghMu.Unlock()
	if f == nil {
		writeJSON(w, 404, errBody("not_found", "nenhum fluxo em andamento"))
		return
	}
	writeJSON(w, 200, map[string]any{
		"status": f.status, "login": f.login, "error": f.errMsg,
		"user_code": f.userCode, "verification_uri": f.verifyURI,
	})
}

// taskSourceLabels: providers de fonte de tarefas suportados.
var taskSourceLabels = map[string]string{
	"github": "GitHub", "gitlab": "GitLab", "bitbucket": "Bitbucket",
	"jira": "Jira", "trello": "Trello", "atlassian_goals": "Atlassian Goals",
}

type taskBody struct {
	Provider string `json:"provider"`
	Token    string `json:"token"`    // PAT / api token / trello token
	Username string `json:"username"` // bitbucket
	Email    string `json:"email"`    // jira
	Site     string `json:"site"`     // jira (ex: empresa.atlassian.net)
	Key      string `json:"key"`      // trello api key
}

// validateTaskSource valida a credencial da fonte de tarefas contra a API do
// provider. github/gitlab/bitbucket reaproveitam validateGitToken.
func (a *API) validateTaskSource(ctx context.Context, in taskBody) (ok bool, who string, msg string) {
	switch in.Provider {
	case "github", "gitlab", "bitbucket":
		o, w2, _, m := a.validateGitToken(ctx, in.Provider, strings.TrimSpace(in.Token), strings.TrimSpace(in.Username))
		return o, w2, m
	case "jira", "atlassian_goals":
		site := strings.TrimSpace(in.Site)
		site = strings.TrimPrefix(strings.TrimPrefix(site, "https://"), "http://")
		site = strings.TrimSuffix(site, "/")
		who1 := "Jira"
		if in.Provider == "atlassian_goals" {
			who1 = "Atlassian Goals"
		}
		if site == "" || strings.TrimSpace(in.Email) == "" || strings.TrimSpace(in.Token) == "" {
			return false, "", who1 + " exige site, e-mail e API token"
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+site+"/rest/api/3/myself", nil)
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(strings.TrimSpace(in.Email)+":"+strings.TrimSpace(in.Token))))
		req.Header.Set("Accept", "application/json")
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return false, "", "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return false, "", "credencial Jira inválida (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
		}
		var u struct {
			DisplayName  string `json:"displayName"`
			EmailAddress string `json:"emailAddress"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&u)
		who = u.DisplayName
		if who == "" {
			who = u.EmailAddress
		}
		return true, who, "conectado como " + who
	case "trello":
		key, token := strings.TrimSpace(in.Key), strings.TrimSpace(in.Token)
		if key == "" || token == "" {
			return false, "", "Trello exige API key + token"
		}
		q := url.Values{"key": {key}, "token": {token}}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.trello.com/1/members/me?"+q.Encode(), nil)
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return false, "", "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return false, "", "credencial Trello inválida (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
		}
		var u struct {
			Username string `json:"username"`
			FullName string `json:"fullName"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&u)
		who = u.FullName
		if who == "" {
			who = u.Username
		}
		return true, who, "conectado como " + who
	}
	return false, "", "provider inválido"
}

// tasksTest valida a credencial da fonte de tarefas sem gravar.
func (a *API) tasksTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	var in taskBody
	_ = json.NewDecoder(r.Body).Decode(&in)
	if _, ok := taskSourceLabels[in.Provider]; !ok {
		writeJSON(w, 400, errBody("bad_request", "provider inválido"))
		return
	}
	ok, who, msg := a.validateTaskSource(r.Context(), in)
	writeJSON(w, 200, map[string]any{"ok": ok, "who": who, "message": msg})
}

// tasksConnect: POST valida + grava a fonte de tarefas; DELETE desconecta.
func (a *API) tasksConnect(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	org := a.orgFrom(r)
	if r.Method == http.MethodDelete {
		prov := strings.TrimSpace(r.URL.Query().Get("provider"))
		if _, ok := taskSourceLabels[prov]; !ok {
			writeJSON(w, 400, errBody("bad_request", "provider inválido"))
			return
		}
		if err := a.DB.DeleteTaskSource(r.Context(), org, prov); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "connection.tasks.delete", "connection", prov)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST/DELETE"))
		return
	}
	var in taskBody
	_ = json.NewDecoder(r.Body).Decode(&in)
	if _, ok := taskSourceLabels[in.Provider]; !ok {
		writeJSON(w, 400, errBody("bad_request", "provider inválido"))
		return
	}
	ok, who, msg := a.validateTaskSource(r.Context(), in)
	if !ok {
		writeJSON(w, 200, map[string]any{"ok": false, "message": msg})
		return
	}
	label := who
	if in.Provider == "bitbucket" && in.Username != "" {
		label = in.Username
	}
	id, err := a.DB.SetTaskSource(r.Context(), org, in.Provider, label)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "connection.tasks.set", "connection", id)
	writeJSON(w, 200, map[string]any{"ok": true, "who": who, "provider": in.Provider})
}

// intProviderType: provider de CI/observabilidade/docs -> tipo de conexão.
var intProviderType = map[string]string{
	"cypress": "ci", "github_actions": "ci", "gitlab_ci": "ci", "bitbucket_pipelines": "ci",
	"sonarcloud": "observability", "sentry": "observability", "playwright": "observability",
	"confluence": "docs", "github_wiki": "docs", "notion": "docs",
}
var intProviderLabel = map[string]string{
	"cypress": "Cypress Cloud", "github_actions": "GitHub Actions", "gitlab_ci": "GitLab CI",
	"bitbucket_pipelines": "Bitbucket Pipelines", "sonarcloud": "SonarCloud", "sentry": "Sentry",
	"playwright": "Playwright", "confluence": "Confluence", "github_wiki": "GitHub Wiki", "notion": "Notion",
}

type intBody struct {
	Provider string `json:"provider"`
	Token    string `json:"token"`
	Username string `json:"username"` // bitbucket pipelines
	Project  string `json:"project"`  // cypress (project id)
	Email    string `json:"email"`    // confluence (Atlassian)
	Site     string `json:"site"`     // confluence (ex: empresa.atlassian.net)
}

// validateIntegration valida a credencial de CI/observabilidade.
func (a *API) validateIntegration(ctx context.Context, in intBody) (ok bool, who string, msg string) {
	tok := strings.TrimSpace(in.Token)
	switch in.Provider {
	case "github_actions":
		o, w2, _, m := a.validateGitToken(ctx, "github", tok, "")
		return o, w2, m
	case "gitlab_ci":
		o, w2, _, m := a.validateGitToken(ctx, "gitlab", tok, "")
		return o, w2, m
	case "bitbucket_pipelines":
		o, w2, _, m := a.validateGitToken(ctx, "bitbucket", tok, strings.TrimSpace(in.Username))
		return o, w2, m
	case "github_wiki":
		o, w2, _, m := a.validateGitToken(ctx, "github", tok, "")
		return o, w2, m
	case "confluence":
		site := strings.TrimSpace(in.Site)
		site = strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(site, "https://"), "http://"), "/")
		if site == "" || strings.TrimSpace(in.Email) == "" || tok == "" {
			return false, "", "Confluence exige site, e-mail e API token"
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://"+site+"/wiki/rest/api/space?limit=1", nil)
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(strings.TrimSpace(in.Email)+":"+tok)))
		req.Header.Set("Accept", "application/json")
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return false, "", "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return false, "", "credencial Confluence inválida (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
		}
		return true, site, "conectado a " + site
	case "notion":
		if tok == "" {
			return false, "", "token vazio"
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.notion.com/v1/users/me", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("Notion-Version", "2022-06-28")
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return false, "", "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return false, "", "token Notion inválido (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
		}
		var u struct {
			Name string `json:"name"`
			Bot  struct {
				Owner struct {
					Workspace bool `json:"workspace"`
				} `json:"owner"`
			} `json:"bot"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&u)
		who = u.Name
		if who == "" {
			who = "Notion"
		}
		return true, who, "conectado (" + who + ")"
	case "cypress":
		// Cypress Cloud não tem endpoint público simples de validação de
		// record key; exigimos record key + project id e registramos.
		if tok == "" || strings.TrimSpace(in.Project) == "" {
			return false, "", "Cypress exige record key + project id"
		}
		return true, "project " + strings.TrimSpace(in.Project), "registrado (record key não é validada online)"
	case "playwright":
		// Playwright (Microsoft Playwright Testing) usa access token + service
		// URL; sem endpoint público simples de validação — registramos.
		if tok == "" {
			return false, "", "Playwright exige access token"
		}
		return true, "Playwright", "registrado (token não é validado online)"
	case "sonarcloud":
		if tok == "" {
			return false, "", "token vazio"
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://sonarcloud.io/api/authentication/validate", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return false, "", "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return false, "", "token SonarCloud inválido (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
		}
		var v struct {
			Valid bool `json:"valid"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&v)
		if !v.Valid {
			return false, "", "token SonarCloud inválido"
		}
		return true, "SonarCloud", "token válido"
	case "sentry":
		if tok == "" {
			return false, "", "token vazio"
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://sentry.io/api/0/organizations/", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			return false, "", "falha de rede: " + err.Error()
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			return false, "", "token Sentry inválido (HTTP " + strconv.Itoa(resp.StatusCode) + ")"
		}
		var orgs []struct {
			Slug string `json:"slug"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&orgs)
		who = "Sentry"
		if len(orgs) > 0 && orgs[0].Slug != "" {
			who = orgs[0].Slug
		}
		return true, who, "conectado (" + who + ")"
	}
	return false, "", "provider inválido"
}

// integrationTest valida a credencial de CI/observabilidade sem gravar.
func (a *API) integrationTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	var in intBody
	_ = json.NewDecoder(r.Body).Decode(&in)
	if _, ok := intProviderType[in.Provider]; !ok {
		writeJSON(w, 400, errBody("bad_request", "provider inválido"))
		return
	}
	ok, who, msg := a.validateIntegration(r.Context(), in)
	writeJSON(w, 200, map[string]any{"ok": ok, "who": who, "message": msg})
}

// integrationConnect: POST valida + grava CI/observabilidade; DELETE desconecta.
func (a *API) integrationConnect(w http.ResponseWriter, r *http.Request) {
	if !a.requireCap(w, r, "manage") {
		return
	}
	org := a.orgFrom(r)
	if r.Method == http.MethodDelete {
		prov := strings.TrimSpace(r.URL.Query().Get("provider"))
		ctype, ok := intProviderType[prov]
		if !ok {
			writeJSON(w, 400, errBody("bad_request", "provider inválido"))
			return
		}
		if err := a.DB.DeleteTypedConnection(r.Context(), org, ctype, prov); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "connection."+ctype+".delete", "connection", prov)
		writeJSON(w, 200, map[string]any{"ok": true})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST/DELETE"))
		return
	}
	var in intBody
	_ = json.NewDecoder(r.Body).Decode(&in)
	ctype, ok := intProviderType[in.Provider]
	if !ok {
		writeJSON(w, 400, errBody("bad_request", "provider inválido"))
		return
	}
	valid, who, msg := a.validateIntegration(r.Context(), in)
	if !valid {
		writeJSON(w, 200, map[string]any{"ok": false, "message": msg})
		return
	}
	label := who
	if label == "" {
		label = intProviderLabel[in.Provider]
	}
	id, err := a.DB.SetTypedConnection(r.Context(), org, ctype, in.Provider, label)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "connection."+ctype+".set", "connection", id)
	writeJSON(w, 200, map[string]any{"ok": true, "who": who, "provider": in.Provider})
}

// família de providers: como cada provedor aparece em cada aba.
var familyProviders = map[string]map[string]string{
	"github":    {"code": "github", "tasks": "github", "ci": "github_actions", "docs": "github_wiki"},
	"gitlab":    {"code": "gitlab", "tasks": "gitlab", "ci": "gitlab_ci"},
	"bitbucket": {"code": "bitbucket", "tasks": "bitbucket", "ci": "bitbucket_pipelines"},
}

// reuseConnection reaproveita uma identidade já conectada (ex: GitHub OAuth)
// p/ ativar a conexão de outra aba (code/tasks/ci/docs) sem refazer o login.
func (a *API) reuseConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	var in struct {
		Family string `json:"family"` // github | gitlab | bitbucket
		Target string `json:"target"` // code | tasks | ci | docs
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	fam, okF := familyProviders[in.Family]
	provider, okT := fam[in.Target]
	if !okF || !okT {
		writeJSON(w, 400, errBody("bad_request", "família ou destino inválido"))
		return
	}
	org := a.orgFrom(r)
	// identidade existente: qualquer provider da família já conectado.
	all := make([]string, 0, len(fam))
	for _, p := range fam {
		all = append(all, p)
	}
	label := a.DB.FindConnectionLabelByProviders(r.Context(), org, all)
	if label == "" {
		writeJSON(w, 200, map[string]any{"ok": false, "message": "nenhuma conexão " + in.Family + " para reaproveitar"})
		return
	}
	var id string
	var err error
	switch in.Target {
	case "code":
		id, err = a.DB.SetCodeProvider(r.Context(), org, provider, label)
	case "tasks":
		id, err = a.DB.SetTaskSource(r.Context(), org, provider, label)
	case "ci":
		id, err = a.DB.SetTypedConnection(r.Context(), org, "ci", provider, label)
	case "docs":
		id, err = a.DB.SetTypedConnection(r.Context(), org, "docs", provider, label)
	}
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "connection.reuse", "connection", id)
	writeJSON(w, 200, map[string]any{"ok": true, "who": label, "provider": provider})
}

// pinnedWorkers: GET lista; POST cria worker dedicado (modo pinned).
func (a *API) pinnedWorkers(w http.ResponseWriter, r *http.Request) {
	org := a.orgFrom(r)
	if r.Method == http.MethodPost {
		if !a.requireCap(w, r, "manage") {
			return
		}
		var body struct {
			Focus       string `json:"focus"`
			RepoID      string `json:"repo_id"`
			Model       string `json:"model"`
			Concurrency int    `json:"concurrency"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, 400, errBody("bad_request", err.Error()))
			return
		}
		if body.Model == "" {
			body.Model = "claude_opus"
		}
		id, err := a.DB.CreatePinnedWorker(r.Context(), org, body.Focus, body.RepoID, body.Model, body.Concurrency)
		if err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.recordAudit(r, "pinned.create", "pinned_worker", id)
		writeJSON(w, 200, map[string]any{"id": id})
		return
	}
	rows, err := a.DB.ListPinnedWorkers(r.Context(), org, a.wspFrom(r))
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) pinnedWorkerByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/v1/pinned-workers/")
	if id == "" || r.Method != http.MethodDelete {
		writeJSON(w, 404, errBody("not_found", "use DELETE /v1/pinned-workers/{id}"))
		return
	}
	if !a.requireCap(w, r, "manage") {
		return
	}
	if err := a.DB.DeletePinnedWorker(r.Context(), a.orgFrom(r), id); err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	a.recordAudit(r, "pinned.delete", "pinned_worker", id)
	writeJSON(w, 200, map[string]any{"id": id, "deleted": true})
}

func (a *API) qa(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListQA(r.Context(), a.orgFrom(r), a.wspFrom(r))
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
	if err := a.DB.RevokeDevice(r.Context(), a.orgFrom(r), id); err != nil {
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
			workers, _ := a.DB.ListWorkers(r.Context(), org, "")
			tasks, _ := a.DB.ListTasks(r.Context(), org, "")
			b, _ := json.Marshal(map[string]any{"workers": workers, "tasks": tasks})
			_, _ = w.Write([]byte("data: " + string(b) + "\n\n"))
			fl.Flush()
		}
	}
}

// ── Superadmin ──

func (a *API) adminStats(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	row, err := a.DB.AdminStats(r.Context())
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, row)
}

func (a *API) adminOrgs(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	rows, err := a.DB.AdminListOrgs(r.Context())
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func (a *API) adminUsers(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	rows, err := a.DB.AdminListUsers(r.Context())
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// adminOrgAction: GET  /v1/admin/orgs/{id}            → detalhe (org + membros + tarefas)
//                 POST /v1/admin/orgs/{id}/plan       {plan: "free|pro|team|enterprise"}
//                 POST /v1/admin/orgs/{id}/suspend
//                 POST /v1/admin/orgs/{id}/unsuspend
func (a *API) adminOrgAction(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/v1/admin/orgs/")
	parts := strings.SplitN(rest, "/", 2)
	if parts[0] == "" {
		writeJSON(w, 404, errBody("not_found", "informe /v1/admin/orgs/{id}"))
		return
	}
	// GET /{id} → detalhe da org
	if r.Method == http.MethodGet && len(parts) == 1 {
		a.adminOrgDetail(w, r, parts[0])
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	if len(parts) < 2 || parts[1] == "" {
		writeJSON(w, 404, errBody("not_found", "use POST /v1/admin/orgs/{id}/{plan|suspend|unsuspend}"))
		return
	}
	orgID, action := parts[0], parts[1]
	uid, _, _ := a.authz(r)
	switch action {
	case "plan":
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
		if err := a.DB.AdminSetOrgPlan(r.Context(), orgID, in.Plan); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.DB.WriteAudit(r.Context(), orgID, "user", uid, "admin.set_plan", "org", in.Plan)
		writeJSON(w, 200, map[string]any{"org_id": orgID, "plan": in.Plan})
	case "suspend":
		if err := a.DB.AdminSuspendOrg(r.Context(), orgID, true); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.DB.WriteAudit(r.Context(), orgID, "user", uid, "admin.suspend", "org", orgID)
		writeJSON(w, 200, map[string]any{"org_id": orgID, "suspended": true})
	case "unsuspend":
		if err := a.DB.AdminSuspendOrg(r.Context(), orgID, false); err != nil {
			writeJSON(w, 500, errBody("internal", err.Error()))
			return
		}
		a.DB.WriteAudit(r.Context(), orgID, "user", uid, "admin.unsuspend", "org", orgID)
		writeJSON(w, 200, map[string]any{"org_id": orgID, "suspended": false})
	default:
		writeJSON(w, 404, errBody("not_found", "ação inválida: plan|suspend|unsuspend"))
	}
}

// adminOrgDetail: org + membros + tarefas recentes.
func (a *API) adminOrgDetail(w http.ResponseWriter, r *http.Request, orgID string) {
	info, err := a.DB.AdminOrgInfo(r.Context(), orgID)
	if err != nil {
		writeJSON(w, 404, errBody("not_found", "org não encontrada"))
		return
	}
	members, _ := a.DB.AdminOrgMembers(r.Context(), orgID)
	tasks, _ := a.DB.AdminOrgTasks(r.Context(), orgID, 20)
	writeJSON(w, 200, map[string]any{"org": info, "members": members, "tasks": tasks})
}

// adminUserAction: POST /v1/admin/users/{id}/suspend | /v1/admin/users/{id}/activate
func (a *API) adminUserAction(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, 405, errBody("method", "use POST"))
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/v1/admin/users/")
	parts := strings.SplitN(rest, "/", 2)
	if len(parts) < 2 || parts[0] == "" {
		writeJSON(w, 404, errBody("not_found", "use POST /v1/admin/users/{id}/{suspend|activate}"))
		return
	}
	userID, action := parts[0], parts[1]
	var status string
	switch action {
	case "suspend":
		status = "suspended"
	case "activate":
		status = "active"
	default:
		writeJSON(w, 404, errBody("not_found", "ação inválida: suspend|activate"))
		return
	}
	uid, _, _ := a.authz(r)
	if userID == uid {
		writeJSON(w, 400, errBody("bad_request", "não é possível alterar o próprio status"))
		return
	}
	if err := a.DB.AdminSetUserStatus(r.Context(), userID, status); err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	if auditOrg := a.DB.AdminUserOrg(r.Context(), userID); auditOrg != "" {
		a.DB.WriteAudit(r.Context(), auditOrg, "user", uid, "admin.user_"+action, "user", userID)
	}
	writeJSON(w, 200, map[string]any{"user_id": userID, "status": status})
}

// adminAudit: trilha global. ?scope=admin filtra ações admin.*; ?limit=N.
func (a *API) adminAudit(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	prefix := ""
	if r.URL.Query().Get("scope") == "admin" {
		prefix = "admin."
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	rows, err := a.DB.AdminListAudit(r.Context(), prefix, limit)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

// adminPlans: catálogo de planos + nº de orgs/assentos por plano.
func (a *API) adminPlans(w http.ResponseWriter, r *http.Request) {
	if !a.requireSuperAdmin(w, r) {
		return
	}
	rows, err := a.DB.AdminPlanCatalog(r.Context())
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}
	writeJSON(w, 200, map[string]any{"data": rows})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
func errBody(code, msg string) map[string]any {
	return map[string]any{"error": map[string]string{"code": code, "message": msg}}
}

// writeJSONRaw repassa um corpo JSON já serializado (ex.: resposta de proxy).
func writeJSONRaw(w http.ResponseWriter, code int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_, _ = w.Write(body)
}

// errJSON é o errBody serializado em bytes (p/ caminhos que devolvem corpo bruto).
func errJSON(code, msg string) []byte {
	b, _ := json.Marshal(errBody(code, msg))
	return b
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
