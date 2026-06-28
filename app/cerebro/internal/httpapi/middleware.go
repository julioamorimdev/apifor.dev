package httpapi

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"apifor.dev/cerebro/internal/db"
)

// ── Métricas (Prometheus-style) ──

type Metrics struct {
	requests    atomic.Int64
	rateLimited atomic.Int64
	status2xx   atomic.Int64
	status4xx   atomic.Int64
	status5xx   atomic.Int64
}

func (m *Metrics) record(code int) {
	switch {
	case code >= 500:
		m.status5xx.Add(1)
	case code >= 400:
		m.status4xx.Add(1)
	default:
		m.status2xx.Add(1)
	}
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(c int) { s.code = c; s.ResponseWriter.WriteHeader(c) }

// ── Rate limit por plano (janela de 1 minuto, por org) ──

type RateLimiter struct {
	db   *db.DB
	mu   sync.Mutex
	win  map[string]*counterWin // org -> contagem na janela atual
	plan map[string]*planCache  // org -> rpm cacheado
}

type counterWin struct {
	minute int64
	count  int64
}
type planCache struct {
	rpm int64
	exp int64
}

func newRateLimiter(d *db.DB) *RateLimiter {
	return &RateLimiter{db: d, win: map[string]*counterWin{}, plan: map[string]*planCache{}}
}

// rpm por plano (0 = ilimitado).
func rpmForPlan(plan string) int64 {
	switch plan {
	case "free":
		return 240 // o dashboard faz polling de vários endpoints; 60 estourava só ocioso
	case "pro":
		return 600
	case "team":
		return 2000
	default: // enterprise
		return 0
	}
}

func (rl *RateLimiter) rpm(ctx context.Context, org string) int64 {
	now := time.Now().Unix()
	rl.mu.Lock()
	pc, ok := rl.plan[org]
	rl.mu.Unlock()
	if ok && pc.exp > now {
		return pc.rpm
	}
	r := rpmForPlan(rl.db.GetOrgPlan(ctx, org))
	rl.mu.Lock()
	rl.plan[org] = &planCache{rpm: r, exp: now + 30} // cache 30s
	rl.mu.Unlock()
	return r
}

// allow incrementa a janela e diz se está dentro do limite do plano.
func (rl *RateLimiter) allow(ctx context.Context, org string) bool {
	limit := rl.rpm(ctx, org)
	if limit <= 0 {
		return true // ilimitado
	}
	m := time.Now().Unix() / 60
	rl.mu.Lock()
	defer rl.mu.Unlock()
	w := rl.win[org]
	if w == nil || w.minute != m {
		w = &counterWin{minute: m}
		rl.win[org] = w
	}
	w.count++
	return w.count <= limit
}

// ── Middleware ──

func rateLimitable(path string) bool {
	if path == "/healthz" || path == "/v1/ca" || path == "/metrics" {
		return false
	}
	return !strings.HasSuffix(path, "/stream") // SSE são conexões longas
}

// publicPath: rotas que dispensam autenticação mesmo com REQUIRE_AUTH.
func publicPath(path string) bool {
	switch path {
	case "/healthz", "/metrics", "/v1/ca", "/v1/auth/login", "/v1/auth/register", "/v1/billing/webhook":
		return true
	}
	return false
}

func (a *API) instrument(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		a.metrics.requests.Add(1)
		// M6.2: exige JWT quando RequireAuth (fecha o fallback dev demo-owner).
		if a.RequireAuth && r.Method != http.MethodOptions && !publicPath(r.URL.Path) {
			if uid, _, _ := a.authz(r); uid == "" {
				a.metrics.record(401)
				writeJSON(w, 401, errBody("unauthorized", "autenticação obrigatória"))
				return
			}
		}
		if r.Method != http.MethodOptions && rateLimitable(r.URL.Path) {
			if !a.rl.allow(r.Context(), a.orgFrom(r)) {
				a.metrics.rateLimited.Add(1)
				a.metrics.record(429)
				w.Header().Set("Retry-After", "60")
				writeJSON(w, 429, errBody("rate_limit", "limite de requisições por minuto do plano excedido"))
				return
			}
		}
		rec := &statusRecorder{ResponseWriter: w, code: 200}
		next.ServeHTTP(rec, r)
		a.metrics.record(rec.code)
	})
}
