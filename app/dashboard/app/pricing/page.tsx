"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, badge, btn, card, Page, PageHead, useT } from "../ui";

type Usage = { plan: string; active_workers: number; max_workers: number | null; week_seconds_used: number; week_cap_seconds: number };
type Plan = { key: string; name: string; price: string; highlight?: boolean; feats: string[] };

function Bar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: string }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span style={{ color: "var(--dim)" }}>{label}</span><span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{value}</span></div>
      <div style={{ height: 6, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}><div style={{ width: p + "%", height: "100%", background: `var(--${tone})`, transition: "width .4s" }} /></div>
    </div>
  );
}
const PLANS: Plan[] = [
  { key: "free", name: "Free", price: "R$0", feats: ["1 worker", "lease 4h", "36h/semana", "1 repositório", "comunidade"] },
  { key: "pro", name: "Pro", price: "R$99/mês", highlight: true, feats: ["até 4 workers", "lease 24h", "200h/semana", "repos ilimitados", "rate 300/min", "suporte e-mail"] },
  { key: "team", name: "Team", price: "R$399/mês", feats: ["até 16 workers", "lease 72h", "1000h/semana", "RBAC + auditoria", "rate 1000/min", "SSO (em breve)"] },
  { key: "enterprise", name: "Enterprise", price: "sob consulta", feats: ["workers ilimitados", "sem cap de horas", "cloud workers", "SSO/SAML", "RLS dedicada", "SLA + suporte"] },
];

export default function Pricing() {
  const t = useT();
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    const load = () => apiGet<Usage>("/v1/usage").then((r) => { if (!(r as any)?.error) setU(r); }).catch(() => {});
    load(); const i = setInterval(load, 5000); return () => clearInterval(i);
  }, []);
  const cur = u?.plan;
  const wPct = u?.max_workers ? (100 * u.active_workers) / u.max_workers : 0;
  const hPct = u?.week_cap_seconds ? (100 * u.week_seconds_used) / u.week_cap_seconds : 0;
  const fmtH = (s: number) => (s >= 3600 ? (s / 3600).toFixed(1) + "h" : Math.round(s || 0) + "s");
  async function assinar(plan: string) {
    if (plan === "free") return;
    if (plan === "enterprise") { window.location.href = "mailto:vendas@apifor.dev?subject=Enterprise"; return; }
    const r = await apiPost<{ url?: string }>("/v1/billing/checkout", { plan });
    if (r?.url) window.location.href = r.url;
    else alert("Checkout indisponível (configure o Stripe no cérebro).");
  }
  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Planos" subtitle="Gerencie seu plano e limites do pipeline." />

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 18, marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>{t("Plano atual", "Current plan")}</span>
            <span style={badge(cur && cur !== "free" ? "open" : "idle")}>{cur === "free" ? "free" : t("Ativo", "Active")}</span>
          </div>
          <div style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 30, textTransform: "capitalize" }}>{cur || "—"}</div>
          <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 4 }}>{t("Troque de plano nos cards abaixo (Stripe Checkout).", "Switch plans in the cards below (Stripe Checkout).")}</div>
        </div>
        <div style={{ ...card, padding: 18, marginBottom: 0, display: "grid", gap: 14 }}>
          <span style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}>{t("Neste ciclo", "This cycle")}</span>
          <Bar label={t("Workers simultâneos", "Concurrent workers")} value={`${u?.active_workers ?? 0} / ${u?.max_workers ?? "∞"}`} pct={wPct} tone="green" />
          <Bar label={t("Worker-hours (semana)", "Worker-hours (week)")} value={`${fmtH(u?.week_seconds_used ?? 0)} / ${u?.week_cap_seconds ? fmtH(u.week_cap_seconds) : "∞"}`} pct={hPct} tone="accent" />
        </div>
      </div>

      <div style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", margin: "4px 0 10px" }}>{t("Planos disponíveis", "Available plans")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {PLANS.map((p) => {
          const isCur = p.key === cur;
          return (
          <div key={p.key} style={{ ...card, padding: 18, marginBottom: 0, border: isCur ? "1px solid var(--accent)" : "1px solid var(--border)", boxShadow: isCur ? "0 0 0 1px var(--accent), var(--shadow)" : "var(--shadow)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h2 style={{ margin: 0, color: isCur ? "var(--accent)" : "var(--ink)" }}>{p.name}</h2>
              {isCur ? <span style={{ fontSize: 11, color: "var(--accent-ink)", background: "var(--accent)", borderRadius: 6, padding: "1px 6px", fontWeight: 700 }}>{t("ATUAL", "CURRENT")}</span>
                : p.highlight && <span style={{ fontSize: 11, color: "var(--accent)", background: "var(--accent-tint)", borderRadius: 6, padding: "1px 6px" }}>{t("popular", "popular")}</span>}
            </div>
            <div style={{ color: "var(--ink)", fontSize: 22, margin: "8px 0 14px", fontFamily: "var(--head)", fontWeight: 800 }}>{p.price}</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--dim)", fontSize: 13, lineHeight: 1.9 }}>
              {p.feats.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button style={{ ...btn, width: "100%", marginTop: 16, ...(isCur ? { background: "var(--elev)", color: "var(--dim)" } : p.highlight ? { background: "var(--accent)", color: "var(--accent-ink)" } : {}) }}
              onClick={() => assinar(p.key)} disabled={isCur}>
              {isCur ? t("plano atual", "current plan") : p.key === "enterprise" ? t("falar com vendas", "contact sales") : t("assinar", "subscribe") + " " + p.name}
            </button>
          </div>
          );
        })}
      </div>
      <p style={{ color: "var(--mute)", fontSize: 13, marginTop: 16 }}>
        A cobrança é por assinatura (Stripe). O uso de IA roda <b>local com a sua chave</b> —
        a chave nunca vai ao cérebro. Cancele quando quiser; ao vencer, cai pro Free após a graça.
      </p>
    </Page>
  );
}
