"use client";
import { useState } from "react";
import { apiDelete, apiPost, badge, btn, card, CardHead, cell, input, Page, PageHead, tableStyle, thCell, usePoll, useT } from "../ui";

type Routine = {
  id: string; name: string; trigger: string; interval_sec: number;
  enabled: boolean; last_run: string; action_title: string;
};
type Repo = { id: string; name: string };

export default function Rotinas() {
  const t = useT();
  const { data: routines, reload } = usePoll<Routine[]>("/v1/routines", 2500);
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 5000);
  const [f, setF] = useState({ name: "", trigger: "manual", interval: "30", prompt: "", repo: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function create() {
    if (!f.name || !f.prompt) return;
    await apiPost("/v1/routines", {
      name: f.name, trigger: f.trigger, interval_sec: Number(f.interval) || 0,
      prompt: f.prompt, repo_id: f.repo || undefined,
    });
    set("name", ""); set("prompt", ""); reload();
  }
  const act = async (id: string, a: string) => { await apiPost(`/v1/routines/${id}/${a}`, {}); reload(); };
  const del = async (id: string) => { await apiDelete(`/v1/routines/${id}`); reload(); };

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Rotinas" subtitle="Gatilhos agendados e manuais." />

      <div style={card}>
        <CardHead title="Nova rotina" />
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...input, flex: 1, minWidth: 140 }} placeholder={t("nome")} value={f.name} onChange={(e) => set("name", e.target.value)} />
            <select style={{ ...input, width: 130 }} value={f.trigger} onChange={(e) => set("trigger", e.target.value)}>
              <option value="manual">manual</option>
              <option value="schedule">schedule</option>
            </select>
            {f.trigger === "schedule" && <input style={{ ...input, width: 120 }} type="number" placeholder="intervalo (s)" value={f.interval} onChange={(e) => set("interval", e.target.value)} />}
            <select style={{ ...input, width: 160 }} value={f.repo} onChange={(e) => set("repo", e.target.value)}>
              <option value="">(sem repo — só planeja)</option>
              {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <textarea style={{ ...input, minHeight: 56, resize: "vertical" }} placeholder="prompt (ação da rotina)" value={f.prompt} onChange={(e) => set("prompt", e.target.value)} />
          <button style={{ ...btn, width: 160 }} onClick={create}>{t("Criar rotina")}</button>
        </div>
      </div>

      <div style={card}>
        <CardHead title="Rotinas" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(routines || []).length}</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Nome")}</th><th style={thCell}>{t("Trigger")}</th><th style={thCell}>{t("Estado")}</th><th style={thCell}>{t("Último")}</th><th style={{ ...thCell, textAlign: "right" }}>{t("Ações")}</th></tr></thead>
          <tbody>
            {(routines || []).map((rt) => (
              <tr key={rt.id}>
                <td style={cell}>{rt.name}</td>
                <td style={cell}>{rt.trigger}{rt.trigger === "schedule" ? ` (${rt.interval_sec}s)` : ""}</td>
                <td style={cell}><span style={badge(rt.enabled ? "open" : "idle")}>{rt.enabled ? "ativa" : "off"}</span></td>
                <td style={cell}>{rt.last_run || "—"}</td>
                <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                  <a onClick={() => act(rt.id, "run")} style={{ color: "var(--green)", cursor: "pointer", fontSize: 13, marginRight: 10 }}>{t("run")}</a>
                  <a onClick={() => act(rt.id, rt.enabled ? "disable" : "enable")} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13, marginRight: 10 }}>{rt.enabled ? "pausar" : "ativar"}</a>
                  <a onClick={() => del(rt.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>{t("excluir")}</a>
                </td>
              </tr>
            ))}
            {!routines?.length && <tr><td style={cell} colSpan={5}>{t("nenhuma rotina")}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--mute)", fontSize: 13 }}>
        <b>manual</b>: dispara com “run”. <b>schedule</b>: o cérebro dispara a cada N segundos
        (cria a tarefa e roda o relay). Tudo server-side.
      </p>
    </Page>
  );
}
