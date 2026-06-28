"use client";
import { apiPost, badge, btn, card, cell, Page, short, tableStyle, usePoll } from "../ui";

type Intervention = { task_id: string; title: string; branch: string; ci_status: string; ai_review_status: string };

export default function Intervencao() {
  const { data: items, reload } = usePoll<Intervention[]>("/v1/interventions", 2000);

  async function answer(taskID: string, decision: "approve" | "reject") {
    await apiPost(`/v1/interventions/${taskID}/answer`, { decision });
    reload();
  }

  return (
    <Page>
      <h3 style={{ color: "#9BA1A9" }}>Intervenção <span style={{ color: "#697079", fontSize: 13 }}>(gate de revisão humana — destrava o merge)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>tarefa</th><th style={cell}>branch</th><th style={cell}>CI</th><th style={cell}>review IA</th><th style={cell}>decisão</th></tr></thead>
          <tbody>
            {(items || []).map((it) => (
              <tr key={it.task_id}>
                <td style={cell}>{it.title} <code style={{ color: "#697079", fontSize: 11 }}>{short(it.task_id, 12)}</code></td>
                <td style={cell}><code style={{ fontSize: 12 }}>{it.branch}</code></td>
                <td style={cell}><span style={badge(it.ci_status === "passed" ? "merged" : "failed")}>{it.ci_status || "—"}</span></td>
                <td style={cell}><span style={badge(it.ai_review_status === "approved" ? "merged" : "queued")}>{it.ai_review_status || "—"}</span></td>
                <td style={cell}>
                  <button style={{ ...btn, padding: "4px 12px", marginRight: 6 }} onClick={() => answer(it.task_id, "approve")}>aprovar</button>
                  <button style={{ ...btn, padding: "4px 12px", background: "#F85149", color: "#fff" }} onClick={() => answer(it.task_id, "reject")}>reprovar</button>
                </td>
              </tr>
            ))}
            {!items?.length && <tr><td style={cell} colSpan={5}>nenhuma intervenção pendente</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: "#697079", fontSize: 13 }}>
        Aprovar despacha o <b>merge</b> ao executor; reprovar marca a tarefa como falha. Os gates
        (CI verde, revisão IA, revisão humana) são aplicados <b>server-side</b> no cérebro.
      </p>
    </Page>
  );
}
