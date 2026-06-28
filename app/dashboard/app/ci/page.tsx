"use client";
import { badge, card, CardHead, cell, codeAmber, Page, PageHead, short, tableStyle, thCell, usePoll } from "../ui";

type CI = { id: string; provider: string; status: string; task_id: string; finished_at: string };

export default function CITela() {
  const { data: runs } = usePoll<CI[]>("/v1/ci", 2500);
  const list = runs || [];
  return (
    <Page>
      <PageHead eyebrow="Operação" title="CI" subtitle="Execuções do step de teste." />
      <div style={card}>
        <CardHead title="Execuções de CI" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{list.length} run(s)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Tarefa</th><th style={thCell}>Provider</th><th style={thCell}>Status</th><th style={thCell}>Concluído</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td style={cell}><span style={codeAmber}>{short(c.task_id, 12)}</span></td>
                <td style={cell}>{c.provider || "—"}</td>
                <td style={cell}><span style={badge(c.status === "passed" ? "merged" : c.status === "failed" ? "failed" : "queued")}>{c.status}</span></td>
                <td style={cell}>{c.finished_at || "—"}</td>
              </tr>
            ))}
            {!list.length && <tr><td style={cell} colSpan={4}>nenhuma execução de CI</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
