"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, badge, Page, PageHead, short, sseURL } from "../ui";

type Worker = {
  id: string; source: string; host: string; status: string;
  current_step: string; current_task_id: string;
};
type Task = { id: string; title: string; status: string };
type PoolCfg = { paused: boolean };

const RUNNING = new Set(["running", "busy", "active", "exec"]);

function workerColor(s: string) {
  if (RUNNING.has(s))                    return "var(--accent)";
  if (s === "merged" || s === "done")    return "var(--green)";
  if (s === "failed" || s === "blocked") return "var(--red)";
  if (s === "paused")                    return "var(--orange)";
  return "var(--mute)";
}

// 3-bar dotpulse visualizer
function Bars({ color, animate }: { color: string; animate: boolean }) {
  const bar = (h: string, delay: string): React.CSSProperties => ({
    width: 3, borderRadius: 2, background: color, height: h, transformOrigin: "bottom",
    ...(animate ? { animation: `dotpulse 1s ease-in-out ${delay} infinite` } : {}),
  });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 15, width: 15, flexShrink: 0, color }}>
      <span style={bar("45%", "0s")} />
      <span style={bar("90%", ".18s")} />
      <span style={bar("65%", ".36s")} />
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  height: 28, padding: "0 11px", borderRadius: 7,
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--dim)", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
};

export default function Live() {
  const [d, setD] = useState<{ workers: Worker[]; tasks: Task[] }>({ workers: [], tasks: [] });
  const [live, setLive] = useState(false);
  const [pool, setPool] = useState<PoolCfg | null>(null);

  const loadPool = useCallback(() => {
    apiGet<PoolCfg>("/v1/pool").then((x) => { if (!(x as any)?.error) setPool(x); }).catch(() => {});
  }, []);

  const [loading, setLoading] = useState(true);
  useEffect(() => { if (pool !== null) setLoading(false); }, [pool]);

  useEffect(() => {
    loadPool();
    const t = setInterval(loadPool, 5000);
    return () => clearInterval(t);
  }, [loadPool]);

  useEffect(() => {
    const es = new EventSource(sseURL("/v1/workers/stream"));
    es.onopen  = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => { try { setD(JSON.parse(e.data)); } catch {} };
    return () => es.close();
  }, []);

  const taskTitle = (id: string) => d.tasks.find((x) => x.id === id)?.title ?? "";
  const paused = pool?.paused ?? false;
  const poolColor = live && !paused ? "var(--green)" : paused ? "var(--orange)" : "var(--mute)";
  const poolWord  = paused ? "PAUSADO" : live ? "RODANDO" : "OFFLINE";
  const nWorkers  = d.workers.length;
  const nRunning  = d.workers.filter((w) => RUNNING.has(w.status)).length;

  return (
    <Page loading={loading}>
      <PageHead
        eyebrow="Operação"
        title="Live"
        subtitle={`Progresso em tempo real de cada worker · ${nWorkers} ativo(s) · ${nWorkers - nRunning} slot(s) livre(s).`}
        right={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: poolColor }} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".04em", color: poolColor }}>{poolWord}</span>
          </span>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {d.workers.map((w, i) => {
          const col     = workerColor(w.status);
          const running = RUNNING.has(w.status);
          const isPaused = w.status === "paused";
          const taskId  = w.current_task_id;
          const title   = taskTitle(taskId) || (running ? "processando…" : "ocioso");

          return (
            <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: "13px 15px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--card)", boxShadow: "var(--shadow)" }}>

              {/* row 1: bars + id chip + [paused] + task + title + pill */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Bars color={col} animate={running} />

                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                  W-{String(i + 1).padStart(2, "0")}
                </span>

                {isPaused && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "1px 7px 1px 6px", borderRadius: 999, background: "var(--red-tint)", border: "1px solid rgba(248,81,73,.3)", color: "var(--red)", fontSize: 10, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" }}>
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                    pausado
                  </span>
                )}

                {taskId && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 500, flexShrink: 0 }}>
                    #{short(taskId.replace(/^tsk_/, ""), 6)}
                  </span>
                )}

                <span style={{ fontSize: 12.5, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </span>

                <span style={badge(w.status)}>{w.status}</span>
              </div>

              {/* row 2: source + model chip + progress bar + elapsed */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", flexShrink: 0 }}>
                  {w.source}<span style={{ color: "var(--mute)" }}>:{w.host}</span>
                </span>

                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dim)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 1, background: "var(--accent)", transform: "rotate(45deg)" }} />
                  {w.source}
                </span>

                {/* progress bar */}
                <div style={{ flex: 1, minWidth: 90, height: 6, borderRadius: 4, background: "var(--elev)", overflow: "hidden", position: "relative" }}>
                  {running && (
                    <div style={{ position: "absolute", inset: 0, width: "100%", background: col, opacity: .25 }}>
                      <span style={{ position: "absolute", inset: 0, width: "40%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.4),transparent)", animation: "barflow 1.8s linear infinite" }} />
                    </div>
                  )}
                  {!running && w.status === "merged" && (
                    <div style={{ width: "100%", height: "100%", background: col }} />
                  )}
                </div>

                <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", flexShrink: 0, width: 34, textAlign: "right" }}>
                  {running ? "●" : w.status === "merged" ? "✓" : "—"}
                </span>
              </div>

              {/* row 3: current step */}
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "var(--dim)" }}>›</span>
                {w.current_step || "aguardando…"}
              </div>

              {/* row 4: action buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button style={ghostBtn} title="Linha do tempo em tempo real">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                  </svg>
                  Linha do tempo
                </button>
                <button style={ghostBtn}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>
                  </svg>
                  Abrir terminal
                </button>
              </div>
            </div>
          );
        })}

        {/* empty state */}
        {!d.workers.length && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--mute)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 11, fontSize: 13 }}>
            nenhum worker conectado — suba o executor e crie uma tarefa.
          </div>
        )}
      </div>

      {/* SSE status footer */}
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: live ? "var(--green)" : "var(--mute)" }}>
          <span className={live ? "apf-live" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
          {live ? "SSE conectado" : "SSE offline"}
        </span>
      </div>
    </Page>
  );
}
