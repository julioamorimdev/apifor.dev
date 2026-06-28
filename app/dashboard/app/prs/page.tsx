"use client";
import { badge, card, CardHead, cell, codeAmber, codeDim, Page, PageHead, short, tableStyle, usePoll } from "../ui";

type PR = {
  id: string; task_id: string; branch: string; url: string; status: string;
  ci_status: string; ai_review_status: string; human_review_status: string;
};

const gate = (s: string) => badge(s === "passed" || s === "approved" ? "merged" : s === "failed" || s === "changes" ? "failed" : s === "pending" || !s ? "queued" : "queued");
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };

export default function PRs() {
  const { data: prs } = usePoll<PR[]>("/v1/prs", 2500);
  const list = prs || [];
  const open = list.filter((p) => p.status !== "merged").length;

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Pull Requests" subtitle="Gates de qualidade: CI · revisão IA · revisão humana." />
      <div style={card}>
        <CardHead title="Pull requests" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{open} aberto(s) · {list.length} total</span>} />
        <table style={tableStyle}>
          <thead><tr>
            <th style={th}>Tarefa</th><th style={th}>Branch</th><th style={th}>Status</th>
            <th style={th}>CI</th><th style={th}>IA</th><th style={th}>Humano</th><th style={th}>PR</th>
          </tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td style={cell}><span style={codeAmber}>{p.task_id.slice(-8)}</span></td>
                <td style={cell}><span style={codeDim}>{short(p.branch, 22)}</span></td>
                <td style={cell}><span style={badge(p.status)}>{p.status}</span></td>
                <td style={cell}><span style={gate(p.ci_status)}>{p.ci_status || "—"}</span></td>
                <td style={cell}><span style={gate(p.ai_review_status)}>{p.ai_review_status || "—"}</span></td>
                <td style={cell}><span style={gate(p.human_review_status)}>{p.human_review_status || "—"}</span></td>
                <td style={cell}>
                  {p.url.startsWith("http")
                    ? <a href={p.url} target="_blank" style={{ color: "var(--blue)", fontSize: 13 }}>abrir ↗</a>
                    : <span style={codeDim}>{short(p.url, 28)}</span>}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td style={cell} colSpan={7}>nenhum PR ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
