"use client";
import { useState } from "react";
import { badge, card, cell, codeAmber, input, Page, PageHead, Pills, StateBar, tableStyle, usePoll, useT } from "../ui";

type Task = { id: string; title: string; status: string };

const BUCKETS = [
  { label: "Na fila", tone: "orange", st: ["queued", "planning", "assigned"] },
  { label: "Em execução", tone: "blue", st: ["running"] },
  { label: "Em revisão", tone: "accent", st: ["in_review", "blocked"] },
  { label: "Concluídas", tone: "green", st: ["merged"] },
  { label: "Falhas", tone: "red", st: ["failed"] },
];
const FILTERS: [string, string][] = [["all", "Todos"], ["queue", "Na fila"], ["run", "Em execução"], ["done", "Encerradas"]];
const match = (f: string, s: string) =>
  f === "all" || (f === "queue" && ["queued", "planning", "assigned"].includes(s)) || (f === "run" && s === "running") || (f === "done" && ["merged", "failed"].includes(s));
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };

export default function Fila() {
  const t = useT();
  const { data: tasks } = usePoll<Task[]>("/v1/tasks", 1500);
  const all = tasks || [];
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const counts = BUCKETS.map((b) => ({ label: b.label, tone: b.tone, n: all.filter((t) => b.st.includes(t.status)).length }));
  const rows = all.filter((t) => match(f, t.status)).filter((t) => (t.title + t.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <Page>
      <PageHead eyebrow="Operação" title="Fila" subtitle="Estados das tarefas e reprocessamento." />
      <StateBar title="Estado das tarefas" counts={counts} />
      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar tarefa…")} style={{ ...input, flex: 1, minWidth: 160 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={th}>{t("Tarefa")}</th><th style={th}>{t("Título")}</th><th style={{ ...th, textAlign: "right" }}>{t("Estado")}</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td style={cell}><span style={codeAmber}>{t.id.slice(-8)}</span></td>
                <td style={cell}>{t.title}</td>
                <td style={{ ...cell, textAlign: "right" }}><span style={badge(t.status)}>{t.status}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td style={cell} colSpan={3}>{t("nenhuma tarefa")}</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 12, borderTop: "1px solid var(--border)" }}>{rows.length} tarefa(s)</div>
      </div>
    </Page>
  );
}
