"use client";
import { useState } from "react";
import { card, input, Page, PageHead, Pills, short, usePoll, useT } from "../ui";

type Log = { when: string; task_id: string; type: string; status: string; log: string };

const FILTERS: [string, string][] = [["all", "Todos"], ["done", "OK"], ["failed", "Erro"]];
const lvl = (s: string): [string, string] =>
  s === "failed" || s === "changes" ? ["ERRO", "var(--red)"]
    : s === "done" || s === "passed" || s === "approved" || s === "merged" ? ["OK", "var(--green)"]
      : s === "running" ? ["INFO", "var(--blue)"] : ["INFO", "var(--orange)"];

export default function Logs() {
  const t = useT();
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar log…")} style={{ ...input, flex: 1, minWidth: 160 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.75, padding: "12px 6px", maxHeight: "68vh", overflowY: "auto", background: "var(--bg)" }}>
          {rows.map((l, i) => {
            const [lv, lc] = lvl(l.status);
            return (
              <div key={i} style={{ display: "flex", gap: 12, padding: "2px 14px", alignItems: "baseline" }}>
                <span style={{ color: "var(--mute)", flexShrink: 0 }}>{(l.when || "").slice(11) || l.when}</span>
                <span style={{ color: lc, flexShrink: 0, width: 40, fontWeight: 600 }}>{lv}</span>
                <span style={{ color: "var(--dim)", flexShrink: 0, width: 64 }}>{l.type}#{short(l.task_id.replace(/^tsk_/, ""), 4)}</span>
                <span style={{ color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.log || l.status}</span>
              </div>
            );
          })}
          {!rows.length && <div style={{ color: "var(--mute)", padding: "4px 14px" }}>{t("nenhum log ainda", "no logs yet")} — {t("crie uma tarefa com repositório pra ver o pipeline.", "create a task with a repo to see the pipeline.")}</div>}
          <div style={{ padding: "6px 14px", color: "var(--green)" }}>apifor@pool ~$ <span className="apf-cursor" style={{ background: "var(--green)", color: "var(--green)" }}>█</span></div>
        </div>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} {t("linha(s)", "line(s)")}</div>
      </div>
    </Page>
  );
}
