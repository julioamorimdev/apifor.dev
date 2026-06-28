"use client";
import { apiPost, badge, btn, card, CardHead, cell, codeDim, Page, PageHead, short, tableStyle, thCell, usePoll, useT } from "../ui";

type Intervention = { task_id: string; title: string; branch: string; ci_status: string; ai_review_status: string };

export default function Intervencao() {
  const t = useT();
  const { data: items, reload } = usePoll<Intervention[]>("/v1/interventions", 2000);
  const list = items || [];

  async function answer(taskID: string, decision: "approve" | "reject") {
    await apiPost(`/v1/interventions/${taskID}/answer`, { decision });
    reload();
  }

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Intervenção" subtitle="Gate de revisão humana — destrava o merge." />
      <div style={card}>
        <CardHead title="Aguardando revisão humana" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{list.length} pendente(s)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Tarefa")}</th><th style={thCell}>{t("Branch")}</th><th style={thCell}>CI</th><th style={thCell}>Review IA</th><th style={{ ...thCell, textAlign: "right" }}>Decisão</th></tr></thead>
          <tbody>
            {list.map((it) => (
              <tr key={it.task_id}>
                <td style={cell}>{it.title} <span style={{ ...codeDim, fontSize: 11 }}>{short(it.task_id, 12)}</span></td>
                <td style={cell}><span style={codeDim}>{it.branch}</span></td>
                <td style={cell}><span style={badge(it.ci_status === "passed" ? "merged" : "failed")}>{it.ci_status || "—"}</span></td>
                <td style={cell}><span style={badge(it.ai_review_status === "approved" ? "merged" : "queued")}>{it.ai_review_status || "—"}</span></td>
                <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button style={{ ...btn, padding: "5px 13px", marginRight: 6 }} onClick={() => answer(it.task_id, "approve")}>{t("aprovar")}</button>
                  <button style={{ ...btn, padding: "5px 13px", background: "var(--red-tint)", color: "var(--red)" }} onClick={() => answer(it.task_id, "reject")}>{t("reprovar")}</button>
                </td>
              </tr>
            ))}
            {!list.length && <tr><td style={cell} colSpan={5}>{t("nenhuma intervenção pendente")}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--mute)", fontSize: 13 }}>
        Aprovar despacha o <b>merge</b> ao executor; reprovar marca a tarefa como falha. Os gates
        (CI verde, revisão IA, revisão humana) são aplicados <b>server-side</b> no cérebro.
      </p>
    </Page>
  );
}
