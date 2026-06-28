"use client";
import { useState } from "react";
import { apiDelete, apiPost, badge, btn, card, cell, input, Page, short, tableStyle, usePoll } from "../ui";

type Memory = { id: string; scope: string; repo_id: string; instruction: string; source: string };
type KB = { id: string; name: string; category: string; file_ref: string; indexed: boolean };
type Repo = { id: string; name: string };

export default function Knowledge() {
  const { data: memories, reload } = usePoll<Memory[]>("/v1/memories", 3000);
  const { data: kb } = usePoll<KB[]>("/v1/kb-documents", 3000);
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 5000);
  const [f, setF] = useState({ scope: "global", repo: "", instr: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function addMem() {
    if (!f.instr) return;
    await apiPost("/v1/memories", { scope: f.scope, repo_id: f.repo || undefined, instruction: f.instr });
    set("instr", ""); reload();
  }
  const delMem = async (id: string) => { await apiDelete(`/v1/memories/${id}`); reload(); };

  return (
    <Page>
      <h3 style={{ color: "var(--dim)" }}>Memória <span style={{ color: "var(--mute)", fontSize: 13 }}>(guia os agentes; injetada no plano)</span></h3>
      <div style={{ ...card, padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select style={{ ...input, width: 120 }} value={f.scope} onChange={(e) => set("scope", e.target.value)}>
          <option value="global">global</option>
          <option value="repo">repo</option>
        </select>
        {f.scope === "repo" && (
          <select style={{ ...input, width: 160 }} value={f.repo} onChange={(e) => set("repo", e.target.value)}>
            <option value="">(escolha o repo)</option>
            {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="instrução (ex.: sempre adicione testes)" value={f.instr} onChange={(e) => set("instr", e.target.value)} />
        <button style={btn} onClick={addMem}>Adicionar</button>
      </div>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>escopo</th><th style={cell}>instrução</th><th style={cell}>origem</th><th style={cell}></th></tr></thead>
          <tbody>
            {(memories || []).map((m) => (
              <tr key={m.id}>
                <td style={cell}><span style={badge(m.scope === "global" ? "open" : "idle")}>{m.scope}{m.repo_id ? " " + short(m.repo_id, 10) : ""}</span></td>
                <td style={cell}>{m.instruction}</td>
                <td style={cell}>{m.source}</td>
                <td style={cell}><a onClick={() => delMem(m.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>excluir</a></td>
              </tr>
            ))}
            {!memories?.length && <tr><td style={cell} colSpan={4}>nenhuma memória</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: "var(--dim)" }}>Base de conhecimento (KB)</h3>
      <div style={{ ...card, padding: "10px 16px", color: "var(--mute)", fontSize: 13 }}>
        O <b>arquivo</b> da KB fica local (vault/store), importado via IPC
        (<code>executor kb-import &lt;nome&gt; &lt;categoria&gt;</code>). A lista abaixo é só metadado;
        o agente lê o conteúdo localmente no planejamento.
      </div>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>nome</th><th style={cell}>categoria</th><th style={cell}>file_ref</th><th style={cell}>indexado</th></tr></thead>
          <tbody>
            {(kb || []).map((k) => (
              <tr key={k.id}>
                <td style={cell}>{k.name}</td>
                <td style={cell}>{k.category}</td>
                <td style={cell}><code style={{ fontSize: 12 }}>{k.file_ref || "—"}</code></td>
                <td style={cell}>{k.indexed ? "sim" : "não"}</td>
              </tr>
            ))}
            {!kb?.length && <tr><td style={cell} colSpan={4}>nenhum documento de KB</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
