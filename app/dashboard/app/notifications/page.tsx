"use client";
import { useEffect, useState } from "react";
import { apiPost, badge, btn, card, cell, Page, tableStyle } from "../ui";

type Notif = { id: string; type: string; title: string; body: string; link: string; read: boolean; date: string };
const tone = (t: string) => (t === "merge" ? "merged" : t === "fail" || t === "lease" ? "failed" : t === "intervention" ? "queued" : "running");

export default function Notificacoes() {
  const [items, setItems] = useState<Notif[]>([]);
  useEffect(() => {
    const es = new EventSource("/api/v1/notifications/stream");
    es.onmessage = (e) => { try { setItems(JSON.parse(e.data).notifications || []); } catch {} };
    return () => es.close();
  }, []);

  async function markRead() { await apiPost("/v1/notifications", {}); }

  return (
    <Page>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 style={{ color: "#9BA1A9", margin: 0 }}>Notificações <span style={{ color: "#697079", fontSize: 13 }}>(SSE — tempo real)</span></h3>
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={markRead}>marcar todas como lidas</button>
      </div>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>tipo</th><th style={cell}>título</th><th style={cell}>detalhe</th><th style={cell}>quando</th><th style={cell}></th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} style={{ opacity: n.read ? 0.55 : 1 }}>
                <td style={cell}><span style={badge(tone(n.type))}>{n.type}</span></td>
                <td style={cell}>{n.link ? <a href={n.link} style={{ color: "#E8EAED" }}>{n.title}</a> : n.title}{!n.read && <span style={{ color: "#F85149", marginLeft: 6 }}>●</span>}</td>
                <td style={cell}>{n.body}</td>
                <td style={cell}>{n.date}</td>
                <td style={cell}>{n.link && <a href={n.link} style={{ color: "#5BA9FF", fontSize: 13 }}>abrir</a>}</td>
              </tr>
            ))}
            {!items.length && <tr><td style={cell} colSpan={5}>nenhuma notificação</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
