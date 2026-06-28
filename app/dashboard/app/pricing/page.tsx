"use client";
import { apiPost, btn, card, Page } from "../ui";

type Plan = { key: string; name: string; price: string; highlight?: boolean; feats: string[] };
const PLANS: Plan[] = [
  { key: "free", name: "Free", price: "R$0", feats: ["1 worker", "lease 4h", "36h/semana", "1 repositório", "comunidade"] },
  { key: "pro", name: "Pro", price: "R$99/mês", highlight: true, feats: ["até 4 workers", "lease 24h", "200h/semana", "repos ilimitados", "rate 300/min", "suporte e-mail"] },
  { key: "team", name: "Team", price: "R$399/mês", feats: ["até 16 workers", "lease 72h", "1000h/semana", "RBAC + auditoria", "rate 1000/min", "SSO (em breve)"] },
  { key: "enterprise", name: "Enterprise", price: "sob consulta", feats: ["workers ilimitados", "sem cap de horas", "cloud workers", "SSO/SAML", "RLS dedicada", "SLA + suporte"] },
];

export default function Pricing() {
  async function assinar(plan: string) {
    if (plan === "free") return;
    if (plan === "enterprise") { window.location.href = "mailto:vendas@apifor.dev?subject=Enterprise"; return; }
    const r = await apiPost<{ url?: string }>("/v1/billing/checkout", { plan });
    if (r?.url) window.location.href = r.url;
    else alert("Checkout indisponível (configure o Stripe no cérebro).");
  }
  return (
    <Page>
      <h3 style={{ color: "#9BA1A9" }}>Planos <span style={{ color: "#697079", fontSize: 13 }}>(freemium — comece no Free, suba quando precisar)</span></h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        {PLANS.map((p) => (
          <div key={p.key} style={{ ...card, padding: 18, border: p.highlight ? "1px solid #F5A623" : "1px solid #1E2228" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <h2 style={{ margin: 0, color: p.highlight ? "#F5A623" : "#E8EAED" }}>{p.name}</h2>
              {p.highlight && <span style={{ fontSize: 11, color: "#0A0B0D", background: "#F5A623", borderRadius: 6, padding: "1px 6px" }}>popular</span>}
            </div>
            <div style={{ color: "#E8EAED", fontSize: 22, margin: "8px 0 14px" }}>{p.price}</div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#9BA1A9", fontSize: 13, lineHeight: 1.9 }}>
              {p.feats.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button style={{ ...btn, width: "100%", marginTop: 16, ...(p.highlight ? { background: "#F5A623", color: "#0A0B0D" } : {}) }}
              onClick={() => assinar(p.key)} disabled={p.key === "free"}>
              {p.key === "free" ? "plano atual" : p.key === "enterprise" ? "falar com vendas" : "assinar " + p.name}
            </button>
          </div>
        ))}
      </div>
      <p style={{ color: "#697079", fontSize: 13, marginTop: 16 }}>
        A cobrança é por assinatura (Stripe). O uso de IA roda <b>local com a sua chave</b> —
        a chave nunca vai ao cérebro. Cancele quando quiser; ao vencer, cai pro Free após a graça.
      </p>
    </Page>
  );
}
