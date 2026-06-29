"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, Page, PageHead, useT } from "../ui";

type Usage = {
  plan: string; max_workers: number | null; active_workers: number;
  week_seconds_used: number; week_cap_seconds: number; lease_ttl_seconds: number;
};
type Tel = { tasks_total: number; tokens_used: number };

const fmtH  = (s: number) => s >= 3600 ? (s / 3600).toFixed(1) + "h" : s + "s";
const fmtTok = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(0) + "K" : String(n || 0);

const barColor = (pct: number) => pct > 80 ? "var(--red)" : pct > 60 ? "var(--orange)" : "var(--accent)";

const API_MODELS = [
  { name: "claude-sonnet-4-5",  provider: "Anthropic", tokens: "2,1M", cost: "R$ 2.700", pct: 72 },
  { name: "claude-haiku-4-5",   provider: "Anthropic", tokens: "1,8M", cost: "R$ 1.890", pct: 58 },
  { name: "gpt-4o-mini",        provider: "OpenAI",    tokens: "0,7M", cost: "R$   950", pct: 24 },
];
const SUB_MODELS = [
  { name: "claude-sonnet-4-5", plan: "Max",  pct: 68, limit: "5M/mês",  tokens: "3,4M" },
  { name: "claude-haiku-4-5",  plan: "Max",  pct: 34, limit: "10M/mês", tokens: "3,4M" },
];
const INST_USE = [
  { id: "cld-1a2b3c", region: "sa-east-1", hours: "312h", vcpuh: "1.248",  cost: "R$ 599",   pct: 81 },
  { id: "cld-7g8h9i", region: "us-east-1", hours: "298h", vcpuh: "2.384",  cost: "R$ 1.144", pct: 94 },
  { id: "cld-6p7q8r", region: "eu-west-1", hours: "276h", vcpuh: "4.416",  cost: "R$ 2.120", pct: 71 },
  { id: "cld-0j1k2l", region: "us-east-1", hours: "187h", vcpuh:   "748",  cost: "R$ 359",   pct: 48 },
];

const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", overflow: "hidden",
};
const sThCell: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)",
};

function MiniBar({ pct, h = 7, border = true }: { pct: number; h?: number; border?: boolean }) {
  return (
    <div style={{ height: h, borderRadius: h / 2, background: "var(--bg)", overflow: "hidden", ...(border ? { border: "1px solid var(--border)" } : {}) }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: barColor(pct), borderRadius: h / 2, transition: "width .4s ease" }} />
    </div>
  );
}

export default function Uso() {
  const t = useT();
  const [u,   setU]   = useState<Usage | null>(null);
  const [tel, setTel] = useState<Tel | null>(null);
  const [cycleLabel, setCycleLabel] = useState("");
  const [daysLeft,   setDaysLeft]   = useState<number | null>(null);

  useEffect(() => {
    const now  = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const rem  = last - now.getDate();
    setDaysLeft(rem);
    const mo = now.toLocaleString("pt-BR", { month: "short" }).replace(".", "");
    setCycleLabel(`Ciclo 01–${last} ${mo} ${now.getFullYear()}`);
  }, []);

  const [loading, setLoading] = useState(true);
  const load = useCallback(() => Promise.allSettled([
    apiGet<Usage>("/v1/usage").then((r) => { if (!(r as any)?.error) setU(r); }).catch(() => {}),
    apiGet<Tel>("/v1/telemetry").then((r) => { if (!(r as any)?.error) setTel(r); }).catch(() => {}),
  ]), []);
  useEffect(() => {
    load().then(() => setLoading(false));
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  const planName  = u?.plan ? u.plan.charAt(0).toUpperCase() + u.plan.slice(1) : "Free";
  const wPct      = u?.max_workers ? (100 * u.active_workers) / u.max_workers : 0;
  const hPct      = u?.week_cap_seconds ? (100 * u.week_seconds_used) / u.week_cap_seconds : 0;
  const taskLimit = u?.plan === "free" ? 50 : null;
  const tPct      = taskLimit ? Math.min(100, (100 * (tel?.tasks_total ?? 0)) / taskLimit) : 0;
  const tokLimit  = u?.plan === "free" ? 500_000 : null;
  const tokPct    = tokLimit ? Math.min(100, (100 * (tel?.tokens_used ?? 0)) / tokLimit) : 0;

  const meters = [
    {
      label: t("Workers simultâneos", "Concurrent workers"),
      used:  String(u?.active_workers ?? 0),
      total: u?.max_workers != null ? String(u.max_workers) : "∞",
      pct:   wPct,
    },
    {
      label: t("Worker-hours / semana", "Worker-hours / week"),
      used:  fmtH(u?.week_seconds_used ?? 0),
      total: u?.week_cap_seconds ? fmtH(u.week_cap_seconds) : "∞",
      pct:   hPct,
    },
    {
      label: t("Tarefas / mês", "Tasks / month"),
      used:  String(tel?.tasks_total ?? 0),
      total: taskLimit ? String(taskLimit) : "∞",
      pct:   tPct,
    },
    {
      label: t("Tokens / mês", "Tokens / month"),
      used:  fmtTok(tel?.tokens_used ?? 0),
      total: tokLimit ? fmtTok(tokLimit) : "∞",
      pct:   tokPct,
    },
  ];

  return (
    <Page loading={loading}>
      <PageHead
        eyebrow={t("Conta & cobrança", "Account & billing")}
        title={t("Uso", "Usage")}
        subtitle={t(`Consumo do ciclo atual frente aos limites do plano ${planName}.`, `Current cycle consumption against the ${planName} plan limits.`)}
        right={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 11px", background: "var(--card)" }}>
              {cycleLabel || "—"}
            </span>
            {daysLeft !== null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                {daysLeft} {daysLeft === 1 ? t("dia restante", "day remaining") : t("dias restantes", "days remaining")}
              </span>
            )}
          </div>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Meter cards ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {meters.map((m) => (
            <div key={m.label} style={{ flex: "1 1 220px", minWidth: 200, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 15, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--mute)" }}>{m.label}</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 21, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>{m.used}</span>
                <span style={{ fontSize: 12, color: "var(--mute)", whiteSpace: "nowrap" }}>/ {m.total}</span>
              </div>
              <MiniBar pct={m.pct} />
              <span style={{ fontSize: 11, color: "var(--dim)" }}>
                {m.total === "∞" ? t("sem limite", "no limit") : `${Math.round(m.pct)}% ${t("do limite", "of limit")}`}
              </span>
            </div>
          ))}
        </div>

        {/* ── Mid row: API consumption + Claude subscription ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* Consumo por API */}
          <div style={{ flex: "1.4 1 420px", minWidth: 300, ...sCard }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 9 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3"/></svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("Consumo por API", "API usage")}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{t("Modelos cobrados por token · valor", "Token-billed models · cost")}</span>
              </div>
            </div>
            <div style={{ padding: "6px 16px 12px" }}>
              {API_MODELS.map((m) => (
                <div key={m.name} style={{ display: "flex", flexDirection: "column", gap: 7, padding: "11px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink)" }}>
                      <span style={{ width: 6, height: 6, background: "var(--accent)", transform: "rotate(45deg)", flexShrink: 0 }} />
                      {m.name}
                      <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{m.provider}</span>
                    </span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)", whiteSpace: "nowrap" }}>
                      {m.tokens} · <span style={{ color: "var(--ink)" }}>{m.cost}</span>
                    </span>
                  </div>
                  <MiniBar pct={m.pct} h={5} border={false} />
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 0 2px" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{t("Total por API", "API total")}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>4,6M · R$ 5.540</span>
              </div>
            </div>
          </div>

          {/* Assinatura Claude */}
          <div style={{ flex: "1 1 320px", minWidth: 280, ...sCard }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 9 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/></svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("Assinatura Claude", "Claude subscription")}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{t("% de uso · tokens (sem cobrança por token)", "% usage · tokens (no per-token charge)")}</span>
              </div>
            </div>
            <div style={{ padding: "6px 16px 14px" }}>
              {SUB_MODELS.map((s) => (
                <div key={s.name} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "13px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{s.name}</span>
                      <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{s.plan}</span>
                    </div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{s.pct}%</span>
                  </div>
                  <MiniBar pct={s.pct} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--dim)" }}>{t(`${s.pct}% do limite de ${s.limit}`, `${s.pct}% of the ${s.limit} limit`)}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{s.tokens} tokens</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Cloud instances ── */}
        <div style={sCard}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("Consumo das instâncias (Cloud)", "Cloud instance usage")}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{t("Horas, vCPU-hora e custo no ciclo", "Hours, vCPU-hours and cycle cost")}</span>
              </div>
            </div>
            <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>R$ 4.222</span>
          </div>
          {/* headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, ...sThCell, padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
            <span>{t("Instância", "Instance")}</span>
            <span style={{ padding: "0 12px", textAlign: "right" }}>{t("Horas", "Hours")}</span>
            <span style={{ padding: "0 12px", textAlign: "right" }}>vCPU-h</span>
            <span style={{ textAlign: "right", width: 120 }}>{t("Custo", "Cost")}</span>
          </div>
          {INST_USE.map((n) => (
            <div key={n.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--accent)", fontWeight: 600 }}>{n.id}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>{n.region}</span>
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)", padding: "0 12px", textAlign: "right" }}>{n.hours}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)", padding: "0 12px", textAlign: "right" }}>{n.vcpuh}</span>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, width: 120 }}>
                <div style={{ width: 42, height: 6, borderRadius: 3, background: "var(--bg)", overflow: "hidden", flexShrink: 0 }}>
                  <div style={{ width: `${n.pct}%`, height: "100%", background: barColor(n.pct), borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", width: 58, textAlign: "right" }}>{n.cost}</span>
              </span>
            </div>
          ))}
        </div>

        {/* ── Info note ── */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.22)", borderRadius: 10, padding: "12px 15px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
          <span style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
            {t("Limites referentes ao plano", "Limits for the")} <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{planName}</strong>{t(".", " plan.")}{" "}
            <a href="/subscription" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer" }}>{t("Faça upgrade", "Upgrade")}</a> {t("para aumentar a capacidade.", "to increase capacity.")}
          </span>
        </div>

      </div>
    </Page>
  );
}
