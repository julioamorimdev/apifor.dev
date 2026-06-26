"use client";
import { useEffect, useState } from "react";

type Worker = { id: string; source: string; status: string; current_step: string };
type Task = { id: string; title: string; status: string };

const badge = (s: string) => {
  const c: Record<string, string> = { merged: "#3FB950", running: "#5BA9FF", idle: "#9BA1A9", queued: "#E3B341", failed: "#F85149" };
  return { background: (c[s] || "#9BA1A9") + "22", color: c[s] || "#9BA1A9", padding: "2px 8px", borderRadius: 6, fontSize: 12 };
};

export default function Live() {
  const [d, setD] = useState<{ workers: Worker[]; tasks: Task[] }>({ workers: [], tasks: [] });
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource("/api/v1/workers/stream");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => setD(JSON.parse(e.data));
    return () => es.close();
  }, []);

  const cell = { padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.07)", textAlign: "left" as const };
  const card = { background: "#15171C", borderRadius: 10, overflow: "hidden", marginBottom: 24 };

  return (
    <main style={{ maxWidth: 820, margin: "6vh auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ color: "#F5A623", margin: 0 }}>apiforDEV</h1>
        <span style={badge(live ? "running" : "failed")}>{live ? "● live" : "○ offline"}</span>
        <span style={{ color: "#697079", fontSize: 13 }}>M1 — Live</span>
      </div>

      <h3 style={{ color: "#9BA1A9" }}>Workers</h3>
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: "#E8EAED", fontSize: 14 }}>
          <thead><tr><th style={cell}>id</th><th style={cell}>source</th><th style={cell}>status</th><th style={cell}>step</th></tr></thead>
          <tbody>
            {d.workers.map((w) => (
              <tr key={w.id}><td style={cell}><code>{w.id.slice(0, 16)}…</code></td><td style={cell}>{w.source}</td><td style={cell}><span style={badge(w.status)}>{w.status}</span></td><td style={cell}>{w.current_step || "—"}</td></tr>
            ))}
            {!d.workers.length && <tr><td style={cell} colSpan={4}>nenhum worker ligado</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: "#9BA1A9" }}>Tarefas</h3>
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse", color: "#E8EAED", fontSize: 14 }}>
          <thead><tr><th style={cell}>id</th><th style={cell}>título</th><th style={cell}>status</th></tr></thead>
          <tbody>
            {d.tasks.map((t) => (
              <tr key={t.id}><td style={cell}><code>{t.id.slice(0, 16)}…</code></td><td style={cell}>{t.title}</td><td style={cell}><span style={badge(t.status)}>{t.status}</span></td></tr>
            ))}
            {!d.tasks.length && <tr><td style={cell} colSpan={3}>nenhuma tarefa</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
