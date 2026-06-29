"use client";
import { useEffect, useState } from "react";
import { apiDelete, apiPost, btn, Modal, Page, PageHead, usePoll } from "../ui";

type Routine = {
  id: string; name: string; trigger: string; interval_sec: number;
  enabled: boolean; last_run: string; next_run: string; action_title: string;
};
type Repo = { id: string; name: string };

const PAGE_SIZE = 20;

function fmtTime(iso: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) {
    const s = Math.ceil(-diff / 1000);
    if (s < 60)   return `em ${s}s`;
    const m = Math.ceil(s / 60);
    if (m < 60)   return `em ${m}m`;
    return `em ${Math.ceil(m / 60)}h`;
  }
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function schedLabel(r: Routine) {
  if (r.trigger === "schedule") {
    const s = r.interval_sec;
    if (!s)       return "schedule";
    if (s < 60)   return `A cada ${s}s`;
    if (s < 3600) return `A cada ${Math.round(s / 60)}min`;
    return `A cada ${Math.round(s / 3600)}h`;
  }
  return "Manual";
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%", background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--border)",
  borderRadius: 9, padding: "10px 12px", fontSize: 13, outline: "none",
};

export default function Rotinas() {
  const { data: routines, reload } = usePoll<Routine[]>("/v1/routines", 2500);
  const { data: repos }             = usePoll<Repo[]>("/v1/repos", 5000);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (routines !== undefined) setLoading(false); }, [routines]);
  const list = routines || [];

  const [page, setPage]         = useState(0);
  const [newOpen, setNewOpen]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: "", trigger: "manual", interval: "30", prompt: "", repo: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function create() {
    if (!f.name || !f.prompt) return;
    setCreating(true);
    try {
      await apiPost("/v1/routines", { name: f.name, trigger: f.trigger, interval_sec: Number(f.interval) || 0, prompt: f.prompt, repo_id: f.repo || undefined });
      setF({ name: "", trigger: "manual", interval: "30", prompt: "", repo: "" });
      setNewOpen(false);
      reload();
    } finally {
      setCreating(false);
    }
  }

  const del = async (id: string) => { await apiDelete(`/v1/routines/${id}`); reload(); };
  const act = async (id: string, a: string) => { await apiPost(`/v1/routines/${id}/${a}`, {}); reload(); };

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = list.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="Rotinas"
        subtitle="Tarefas agendadas e varreduras recorrentes."
        right={
          <button onClick={() => setNewOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 13px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elev)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Nova rotina
          </button>
        }
      />

      {newOpen && (
        <Modal title="Nova rotina" onClose={() => setNewOpen(false)}
          footer={
            <>
              <button onClick={() => setNewOpen(false)} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={create} disabled={creating} style={{ ...btn, opacity: creating ? .6 : 1 }}>
                {creating ? "Criando…" : "Criar rotina"}
              </button>
            </>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Nome</span>
              <input style={fieldStyle} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Varredura de segurança" />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Gatilho</span>
                <select style={{ ...fieldStyle, cursor: "pointer" }} value={f.trigger} onChange={(e) => set("trigger", e.target.value)}>
                  <option value="manual">manual</option>
                  <option value="schedule">schedule</option>
                </select>
              </label>
              {f.trigger === "schedule" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 5, width: 140 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Intervalo (s)</span>
                  <input style={fieldStyle} type="number" value={f.interval} onChange={(e) => set("interval", e.target.value)} />
                </label>
              )}
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Repositório</span>
                <select style={{ ...fieldStyle, cursor: "pointer" }} value={f.repo} onChange={(e) => set("repo", e.target.value)}>
                  <option value="">(sem repo — só planeja)</option>
                  {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Prompt <span style={{ color: "var(--mute)", fontWeight: 400 }}>(ação da rotina)</span></span>
              <textarea style={{ ...fieldStyle, minHeight: 80, resize: "vertical", lineHeight: 1.5 }} value={f.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder="Descreva o que o worker deve fazer…" />
            </label>
          </div>
        </Modal>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>

        {/* card header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Rotinas agendadas</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mute)" }}>{list.length}</span>
        </div>

        {/* routine rows */}
        {rows.map((r) => {
          const pillColor   = r.enabled ? "var(--green)"      : "var(--mute)";
          const pillBg      = r.enabled ? "var(--green-tint)" : "var(--border)";
          const statusLabel = r.enabled ? "ativa"             : "pausada";

          return (
            <div key={r.id}
              style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>

              {/* top row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l2.8 1.7"/>
                  </svg>
                </span>

                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{schedLabel(r)}</div>
                </div>

                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: pillColor, background: pillBg, flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: pillColor }} />
                  {statusLabel}
                </span>

                <button onClick={() => act(r.id, r.enabled ? "disable" : "enable")}
                  style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elev)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  {r.enabled ? "Pausar" : "Ativar"}
                </button>

                <button onClick={() => del(r.id)}
                  style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--red-tint)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  Excluir
                </button>
              </div>

              {/* meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l2.8 1.7"/>
                  </svg>
                  Última: <span style={{ color: "var(--ink)" }}>{fmtTime(r.last_run)}</span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l2.8 1.7"/>
                  </svg>
                  Próxima: <span style={{ color: "var(--ink)" }}>{fmtTime(r.next_run)}</span>
                </span>
              </div>
            </div>
          );
        })}

        {!rows.length && (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>
            nenhuma rotina
          </div>
        )}

        {/* pagination footer */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{list.length} rotinas</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </NavBtn>
              <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </NavBtn>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}
