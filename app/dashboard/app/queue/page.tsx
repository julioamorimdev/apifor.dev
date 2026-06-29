"use client";
import { useEffect, useState } from "react";
import { badge, card, cell, codeAmber, Page, PageHead, Pills, StateBar, tableStyle, thCell, usePoll } from "../ui";

type Task = { id: string; title: string; status: string; assigned_worker_id?: string; repo_id?: string };

const PAGE_SIZE = 20;

const BUCKETS = [
  { label: "Na fila",     tone: "orange", st: ["queued", "planning", "assigned"] },
  { label: "Em execução", tone: "blue",   st: ["running"] },
  { label: "Em revisão",  tone: "accent", st: ["in_review", "blocked"] },
  { label: "Concluídas",  tone: "green",  st: ["merged"] },
  { label: "Falhas",      tone: "red",    st: ["failed"] },
];

const STATE_FILTERS: [string, string][] = [
  ["todos",     "Todos"],
  ["andamento", "Em andamento"],
  ["fila",      "Na fila"],
  ["encerrado", "Encerrados"],
];

function matchState(f: string, s: string) {
  if (f === "todos")     return true;
  if (f === "andamento") return ["running", "in_review", "blocked"].includes(s);
  if (f === "fila")      return ["queued", "planning", "assigned"].includes(s);
  if (f === "encerrado") return ["merged", "failed"].includes(s);
  return true;
}

const selStyle: React.CSSProperties = {
  height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", fontSize: 12, cursor: "pointer",
};

export default function Fila() {
  const { data: tasks } = usePoll<Task[]>("/v1/tasks", 1500);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (tasks !== undefined) setLoading(false); }, [tasks]);
  const all = tasks || [];

  const [q, setQ]       = useState("");
  const [state, setState] = useState("todos");
  const [source, setSource] = useState("todas");
  const [provider, setProvider] = useState("todos");
  const [page, setPage] = useState(0);

  const counts = BUCKETS.map((b) => ({
    label: b.label,
    tone: b.tone,
    n: all.filter((t) => b.st.includes(t.status)).length,
  }));

  const filtered = all.filter((t) =>
    matchState(state, t.status) &&
    (q === "" || (t.title + t.id + (t.repo_id ?? "")).toLowerCase().includes(q.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const pageLabel = totalPages > 1 ? `${safePage + 1} / ${totalPages}` : "";

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="Fila" subtitle="Estados das tarefas e reprocessamento." />
      <StateBar title="Estado das tarefas" counts={counts} />

      <div style={card}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          {/* search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 160 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Buscar tarefa…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", fontSize: 12.5 }}
            />
          </div>

          {/* state pills */}
          <Pills options={STATE_FILTERS} value={state} onChange={(v) => { setState(v); setPage(0); }} />

          {/* fonte */}
          <select value={source} onChange={(e) => setSource(e.target.value)} style={selStyle}>
            <option value="todas">Fonte: todas</option>
            <option>Jira</option>
            <option>Linear</option>
            <option>GitHub Issues</option>
            <option>Trello</option>
          </select>

          {/* código */}
          <select value={provider} onChange={(e) => setProvider(e.target.value)} style={selStyle}>
            <option value="todos">Código: todos</option>
            <option>GitHub</option>
            <option>GitLab</option>
            <option>Bitbucket</option>
          </select>
        </div>

        {/* table */}
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thCell}>Tarefa</th>
              <th style={{ ...thCell, paddingLeft: 12 }}>Título</th>
              <th style={{ ...thCell, paddingLeft: 12 }}>Repositório</th>
              <th style={{ ...thCell, textAlign: "right" }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td style={cell}><span style={codeAmber}>{t.id.slice(-8)}</span></td>
                <td style={{ ...cell, paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 340 }}>{t.title}</td>
                <td style={{ ...cell, paddingLeft: 12 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)" }}>
                    {t.repo_id ? t.repo_id.slice(0, 24) : "—"}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: "right" }}><span style={badge(t.status)}>{t.status}</span></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={4} style={{ ...cell, color: "var(--mute)", textAlign: "center" }}>nenhuma tarefa</td></tr>
            )}
          </tbody>
        </table>

        {/* footer / pagination */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>{filtered.length} tarefas</span>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{pageLabel}</span>
              <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </NavBtn>
              <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </NavBtn>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)",
        background: "transparent", color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
