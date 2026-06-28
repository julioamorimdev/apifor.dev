"use client";
import { useState } from "react";
import { apiPost, badge, btn, card, getToken, input, Page, PageHead, useT } from "../ui";

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <div style={{ ...card, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ background: done ? "var(--green)" : "var(--border)", color: "#fff", borderRadius: 999, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{done ? "✓" : n}</span>
        <b style={{ color: "var(--ink)" }}>{title}</b>
      </div>
      <div style={{ color: "var(--dim)", fontSize: 14, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
const Cmd = ({ children }: { children: React.ReactNode }) => (
  <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", overflowX: "auto", fontSize: 13, color: "var(--ink)" }}>{children}</pre>
);

export default function Onboarding() {
  const t = useT();
  const logged = !!getToken();
  const [repo, setRepo] = useState({ name: "", url: "" });
  const [repoOk, setRepoOk] = useState(false);
  async function addRepo() {
    if (!repo.name || !repo.url) return;
    await apiPost("/v1/repos", { name: repo.name, clone_url: repo.url });
    setRepoOk(true);
  }
  return (
    <Page>
      <PageHead eyebrow="Início" title="Bem-vindo ao apifor.dev" subtitle="4 passos pra primeira tarefa." />

      <Step n={1} title={t("Crie sua conta", "Create your account")} done={logged}>
        {logged ? <span style={badge("merged")}>{t("conectado", "connected")}</span> : <>{t("Crie a org e entre em", "Create the org and sign in at")} <a href="/login" style={{ color: "var(--blue)" }}>/login</a>.</>}
      </Step>

      <Step n={2} title={t("Deixe o executor rodando (na sua máquina/VM)", "Keep the executor running (on your machine/VM)")}>
        {t("O executor é o data plane local — ele roda os workers de IA. Instale como serviço de fundo:", "The executor is the local data plane — it runs the AI workers. Install it as a background service:")}
        <Cmd>{`# Linux/macOS (build + registra o serviço)
sudo app/deploy/install.sh
# ou via Docker (dev):  cd app && make dev`}</Cmd>
        {t("Ele enrola sozinho no cérebro por mTLS (CSR assinado pela CA).", "It enrolls into the brain by itself via mTLS (CSR signed by the CA).")}
      </Step>

      <Step n={3} title={t("Configure sua chave de IA — local, nunca no cérebro", "Set your AI key — local, never in the brain")}>
        {t("A chave fica no vault cifrado local via IPC. Ela nunca trafega pela rede nem é digitada aqui:", "The key lives in the local encrypted vault via IPC. It never travels the network nor is typed here:")}
        <Cmd>{`VALUE="sk-ant-..." app/.../executor secret-put anthropic_api_key
# (ou: make secret NAME=anthropic_api_key VALUE=sk-ant-...)`}</Cmd>
      </Step>

      <Step n={4} title={t("Conecte um repositório", "Connect a repository")} done={repoOk}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...input, width: 160 }} placeholder={t("nome", "name")} value={repo.name} onChange={(e) => setRepo({ ...repo, name: e.target.value })} />
          <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="clone_url (https/ssh/file://)" value={repo.url} onChange={(e) => setRepo({ ...repo, url: e.target.value })} />
          <button style={btn} onClick={addRepo} disabled={!logged}>{t("conectar", "connect")}</button>
          {repoOk && <span style={badge("merged")}>{t("repositório conectado", "repository connected")}</span>}
        </div>
      </Step>

      <div style={{ ...card, padding: 16, borderColor: "var(--accent)" }}>
        {t("Pronto! Crie sua primeira tarefa na", "Done! Create your first task in")} <a href="/queue" style={{ color: "var(--accent)" }}>{t("Fila", "Queue")}</a> {t("e acompanhe ao vivo no", "and watch it live in")}{" "}
        <a href="/live" style={{ color: "var(--accent)" }}>Live</a>. {t("Precisa de mais workers/horas? Veja", "Need more workers/hours? See")} <a href="/pricing" style={{ color: "var(--accent)" }}>{t("Planos", "Plans")}</a>.
      </div>
    </Page>
  );
}
