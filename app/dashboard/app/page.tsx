"use client";
import { useEffect, useState } from "react";
import { badge, card, cell, Page, short, tableStyle } from "./ui";

type Worker = { id: string; source: string; status: string; current_step: string };
type Task = { id: string; title: string; status: string };

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

  return (
    <Page>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={badge(live ? "running" : "failed")}>{live ? "● live (SSE)" : "○ offline"}</span>
        <span style={{ color: "#697079", fontSize: 13 }}>estado em tempo real do cérebro</span>
      </div>

      <h3 style={{ color: "#9BA1A9" }}>Workers</h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>id</th><th style={cell}>source</th><th style={cell}>status</th><th style={cell}>step</th></tr></thead>
          <tbody>
            {(d.workers || []).map((w) => (
              <tr key={w.id}><td style={cell}><code>{short(w.id)}</code></td><td style={cell}>{w.source}</td><td style={cell}><span style={badge(w.status)}>{w.status}</span></td><td style={cell}>{w.current_step || "—"}</td></tr>
            ))}
            {!d.workers?.length && <tr><td style={cell} colSpan={4}>nenhum worker ligado</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: "#9BA1A9" }}>Tarefas</h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>id</th><th style={cell}>título</th><th style={cell}>status</th></tr></thead>
          <tbody>
            {(d.tasks || []).map((t) => (
              <tr key={t.id}><td style={cell}><code>{short(t.id)}</code></td><td style={cell}>{t.title}</td><td style={cell}><span style={badge(t.status)}>{t.status}</span></td></tr>
            ))}
            {!d.tasks?.length && <tr><td style={cell} colSpan={3}>nenhuma tarefa</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
