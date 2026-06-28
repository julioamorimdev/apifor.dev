"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, badge, btn, card, CardHead, cell, MeterCard, Page, PageHead, short, tableStyle, usePoll } from "../ui";

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
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };

export default function UsoTela() {
  const [u, setU] = useState<Usage | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [checkout, setCheckout] = useState<string>("");
  const { data: devices, reload: reloadDev } = usePoll<Device[]>("/v1/devices", 2500);

  const loadUsage = useCallback(() => {
    apiGet<Usage>("/v1/usage").then((r) => { if (!(r as any)?.error) setU(r); }).catch(() => {});
    apiGet<Sub>("/v1/subscription").then((r) => { if (!(r as any)?.error) setSub(r); }).catch(() => {});
  }, []);
  useEffect(() => { loadUsage(); const t = setInterval(loadUsage, 4000); return () => clearInterval(t); }, [loadUsage]);

  async function setPlan(plan: string) { await apiPost("/v1/billing/plan", { plan }); loadUsage(); }
  async function revoke(id: string) { await apiPost(`/v1/devices/${id}/revoke`, {}); reloadDev(); loadUsage(); }
  async function stripeCheckout(plan: string) {
    const r = await apiPost<{ url: string; configured: boolean; note?: string }>("/v1/billing/checkout", { plan });
    if (r.configured && r.url.startsWith("http")) window.open(r.url, "_blank");
    else setCheckout(`${r.url}${r.note ? " — " + r.note : ""}`);
  }

  const wPct = u?.max_workers ? (100 * u.active_workers) / u.max_workers : 0;
  const hPct = u?.week_cap_seconds ? (100 * u.week_seconds_used) / u.week_cap_seconds : 0;

  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Uso" subtitle="Consumo do ciclo atual frente aos limites do plano." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 16 }}>
        <MeterCard label="Workers simultâneos" value={u?.active_workers ?? 0} limit={u?.max_workers ?? "∞"} pct={wPct} tone="green" />
        <MeterCard label="Worker-hours (semana)" value={fmtSec(u?.week_seconds_used ?? 0)} limit={u?.week_cap_seconds ? fmtSec(u.week_cap_seconds) : "∞"} pct={hPct} tone="accent" />
        <div style={{ ...card, padding: 16, marginBottom: 0 }}>
          <div style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Plano</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={badge(u?.plan === "free" ? "queued" : "open")}>{u?.plan || "—"}</span>
            {sub && sub.status !== "none" && <span style={badge(sub.status === "active" ? "open" : sub.status === "past_due" ? "queued" : "failed")}>{sub.status}</span>}
          </div>
          {sub?.grace_until && <div style={{ color: "var(--red)", fontSize: 12 }}>graça até {new Date(sub.grace_until).toLocaleString()}</div>}
        </div>
        <div style={{ ...card, padding: 16, marginBottom: 0 }}>
          <div style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Lease TTL</div>
          <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 23 }}>{u?.lease_ttl_seconds ? fmtSec(u.lease_ttl_seconds) : "∞"}</div>
          <div style={{ color: "var(--mute)", fontSize: 12, marginTop: 8 }}>renovação por heartbeat</div>
        </div>
      </div>

      <div style={card}>
        <CardHead title="Assinatura" />
        <div style={{ padding: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={btn} onClick={() => stripeCheckout("pro")}>Assinar Pro (Stripe)</button>
          {PLANS.map((p) => (
            <button key={p} style={{ ...btn, background: u?.plan === p ? "var(--green)" : "var(--elev)", color: u?.plan === p ? "var(--accent-ink)" : "var(--dim)" }} onClick={() => setPlan(p)}>{p}</button>
          ))}
          <span style={{ color: "var(--mute)", fontSize: 12, width: "100%" }}>
            “Assinar Pro” usa Stripe Checkout (real com STRIPE_SECRET_KEY; senão stub). Os botões de plano são troca direta (dev). Tudo server-side.
          </span>
          {checkout && <code style={{ fontSize: 12, color: "var(--dim)", width: "100%" }}>{checkout}</code>}
        </div>
      </div>

      <div style={card}>
        <CardHead title="Dispositivos" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>kill-switch (mTLS)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={th}>Device</th><th style={th}>Visto por último</th><th style={th}>Status</th><th style={{ ...th, textAlign: "right" }}></th></tr></thead>
          <tbody>
            {(devices || []).map((d) => (
              <tr key={d.id}>
                <td style={cell}><code style={{ color: "var(--accent)", fontSize: 12 }}>{short(d.id)}</code></td>
                <td style={cell}>{d.last_seen || "—"}</td>
                <td style={cell}><span style={badge(d.status === "active" ? "open" : "failed")}>{d.status}</span></td>
                <td style={{ ...cell, textAlign: "right" }}>{d.status === "active" && <a onClick={() => revoke(d.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>revogar</a>}</td>
              </tr>
            ))}
            {!devices?.length && <tr><td style={cell} colSpan={4}>nenhum device</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
