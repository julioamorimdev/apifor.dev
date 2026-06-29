"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, card, codeAmber, Page, PageHead, Pills, short, usePoll } from "../ui";

type Intervention = {
  task_id: string; title: string; branch: string;
  ci_status: string; ai_review_status: string; created_at: string;
};
type Task = { id: string; title: string; status: string; repo_id?: string };
type PoolCfg = { paused: boolean; parallel_workers: number };

const PAGE_SIZE = 20;

const FILTERS: [string, string][] = [
  ["todos",    "Todos"],
  ["decisao",  "Decisões"],
  ["bloqueada","Bloqueadas"],
];

function age(iso: string) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ── action buttons ───────────────────────────────────────────
const ghostBtn: React.CSSProperties = {
  height: 32, padding: "0 13px", borderRadius: 8, border: "1px solid var(--border)",
  background: "transparent", color: "var(--dim)", fontSize: 12, fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 6,
};

export default function Intervencao() {
  const { data: ints, reload: reloadInts } = usePoll<Intervention[]>("/v1/interventions", 2000);
  const { data: tasks }                     = usePoll<Task[]>("/v1/tasks", 3000);
  const { data: workers }                   = usePoll<{ id: string }[]>("/v1/workers", 3000);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (ints !== undefined) setLoading(false); }, [ints]);

  const [pool, setPool]     = useState<PoolCfg | null>(null);
  const [toggling, setT]    = useState(false);
  const [q, setQ]           = useState("");
  const [filter, setFilter] = useState("todos");
  const [page, setPage]     = useState(0);

  const loadPool = useCallback(() => {
    apiGet<PoolCfg>("/v1/pool").then((x) => { if (!(x as any)?.error) setPool(x); }).catch(() => {});
  }, []);
  useEffect(() => { loadPool(); const t = setInterval(loadPool, 3000); return () => clearInterval(t); }, [loadPool]);

  async function togglePool() {
    if (!pool) return;
    setT(true);
    try { await apiPost("/v1/pool", { ...pool, paused: !pool.paused }); loadPool(); }
    finally { setT(false); }
  }

  async function answer(taskId: string, decision: "approve" | "reject") {
    await apiPost(`/v1/interventions/${taskId}/answer`, { decision });
    reloadInts();
  }

  const intList   = ints   || [];
  const taskList  = tasks  || [];
  const nWorkers  = (workers || []).length;
  const paused    = pool?.paused ?? false;
  const running   = !paused && nWorkers > 0;
  const poolColor = running ? "var(--green)" : paused ? "var(--orange)" : "var(--mute)";
  const poolWord  = running ? "RODANDO" : paused ? "PAUSADO" : "PARADO";
  const poolSub   = running
    ? `${nWorkers} worker(s) ativo(s) · gates server-side`
    : paused
    ? "Pool pausado · novas tarefas aguardam na fila"
    : "Nenhum worker ativo";

  // merge decision + blocked items
  const intIds = new Set(intList.map((i) => i.task_id));
  type Item = { id: string; kind: "decisao" | "bloqueada"; title: string; repo: string; agent: string; age: string; reason: string; ci?: string; ai?: string };
  const decisions: Item[] = intList.map((i) => ({
    id: i.task_id, kind: "decisao",
    title: i.title,
    repo: short(i.branch, 20),
    agent: short(i.task_id.replace(/^tsk_/, "#"), 8),
    age: age(i.created_at),
    reason: `CI: ${i.ci_status || "—"} · IA: ${i.ai_review_status || "—"} — aguardando aprovação humana antes do merge.`,
    ci: i.ci_status, ai: i.ai_review_status,
  }));
  const blocked: Item[] = taskList
    .filter((t) => (t.status === "blocked" || t.status === "failed") && !intIds.has(t.id))
    .map((t) => ({
      id: t.id, kind: "bloqueada",
      title: t.title,
      repo: short(t.repo_id || "", 20),
      agent: short(t.id.replace(/^tsk_/, "#"), 8),
      age: "",
      reason: `Tarefa com status "${t.status}" — acione o agente de correção ou reprocesse.`,
    }));

  const allItems = [...decisions, ...blocked];

  const filtered = allItems
    .filter((i) => filter === "todos" || i.kind === filter)
    .filter((i) => q === "" || (i.title + i.id + i.repo).toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="Intervenção" subtitle="Pausar e retomar o pool, e disparar ações manuais." />

      {/* pool status card */}
      <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ position: "relative", width: 14, height: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {(running || paused) && (
            <span style={{ position: "absolute", inset: -4, borderRadius: "50%", background: poolColor, opacity: .28, animation: "pulsering 2.4s ease-out infinite" }} />
          )}
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: poolColor, boxShadow: `0 0 12px ${poolColor}` }} />
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: poolColor, letterSpacing: ".01em" }}>{poolWord}</div>
          <div style={{ fontSize: 12.5, color: "var(--dim)" }}>{poolSub}</div>
        </div>
        <button
          onClick={togglePool}
          disabled={toggling || !pool}
          style={{
            height: 36, padding: "0 16px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8,
            background: paused ? "var(--green)" : "var(--red-tint)",
            color: paused ? "#fff" : "var(--red)",
            opacity: toggling ? .6 : 1,
          }}
        >
          {paused ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          )}
          {paused ? "Retomar pool" : "Pausar pool"}
        </button>
      </div>

      {/* precisa de atenção */}
      <div style={{ ...card, marginBottom: 16 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>
          </svg>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flex: 1 }}>Precisa de atenção</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--red)", background: "var(--red-tint)", borderRadius: 6, padding: "2px 8px" }}>
            {allItems.length}
          </span>
        </div>

        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 160 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Buscar por tarefa, repo ou worker…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", fontSize: 12.5 }}
            />
          </div>
          <Pills options={FILTERS} value={filter} onChange={(v) => { setFilter(v); setPage(0); }} />
        </div>

        {/* rows */}
        {rows.map((item) => (
          <div
            key={item.id}
            style={{
              borderLeft: `3px solid ${item.kind === "decisao" ? "var(--accent)" : "var(--red)"}`,
              borderBottom: "1px solid var(--border)",
              padding: "14px 16px",
              display: "flex", flexDirection: "column", gap: 8,
            }}
          >
            {/* row header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* kind badge */}
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: 6,
                background: item.kind === "decisao" ? "var(--accent-tint)" : "var(--red-tint)",
                color: item.kind === "decisao" ? "var(--accent)" : "var(--red)",
              }}>
                {item.kind === "decisao" ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                ) : (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                )}
                {item.kind === "decisao" ? "Decisão humana" : "Bloqueada"}
              </span>
              <span style={codeAmber}>{short(item.id.replace(/^tsk_/, "#"), 8)}</span>
              <span style={{ fontSize: 12.5, color: "var(--ink)", flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.title}
              </span>
              {item.repo && (
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", whiteSpace: "nowrap" }}>
                  {item.repo} · {item.agent}
                </span>
              )}
              {item.age && (
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", whiteSpace: "nowrap" }}>
                  há {item.age}
                </span>
              )}
            </div>

            {/* reason */}
            <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.5 }}>{item.reason}</span>

            {/* actions */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {item.kind === "decisao" ? (
                <>
                  <button
                    onClick={() => answer(item.id, "approve")}
                    style={{ height: 32, padding: "0 13px", borderRadius: 8, border: "none", background: "var(--green)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    Aprovar merge
                  </button>
                  <button
                    onClick={() => answer(item.id, "reject")}
                    style={{ height: 32, padding: "0 13px", borderRadius: 8, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    Reprovar
                  </button>
                </>
              ) : (
                <>
                  <button style={{ ...ghostBtn, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v4M3 5h4M6 17v4M4 19h4"/><path d="M13 3l2.4 6.1L22 12l-6.6 2.9L13 21l-2.4-6.1L4 12l6.6-2.9z"/></svg>
                    Chamar agente de correção
                  </button>
                  <button style={ghostBtn}>Reprocessar</button>
                </>
              )}
              {/* eye button — future: show worker path */}
              <button
                title="Ver caminho do worker"
                style={{ ...ghostBtn, width: 32, padding: 0, marginLeft: "auto", flexShrink: 0 }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                </svg>
              </button>
            </div>
          </div>
        ))}

        {/* empty state */}
        {!rows.length && (
          <div style={{ padding: "34px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>
            </svg>
            <span style={{ fontSize: 13, color: "var(--dim)" }}>Nada pendente neste filtro.</span>
            <span style={{ fontSize: 11.5, color: "var(--mute)" }}>O pipeline está fluindo sem intervenções.</span>
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>{filtered.length} itens · página {safePage + 1}/{totalPages}</span>
            <div style={{ display: "flex", gap: 6 }}>
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

      {/* ações manuais */}
      <div style={{ ...card, padding: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mute)", display: "block", marginBottom: 11 }}>
          Ações manuais
        </span>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <button style={ghostBtn}>Forçar processar fila</button>
          <button style={ghostBtn}>Reprocessar bloqueadas</button>
          <button style={ghostBtn}>Limpar retries</button>
        </div>
      </div>
    </Page>
  );
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 8, border: "1px solid var(--border)", background: "transparent",
      color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer",
    }}>
      {children}
    </button>
  );
}
