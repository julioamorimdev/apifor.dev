"use client";
import { useEffect, useState } from "react";
import { apiPost, badge, btn, card, codeAmber, Modal, Page, PageHead, Pills, thCell, usePoll } from "../ui";

type Task = { id: string; title: string; status: string; repo_id?: string };
type Repo = { id: string; name: string };

const PAGE_SIZE = 20;

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

const fieldStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--border)",
  borderRadius: 9, padding: "10px 12px", fontSize: 13, outline: "none",
};

export default function Tarefas() {
  const { data: tasks, reload } = usePoll<Task[]>("/v1/tasks", 1500);
  const { data: repos }         = usePoll<Repo[]>("/v1/repos", 5000);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (tasks !== undefined) setLoading(false); }, [tasks]);
  const all = tasks || [];

  const [q, setQ]       = useState("");
  const [state, setState] = useState("todos");
  const [source, setSource] = useState("todas");
  const [page, setPage] = useState(0);

  // nova tarefa modal
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle]   = useState("");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs]     = useState("");
  const [repo, setRepo]     = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await apiPost("/v1/tasks", {
        title,
        prompt,
        refs: refs.split(",").map((s) => s.trim()).filter(Boolean),
        repo_id: repo || undefined,
      });
      setNewOpen(false);
      setTitle(""); setPrompt(""); setRefs(""); setRepo("");
      reload();
    } finally {
      setCreating(false);
    }
  }

  const filtered = all.filter((t) =>
    matchState(state, t.status) &&
    (q === "" || (t.title + t.id + (t.repo_id ?? "")).toLowerCase().includes(q.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const pageLabel  = totalPages > 1 ? `${safePage + 1} / ${totalPages}` : "";

  return (
    <Page loading={loading}>
      <PageHead
        eyebrow="Operação"
        title="Tarefas"
        subtitle="Crie e acompanhe as tarefas dos workers."
        right={
          <button style={btn} onClick={() => setNewOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14"/></svg>
            Nova tarefa
          </button>
        }
      />

      {newOpen && (
        <Modal
          title="Nova tarefa"
          onClose={() => setNewOpen(false)}
          width={540}
          footer={
            <>
              <button style={{ ...btn, background: "transparent", border: "1px solid var(--border)", color: "var(--ink)" }} onClick={() => setNewOpen(false)}>
                Cancelar
              </button>
              <button style={{ ...btn, opacity: creating ? .6 : 1 }} onClick={create} disabled={creating}>
                {creating ? "Criando…" : "Criar → planejar"}
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Título</span>
              <input style={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Adicionar endpoint /health" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Prompt <span style={{ color: "var(--mute)", fontWeight: 400 }}>(instrução detalhada)</span></span>
              <textarea style={{ ...fieldStyle, minHeight: 88, resize: "vertical", lineHeight: 1.5 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Descreva o que o worker deve fazer…" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Refs <span style={{ color: "var(--mute)", fontWeight: 400 }}>(arquivos de contexto, separados por vírgula)</span></span>
              <input style={fieldStyle} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="README.md, main.go" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Repositório</span>
              <select style={{ ...fieldStyle, cursor: "pointer" }} value={repo} onChange={(e) => setRepo(e.target.value)}>
                <option value="">(sem repo — só planeja)</option>
                {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--mute)", lineHeight: 1.5 }}>
              Com repo: planeja → clona → coda → push → PR. Sem repo: só o plano.
            </p>
          </div>
        </Modal>
      )}

      <div style={card}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
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

          <Pills options={STATE_FILTERS} value={state} onChange={(v) => { setState(v); setPage(0); }} />

          <select value={source} onChange={(e) => setSource(e.target.value)} style={selStyle}>
            <option value="todas">Todas as fontes</option>
            <option>Jira</option>
            <option>Linear</option>
            <option>GitHub Issues</option>
            <option>Trello</option>
          </select>
        </div>

        {/* col headers */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={thCell}>Tarefa</span>
          <span style={{ ...thCell, paddingLeft: 12 }}>Título</span>
          <span style={{ ...thCell, paddingLeft: 12 }}>Repositório</span>
          <span style={thCell}>Estado</span>
        </div>

        {/* rows */}
        {rows.map((t) => (
          <div
            key={t.id}
            style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elev)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <span style={codeAmber}>{t.id.slice(-8)}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink)", paddingLeft: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", paddingLeft: 12 }}>
              {t.repo_id ? t.repo_id.slice(0, 28) : "—"}
            </span>
            <span style={badge(t.status)}>{t.status}</span>
          </div>
        ))}

        {!rows.length && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>nenhuma tarefa</div>
        )}

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
        background: "transparent", color: disabled ? "var(--border)" : "var(--dim)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
