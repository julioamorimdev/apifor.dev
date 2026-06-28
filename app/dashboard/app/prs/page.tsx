"use client";
import { useState } from "react";
import { badge, card, cell, codeAmber, codeDim, input, Page, PageHead, Pills, short, StatCard, tableStyle, thCell, usePoll, useT } from "../ui";

type PR = {
  id: string; task_id: string; branch: string; url: string; status: string;
  ci_status: string; ai_review_status: string; human_review_status: string;
};

const gate = (s: string) => badge(s === "passed" || s === "approved" ? "merged" : s === "failed" || s === "changes" ? "failed" : "queued");
const FILTERS: [string, string][] = [["all", "Todos"], ["review", "Em revisão"], ["cifail", "CI falhou"]];

export default function PRs() {
  const t = useT();
  const { data: prs } = usePoll<PR[]>("/v1/prs", 2500);
  const list = prs || [];
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const open = list.filter((p) => p.status !== "merged").length;
  const ciGreen = list.filter((p) => p.ci_status === "passed").length;
  const merged = list.filter((p) => p.status === "merged").length;
  const match = (p: PR) =>
    f === "all" || (f === "review" && p.status !== "merged" && p.status !== "failed") || (f === "cifail" && p.ci_status === "failed");
  const rows = list.filter(match).filter((p) => (p.branch + p.task_id).toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Pull Requests" subtitle="Status de revisão e CI, com links pro GitHub." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(176px,1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard label="Total" value={list.length} tone="accent" sub="pull requests" />
        <StatCard label="Abertos" value={open} tone="orange" sub="em revisão/merge" />
        <StatCard label="CI verde" value={ciGreen} tone="green" sub="testes passaram" />
        <StatCard label="Merged" value={merged} tone="blue" sub="concluídos" />
      </div>

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar PR…")} style={{ ...input, flex: 1, minWidth: 160 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Pull Request</th><th style={thCell}>CI</th><th style={thCell}>IA</th><th style={thCell}>{t("Humano")}</th><th style={{ ...thCell, textAlign: "right" }}>{t("Estado")}</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td style={cell}>
                  <div><span style={codeAmber}>#{short(p.task_id.replace(/^tsk_/, ""), 6)}</span> <span style={{ marginLeft: 4 }}>{short(p.branch, 28)}</span></div>
                  <div style={{ ...codeDim, marginTop: 2 }}>{p.url.startsWith("http") ? <a href={p.url} target="_blank" style={{ color: "var(--blue)" }}>{short(p.url, 40)} ↗</a> : short(p.task_id, 22)}</div>
                </td>
                <td style={cell}><span style={gate(p.ci_status)}>{p.ci_status || "—"}</span></td>
                <td style={cell}><span style={gate(p.ai_review_status)}>{p.ai_review_status || "—"}</span></td>
                <td style={cell}><span style={gate(p.human_review_status)}>{p.human_review_status || "—"}</span></td>
                <td style={{ ...cell, textAlign: "right" }}><span style={badge(p.status)}>{p.status}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td style={cell} colSpan={5}>{t("nenhum PR ainda")}</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} pull request(s)</div>
      </div>
    </Page>
  );
}
