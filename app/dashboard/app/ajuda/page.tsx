"use client";
import { card, CardHead, Page, PageHead } from "../ui";

const GH = "https://github.com/julioamorimdev/apifor.dev";
const docs: [string, string, string][] = [
  ["README", "Visão geral, arquitetura e quickstart", GH + "/blob/main/README.md"],
  ["SECURITY", "Postura de segurança (mTLS, vault, RLS, kill-switch)", GH + "/blob/main/SECURITY.md"],
  ["PRODUCTION", "Deploy de produção (perfil endurecido + checklist)", GH + "/blob/main/PRODUCTION.md"],
  ["ROADMAP", "Marcos de construção M0→M7", GH + "/blob/main/ROADMAP.md"],
];

export default function Ajuda() {
  const Step = ({ n, t, children }: { n: string; t: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <span style={{ width: 24, height: 24, borderRadius: 7, background: "var(--accent)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{n}</span>
      <div><b>{t}</b><div style={{ color: "var(--dim)", fontSize: 13, marginTop: 3 }}>{children}</div></div>
    </div>
  );
  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Ajuda" subtitle="Primeiros passos, docs e a fronteira de privacidade." />

      <div style={card}>
        <CardHead title="Começar em 4 passos" />
        <Step n="1" t="Crie a org / faça login">Em <a href="/login" style={{ color: "var(--blue)" }}>/login</a> (ou <a href="/onboarding" style={{ color: "var(--blue)" }}>Início</a>).</Step>
        <Step n="2" t="Deixe o executor rodando">Serviço de fundo na sua máquina/VM: <code>sudo app/deploy/install.sh</code> (ou <code>make dev</code> via Docker). Ele enrola por mTLS sozinho.</Step>
        <Step n="3" t="Configure a chave de IA — local">A chave fica no vault cifrado local via IPC: <code>make secret NAME=anthropic_api_key VALUE=sk-ant-…</code>. <b>Nunca</b> vai ao cérebro.</Step>
        <Step n="4" t="Conecte um repo e crie a tarefa">Em <a href="/config" style={{ color: "var(--blue)" }}>Configuração</a> registre o repo; depois crie a tarefa em <a href="/tasks" style={{ color: "var(--blue)" }}>Tarefas</a>.</Step>
      </div>

      <div style={card}>
        <CardHead title="Documentação" />
        {docs.map(([t, d, u]) => (
          <a key={t} href={u} target="_blank" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }} className="apf-link">
            <span><b>{t}</b> <span style={{ color: "var(--mute)", fontSize: 13 }}>— {d}</span></span>
            <span style={{ color: "var(--blue)", fontSize: 13 }}>abrir ↗</span>
          </a>
        ))}
      </div>

      <div style={{ ...card, padding: 16, color: "var(--dim)", fontSize: 13.5, lineHeight: 1.7 }}>
        <b style={{ color: "var(--ink)" }}>Fronteira de privacidade.</b> Chave de IA, código e segredos ficam
        <b> locais</b> (vault cifrado, execução no seu executor). O cérebro só vê metadados:
        plano estruturado, branch + URL do PR, e referências (sem valores). É a invariante central do apifor.dev.
      </div>
    </Page>
  );
}
