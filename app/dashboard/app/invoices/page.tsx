"use client";
import { badge, card, cell, Page, tableStyle, usePoll } from "../ui";

type Invoice = { stripe_invoice_id: string; amount_cents: number; currency: string; status: string; date: string; pdf_url: string };

const money = (c: number, cur: string) => (c / 100).toLocaleString("en-US", { style: "currency", currency: (cur || "usd").toUpperCase() });

export default function Faturas() {
  const { data: invoices } = usePoll<Invoice[]>("/v1/invoices", 4000);

  return (
    <Page>
      <h3 style={{ color: "var(--dim)" }}>Faturas <span style={{ color: "var(--mute)", fontSize: 13 }}>(via webhooks do Stripe)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>data</th><th style={cell}>valor</th><th style={cell}>status</th><th style={cell}>stripe id</th><th style={cell}>pdf</th></tr></thead>
          <tbody>
            {(invoices || []).map((iv, i) => (
              <tr key={iv.stripe_invoice_id + i}>
                <td style={cell}>{iv.date}</td>
                <td style={cell}>{money(iv.amount_cents, iv.currency)}</td>
                <td style={cell}><span style={badge(iv.status === "paid" ? "merged" : "queued")}>{iv.status}</span></td>
                <td style={cell}><code style={{ fontSize: 12 }}>{iv.stripe_invoice_id || "—"}</code></td>
                <td style={cell}>{iv.pdf_url ? <a href={iv.pdf_url} target="_blank" style={{ color: "var(--blue)" }}>PDF</a> : "—"}</td>
              </tr>
            ))}
            {!invoices?.length && <tr><td style={cell} colSpan={5}>nenhuma fatura</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
