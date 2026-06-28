"use client";
import { badge, card, cell, Page, short, tableStyle, usePoll } from "../ui";

type PR = {
  id: string; task_id: string; branch: string; url: string; status: string;
  ci_status: string; ai_review_status: string; human_review_status: string;
};

const gate = (s: string) => badge(s === "passed" || s === "approved" ? "merged" : s === "failed" || s === "changes" ? "failed" : "queued");

export default function PRs() {
  const { data: prs } = usePoll<PR[]>("/v1/prs", 2500);

  return (
    <Page>
      <h3 style={{ color: "#9BA1A9" }}>Pull Requests <span style={{ color: "#697079", fontSize: 13 }}>(gates: CI · revisão IA · revisão humana)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={cell}>task</th><th style={cell}>branch</th><th style={cell}>status</th>
            <th style={cell}>CI</th><th style={cell}>IA</th><th style={cell}>humano</th><th style={cell}>url</th>
          </tr></thead>
          <tbody>
            {(prs || []).map((p) => (
              <tr key={p.id}>
                <td style={cell}><code>{short(p.task_id)}</code></td>
                <td style={cell}><code style={{ fontSize: 12 }}>{short(p.branch, 24)}</code></td>
                <td style={cell}><span style={badge(p.status)}>{p.status}</span></td>
                <td style={cell}><span style={gate(p.ci_status)}>{p.ci_status}</span></td>
                <td style={cell}><span style={gate(p.ai_review_status)}>{p.ai_review_status}</span></td>
                <td style={cell}><span style={gate(p.human_review_status)}>{p.human_review_status}</span></td>
                <td style={cell}>
                  {p.url.startsWith("http")
                    ? <a href={p.url} target="_blank" style={{ color: "#5BA9FF" }}>{short(p.url, 28)}</a>
                    : <code style={{ fontSize: 12, color: "#9BA1A9" }}>{short(p.url, 36)}</code>}
                </td>
              </tr>
            ))}
            {!prs?.length && <tr><td style={cell} colSpan={7}>nenhum PR ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
