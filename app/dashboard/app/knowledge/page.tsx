"use client";
import { useState } from "react";
import { apiDelete, apiPost, badge, btn, card, CardHead, cell, codeDim, input, Page, PageHead, short, tableStyle, thCell, usePoll } from "../ui";

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
      <PageHead eyebrow="Conhecimento & sistema" title="Conhecimento" subtitle="Memória e base de conhecimento." />

      <div style={card}>
        <CardHead title="Memória" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>guia os agentes · injetada no plano</span>} />
        <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
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
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Escopo</th><th style={thCell}>Instrução</th><th style={thCell}>Origem</th><th style={{ ...thCell, textAlign: "right" }}></th></tr></thead>
          <tbody>
            {(memories || []).map((m) => (
              <tr key={m.id}>
                <td style={cell}><span style={badge(m.scope === "global" ? "open" : "idle")}>{m.scope}{m.repo_id ? " " + short(m.repo_id, 10) : ""}</span></td>
                <td style={cell}>{m.instruction}</td>
                <td style={cell}>{m.source}</td>
                <td style={{ ...cell, textAlign: "right" }}><a onClick={() => delMem(m.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>excluir</a></td>
              </tr>
            ))}
            {!memories?.length && <tr><td style={cell} colSpan={4}>nenhuma memória</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <CardHead title="Base de conhecimento (KB)" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(kb || []).length} doc(s)</span>} />
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
          O <b>arquivo</b> fica local (vault/store), importado via IPC
          (<code>executor kb-import &lt;nome&gt; &lt;categoria&gt;</code>). Abaixo só o metadado;
          o agente lê o conteúdo localmente no planejamento.
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Nome</th><th style={thCell}>Categoria</th><th style={thCell}>file_ref</th><th style={thCell}>Indexado</th></tr></thead>
          <tbody>
            {(kb || []).map((k) => (
              <tr key={k.id}>
                <td style={cell}>{k.name}</td>
                <td style={cell}>{k.category}</td>
                <td style={cell}><span style={codeDim}>{k.file_ref || "—"}</span></td>
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
