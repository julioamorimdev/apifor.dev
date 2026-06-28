"use client";
import { badge, card, cell, Page, short, tableStyle, usePoll } from "../ui";

type QA = { id: string; task_id: string; status: string; tests_total: number; tests_passed: number; date: string };

export default function QATela() {
  const { data: reports } = usePoll<QA[]>("/v1/qa", 2500);
  return (
    <Page>
      <h3 style={{ color: "var(--dim)" }}>QA <span style={{ color: "var(--mute)", fontSize: 13 }}>(relatórios de teste)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>task</th><th style={cell}>status</th><th style={cell}>testes</th><th style={cell}>data</th></tr></thead>
          <tbody>
            {(reports || []).map((q) => (
              <tr key={q.id}>
                <td style={cell}><code>{short(q.task_id)}</code></td>
                <td style={cell}><span style={badge(q.status === "passed" ? "merged" : "failed")}>{q.status}</span></td>
                <td style={cell}>{q.tests_passed}/{q.tests_total}</td>
                <td style={cell}>{q.date}</td>
              </tr>
            ))}
            {!reports?.length && <tr><td style={cell} colSpan={4}>nenhum relatório de QA</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
