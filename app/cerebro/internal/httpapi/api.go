// Package httpapi — REST/JSON + SSE p/ a GUI (M1 mínimo).
package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/db"
)

type API struct {
	DB   *db.DB
	Auth *auth.Auth
}

func (a *API) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", a.health)
	mux.HandleFunc("/v1/auth/login", a.login)
	mux.HandleFunc("/v1/workers", a.workers)
	mux.HandleFunc("/v1/tasks", a.tasks)
	mux.HandleFunc("/v1/workers/stream", a.stream)
	return cors(mux)
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"service": "cerebro", "status": "ok", "milestone": "M1"})
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

func (a *API) tasks(w http.ResponseWriter, r *http.Request) {
	rows, err := a.DB.ListTasks(r.Context(), a.orgFrom(r))
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
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		h.ServeHTTP(w, r)
	})
}
