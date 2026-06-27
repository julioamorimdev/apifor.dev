"use client";
import { badge, card, cell, Page, short, tableStyle, usePoll } from "../ui";

type PR = { id: string; task_id: string; branch: string; url: string; status: string };

export default function PRs() {
  const { data: prs } = usePoll<PR[]>("/v1/prs", 2500);

  return (
    <Page>
      <h3 style={{ color: "#9BA1A9" }}>Pull Requests <span style={{ color: "#697079", fontSize: 13 }}>(abertos pelo executor)</span></h3>
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>task</th><th style={cell}>branch</th><th style={cell}>status</th><th style={cell}>url</th></tr></thead>
          <tbody>
            {(prs || []).map((p) => (
              <tr key={p.id}>
                <td style={cell}><code>{short(p.task_id)}</code></td>
                <td style={cell}><code>{p.branch}</code></td>
                <td style={cell}><span style={badge(p.status)}>{p.status}</span></td>
                <td style={cell}>
                  {p.url.startsWith("http")
                    ? <a href={p.url} target="_blank" style={{ color: "#5BA9FF" }}>{short(p.url, 40)}</a>
                    : <code style={{ fontSize: 12, color: "#9BA1A9" }}>{short(p.url, 48)}</code>}
                </td>
              </tr>
            ))}
            {!prs?.length && <tr><td style={cell} colSpan={4}>nenhum PR ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
