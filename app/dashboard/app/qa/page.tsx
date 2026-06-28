"use client";
import { useState } from "react";
import { badge, card, cell, codeAmber, codeDim, input, Page, PageHead, Pills, short, StatCard, tableStyle, thCell, usePoll, useT } from "../ui";

type QA = { id: string; task_id: string; status: string; tests_total: number; tests_passed: number; date: string };

const FILTERS: [string, string][] = [["all", "Todos"], ["passed", "Aprovados"], ["failed", "Falhas"]];

export default function QATela() {
  const t = useT();
  const { data: reports } = usePoll<QA[]>("/v1/qa", 2500);
  const list = reports || [];
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const passed = list.filter((x) => x.status === "passed").length;
  const failed = list.filter((x) => x.status === "failed").length;
  const tot = list.reduce((a, x) => a + (x.tests_total || 0), 0);
  const ok = list.reduce((a, x) => a + (x.tests_passed || 0), 0);
  const pct = tot ? Math.round((100 * ok) / tot) : 0;
  const rows = list.filter((x) => f === "all" || x.status === f).filter((x) => x.task_id.toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageHead eyebrow="Operação" title="QA" subtitle="Relatórios de teste por tarefa." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(176px,1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard label="Aprovação" value={pct} suffix="%" tone="green" sub={`${ok}/${tot} testes`} />
        <StatCard label="Relatórios" value={list.length} tone="accent" sub="total" />
        <StatCard label="Aprovados" value={passed} tone="blue" sub="status passed" />
        <StatCard label="Falhas" value={failed} tone="red" sub="status failed" />
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar tarefa…")} style={{ ...input, flex: 1, minWidth: 160 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Tarefa")}</th><th style={thCell}>{t("Status")}</th><th style={thCell}>{t("Testes")}</th><th style={{ ...thCell, textAlign: "right" }}>{t("Data")}</th></tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td style={cell}>
                  <div><span style={codeAmber}>#{short(x.task_id.replace(/^tsk_/, ""), 6)}</span></div>
                  <div style={{ ...codeDim, marginTop: 2 }}>{short(x.task_id, 22)}</div>
                </td>
                <td style={cell}><span style={badge(x.status === "passed" ? "merged" : "failed")}>{x.status}</span></td>
                <td style={cell}>{x.tests_passed}/{x.tests_total}</td>
                <td style={{ ...cell, textAlign: "right" }}>{x.date}</td>
              </tr>
            ))}
            {!rows.length && <tr><td style={cell} colSpan={4}>{t("nenhum relatório de QA")}</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} relatório(s)</div>
      </div>
    </Page>
  );
}
