"use client";
import { useState } from "react";
import { card, input, Page, PageHead, Pills, short, usePoll } from "../ui";

type Log = { when: string; task_id: string; type: string; status: string; log: string };

const FILTERS: [string, string][] = [["all", "Todos"], ["done", "OK"], ["failed", "Falhas"]];
const dot = (s: string) => (s === "done" || s === "passed" || s === "approved" || s === "merged" ? "var(--green)" : s === "failed" || s === "changes" ? "var(--red)" : s === "running" ? "var(--blue)" : "var(--mute)");

export default function Logs() {
  const { data: logs } = usePoll<Log[]>("/v1/logs", 2500);
  const all = logs || [];
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const rows = all
    .filter((l) => f === "all" || (f === "failed" && (l.status === "failed" || l.status === "changes")) || (f === "done" && !["failed", "changes"].includes(l.status)))
    .filter((l) => (l.task_id + l.type + l.log).toLowerCase().includes(q.toLowerCase()));

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Logs" subtitle="Feed do pipeline (steps dos workers) em tempo real." />
      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar log…" style={{ ...input, flex: 1, minWidth: 160 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.7, padding: "10px 4px", maxHeight: "68vh", overflowY: "auto" }}>
          {rows.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "4px 14px", alignItems: "baseline" }}>
              <span style={{ color: "var(--mute)", flexShrink: 0 }}>{l.when}</span>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: dot(l.status), flexShrink: 0, alignSelf: "center" }} />
              <span style={{ color: "var(--accent)", flexShrink: 0 }}>#{short(l.task_id.replace(/^tsk_/, ""), 6)}</span>
              <span style={{ color: "var(--blue)", flexShrink: 0, width: 56 }}>{l.type}</span>
              <span style={{ color: "var(--dim)", flexShrink: 0, width: 64 }}>{l.status}</span>
              <span style={{ color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.log || "—"}</span>
            </div>
          ))}
          {!rows.length && <div style={{ color: "var(--mute)", padding: "14px" }}>nenhum log ainda — crie uma tarefa com repositório pra ver o pipeline.</div>}
        </div>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} linha(s)</div>
      </div>
    </Page>
  );
}
