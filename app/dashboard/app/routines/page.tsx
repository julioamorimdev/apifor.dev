"use client";
import { useState } from "react";
import { apiDelete, apiPost, badge, btn, card, CardHead, input, Modal, Page, PageHead, usePoll, useT } from "../ui";

type Routine = {
  id: string; name: string; trigger: string; interval_sec: number;
  enabled: boolean; last_run: string; action_title: string;
};
type Repo = { id: string; name: string };

export default function Rotinas() {
  const t = useT();
  const { data: routines, reload } = usePoll<Routine[]>("/v1/routines", 2500);
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 5000);
  const [newOpen, setNewOpen] = useState(false);
  const [f, setF] = useState({ name: "", trigger: "manual", interval: "30", prompt: "", repo: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function create() {
    if (!f.name || !f.prompt) return;
    await apiPost("/v1/routines", { name: f.name, trigger: f.trigger, interval_sec: Number(f.interval) || 0, prompt: f.prompt, repo_id: f.repo || undefined });
    set("name", ""); set("prompt", ""); setNewOpen(false); reload();
  }
  const act = async (id: string, a: string) => { await apiPost(`/v1/routines/${id}/${a}`, {}); reload(); };
  const del = async (id: string) => { await apiDelete(`/v1/routines/${id}`); reload(); };

  const list = routines || [];
  const sched = (r: Routine) => (r.trigger === "schedule" ? t("A cada", "Every") + ` ${r.interval_sec}s` : t("Manual", "Manual"));

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Rotinas" subtitle="Gatilhos agendados e manuais."
        right={<button style={btn} onClick={() => setNewOpen(true)}>+ {t("Nova rotina")}</button>} />

      {newOpen && (
        <Modal title="Nova rotina" onClose={() => setNewOpen(false)}
          footer={<><button style={{ ...btn, background: "var(--elev)", color: "var(--dim)" }} onClick={() => setNewOpen(false)}>{t("Cancelar", "Cancel")}</button><button style={btn} onClick={create}>{t("Criar rotina")}</button></>}>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={input} placeholder={t("nome")} value={f.name} onChange={(e) => set("name", e.target.value)} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <select style={{ ...input, flex: 1 }} value={f.trigger} onChange={(e) => set("trigger", e.target.value)}>
                <option value="manual">manual</option>
                <option value="schedule">schedule</option>
              </select>
              {f.trigger === "schedule" && <input style={{ ...input, width: 140 }} type="number" placeholder={t("intervalo (s)", "interval (s)")} value={f.interval} onChange={(e) => set("interval", e.target.value)} />}
              <select style={{ ...input, flex: 1 }} value={f.repo} onChange={(e) => set("repo", e.target.value)}>
                <option value="">{t("(sem repo — só planeja)", "(no repo — plan only)")}</option>
                {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} placeholder={t("prompt (ação da rotina)", "prompt (routine action)")} value={f.prompt} onChange={(e) => set("prompt", e.target.value)} />
          </div>
        </Modal>
      )}

      <div style={card}>
        <CardHead title="Rotinas agendadas" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{list.length}</span>} />
        {list.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-tint)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>⏱</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div style={{ color: "var(--mute)", fontSize: 12.5, fontFamily: "var(--mono)" }}>{sched(r)} · {t("Última", "Last")}: {r.last_run || "—"}</div>
            </div>
            <span style={badge(r.enabled ? "open" : "idle")}>{r.enabled ? t("ativa", "active") : t("pausada", "paused")}</span>
            <div style={{ display: "flex", gap: 10, whiteSpace: "nowrap" }}>
              <a onClick={() => act(r.id, "run")} style={{ color: "var(--green)", cursor: "pointer", fontSize: 13 }}>{t("run")}</a>
              <a onClick={() => act(r.id, r.enabled ? "disable" : "enable")} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>{r.enabled ? t("pausar") : t("ativar")}</a>
              <a onClick={() => del(r.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>{t("excluir")}</a>
            </div>
          </div>
        ))}
        {!list.length && <div style={{ padding: 20, color: "var(--mute)" }}>{t("nenhuma rotina")}</div>}
      </div>

      <p style={{ color: "var(--mute)", fontSize: 13 }}>
        {t("manual: dispara com “run”. schedule: o cérebro dispara a cada N segundos (cria a tarefa e roda o relay). Tudo server-side.",
          "manual: triggers with “run”. schedule: the brain fires every N seconds (creates the task and runs the relay). All server-side.")}
      </p>
    </Page>
  );
}
