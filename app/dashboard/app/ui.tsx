"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ── tema / estilos compartilhados ──
export const COLORS: Record<string, string> = {
  merged: "#3FB950",
  in_review: "#A371F7",
  running: "#5BA9FF",
  planning: "#5BA9FF",
  open: "#3FB950",
  idle: "#9BA1A9",
  queued: "#E3B341",
  assigned: "#E3B341",
  failed: "#F85149",
  blocked: "#F85149",
};

export const badge = (s: string) => ({
  background: (COLORS[s] || "#9BA1A9") + "22",
  color: COLORS[s] || "#9BA1A9",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 12,
  whiteSpace: "nowrap" as const,
});

export const cell = {
  padding: "8px 12px",
  borderBottom: "1px solid rgba(255,255,255,.07)",
  textAlign: "left" as const,
};
export const card = { background: "#15171C", borderRadius: 10, overflow: "hidden", marginBottom: 24 };
export const tableStyle = { width: "100%", borderCollapse: "collapse" as const, color: "#E8EAED", fontSize: 14 };

export const input = {
  background: "#0E1014",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 6,
  color: "#E8EAED",
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box" as const,
};
export const btn = {
  background: "#F5A623",
  color: "#0A0B0D",
  border: 0,
  borderRadius: 6,
  padding: "8px 16px",
  fontWeight: 600,
  cursor: "pointer",
};

export function short(id: string, n = 16) {
  return id.length > n ? id.slice(0, n) + "…" : id;
}

// ── navegação ──
const TABS = [
  ["/", "Live"],
  ["/queue", "Fila"],
  ["/tasks", "Tarefas"],
  ["/routines", "Rotinas"],
  ["/config", "Configuração"],
  ["/prs", "PRs"],
  ["/ci", "CI"],
  ["/qa", "QA"],
  ["/interventions", "Intervenção"],
  ["/telemetry", "Telemetria"],
  ["/knowledge", "Conhecimento"],
  ["/usage", "Uso"],
  ["/invoices", "Faturas"],
  ["/org", "Organização"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 28, flexWrap: "wrap" }}>
      <h1 style={{ color: "#F5A623", margin: "0 12px 0 0", fontSize: 22 }}>apiforDEV</h1>
      {TABS.map(([href, label]) => {
        const active = path === href;
        return (
          <a
            key={href}
            href={href}
            style={{
              color: active ? "#0A0B0D" : "#9BA1A9",
              background: active ? "#F5A623" : "transparent",
              padding: "6px 12px",
              borderRadius: 6,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: active ? 600 : 400,
            }}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

// ── auth token (M5.1) ──
const TOKEN_KEY = "apifor_token";
export const getToken = () => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
export const setToken = (t: string | null) => {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};
function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}

// ── data fetching ──
const API = (p: string) => "/api" + p;

export async function apiGet<T = any>(p: string): Promise<T> {
  const r = await fetch(API(p), { headers: authHeaders() });
  return r.json();
}
export async function apiPost<T = any>(p: string, body: unknown): Promise<T> {
  const r = await fetch(API(p), {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return r.json();
}
export async function apiDelete<T = any>(p: string): Promise<T> {
  const r = await fetch(API(p), { method: "DELETE", headers: authHeaders() });
  return r.json();
}

/** Faz GET em `path` e repete a cada `ms`. Retorna { data, reload }. */
export function usePoll<T = any>(path: string, ms = 2000) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    apiGet<{ data: T }>(path).then((r) => setData((r as any).data ?? null)).catch(() => {});
  }, [path]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [reload, ms]);
  return { data, reload };
}

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 920, margin: "5vh auto", padding: 24 }}>
      <Nav />
      {children}
    </main>
  );
}
