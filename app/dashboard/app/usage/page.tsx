"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, badge, btn, card, cell, Page, short, tableStyle, usePoll } from "../ui";

type Usage = {
  plan: string;
  max_workers: number | null;
  active_workers: number;
  week_seconds_used: number;
  week_cap_seconds: number;
  lease_ttl_seconds: number;
};
type Device = { id: string; label: string; last_seen: string; status: string };
type Sub = { plan: string; status: string; grace_until?: string };

const fmtSec = (s: number) => (s >= 3600 ? (s / 3600).toFixed(1) + "h" : s + "s");
const PLANS = ["free", "pro", "team", "enterprise"];

export default function UsoTela() {
  const [u, setU] = useState<Usage | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [checkout, setCheckout] = useState<string>("");
  const { data: devices, reload: reloadDev } = usePoll<Device[]>("/v1/devices", 2500);

  const loadUsage = useCallback(() => {
    apiGet<Usage>("/v1/usage").then(setU).catch(() => {});
    apiGet<Sub>("/v1/subscription").then(setSub).catch(() => {});
  }, []);
  useEffect(() => { loadUsage(); const t = setInterval(loadUsage, 2000); return () => clearInterval(t); }, [loadUsage]);

  async function setPlan(plan: string) { await apiPost("/v1/billing/plan", { plan }); loadUsage(); }
  async function revoke(id: string) { await apiPost(`/v1/devices/${id}/revoke`, {}); reloadDev(); loadUsage(); }
  async function stripeCheckout(plan: string) {
    const r = await apiPost<{ url: string; configured: boolean; note?: string }>("/v1/billing/checkout", { plan });
    if (r.configured && r.url.startsWith("http")) window.open(r.url, "_blank");
    else setCheckout(`${r.url}${r.note ? " — " + r.note : ""}`);
  }

  return (
    <Page>
      <h3 style={{ color: "var(--dim)" }}>Assinatura</h3>
      <div style={{ ...card, padding: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--mute)" }}>plano:</span>
        <span style={badge(u?.plan === "free" ? "queued" : "open")}>{u?.plan || "—"}</span>
        {sub && sub.status !== "none" && <span style={badge(sub.status === "active" ? "open" : sub.status === "past_due" ? "queued" : "failed")}>{sub.status}</span>}
        {sub?.grace_until && <span style={{ color: "var(--red)", fontSize: 12 }}>graça até {new Date(sub.grace_until).toLocaleString()}</span>}
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={() => stripeCheckout("pro")}>Assinar Pro (Stripe)</button>
        {PLANS.map((p) => (
          <button key={p} style={{ ...btn, background: u?.plan === p ? "var(--green)" : "#2A2D34", color: u?.plan === p ? "var(--accent-ink)" : "var(--dim)" }} onClick={() => setPlan(p)}>{p}</button>
        ))}
        <span style={{ color: "var(--mute)", fontSize: 12, width: "100%" }}>
          “Assinar Pro” usa Stripe Checkout (real com STRIPE_SECRET_KEY; senão stub). Os botões de plano são troca direta (dev). Tudo server-side.
        </span>
        {checkout && <code style={{ fontSize: 12, color: "var(--dim)", width: "100%" }}>{checkout}</code>}
      </div>

      <h3 style={{ color: "var(--dim)" }}>Uso vs limites</h3>
      <div style={{ ...card, padding: 16, display: "grid", gap: 8, color: "#C9CDD3" }}>
        <Metric label="Workers ativos" value={`${u?.active_workers ?? 0} / ${u?.max_workers ?? "∞"}`} />
        <Metric label="Worker-hours (semana)" value={`${fmtSec(u?.week_seconds_used ?? 0)} / ${u?.week_cap_seconds ? fmtSec(u.week_cap_seconds) : "∞"}`} />
        <Metric label="Lease TTL" value={u?.lease_ttl_seconds ? fmtSec(u.lease_ttl_seconds) : "sem expiração"} />
      </div>

      <h3 style={{ color: "var(--dim)" }}>Dispositivos <span style={{ color: "var(--mute)", fontSize: 13 }}>(kill-switch)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>id</th><th style={cell}>visto por último</th><th style={cell}>status</th><th style={cell}></th></tr></thead>
          <tbody>
            {(devices || []).map((d) => (
              <tr key={d.id}>
                <td style={cell}><code>{short(d.id)}</code></td>
                <td style={cell}>{d.last_seen || "—"}</td>
                <td style={cell}><span style={badge(d.status === "active" ? "open" : "failed")}>{d.status}</span></td>
                <td style={cell}>{d.status === "active" && <a onClick={() => revoke(d.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>revogar</a>}</td>
              </tr>
            ))}
            {!devices?.length && <tr><td style={cell} colSpan={4}>nenhum device</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "var(--dim)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
