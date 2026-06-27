// Package httpapi — REST/JSON + SSE p/ a GUI.
// M1: login, workers, tasks, SSE. M2.1: criar tarefa real (dispara relay), secret_ref.
package httpapi

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/db"
)

// Pusher empurra um comando ao executor conectado (implementado por grpcsrv.Hub).
type Pusher interface {
	Send(org string, env *apiforv1.Envelope) bool
}

type API struct {
	DB   *db.DB
	Auth *auth.Auth
	Hub  Pusher
}

func (a *API) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.health)
	mux.HandleFunc("/v1/auth/login", a.login)
	mux.HandleFunc("/v1/workers", a.workers)
	mux.HandleFunc("/v1/tasks", a.tasks)          // GET lista, POST cria (dispara relay)
	mux.HandleFunc("/v1/tasks/", a.taskSteps)     // GET /v1/tasks/{id}/steps
	mux.HandleFunc("/v1/secrets", a.secrets)      // GET lista, POST registra metadado
	mux.HandleFunc("/v1/workers/stream", a.stream) // SSE
	return cors(mux)
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"service": "cerebro", "status": "ok", "milestone": "M2.1"})
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
	tok, err := a.Auth.Issue(u.ID, u.OrgID, 15*time.Minute)
	if err != nil {
		writeJSON(w, 500, errBody("internal", "falha ao emitir token"))
		return
	}
	writeJSON(w, 200, map[string]string{"access_token": tok, "org_id": u.OrgID})
}

func (a *API) orgFrom(r *http.Request) string {
	t := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if c, err := a.Auth.Parse(t); err == nil {
		return c.OrgID
	}
	return db.DemoOrgID // M1: cai no demo se não autenticado
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
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Title == "" {
		writeJSON(w, 400, errBody("bad_request", "title e prompt obrigatórios"))
		return
	}
	org := a.orgFrom(r)
	taskID, err := a.DB.CreateRealTask(r.Context(), org, db.DemoWspID, in.Title, in.Prompt)
	if err != nil {
		writeJSON(w, 500, errBody("internal", err.Error()))
		return
	}

	// Dispara o relay: manda só a ESTRUTURA (template + refs), nunca código.
	env := &apiforv1.Envelope{
		Type: apiforv1.MsgType_REQUEST_PLAN,
		Payload: &apiforv1.Envelope_RequestPlan{RequestPlan: &apiforv1.RequestPlan{
			TaskId:         taskID,
			PromptTemplate: in.Prompt,
			ContextRefs:    in.Refs,
		}},
	}
	dispatched := a.Hub.Send(org, env)
	if dispatched {
		_ = a.DB.SetTaskStatus(r.Context(), taskID, "planning")
		log.Printf("relay disparado: task=%s refs=%v", taskID, in.Refs)
	} else {
		log.Printf("task %s criada mas nenhum executor conectado", taskID)
	}
	writeJSON(w, 201, map[string]any{"id": taskID, "dispatched": dispatched})
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
