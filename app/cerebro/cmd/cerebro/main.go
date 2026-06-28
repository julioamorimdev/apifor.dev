// cerebro — control plane do apifor.dev (M1: espinha e2e real).
// HTTP (:8080) p/ a GUI + gRPC (:9090) p/ o executor.
package main

import (
	"context"
	"crypto/tls"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/db"
	"apifor.dev/cerebro/internal/grpcsrv"
	"apifor.dev/cerebro/internal/httpapi"
	"apifor.dev/cerebro/internal/pki"
)

func main() {
	ctx := context.Background()
	httpAddr := envOr("CEREBRO_ADDR", ":8080")
	grpcAddr := envOr("CEREBRO_GRPC", ":9090")
	dbURL := envOr("DATABASE_URL", "postgres://postgres:pg@postgres/apifor?sslmode=disable")
	appURL := os.Getenv("APP_DATABASE_URL")       // M6.3: pool com RLS (role não-superuser)
	workerURL := os.Getenv("WORKER_DATABASE_URL") // M6.5: pool primário sem superuser (BYPASSRLS)
	if workerURL != "" {
		dbURL = workerURL
	}
	secret := envOr("JWT_SECRET", "dev-secret-troque-em-prod")

	// M6.2: aviso de segurança se o segredo do JWT for fraco/padrão.
	if len(secret) < 24 || secret == "dev-secret" || secret == "dev-secret-troque-em-prod" {
		log.Printf("AVISO SEGURANÇA: JWT_SECRET fraco/padrão — defina um segredo forte em produção")
	}

	database, err := db.Open(ctx, dbURL, appURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	if database.App != database.Pool {
		log.Printf("RLS: reads/writes do REST via role apifor_app (enforcement por org)")
	}
	if workerURL != "" {
		log.Printf("RLS: runtime sem superuser — pool primário via role apifor_worker (BYPASSRLS)")
	}
	// SEED_DEMO=false (produção): não cria o usuário/org demo. Os catálogos globais
	// (plan_catalog/agent_profile) vêm da migration, então isto é seguro.
	requireAuth := os.Getenv("REQUIRE_AUTH") == "true"
	if os.Getenv("SEED_DEMO") != "false" {
		if err := database.SeedDemo(ctx); err != nil {
			log.Fatalf("seed: %v", err)
		}
		if requireAuth {
			log.Printf("AVISO SEGURANÇA: credenciais demo ativas (SEED_DEMO) com REQUIRE_AUTH — desative SEED_DEMO em produção")
		}
	} else {
		log.Printf("seed demo desativado (SEED_DEMO=false)")
		if !requireAuth {
			log.Printf("AVISO: SEED_DEMO=false sem REQUIRE_AUTH=true — o fallback demo do REST não funcionará")
		}
	}
	log.Printf("db conectado + seed demo (login: %s / %s)", db.DemoEmail, db.DemoPass)

	a := auth.New(secret)
	hub := grpcsrv.NewHub() // ponte REST -> stream do executor (relay)

	// PKI: CA própria + cert de servidor (M3.2a — mTLS real)
	ca, err := pki.EnsureCA(envOr("CEREBRO_PKI_DIR", "/var/lib/cerebro"))
	if err != nil {
		log.Fatalf("pki: %v", err)
	}
	serverCert, err := ca.ServerTLSCert([]string{"cerebro", "localhost"}, []net.IP{net.ParseIP("127.0.0.1")})
	if err != nil {
		log.Fatalf("pki server cert: %v", err)
	}
	tlsCfg := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientAuth:   tls.VerifyClientCertIfGiven, // Enroll sem cert; Stream com cert de device
		ClientCAs:    ca.Pool(),
	}
	log.Printf("PKI pronta: CA carregada, gRPC com mTLS")

	srv := &grpcsrv.Server{
		DB: database, Auth: a, Hub: hub, CA: ca, Cfg: grpcsrv.EnforceConfigFromEnv(),
		MergeRequireHuman: os.Getenv("MERGE_REQUIRE_HUMAN") != "false", // default: exige revisão humana
	}

	// reaper de enforcement (lease TTL, worker-hours, kill-switch) — server-side
	go srv.RunReaper(ctx)
	// scheduler de rotinas (M5.2)
	go srv.RunScheduler(ctx)

	// gRPC (mTLS)
	go func() {
		lis, err := net.Listen("tcp", grpcAddr)
		if err != nil {
			log.Fatalf("grpc listen: %v", err)
		}
		gs := grpc.NewServer(grpc.Creds(credentials.NewTLS(tlsCfg)))
		apiforv1.RegisterOrchestratorServer(gs, srv)
		log.Printf("gRPC (mTLS) ouvindo em %s", grpcAddr)
		if err := gs.Serve(lis); err != nil {
			log.Fatalf("grpc serve: %v", err)
		}
	}()

	// HTTP
	api := &httpapi.API{
		DB: database, Auth: a, Hub: hub, CACertPEM: ca.CertPEM,
		HoursCapOverrideSec: srv.Cfg.HoursCapOverrideSec,
		LeaseTTLOverrideSec: srv.Cfg.LeaseTTLOverrideSec,
		StripeSecretKey:     os.Getenv("STRIPE_SECRET_KEY"),
		StripeWebhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
		StripePrices:        map[string]string{"pro": os.Getenv("STRIPE_PRICE_PRO"), "team": os.Getenv("STRIPE_PRICE_TEAM")},
		DunningGraceSec:     atoiEnv("DUNNING_GRACE_SEC"),
		PublicURL:           envOr("PUBLIC_URL", "http://localhost:3000"),
		RequireAuth:         os.Getenv("REQUIRE_AUTH") == "true", // M6.2: fecha o fallback dev
	}
	log.Printf("HTTP ouvindo em %s", httpAddr)
	if err := http.ListenAndServe(httpAddr, api.Routes()); err != nil {
		log.Fatal(err)
	}
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func atoiEnv(k string) int {
	if v, err := strconv.Atoi(os.Getenv(k)); err == nil {
		return v
	}
	return 0
}
