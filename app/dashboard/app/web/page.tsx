"use client";
import { card, CardHead, cell, codeAmber, Page, PageHead, tableStyle, thCell } from "../ui";

const base = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_BASE || window.location.origin + "/api") : "/api";

const endpoints: [string, string, string][] = [
  ["POST", "/v1/auth/login", "obter token JWT"],
  ["GET", "/v1/tasks", "listar tarefas"],
  ["POST", "/v1/tasks", "criar tarefa → planejar"],
  ["GET", "/v1/prs", "pull requests + gates"],
  ["GET", "/v1/workers/stream", "SSE — workers ao vivo"],
  ["POST", "/v1/billing/webhook", "webhook Stripe (HMAC)"],
  ["GET", "/metrics", "métricas Prometheus"],
];

export default function Web() {
  return (
    <Page>
      <PageHead eyebrow="Sistema" title="Web & API" subtitle="Acesso programático ao control plane (REST + SSE)." />

      <div style={card}>
        <CardHead title="Base da API" />
        <div style={{ padding: 16, fontFamily: "var(--mono)", fontSize: 14 }}>
          <span style={{ color: "var(--mute)" }}>base url</span><br />
          <span style={{ color: "var(--accent)" }}>{base}</span>
        </div>
      </div>

      <div style={card}>
        <CardHead title="Endpoints principais" />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Método</th><th style={thCell}>Rota</th><th style={thCell}>Descrição</th></tr></thead>
          <tbody>
            {endpoints.map(([m, p, d]) => (
              <tr key={p}>
                <td style={cell}><span style={{ ...codeAmber, color: m === "GET" ? "var(--blue)" : "var(--green)" }}>{m}</span></td>
                <td style={cell}><span style={codeAmber}>{p}</span></td>
                <td style={cell}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...card, padding: 16, color: "var(--dim)", fontSize: 13.5, lineHeight: 1.7 }}>
        Autentique com <code>Authorization: Bearer &lt;token&gt;</code> (de <code>/v1/auth/login</code>).
        O acesso é isolado por org (RBAC + RLS server-side). Em produção, ligue <code>REQUIRE_AUTH=true</code> e
        sirva o REST sobre TLS (<code>REST_TLS=true</code>). Webhooks do Stripe são verificados por HMAC.
      </div>
    </Page>
  );
}
