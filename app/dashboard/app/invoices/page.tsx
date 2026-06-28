"use client";
import { useEffect, useState } from "react";
import { apiGet, badge, card, cell, codeAmber, codeDim, input, Page, PageHead, Pills, tableStyle, thCell, usePoll, useT } from "../ui";

type Invoice = { stripe_invoice_id: string; amount_cents: number; currency: string; status: string; date: string; pdf_url: string };
type Sub = { plan: string; status: string };

const money = (c: number, cur: string) => (c / 100).toLocaleString("en-US", { style: "currency", currency: (cur || "usd").toUpperCase() });
const FILTERS: [string, string][] = [["all", "Todas"], ["paid", "Pagas"], ["open", "Pendentes"], ["failed", "Falhou"]];

export default function Faturas() {
  const t = useT();
  const { data: invoices } = usePoll<Invoice[]>("/v1/invoices", 4000);
  const [sub, setSub] = useState<Sub | null>(null);
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  useEffect(() => { apiGet<Sub>("/v1/subscription").then((r) => { if (!(r as any)?.error) setSub(r); }).catch(() => {}); }, []);

  const list = invoices || [];
  const rows = list
    .filter((iv) => f === "all" || iv.status === f)
    .filter((iv) => (iv.stripe_invoice_id + iv.date).toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Faturas" subtitle="Histórico de cobranças e recibos da sua organização." />

      {/* banner da assinatura */}
      <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ width: 42, height: 42, borderRadius: 11, background: "var(--accent-tint)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>🧾</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 15, textTransform: "capitalize" }}>{t("Plano", "Plan")} {sub?.plan || "free"}</div>
          <div style={{ color: "var(--mute)", fontSize: 13 }}>{sub && sub.status !== "none" ? <span style={badge(sub.status === "active" ? "open" : "queued")}>{sub.status}</span> : t("sem assinatura ativa", "no active subscription")} · {list.length} {t("fatura(s)", "invoice(s)")}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar fatura ou período…", "Search invoice or period…")} style={{ ...input, flex: 1, minWidth: 180 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Fatura", "Invoice")}</th><th style={thCell}>{t("Valor", "Amount")}</th><th style={thCell}>Status</th><th style={{ ...thCell, textAlign: "right" }}>PDF</th></tr></thead>
          <tbody>
            {rows.map((iv, i) => (
              <tr key={iv.stripe_invoice_id + i}>
                <td style={cell}>
                  <div><span style={codeAmber}>{iv.stripe_invoice_id || "—"}</span></div>
                  <div style={{ ...codeDim, marginTop: 2 }}>{iv.date}</div>
                </td>
                <td style={cell}><b>{money(iv.amount_cents, iv.currency)}</b></td>
                <td style={cell}><span style={badge(iv.status === "paid" ? "merged" : iv.status === "failed" ? "failed" : "queued")}>{iv.status}</span></td>
                <td style={{ ...cell, textAlign: "right" }}>{iv.pdf_url ? <a href={iv.pdf_url} target="_blank" style={{ color: "var(--blue)", fontSize: 13 }}>PDF ↗</a> : "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td style={cell} colSpan={4}>{t("nenhuma fatura")}</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} {t("fatura(s)", "invoice(s)")}</div>
      </div>
    </Page>
  );
}
