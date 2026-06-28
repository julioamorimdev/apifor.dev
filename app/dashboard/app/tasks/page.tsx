"use client";
import { Fragment, useState } from "react";
import { apiGet, apiPost, badge, btn, card, CardHead, cell, codeAmber, input, Modal, Page, PageHead, tableStyle, usePoll, useT } from "../ui";

type Task = { id: string; title: string; status: string; assigned_worker_id?: string };
type Repo = { id: string; name: string };
type Step = { idx: number; type: string; label: string; status: string };
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };

export default function Tarefas() {
  const t = useT();
  const { data: tasks, reload } = usePoll<Task[]>("/v1/tasks");
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 5000);
  const [title, setTitle] = useState("Adicionar endpoint /health");
  const [prompt, setPrompt] = useState("Adicione um endpoint HTTP GET /health que retorna 200 ok no main.go.");
  const [refs, setRefs] = useState("README.md,main.go");
  const [repo, setRepo] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  async function create() {
    if (!title.trim()) return;
    await apiPost("/v1/tasks", { title, prompt, refs: refs.split(",").map((s) => s.trim()).filter(Boolean), repo_id: repo || undefined });
    setNewOpen(false); reload();
  }
  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    const r = await apiGet<{ data: Step[] }>(`/v1/tasks/${id}/steps`);
    setSteps(r.data || []);
  }

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Tarefas" subtitle="Crie e acompanhe as tarefas dos workers."
        right={<button style={btn} onClick={() => setNewOpen(true)}>+ {t("Nova tarefa")}</button>} />

      {newOpen && (
        <Modal title="Nova tarefa" onClose={() => setNewOpen(false)} width={560}
          footer={<><button style={{ ...btn, background: "var(--elev)", color: "var(--dim)" }} onClick={() => setNewOpen(false)}>{t("Cancelar", "Cancel")}</button><button style={btn} onClick={create}>{t("Criar → planejar")}</button></>}>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("título")} />
            <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("pedido (prompt — vira o template do relay)", "request (prompt — becomes the relay template)")} />
            <input style={input} value={refs} onChange={(e) => setRefs(e.target.value)} placeholder={t("refs (arquivos de contexto, separados por vírgula)", "refs (context files, comma-separated)")} />
            <select style={input} value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">{t("(sem repo — só planeja)", "(no repo — plan only)")}</option>
              {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <span style={{ color: "var(--mute)", fontSize: 12 }}>{t("Com repo: planeja → clona → coda → push → PR. Sem repo: só o plano.", "With repo: plan → clone → code → push → PR. No repo: plan only.")}</span>
          </div>
        </Modal>
      )}

      <div style={card}>
        <CardHead title="Tarefas" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(tasks || []).length} total</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={th}>{t("Tarefa")}</th><th style={th}>{t("Título")}</th><th style={th}>{t("Estado")}</th><th style={{ ...th, textAlign: "right" }}>{t("Plano", "Plan")}</th></tr></thead>
          <tbody>
            {(tasks || []).map((x) => (
              <Fragment key={x.id}>
                <tr>
                  <td style={cell}><span style={codeAmber}>{x.id.slice(-8)}</span></td>
                  <td style={cell}>{x.title}</td>
                  <td style={cell}><span style={badge(x.status)}>{x.status}</span></td>
                  <td style={{ ...cell, textAlign: "right" }}><a onClick={() => toggle(x.id)} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>{open === x.id ? t("ocultar") : t("ver plano")}</a></td>
                </tr>
                {open === x.id && (
                  <tr>
                    <td style={{ ...cell, background: "var(--bg)" }} colSpan={4}>
                      {steps.length ? (
                        <ol style={{ margin: 0, paddingLeft: 20, color: "var(--dim)", lineHeight: 1.9 }}>
                          {steps.map((s) => <li key={s.idx}><span style={badge(s.type === "exec" ? "running" : s.type)}>{s.type}</span> {s.label}</li>)}
                        </ol>
                      ) : <span style={{ color: "var(--mute)" }}>{t("sem plano ainda", "no plan yet")}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!tasks?.length && <tr><td style={cell} colSpan={4}>{t("nenhuma tarefa")}</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
