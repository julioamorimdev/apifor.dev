"use client";
import { card, CardHead, Page, PageHead, useT } from "../ui";

const GH = "https://github.com/julioamorimdev/apifor.dev";

export default function Ajuda() {
  const t = useT();
  const docs: [string, string, string][] = [
    ["README", t("Visão geral, arquitetura e quickstart", "Overview, architecture and quickstart"), GH + "/blob/main/README.md"],
    ["SECURITY", t("Postura de segurança (mTLS, vault, RLS, kill-switch)", "Security posture (mTLS, vault, RLS, kill-switch)"), GH + "/blob/main/SECURITY.md"],
    ["PRODUCTION", t("Deploy de produção (perfil endurecido + checklist)", "Production deploy (hardened profile + checklist)"), GH + "/blob/main/PRODUCTION.md"],
    ["ROADMAP", t("Marcos de construção M0→M7", "Build milestones M0→M7"), GH + "/blob/main/ROADMAP.md"],
  ];
  const Step = ({ n, ti, children }: { n: string; ti: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--accent)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{n}</span>
      <div><b>{ti}</b><div style={{ color: "var(--dim)", fontSize: 13, marginTop: 3 }}>{children}</div></div>
    </div>
  );
  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Ajuda" subtitle="Primeiros passos, docs e a fronteira de privacidade." />

      <div style={card}>
        <CardHead title="Começar em 4 passos" />
        <Step n="1" ti={t("Crie a org / faça login", "Create the org / sign in")}>{t("Em", "At")} <a href="/login" style={{ color: "var(--blue)" }}>/login</a> ({t("ou", "or")} <a href="/onboarding" style={{ color: "var(--blue)" }}>{t("Início", "Home")}</a>).</Step>
        <Step n="2" ti={t("Deixe o executor rodando", "Keep the executor running")}>{t("Serviço de fundo na sua máquina/VM:", "Background service on your machine/VM:")} <code>sudo app/deploy/install.sh</code> ({t("ou", "or")} <code>make dev</code>). {t("Ele enrola por mTLS sozinho.", "It enrolls via mTLS by itself.")}</Step>
        <Step n="3" ti={t("Configure a chave de IA — local", "Set the AI key — local")}>{t("A chave fica no vault cifrado local via IPC:", "The key lives in the local encrypted vault via IPC:")} <code>make secret NAME=anthropic_api_key VALUE=sk-ant-…</code>. <b>{t("Nunca", "Never")}</b> {t("vai ao cérebro.", "goes to the brain.")}</Step>
        <Step n="4" ti={t("Conecte um repo e crie a tarefa", "Connect a repo and create the task")}>{t("Em", "At")} <a href="/config" style={{ color: "var(--blue)" }}>{t("Configuração", "Settings")}</a> {t("registre o repo; depois crie a tarefa em", "register the repo; then create the task at")} <a href="/tasks" style={{ color: "var(--blue)" }}>{t("Tarefas", "Tasks")}</a>.</Step>
      </div>

      <div style={card}>
        <CardHead title="Documentação" />
        {docs.map(([ti, d, u]) => (
          <a key={ti} href={u} target="_blank" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }} className="apf-link">
            <span><b>{ti}</b> <span style={{ color: "var(--mute)", fontSize: 13 }}>— {d}</span></span>
            <span style={{ color: "var(--blue)", fontSize: 13 }}>{t("abrir", "open")} ↗</span>
          </a>
        ))}
      </div>

      <div style={{ ...card, padding: 16, color: "var(--dim)", fontSize: 13.5, lineHeight: 1.7 }}>
        <b style={{ color: "var(--ink)" }}>{t("Fronteira de privacidade.", "Privacy boundary.")}</b> {t("Chave de IA, código e segredos ficam locais (vault cifrado, execução no seu executor). O cérebro só vê metadados: plano estruturado, branch + URL do PR, e referências (sem valores). É a invariante central do apifor.dev.",
          "AI key, code and secrets stay local (encrypted vault, execution on your executor). The brain only sees metadata: structured plan, branch + PR URL, and references (no values). It's the core invariant of apifor.dev.")}
      </div>
    </Page>
  );
}
