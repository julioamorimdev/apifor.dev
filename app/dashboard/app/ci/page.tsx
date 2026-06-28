"use client";
import { useState } from "react";
import { badge, card, cell, codeAmber, codeDim, input, Page, PageHead, Pills, short, StatCard, tableStyle, thCell, usePoll } from "../ui";

type CI = { id: string; provider: string; status: string; task_id: string; finished_at: string };

const FILTERS: [string, string][] = [["all", "Todos"], ["passed", "Verde"], ["failed", "Falhou"]];

export default function CITela() {
  const { data: runs } = usePoll<CI[]>("/v1/ci", 2500);
  const list = runs || [];
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const passed = list.filter((c) => c.status === "passed").length;
  const failed = list.filter((c) => c.status === "failed").length;
  const done = passed + failed;
  const pct = done ? Math.round((100 * passed) / done) : 0;
  const rows = list.filter((c) => f === "all" || c.status === f).filter((c) => (c.task_id + c.provider).toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageHead eyebrow="Operação" title="CI" subtitle="Integração contínua — execuções de build/teste." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(176px,1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard label="CI verde" value={pct} suffix="%" tone="green" sub={`${passed}/${done} execuções`} />
        <StatCard label="Execuções" value={list.length} tone="accent" sub="total" />
        <StatCard label="Falhas" value={failed} tone="red" sub="vermelhas" />
        <StatCard label="Verde" value={passed} tone="blue" sub="passaram" />
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar execução…" style={{ ...input, flex: 1, minWidth: 160 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Execução</th><th style={thCell}>Provider</th><th style={thCell}>CI</th><th style={{ ...thCell, textAlign: "right" }}>Concluído</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={cell}>
                  <div><span style={codeAmber}>#{short(c.task_id.replace(/^tsk_/, ""), 6)}</span></div>
                  <div style={{ ...codeDim, marginTop: 2 }}>{short(c.task_id, 22)}</div>
                </td>
                <td style={cell}>{c.provider || "—"}</td>
                <td style={cell}><span style={badge(c.status === "passed" ? "merged" : c.status === "failed" ? "failed" : "queued")}>{c.status}</span></td>
                <td style={{ ...cell, textAlign: "right" }}>{c.finished_at || "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td style={cell} colSpan={4}>nenhuma execução de CI</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} execução(ões)</div>
      </div>
    </Page>
  );
}
