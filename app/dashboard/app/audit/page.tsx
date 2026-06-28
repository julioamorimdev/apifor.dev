"use client";
import { btn, card, CardHead, cell, codeAmber, codeDim, getToken, Page, PageHead, short, tableStyle, thCell, usePoll, useT } from "../ui";

type Audit = { when: string; actor_type: string; actor_id: string; action: string; target_type: string; target_id: string };

export default function Auditoria() {
  const t = useT();
  const { data: rows } = usePoll<Audit[]>("/v1/audit", 4000);
  const list = rows || [];

  function exportCSV() {
    const t = getToken();
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
      <PageHead eyebrow="Conhecimento & sistema" title="Auditoria" subtitle="Quem fez o quê — server-side."
        right={<button style={btn} onClick={exportCSV}>{t("exportar CSV")}</button>} />
      <div style={card}>
        <CardHead title="Trilha de auditoria" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{list.length} evento(s)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Quando")}</th><th style={thCell}>{t("Ator")}</th><th style={thCell}>{t("Ação")}</th><th style={thCell}>{t("Alvo")}</th></tr></thead>
          <tbody>
            {list.map((a, i) => (
              <tr key={i}>
                <td style={cell}><span style={codeDim}>{a.when}</span></td>
                <td style={cell}>{a.actor_type}{a.actor_id ? " " + short(a.actor_id, 12) : ""}</td>
                <td style={cell}><span style={codeAmber}>{a.action}</span></td>
                <td style={cell}>{a.target_type} {a.target_id}</td>
              </tr>
            ))}
            {!list.length && <tr><td style={cell} colSpan={4}>{t("nenhum evento de auditoria")}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--mute)", fontSize: 13 }}>
        Registra escritas sensíveis (criar tarefa/repo, trocar plano, adicionar membro,
        revogar device). Rate limit por plano (Free 60/min · Pro 300 · Team 1000) e métricas
        Prometheus em <code>/metrics</code> completam o hardening do M6.1.
      </p>
    </Page>
  );
}
