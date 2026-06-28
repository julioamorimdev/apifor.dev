"use client";
import { useEffect, useState } from "react";
import { badge, card, Page, PageHead, short, sseURL, useT } from "../ui";

type Worker = { id: string; source: string; status: string; current_step: string; current_task_id?: string };
type Task = { id: string; title: string; status: string };

const RUN = new Set(["running", "busy", "active", "exec"]);

export default function Live() {
  const t = useT();
  const [d, setD] = useState<{ workers: Worker[]; tasks: Task[] }>({ workers: [], tasks: [] });
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource(sseURL("/v1/workers/stream"));
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => { try { setD(JSON.parse(e.data)); } catch {} };
    return () => es.close();
  }, []);

  const title = (id?: string) => d.tasks.find((x) => x.id === id)?.title || "";
  const tone = (s: string) => (s === "merged" || s === "done" ? "merged" : s === "failed" || s === "blocked" ? "failed" : RUN.has(s) ? "running" : "idle");

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Live" subtitle={`${d.workers.length} ${t("ativas", "active")} · ${t("progresso em tempo real de cada worker.", "real-time progress of each worker.")}`}
        right={<span style={{ ...badge(live ? "running" : "failed"), display: "flex", alignItems: "center", gap: 6 }}><span className={live ? "apf-live" : ""} style={{ width: 7, height: 7, borderRadius: 7, background: "currentColor" }} />{live ? "● live (SSE)" : "○ offline"}</span>} />

      {d.workers.map((w, i) => {
        const running = RUN.has(w.status);
        const col = `var(--${tone(w.status)})`;
        return (
          <div key={w.id} style={{ ...card, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--elev)", color: col, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>▮</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)", background: "var(--bg)", borderRadius: 5, padding: "2px 7px" }}>W-{String(i + 1).padStart(2, "0")}</span>
              {w.current_task_id && <span style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 600, fontSize: 13 }}>#{short(w.current_task_id.replace(/^tsk_/, ""), 6)}</span>}
              <b style={{ flex: 1, minWidth: 120 }}>{title(w.current_task_id) || t("ocioso", "idle")}</b>
              <span style={badge(w.status)}>{w.status}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "11px 0 4px" }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mute)" }}>{w.source}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 6, background: "var(--border)", overflow: "hidden", position: "relative" }}>
                {running && <div style={{ position: "absolute", inset: 0, width: "38%", background: `linear-gradient(90deg, transparent, ${col}, transparent)`, animation: "barflow 1.6s linear infinite" }} />}
                {!running && <div style={{ width: w.status === "merged" || w.status === "done" ? "100%" : "0%", height: "100%", background: col }} />}
              </div>
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>› {w.current_step || t("aguardando…", "waiting…")}</div>
          </div>
        );
      })}
      {!d.workers.length && (
        <div style={{ ...card, padding: 28, textAlign: "center", color: "var(--mute)" }}>
          {t("nenhum worker ligado", "no worker connected")} — {t("suba o executor e crie uma tarefa.", "start the executor and create a task.")}
        </div>
      )}
    </Page>
  );
}
