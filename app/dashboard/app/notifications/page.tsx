"use client";
import { useEffect, useState } from "react";
import { apiPost, badge, btn, card, CardHead, cell, codeDim, Page, PageHead, sseURL, tableStyle, thCell } from "../ui";

type Notif = { id: string; type: string; title: string; body: string; link: string; read: boolean; date: string };
const tone = (t: string) => (t === "merge" ? "merged" : t === "fail" || t === "lease" ? "failed" : t === "intervention" ? "queued" : "running");

export default function Notificacoes() {
  const [items, setItems] = useState<Notif[]>([]);
  useEffect(() => {
    const es = new EventSource(sseURL("/v1/notifications/stream"));
    es.onmessage = (e) => { try { setItems(JSON.parse(e.data).notifications || []); } catch {} };
    return () => es.close();
  }, []);

  async function markRead() { await apiPost("/v1/notifications", {}); }
  const unread = items.filter((n) => !n.read).length;

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Notificações" subtitle="Eventos do cérebro em tempo real (SSE)."
        right={<button style={btn} onClick={markRead}>marcar todas como lidas</button>} />
      <div style={card}>
        <CardHead title="Notificações" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{unread} não-lida(s) · {items.length} total</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Tipo</th><th style={thCell}>Título</th><th style={thCell}>Detalhe</th><th style={thCell}>Quando</th><th style={{ ...thCell, textAlign: "right" }}></th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} style={{ opacity: n.read ? 0.55 : 1 }}>
                <td style={cell}><span style={badge(tone(n.type))}>{n.type}</span></td>
                <td style={cell}>{n.link ? <a href={n.link} style={{ color: "var(--ink)" }}>{n.title}</a> : n.title}{!n.read && <span style={{ color: "var(--red)", marginLeft: 6 }}>●</span>}</td>
                <td style={cell}>{n.body}</td>
                <td style={cell}><span style={codeDim}>{n.date}</span></td>
                <td style={{ ...cell, textAlign: "right" }}>{n.link && <a href={n.link} style={{ color: "var(--blue)", fontSize: 13 }}>abrir →</a>}</td>
              </tr>
            ))}
            {!items.length && <tr><td style={cell} colSpan={5}>nenhuma notificação</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
