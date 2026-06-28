"use client";
import { badge, card, CardHead, cell, codeAmber, Page, PageHead, short, tableStyle, thCell, usePoll } from "../ui";

type QA = { id: string; task_id: string; status: string; tests_total: number; tests_passed: number; date: string };

export default function QATela() {
  const { data: reports } = usePoll<QA[]>("/v1/qa", 2500);
  const list = reports || [];
  return (
    <Page>
      <PageHead eyebrow="Operação" title="QA" subtitle="Relatórios de teste." />
      <div style={card}>
        <CardHead title="Relatórios de QA" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{list.length} relatório(s)</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Tarefa</th><th style={thCell}>Status</th><th style={thCell}>Testes</th><th style={thCell}>Data</th></tr></thead>
          <tbody>
            {list.map((q) => (
              <tr key={q.id}>
                <td style={cell}><span style={codeAmber}>{short(q.task_id, 12)}</span></td>
                <td style={cell}><span style={badge(q.status === "passed" ? "merged" : "failed")}>{q.status}</span></td>
                <td style={cell}>{q.tests_passed}/{q.tests_total}</td>
                <td style={cell}>{q.date}</td>
              </tr>
            ))}
            {!list.length && <tr><td style={cell} colSpan={4}>nenhum relatório de QA</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
