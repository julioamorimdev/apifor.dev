"use client";
import { badge, card, CardHead, cell, codeDim, Page, PageHead, tableStyle, thCell, usePoll } from "../ui";

type Invoice = { stripe_invoice_id: string; amount_cents: number; currency: string; status: string; date: string; pdf_url: string };

const money = (c: number, cur: string) => (c / 100).toLocaleString("en-US", { style: "currency", currency: (cur || "usd").toUpperCase() });

export default function Faturas() {
  const { data: invoices } = usePoll<Invoice[]>("/v1/invoices", 4000);
  const list = invoices || [];

  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Faturas" subtitle="Faturas emitidas (webhooks do Stripe)." />
      <div style={card}>
        <CardHead title="Faturas" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{list.length} fatura(s)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Data</th><th style={thCell}>Valor</th><th style={thCell}>Status</th><th style={thCell}>Stripe ID</th><th style={{ ...thCell, textAlign: "right" }}>PDF</th></tr></thead>
          <tbody>
            {list.map((iv, i) => (
              <tr key={iv.stripe_invoice_id + i}>
                <td style={cell}>{iv.date}</td>
                <td style={cell}><b>{money(iv.amount_cents, iv.currency)}</b></td>
                <td style={cell}><span style={badge(iv.status === "paid" ? "merged" : "queued")}>{iv.status}</span></td>
                <td style={cell}><span style={codeDim}>{iv.stripe_invoice_id || "—"}</span></td>
                <td style={{ ...cell, textAlign: "right" }}>{iv.pdf_url ? <a href={iv.pdf_url} target="_blank" style={{ color: "var(--blue)", fontSize: 13 }}>PDF ↗</a> : "—"}</td>
              </tr>
            ))}
            {!list.length && <tr><td style={cell} colSpan={5}>nenhuma fatura</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
