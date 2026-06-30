"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, getToken, setToken, useTheme } from "../ui";

// ───────────────────────── helpers compartilhados ─────────────────────────
export type Me = { user_id: string; org_id: string; role: string };

export function getEmail(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem("apifor_email") || ""; } catch { return ""; }
}

export function fmtMoney(cents?: number | null, currency = "usd"): string {
  if (cents == null) return "—";
  const sym = currency === "usd" ? "$" : currency.toUpperCase() + " ";
  return sym + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export const PLAN_COLOR: Record<string, [string, string]> = {
  free:       ["var(--mute)",   "var(--elev)"],
  pro:        ["var(--blue)",   "var(--blue-tint)"],
  team:       ["var(--accent)", "var(--accent-tint)"],
  enterprise: ["var(--green)",  "var(--green-tint)"],
};

export function PlanPill({ plan }: { plan: string }) {
  const [c, bg] = PLAN_COLOR[plan] || ["var(--mute)", "var(--elev)"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: c, background: bg, textTransform: "uppercase", letterSpacing: ".04em" }}>
      {plan}
    </span>
  );
}

export function StatusPill({ ok, on, off }: { ok: boolean; on: string; off: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, width: "fit-content",
      color: ok ? "var(--green)" : "var(--red)", background: ok ? "var(--green-tint)" : "var(--red-tint)", borderRadius: 6, padding: "2px 8px" }}>
      <span style={{ width: 6, height: 6, borderRadius: 6, background: "currentColor" }} />
      {ok ? on : off}
    </span>
  );
}

export function StatCard({ label, value, color = "var(--ink)", sub }: { label: string; value: React.ReactNode; color?: string; sub?: string }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 140, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--mute)" }}>{label}</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--dim)" }}>{sub}</div>}
    </div>
  );
}

export const adminCard = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow)" } as const;

export function PageHeadAdmin({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ color: "var(--red)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 }}>Plataforma</div>
        <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
        {subtitle && <div style={{ color: "var(--dim)", fontSize: 14, marginTop: 6 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

// ───────────────────────── navegação da plataforma ─────────────────────────
type AdminItem = { href: string; label: string; icon: string[] };
const ADMIN_NAV: AdminItem[] = [
  { href: "/superadmin",         label: "Visão geral",   icon: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"] },
  { href: "/superadmin/orgs",    label: "Organizações",  icon: ["M3 21h18", "M5 21V7l8-4v18", "M19 21V11l-6-3"] },
  { href: "/superadmin/users",   label: "Usuários",      icon: ["M17 21v-2a4 4 0 0 0-3-3.87", "M9 21v-2a4 4 0 0 1 3-3.87", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"] },
  { href: "/superadmin/billing", label: "Assinaturas",   icon: ["M1 4h22v16H1z", "M1 10h22"] },
  { href: "/superadmin/audit",   label: "Auditoria",     icon: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M9 12l2 2 4-4"] },
];

function AdminIco({ paths, color }: { paths: string[]; color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

function AdminSidebar({ email }: { email: string }) {
  const path = usePathname();
  return (
    <aside style={{ width: 232, flexShrink: 0, background: "var(--sidebar)", borderRight: "1px solid var(--border)", height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ padding: "18px 18px 14px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 21, letterSpacing: "-.03em" }}>apifor<span style={{ color: "var(--accent)" }}>.</span></span>
          <span style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 11, color: "var(--accent)", letterSpacing: ".14em" }}>DEV</span>
        </div>
        <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 7, background: "var(--red-tint)", color: "var(--red)", fontSize: 11, fontWeight: 700, letterSpacing: ".05em" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          PLATFORM CONSOLE
        </div>
      </div>

      <nav style={{ padding: "4px 8px", flex: 1 }}>
        <div style={{ color: "var(--mute)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px" }}>Gestão</div>
        {ADMIN_NAV.map((it) => {
          const active = path === it.href;
          return (
            <a key={it.href} href={it.href} className={active ? "" : "apf-navitem"}
              style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, fontSize: 13.5, fontWeight: active ? 600 : 500, ...(active ? { color: "var(--ink)", background: "var(--elev)" } : {}) }}>
              {active && <span style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: "var(--red)" }} />}
              <AdminIco paths={it.icon} color={active ? "var(--red)" : "var(--mute)"} />
              {it.label}
            </a>
          );
        })}
        <div style={{ marginTop: 18 }}>
          <div style={{ color: "var(--mute)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px" }}>Atalhos</div>
          <a href="/" className="apf-navitem" style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: "var(--dim)" }}>
            <AdminIco paths={["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"]} color="var(--mute)" />
            Ir ao orquestrador
          </a>
        </div>
      </nav>

      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--mute)", marginBottom: 2 }}>Superadmin</div>
        <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 600, wordBreak: "break-all" }}>{email || "—"}</div>
      </div>
    </aside>
  );
}

function AdminTopbar({ email }: { email: string }) {
  const [theme, toggle] = useTheme();
  const ic = { width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)", color: "var(--dim)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15 } as const;
  function signOut() { setToken(null); try { localStorage.removeItem("apifor_email"); } catch {} window.location.replace("/login"); }
  return (
    <header style={{ height: 56, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", position: "sticky", top: 0, background: "color-mix(in srgb, var(--bg) 86%, transparent)", backdropFilter: "blur(8px)", zIndex: 5 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "var(--red)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        Console da plataforma
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12.5, color: "var(--mute)" }}>{email}</span>
      <button className="apf-iconbtn" style={ic} onClick={toggle} title="Alternar tema">{theme === "dark" ? "☀️" : "🌙"}</button>
      <button onClick={signOut} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)", color: "var(--dim)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sair</button>
    </header>
  );
}

// ───────────────────────── shell (guard + layout) ─────────────────────────
export function AdminShell({ children, loading }: { children: React.ReactNode; loading?: boolean }) {
  const [state, setState] = useState<"checking" | "ok">("checking");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (!getToken()) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
      return;
    }
    setEmail(getEmail());
    apiGet<Me>("/v1/me")
      .then((r) => {
        if (r?.role === "superadmin") setState("ok");
        else window.location.replace("/"); // usuário comum não acessa o console
      })
      .catch(() => window.location.replace("/"));
  }, []);

  if (state !== "ok") return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar email={email} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AdminTopbar email={email} />
        {loading && <div className="apf-progress-bar" key={String(loading)} />}
        <main className="apf-rise" style={{ padding: "26px 32px", maxWidth: 1200, width: "100%" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
