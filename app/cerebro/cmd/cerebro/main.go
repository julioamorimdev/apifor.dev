// cerebro — control plane do apifor.dev (M1: espinha e2e real).
// HTTP (:8080) p/ a GUI + gRPC (:9090) p/ o executor.
package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"

	"google.golang.org/grpc"

	"apifor.dev/cerebro/gen/apiforv1"
	"apifor.dev/cerebro/internal/auth"
	"apifor.dev/cerebro/internal/db"
	"apifor.dev/cerebro/internal/grpcsrv"
	"apifor.dev/cerebro/internal/httpapi"
)

func main() {
	ctx := context.Background()
	httpAddr := envOr("CEREBRO_ADDR", ":8080")
	grpcAddr := envOr("CEREBRO_GRPC", ":9090")
	dbURL := envOr("DATABASE_URL", "postgres://postgres:pg@postgres/apifor?sslmode=disable")
	secret := envOr("JWT_SECRET", "dev-secret-troque-em-prod")

	database, err := db.Open(ctx, dbURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	if err := database.SeedDemo(ctx); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Printf("db conectado + seed demo (login: %s / %s)", db.DemoEmail, db.DemoPass)

	a := auth.New(secret)
	hub := grpcsrv.NewHub() // ponte REST -> stream do executor (relay)

	// gRPC
	go func() {
		lis, err := net.Listen("tcp", grpcAddr)
		if err != nil {
			log.Fatalf("grpc listen: %v", err)
		}
		gs := grpc.NewServer()
		apiforv1.RegisterOrchestratorServer(gs, &grpcsrv.Server{DB: database, Auth: a, Hub: hub})
		log.Printf("gRPC ouvindo em %s", grpcAddr)
		if err := gs.Serve(lis); err != nil {
			log.Fatalf("grpc serve: %v", err)
		}
	}()

	// HTTP
	api := &httpapi.API{DB: database, Auth: a, Hub: hub}
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
