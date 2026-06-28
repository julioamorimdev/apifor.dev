"use client";
import { useEffect, useState } from "react";
import { badge, card, CardHead, cell, Page, PageHead, short, sseURL, tableStyle } from "../ui";

type Worker = { id: string; source: string; status: string; current_step: string };
type Task = { id: string; title: string; status: string };
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };

export default function Live() {
  const [d, setD] = useState<{ workers: Worker[]; tasks: Task[] }>({ workers: [], tasks: [] });
  const [live, setLive] = useState(false);

  useEffect(() => {
    const es = new EventSource(sseURL("/v1/workers/stream"));
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => setD(JSON.parse(e.data));
    return () => es.close();
  }, []);

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Live" subtitle="Workers e tarefas em tempo real."
        right={<span style={badge(live ? "running" : "failed")}>{live ? "● live (SSE)" : "○ offline"}</span>} />

      <div style={card}>
        <CardHead title="Workers" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(d.workers || []).length} ativo(s)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={th}>id</th><th style={th}>source</th><th style={th}>status</th><th style={th}>step</th></tr></thead>
          <tbody>
            {(d.workers || []).map((w) => (
              <tr key={w.id}><td style={cell}><code style={{ color: "var(--accent)", fontSize: 12 }}>{short(w.id)}</code></td><td style={cell}>{w.source}</td><td style={cell}><span style={badge(w.status)}>{w.status}</span></td><td style={cell}>{w.current_step || "—"}</td></tr>
            ))}
            {!d.workers?.length && <tr><td style={cell} colSpan={4}>nenhum worker ligado</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <CardHead title="Tarefas em andamento" />
        <table style={tableStyle}>
          <thead><tr><th style={th}>id</th><th style={th}>título</th><th style={th}>status</th></tr></thead>
          <tbody>
            {(d.tasks || []).map((t) => (
              <tr key={t.id}><td style={cell}><code style={{ color: "var(--accent)", fontSize: 12 }}>{short(t.id)}</code></td><td style={cell}>{t.title}</td><td style={cell}><span style={badge(t.status)}>{t.status}</span></td></tr>
            ))}
            {!d.tasks?.length && <tr><td style={cell} colSpan={3}>nenhuma tarefa</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
