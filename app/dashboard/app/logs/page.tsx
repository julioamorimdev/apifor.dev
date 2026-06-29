"use client";
import { useEffect, useState } from "react";
import { Page, PageHead, short, usePoll } from "../ui";

type Log = { when: string; task_id: string; type: string; status: string; log: string };

const LEVELS: [string, string][] = [
  ["todos", "Todos"], ["info", "Info"], ["warn", "Aviso"], ["err", "Erro"],
];

function lvl(s: string): [string, string] {
  if (s === "failed" || s === "changes")                                  return ["ERRO",  "var(--red)"];
  if (s === "done" || s === "passed" || s === "approved" || s === "merged") return ["OK",    "var(--green)"];
  if (s === "running" || s === "active")                                  return ["INFO",  "var(--blue)"];
  if (s === "pending" || s === "planning")                                return ["AVISO", "var(--orange)"];
  return ["INFO", "var(--dim)"];
}

function matchLevel(f: string, s: string) {
  if (f === "todos") return true;
  if (f === "err")   return s === "failed" || s === "changes";
  if (f === "warn")  return s === "pending" || s === "planning";
  if (f === "info")  return !["failed","changes","pending","planning"].includes(s);
  return true;
}

function fmtTime(iso: string) {
  if (!iso) return "—";
  const t = iso.slice(11, 19);
  return t || iso;
}

const selStyle: React.CSSProperties = {
  height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12, cursor: "pointer",
};

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px", borderRadius: 6, border: "none", fontSize: 12,
  fontWeight: active ? 600 : 500, cursor: "pointer",
  background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
});

export default function Logs() {
  const { data: logs } = usePoll<Log[]>("/v1/logs", 2500);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (logs !== undefined) setLoading(false); }, [logs]);
  const all = logs || [];

  const [level,  setLevel]  = useState("todos");
  const [who,    setWho]    = useState("todos");
  const [agent,  setAgent]  = useState("todos");

  const workers = [...new Set(all.map((l) => l.task_id).filter(Boolean))];
  const agents  = [...new Set(all.map((l) => l.type).filter(Boolean))];

  const rows = all
    .filter((l) => matchLevel(level, l.status))
    .filter((l) => who   === "todos" || l.task_id === who)
    .filter((l) => agent === "todos" || l.type    === agent);

  const controls = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <select value={who} onChange={(e) => setWho(e.target.value)} style={selStyle}>
        <option value="todos">Todos os workers</option>
        {workers.map((w) => (
          <option key={w} value={w}>#{short(w.replace(/^tsk_/, ""), 8)}</option>
        ))}
      </select>

      <select value={agent} onChange={(e) => setAgent(e.target.value)} style={selStyle}>
        <option value="todos">Todos os agentes</option>
        {agents.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 7 }}>
        {LEVELS.map(([k, label]) => (
          <button key={k} onClick={() => setLevel(k)} style={pillStyle(level === k)}>{label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="Logs"
        subtitle="Terminal ao vivo, filtrável por nível."
        right={controls} />

      {/* terminal */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.9, padding: "14px 16px", minHeight: 420, maxHeight: "68vh", overflowY: "auto" }}>
          {rows.map((l, i) => {
            const [lv, lc] = lvl(l.status);
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span style={{ color: "var(--mute)", flexShrink: 0 }}>{fmtTime(l.when)}</span>
                <span style={{ color: lc, fontWeight: 600, flexShrink: 0, flex: "0 0 40px" }}>{lv}</span>
                <span style={{ color: "var(--dim)", flexShrink: 0, minWidth: 44 }}>
                  {l.type}#{short(l.task_id.replace(/^tsk_/, ""), 4)}
                </span>
                <span style={{ color: "var(--ink)", opacity: .92, wordBreak: "break-word" }}>
                  {l.log || l.status}
                </span>
              </div>
            );
          })}

          {!rows.length && (
            <span style={{ color: "var(--mute)" }}>
              nenhum log ainda — crie uma tarefa com repositório pra ver o pipeline.
            </span>
          )}

          {/* blinking cursor */}
          <div style={{ display: "flex", gap: 9, alignItems: "center", paddingTop: 4 }}>
            <span style={{ color: "var(--green)" }}>apifor@pool ~$</span>
            <span style={{ width: 8, height: 14, background: "var(--green)", display: "inline-block", animation: "blink 1.1s step-end infinite" }} />
          </div>
        </div>

        <div style={{ padding: "9px 16px", borderTop: "1px solid var(--border)", fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{rows.length} linha(s)</span>
          <span style={{ fontSize: 11, color: "var(--border)" }}>
            {all.length !== rows.length ? `${all.length} total · ${all.length - rows.length} filtrados` : ""}
          </span>
        </div>
      </div>
    </Page>
  );
}
