"use client";
import { Page, PageHead, badge, card, cell, short, tableStyle, usePoll } from "../ui";

type CI = { id: string; provider: string; status: string; task_id: string; finished_at: string };

export default function CITela() {
  const { data: runs } = usePoll<CI[]>("/v1/ci", 2500);
  return (
    <Page>
      <PageHead eyebrow="Operação" title="CI" subtitle="Execuções do step de teste." />
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>task</th><th style={cell}>provider</th><th style={cell}>status</th><th style={cell}>concluído</th></tr></thead>
          <tbody>
            {(runs || []).map((c) => (
              <tr key={c.id}>
                <td style={cell}><code>{short(c.task_id)}</code></td>
                <td style={cell}>{c.provider || "—"}</td>
                <td style={cell}><span style={badge(c.status === "passed" ? "merged" : c.status === "failed" ? "failed" : "queued")}>{c.status}</span></td>
                <td style={cell}>{c.finished_at || "—"}</td>
              </tr>
            ))}
            {!runs?.length && <tr><td style={cell} colSpan={4}>nenhuma execução de CI</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
