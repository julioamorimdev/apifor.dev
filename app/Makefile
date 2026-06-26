SHELL := /bin/bash
.PHONY: dev up down db migrate cerebro executor dashboard logs ps clean smoke

dev: ; docker compose up --build

up: ; docker compose up -d --build

down: ; docker compose down

db: ; docker compose up -d postgres

migrate: ; docker compose up migrate

cerebro: ; docker compose up -d --build cerebro

executor: ; docker compose up -d --build executor

dashboard: ; pnpm -C dashboard install && pnpm -C dashboard dev

logs: ; docker compose logs -f

ps: ; docker compose ps

clean: ; docker compose down -v

# sobe a stack e checa o health do cérebro
smoke: ; docker compose up -d --build && sleep 5 && curl -sf http://localhost:8088/healthz && echo " <- cerebro OK"
