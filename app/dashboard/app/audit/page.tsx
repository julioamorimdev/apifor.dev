"use client";
import { btn, card, cell, getToken, Page, short, tableStyle, usePoll } from "../ui";

type Audit = { when: string; actor_type: string; actor_id: string; action: string; target_type: string; target_id: string };

export default function Auditoria() {
  const { data: rows } = usePoll<Audit[]>("/v1/audit", 4000);

  function exportCSV() {
    const t = getToken();
    // abre o export (com token, se logado, via fetch->blob)
    fetch("/api/v1/audit/export", { headers: t ? { Authorization: "Bearer " + t } : {} })
      .then((r) => r.blob())
      .then((b) => {
        const url = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = url; a.download = "audit.csv"; a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <Page>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h3 style={{ color: "var(--dim)", margin: 0 }}>Auditoria <span style={{ color: "var(--mute)", fontSize: 13 }}>(quem fez o quê — server-side)</span></h3>
        <span style={{ flex: 1 }} />
        <button style={btn} onClick={exportCSV}>exportar CSV</button>
      </div>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>quando</th><th style={cell}>ator</th><th style={cell}>ação</th><th style={cell}>alvo</th></tr></thead>
          <tbody>
            {(rows || []).map((a, i) => (
              <tr key={i}>
                <td style={cell}>{a.when}</td>
                <td style={cell}>{a.actor_type}{a.actor_id ? " " + short(a.actor_id, 12) : ""}</td>
                <td style={cell}><code>{a.action}</code></td>
                <td style={cell}>{a.target_type} {a.target_id}</td>
              </tr>
            ))}
            {!rows?.length && <tr><td style={cell} colSpan={4}>nenhum evento de auditoria</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--mute)", fontSize: 13 }}>
        Registra escritas sensíveis (criar tarefa/repo, trocar plano, adicionar membro,
        revogar device). Rate limit por plano (Free 60/min, Pro 300, Team 1000) e métricas
        Prometheus em <code>/metrics</code> completam o hardening do M6.1.
      </p>
    </Page>
  );
}
