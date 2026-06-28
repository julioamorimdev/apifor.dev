"use client";
import { Fragment, useState } from "react";
import { apiGet, apiPost, badge, btn, card, CardHead, cell, codeAmber, input, Page, PageHead, tableStyle, usePoll } from "../ui";

type Task = { id: string; title: string; status: string; assigned_worker_id?: string };
type Repo = { id: string; name: string };
type Step = { idx: number; type: string; label: string; status: string };
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };

export default function Tarefas() {
  const { data: tasks, reload } = usePoll<Task[]>("/v1/tasks");
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 5000);
  const [title, setTitle] = useState("Adicionar endpoint /health");
  const [prompt, setPrompt] = useState("Adicione um endpoint HTTP GET /health que retorna 200 ok no main.go.");
  const [refs, setRefs] = useState("README.md,main.go");
  const [repo, setRepo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  async function create() {
    if (!title.trim()) return;
    await apiPost("/v1/tasks", { title, prompt, refs: refs.split(",").map((s) => s.trim()).filter(Boolean), repo_id: repo || undefined });
    reload();
  }
  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    const r = await apiGet<{ data: Step[] }>(`/v1/tasks/${id}/steps`);
    setSteps(r.data || []);
  }

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Tarefas" subtitle="Crie e acompanhe as tarefas dos workers." />

      <div style={card}>
        <CardHead title="Nova tarefa" />
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="título" />
          <textarea style={{ ...input, minHeight: 64, resize: "vertical" }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="pedido (prompt — vira o template do relay)" />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...input, flex: 2, minWidth: 180 }} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="refs (arquivos de contexto, separados por vírgula)" />
            <select style={{ ...input, flex: 1, minWidth: 160 }} value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">(sem repo — só planeja)</option>
              {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button style={btn} onClick={create}>Criar → planejar</button>
          </div>
          <span style={{ color: "var(--mute)", fontSize: 12 }}>Com repo: planeja → clona → coda → push → PR. Sem repo: só o plano.</span>
        </div>
      </div>

      <div style={card}>
        <CardHead title="Tarefas" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(tasks || []).length} total</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={th}>Tarefa</th><th style={th}>Título</th><th style={th}>Estado</th><th style={{ ...th, textAlign: "right" }}>Plano</th></tr></thead>
          <tbody>
            {(tasks || []).map((t) => (
              <Fragment key={t.id}>
                <tr>
                  <td style={cell}><span style={codeAmber}>{t.id.slice(-8)}</span></td>
                  <td style={cell}>{t.title}</td>
                  <td style={cell}><span style={badge(t.status)}>{t.status}</span></td>
                  <td style={{ ...cell, textAlign: "right" }}><a onClick={() => toggle(t.id)} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>{open === t.id ? "ocultar" : "ver plano"}</a></td>
                </tr>
                {open === t.id && (
                  <tr>
                    <td style={{ ...cell, background: "var(--bg)" }} colSpan={4}>
                      {steps.length ? (
                        <ol style={{ margin: 0, paddingLeft: 20, color: "var(--dim)", lineHeight: 1.9 }}>
                          {steps.map((s) => <li key={s.idx}><span style={badge(s.type === "exec" ? "running" : s.type)}>{s.type}</span> {s.label}</li>)}
                        </ol>
                      ) : <span style={{ color: "var(--mute)" }}>sem plano ainda</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!tasks?.length && <tr><td style={cell} colSpan={4}>nenhuma tarefa</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
