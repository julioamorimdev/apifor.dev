"use client";
import { badge, card, cell, Page, short, tableStyle, usePoll } from "../ui";

type Task = { id: string; title: string; status: string };
const ACTIVE = new Set(["queued", "assigned", "planning", "running"]);

export default function Fila() {
  const { data: tasks } = usePoll<Task[]>("/v1/tasks", 1500);
  const fila = (tasks || []).filter((t) => ACTIVE.has(t.status));

  return (
    <Page>
      <h3 style={{ color: "#9BA1A9" }}>Fila <span style={{ color: "#697079", fontSize: 13 }}>(tarefas em andamento)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>id</th><th style={cell}>título</th><th style={cell}>status</th></tr></thead>
          <tbody>
            {fila.map((t) => (
              <tr key={t.id}><td style={cell}><code>{short(t.id)}</code></td><td style={cell}>{t.title}</td><td style={cell}><span style={badge(t.status)}>{t.status}</span></td></tr>
            ))}
            {!fila.length && <tr><td style={cell} colSpan={3}>fila vazia</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
