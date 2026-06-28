"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// ───────────────────────── tema (dark/light) ─────────────────────────
export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "dark");
  }, []);
  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("apifor_theme", next); } catch {}
      return next;
    });
  }, []);
  return [theme, toggle];
}

// ───────────────────────── tokens de estilo (via CSS vars) ─────────────────────────
const TONE: Record<string, [string, string]> = {
  merged: ["--green", "--green-tint"], open: ["--green", "--green-tint"], in_review: ["--accent", "--accent-tint"],
  running: ["--blue", "--blue-tint"], planning: ["--blue", "--blue-tint"], queued: ["--orange", "--orange-tint"],
  assigned: ["--orange", "--orange-tint"], idle: ["--dim", "--border"], failed: ["--red", "--red-tint"], blocked: ["--red", "--red-tint"],
};
export const badge = (s: string) => {
  const [c, t] = TONE[s] || ["--dim", "--border"];
  return { background: `var(${t})`, color: `var(${c})`, padding: "2px 8px", borderRadius: 6, fontSize: 12, whiteSpace: "nowrap" as const, fontWeight: 500 };
};
export const cell = { padding: "9px 14px", borderBottom: "1px solid var(--border)", textAlign: "left" as const, fontSize: 13.5 };
export const tableStyle = { width: "100%", borderCollapse: "collapse" as const };
export const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18 };
export const input = { background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", fontSize: 14, outline: "none" };
export const btn = { background: "var(--accent)", color: "var(--accent-ink)", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 };
export function short(id: string, n = 16) { return id.length > n ? id.slice(0, n) + "…" : id; }

// ───────────────────────── navegação agrupada (mockups) ─────────────────────────
type Item = [string, string, string?]; // [href, label, countKey?]
const NAV: { title: string; items: Item[] }[] = [
  { title: "Operação", items: [
    ["/", "Live", "workers"], ["/queue", "Fila", "queue"], ["/tasks", "Tarefas"],
    ["/prs", "Pull Requests", "prs"], ["/interventions", "Intervenção", "interv"],
    ["/ci", "CI"], ["/qa", "QA"], ["/rotinas-placeholder", "", undefined],
    ["/routines", "Rotinas"], ["/telemetry", "Telemetria"],
  ].filter((i) => i[1]) as Item[] },
  { title: "Conhecimento & sistema", items: [
    ["/knowledge", "Conhecimento"], ["/config", "Configuração"], ["/audit", "Auditoria"],
  ] },
  { title: "Conta & cobrança", items: [
    ["/org", "Organização"], ["/usage", "Uso"], ["/invoices", "Faturas"], ["/pricing", "Planos"],
  ] },
];

// contagens ao vivo p/ os badges da sidebar
function useCounts() {
  const [c, setC] = useState<Record<string, number>>({});
  useEffect(() => {
    let on = true;
    const load = async () => {
      const n = async (p: string, f?: (d: any[]) => number) => {
        try { const r = await apiGet<{ data: any[] }>(p); const d = r?.data || []; return f ? f(d) : d.length; } catch { return 0; }
      };
      const [workers, queue, prs, interv] = await Promise.all([
        n("/v1/workers"),
        n("/v1/tasks", (d) => d.filter((t) => ["queued", "planning", "assigned"].includes(t.status)).length),
        n("/v1/prs", (d) => d.filter((p) => p.status !== "merged").length),
        n("/v1/interventions"),
      ]);
      if (on) setC({ workers, queue, prs, interv });
    };
    load();
    const t = setInterval(load, 4000);
    return () => { on = false; clearInterval(t); };
  }, []);
  return c;
}

function useUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const es = new EventSource(sseURL("/v1/notifications/stream"));
    es.onmessage = (e) => { try { setN(JSON.parse(e.data).unread || 0); } catch {} };
    return () => es.close();
  }, []);
  return n;
}

const countBadge = (n?: number) =>
  n ? <span style={{ marginLeft: "auto", background: "var(--accent-tint)", color: "var(--accent)", borderRadius: 20, padding: "0 7px", fontSize: 11, fontWeight: 600 }}>{n}</span> : null;

function Sidebar() {
  const path = usePathname();
  const counts = useCounts();
  return (
    <aside style={{ width: 232, flexShrink: 0, background: "var(--sidebar)", borderRight: "1px solid var(--border)", height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ padding: "18px 18px 10px" }}>
        <div style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 20, letterSpacing: "-.02em" }}>
          apifor<span style={{ color: "var(--accent)" }}>DEV</span>
        </div>
      </div>
      <a href="/onboarding" className="apf-link" style={{ margin: "0 12px 8px", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--card)" }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>P</span>
        <span style={{ fontSize: 13 }}><b>Principal</b><br /><span style={{ color: "var(--mute)", fontSize: 11 }}>workspace · Início</span></span>
      </a>
      <nav style={{ padding: "4px 8px", flex: 1 }}>
        {NAV.map((g) => (
          <div key={g.title} style={{ marginBottom: 14 }}>
            <div style={{ color: "var(--mute)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px" }}>{g.title}</div>
            {g.items.map(([href, label, key]) => {
              const active = path === href;
              return (
                <a key={href} href={href} className={active ? "" : "apf-link"}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, fontSize: 13.5,
                    color: active ? "var(--accent-ink)" : "var(--dim)", background: active ? "var(--accent)" : "transparent", fontWeight: active ? 600 : 400 }}>
                  {label}
                  {countBadge((counts as any)[key || ""])}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)", color: "var(--mute)", fontSize: 11 }}>
        <span style={{ color: "var(--green)" }}>●</span> Pool ok · v0.9
      </div>
    </aside>
  );
}

function Topbar() {
  const [theme, toggle] = useTheme();
  const unread = useUnread();
  const ic = { width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)", color: "var(--dim)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15 } as const;
  return (
    <header style={{ height: 56, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", position: "sticky", top: 0, background: "color-mix(in srgb, var(--bg) 86%, transparent)", backdropFilter: "blur(8px)", zIndex: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 420, color: "var(--mute)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 11px", fontSize: 13 }}>
        <span>🔍</span><span style={{ flex: 1 }}>Buscar…</span>
        <kbd style={{ fontFamily: "var(--mono)", fontSize: 11, border: "1px solid var(--border)", borderRadius: 5, padding: "1px 5px" }}>⌘K</kbd>
      </div>
      <span style={{ flex: 1 }} />
      <button className="apf-iconbtn" style={ic} onClick={toggle} title="Alternar tema">{theme === "dark" ? "☀️" : "🌙"}</button>
      <a className="apf-iconbtn" href="/notifications" style={{ ...ic, position: "relative", textDecoration: "none" }} title="Notificações">
        🔔
        {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "var(--red)", color: "#fff", borderRadius: 10, minWidth: 16, height: 16, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontWeight: 700 }}>{unread}</span>}
      </a>
    </header>
  );
}

// ───────────────────────── auth token (M5.1) ─────────────────────────
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

// ───────────────────────── data fetching ─────────────────────────
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";
const API = (p: string) => API_BASE + p;
export const sseURL = (p: string) => API_BASE + p;

export async function apiGet<T = any>(p: string): Promise<T> {
  const r = await fetch(API(p), { headers: authHeaders() });
  return r.json();
}
export async function apiPost<T = any>(p: string, body: unknown): Promise<T> {
  const r = await fetch(API(p), { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
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

// ───────────────────────── app shell ─────────────────────────
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main style={{ padding: "26px 32px", maxWidth: 1180, width: "100%" }}>{children}</main>
      </div>
    </div>
  );
}
