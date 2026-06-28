"use client";
import { card, CardHead, cell, codeAmber, Page, PageHead, tableStyle, thCell, useT } from "../ui";

const base = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_API_BASE || window.location.origin + "/api") : "/api";

export default function Web() {
  const t = useT();
  const endpoints: [string, string, string][] = [
    ["POST", "/v1/auth/login", t("obter token JWT", "get JWT token")],
    ["GET", "/v1/tasks", t("listar tarefas", "list tasks")],
    ["POST", "/v1/tasks", t("criar tarefa → planejar", "create task → plan")],
    ["GET", "/v1/prs", t("pull requests + gates", "pull requests + gates")],
    ["GET", "/v1/workers/stream", t("SSE — workers ao vivo", "SSE — live workers")],
    ["POST", "/v1/billing/webhook", t("webhook Stripe (HMAC)", "Stripe webhook (HMAC)")],
    ["GET", "/metrics", t("métricas Prometheus", "Prometheus metrics")],
  ];
  return (
    <Page>
      <PageHead eyebrow="Sistema" title="Web & API" subtitle={t("Acesso programático ao control plane (REST + SSE).")} />

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
          <thead><tr><th style={thCell}>{t("Método", "Method")}</th><th style={thCell}>{t("Rota", "Route")}</th><th style={thCell}>{t("Descrição", "Description")}</th></tr></thead>
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
        {t("Autentique com Authorization: Bearer <token> (de /v1/auth/login). O acesso é isolado por org (RBAC + RLS server-side). Em produção, ligue REQUIRE_AUTH=true e sirva o REST sobre TLS (REST_TLS=true). Webhooks do Stripe são verificados por HMAC.",
          "Authenticate with Authorization: Bearer <token> (from /v1/auth/login). Access is org-isolated (server-side RBAC + RLS). In production, enable REQUIRE_AUTH=true and serve REST over TLS (REST_TLS=true). Stripe webhooks are verified by HMAC.")}
      </div>
    </Page>
  );
}
