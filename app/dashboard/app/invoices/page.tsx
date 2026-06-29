"use client";
import { useEffect, useState } from "react";
import { apiGet, Page, PageHead, Portal, usePoll, useT } from "../ui";

type RawInvoice = { stripe_invoice_id: string; amount_cents: number; currency: string; status: string; date: string; pdf_url: string };
type Sub = { plan: string; status: string };

type Row = {
  id: string; date: string; period: string; amount: string;
  rawStatus: string; pdfUrl: string;
};

const PAGE_SIZE = 8;

const money = (c: number, cur: string) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: (cur || "brl").toUpperCase() });

const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtDate(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}/${MONTHS_PT[d.getMonth()]}/${d.getFullYear()}`;
}
function invoicePeriod(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const end   = new Date(d.getFullYear(), d.getMonth(), 0);
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  const fm = (x: Date) => `${String(x.getDate()).padStart(2, "0")} ${MONTHS_PT[x.getMonth()]}`;
  return `${fm(start)} – ${fm(end)} ${end.getFullYear()}`;
}
function extractYear(s: string): string {
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : String(d.getFullYear());
}

function toRow(iv: RawInvoice): Row {
  return {
    id:        iv.stripe_invoice_id || "—",
    date:      fmtDate(iv.date),
    period:    invoicePeriod(iv.date),
    amount:    money(iv.amount_cents, iv.currency),
    rawStatus: iv.status,
    pdfUrl:    iv.pdf_url || "",
  };
}

const STATUS_FILTER = ["todos", "paga", "pendente", "falhou"] as const;

const MOCK_ROWS: Row[] = [
  { id: "in_1Abc8f3x", date: "01/jun/2026", period: "01 mai – 31 mai 2026", amount: "R$ 499,00", rawStatus: "paid",     pdfUrl: "" },
  { id: "in_2Bcd9g4y", date: "01/mai/2026", period: "01 abr – 30 abr 2026", amount: "R$ 499,00", rawStatus: "paid",     pdfUrl: "" },
  { id: "in_3Cde0h5z", date: "01/abr/2026", period: "01 mar – 31 mar 2026", amount: "R$ 499,00", rawStatus: "paid",     pdfUrl: "" },
  { id: "in_4Def1i6a", date: "01/mar/2026", period: "01 fev – 28 fev 2026", amount: "R$ 349,00", rawStatus: "open",     pdfUrl: "" },
  { id: "in_5Efg2j7b", date: "01/fev/2026", period: "01 jan – 31 jan 2026", amount: "R$ 349,00", rawStatus: "failed",   pdfUrl: "" },
];

const sPill = (active: boolean): React.CSSProperties => ({
  padding: "4px 11px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: active ? 600 : 500,
  cursor: "pointer", background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)", boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
});
const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", overflow: "hidden",
};
const sNavBtn = (disabled: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28,
  borderRadius: 7, border: "1px solid var(--border)", background: "transparent",
  color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer",
});
const sThCell: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)",
};
const sField: React.CSSProperties = {
  height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12, cursor: "pointer",
  colorScheme: "dark",
};
const sActionBtn = (accent: boolean): React.CSSProperties => ({
  height: 30, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 7,
  border: accent ? "none" : "1px solid var(--border)", flexShrink: 0,
  background: accent ? "var(--accent)" : "transparent",
  color: accent ? "var(--accent-ink)" : "var(--ink)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
});
const sIconBtn: React.CSSProperties = {
  width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 7, border: "1px solid var(--border)", background: "transparent",
  color: "var(--dim)", cursor: "pointer", flexShrink: 0,
};

type DocItem = { desc: string; sub: string; qty: string; unit: string; total: string };
type InvoiceDoc = { id: string; date: string; due: string; period: string; plan: string; statusLabel: string; statusColor: string; statusBg: string; items: DocItem[]; subtotal: string; total: string; payNote: string };

export default function Faturas() {
  const t = useT();

  const STATUS_DISPLAY: Record<string, [string, string, string]> = {
    paid:     [t("Paga", "Paid"),      "var(--green)",  "var(--green-tint)"],
    open:     [t("Pendente", "Pending"),  "var(--accent)", "var(--accent-tint)"],
    past_due: [t("Pendente", "Pending"),  "var(--accent)", "var(--accent-tint)"],
    failed:   [t("Falhou", "Failed"),    "var(--red)",    "var(--red-tint)"],
    void:     [t("Falhou", "Failed"),    "var(--red)",    "var(--red-tint)"],
  };
  const statusInfo = (s: string) => STATUS_DISPLAY[s] || ["—", "var(--mute)", "var(--elev)"];
  const STATUS_LABEL: Record<string, string> = { todos: t("Todas", "All"), paga: t("Pagas", "Paid"), pendente: t("Pendentes", "Pending"), falhou: t("Falhou", "Failed") };

  const buildDoc = (row: Row, plan: string): InvoiceDoc => {
    const [statusLabel, statusColor, statusBg] = statusInfo(row.rawStatus);
    return {
      id: row.id, date: row.date, due: row.date, period: row.period, plan: plan || "Free",
      statusLabel, statusColor, statusBg,
      items: [
        { desc: `${t("Plano", "Plan")} ${plan || "Free"}`, sub: row.period, qty: "1", unit: row.amount, total: row.amount },
      ],
      subtotal: row.amount, total: row.amount,
      payNote: row.rawStatus === "paid" ? t("Pago com Visa •••• 4242", "Paid with Visa •••• 4242") : t("Aguardando pagamento", "Awaiting payment"),
    };
  };

  const [loading, setLoading] = useState(true);
  const { data: invoicesRaw } = usePoll<RawInvoice[]>("/v1/invoices", 4000);
  const [sub, setSub] = useState<Sub | null>(null);
  useEffect(() => { apiGet<Sub>("/v1/subscription").then((r) => { if (!(r as any)?.error) setSub(r); }).catch(() => {}); }, []);
  useEffect(() => { if (invoicesRaw !== undefined) setLoading(false); }, [invoicesRaw]);

  const [q,    setQ]    = useState("");
  const [year, setYear] = useState("todos");
  const [sf,   setSf]   = useState<typeof STATUS_FILTER[number]>("todos");
  const [page, setPage] = useState(0);
  const [doc,  setDoc]  = useState<InvoiceDoc | null>(null);

  const rawRows: Row[] = (invoicesRaw && invoicesRaw.length > 0)
    ? invoicesRaw.map(toRow)
    : MOCK_ROWS;

  const years = Array.from(new Set(rawRows.map((r) => extractYear(r.date)).filter(Boolean))).sort((a, b) => Number(b) - Number(a));

  const statusGroup = (s: string) => {
    if (s === "paid") return "paga";
    if (s === "open" || s === "past_due") return "pendente";
    return "falhou";
  };

  const filtered = rawRows
    .filter((r) => sf === "todos" || statusGroup(r.rawStatus) === sf)
    .filter((r) => year === "todos" || extractYear(r.date) === year)
    .filter((r) => !q || r.id.toLowerCase().includes(q.toLowerCase()) || r.period.toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const plan = sub?.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : "Free";

  return (
    <Page loading={loading}>
      <PageHead eyebrow={t("Conta & cobrança", "Account & billing")} title={t("Faturas", "Invoices")} subtitle={t("Histórico de cobranças e recibos da sua organização.", "Billing history and receipts for your organization.")} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Next billing banner ── */}
        <div style={{ ...sCard, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l2.8 1.7"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
              {t("Próxima cobrança", "Next billing")} · <span style={{ fontFamily: "var(--mono)" }}>R$ 499,00</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--mute)" }}>01/jul/2026 · Visa •••• 4242</div>
          </div>
          <button style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            {t("Baixar todas", "Download all")}
          </button>
        </div>

        {/* ── Invoices table ── */}
        <div style={sCard}>
          {/* toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 160 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("Buscar fatura ou período…", "Search invoice or period…")} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
            </div>
            <select value={year} onChange={(e) => { setYear(e.target.value); setPage(0); }} style={sField}>
              <option value="todos">{t("Todos os anos", "All years")}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
              {STATUS_FILTER.map((s) => (
                <button key={s} onClick={() => { setSf(s); setPage(0); }} style={sPill(sf === s)}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
          </div>

          {/* column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto auto", gap: 0, ...sThCell, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
            <span>{t("Fatura", "Invoice")}</span>
            <span>{t("Período", "Period")}</span>
            <span>{t("Valor", "Amount")}</span>
            <span style={{ padding: "0 14px" }}>{t("Status", "Status")}</span>
            <span style={{ width: 36 }} />
          </div>

          {/* rows */}
          {rows.map((r) => {
            const [sl, sc, sb] = statusInfo(r.rawStatus);
            const isUnpaid = r.rawStatus === "open" || r.rawStatus === "past_due";
            const isPaid   = r.rawStatus === "paid";
            return (
              <div key={r.id}
                style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto auto", alignItems: "center", gap: 0, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.id}</span>
                  <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{r.date}</span>
                </div>
                <span style={{ fontSize: 12.5, color: "var(--dim)" }}>{r.period}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--ink)" }}>{r.amount}</span>
                <div style={{ padding: "0 14px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, color: sc, background: sb }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
                    {sl}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  {isUnpaid && (
                    <button style={sActionBtn(true)}
                      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.filter = "")}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                      {t("Pagar", "Pay")}
                    </button>
                  )}
                  {isPaid && (
                    <button style={sActionBtn(false)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l2 2 4-4"/></svg>
                      NF-e
                    </button>
                  )}
                  <button onClick={() => setDoc(buildDoc(r, plan))} title={t("Abrir fatura", "Open invoice")} style={sIconBtn}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--dim)"; }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14"/></svg>
                  </button>
                </div>
              </div>
            );
          })}

          {/* empty state */}
          {rows.length === 0 && (
            <div style={{ padding: "36px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
              <span style={{ fontSize: 13, color: "var(--dim)" }}>{t("Nenhuma fatura encontrada.", "No invoices found.")}</span>
              <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{t("Ajuste a busca ou os filtros.", "Adjust the search or filters.")}</span>
            </div>
          )}

          {/* footer pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>
              {rows.length} {t("de", "of")} {filtered.length}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{t("Pág.", "Page")} {safePage + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} style={sNavBtn(safePage === 0)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} style={sNavBtn(safePage >= totalPages - 1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ── Invoice detail modal ── */}
      {doc && (
        <Portal>
        <div onClick={() => setDoc(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.62)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 80, padding: "28px 24px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 0, borderRadius: 12, overflow: "hidden", boxShadow: "0 26px 64px rgba(0,0,0,.45)" }}>
            {/* dark header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", background: "rgba(22,18,12,.9)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, color: "#fff" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t("Fatura", "Invoice")} {doc.id}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => window.print()} style={{ height: 34, padding: "0 15px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#1c1303", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 4 5-4M5 21h14"/></svg>
                  {t("Baixar PDF", "Download PDF")}
                </button>
                <button onClick={() => setDoc(null)} style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.08)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            {/* white invoice body */}
            <div id="invoice-print" style={{ background: "#fff", color: "#2A2622" }}>
              {/* invoice header row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "22px 24px 18px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-.02em", color: "#1C1813", lineHeight: 1 }}>{t("FATURA", "INVOICE")}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "#8A8175", marginTop: 5 }}>{doc.id}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: doc.statusColor, background: doc.statusBg, border: `1px solid ${doc.statusColor}30` }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: doc.statusColor }} />
                  {doc.statusLabel}
                </span>
              </div>

              {/* meta grid */}
              <div style={{ display: "flex", gap: 16, padding: "0 24px 18px", flexWrap: "wrap", borderBottom: "1px solid #F0EADF" }}>
                {[[t("Emissão", "Issued"), doc.date], [t("Vencimento", "Due"), doc.due], [t("Período", "Period"), doc.period], [t("Plano", "Plan"), doc.plan]].map(([k, v]) => (
                  <div key={k} style={{ flex: "1 1 180px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#9A8B6E" }}>{k}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: "#2A2622" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* line items header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 46px 110px 110px", padding: "10px 24px", background: "#FBF7EE" }}>
                {[t("Descrição", "Description"), t("Qtd.", "Qty."), t("Unitário", "Unit"), t("Total", "Total")].map((h, i) => (
                  <span key={i} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#9A8B6E", textAlign: i === 0 ? "left" : "right" }}>{h}</span>
                ))}
              </div>

              {/* line items */}
              {doc.items.map((it, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 46px 110px 110px", padding: "14px 24px", borderTop: "1px solid #F0EADF", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#2A2622" }}>{it.desc}</div>
                    <div style={{ fontSize: 10.5, color: "#9A9081", marginTop: 3 }}>{it.sub}</div>
                  </div>
                  <span style={{ textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "#6B6258" }}>{it.qty}</span>
                  <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12, color: "#6B6258" }}>{it.unit}</span>
                  <span style={{ textAlign: "right", fontFamily: "var(--mono)", fontSize: 12.5, fontWeight: 600, color: "#2A2622" }}>{it.total}</span>
                </div>
              ))}

              {/* totals */}
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 24px" }}>
                <div style={{ width: 290, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[[t("Subtotal", "Subtotal"), doc.subtotal, false], [t("Impostos (inclusos)", "Taxes (included)"), "R$ 0,00", false]].map(([k, v, bold]) => (
                    <div key={String(k)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                      <span style={{ fontSize: 12, color: "#6B6258" }}>{k}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "#6B6258" }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ height: 1, background: "#ECE4D6" }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: "#1C1813" }}>{t("Total", "Total")}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 19, fontWeight: 800, color: "#B5740F" }}>{doc.total}</span>
                  </div>
                </div>
              </div>

              {/* payment note */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FBF7EE", border: "1px solid #F0E3C8", borderRadius: 10, margin: "0 24px 24px", padding: "13px 16px" }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#C97D12" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>
                <div style={{ fontSize: 12, color: "#5C5347", lineHeight: 1.5 }}>
                  <strong style={{ color: "#2A2622", fontWeight: 700 }}>{t("Pagamento", "Payment")}</strong> · {doc.payNote}
                </div>
              </div>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </Page>
  );
}
