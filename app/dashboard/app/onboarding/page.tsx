"use client";
import { useState } from "react";
import { apiPost, badge, btn, card, getToken, input, Page } from "../ui";

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <div style={{ ...card, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ background: done ? "#2EA043" : "#1E2228", color: "#fff", borderRadius: 999, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{done ? "✓" : n}</span>
        <b style={{ color: "#E8EAED" }}>{title}</b>
      </div>
      <div style={{ color: "#9BA1A9", fontSize: 14, lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}
const Cmd = ({ children }: { children: React.ReactNode }) => (
  <pre style={{ background: "#0A0B0D", border: "1px solid #1E2228", borderRadius: 6, padding: "8px 10px", overflowX: "auto", fontSize: 13, color: "#C9D1D9" }}>{children}</pre>
);

export default function Onboarding() {
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
      <h3 style={{ color: "#9BA1A9" }}>Bem-vindo ao apifor.dev <span style={{ color: "#697079", fontSize: 13 }}>(4 passos pra primeira tarefa)</span></h3>

      <Step n={1} title="Crie sua conta" done={logged}>
        {logged ? <span style={badge("merged")}>conectado</span> : <>Crie a org e entre em <a href="/login" style={{ color: "#5BA9FF" }}>/login</a>.</>}
      </Step>

      <Step n={2} title="Deixe o executor rodando (na sua máquina/VM)">
        O executor é o <b>data plane local</b> — ele roda os workers de IA. Instale como serviço de fundo:
        <Cmd>{`# Linux/macOS (build + registra o serviço)
sudo app/deploy/install.sh
# ou via Docker (dev):  cd app && make dev`}</Cmd>
        Ele enrola sozinho no cérebro por mTLS (CSR assinado pela CA).
      </Step>

      <Step n={3} title="Configure sua chave de IA — local, nunca no cérebro">
        A chave fica no <b>vault cifrado local</b> via IPC. Ela <b>nunca</b> trafega pela rede nem é digitada aqui:
        <Cmd>{`VALUE="sk-ant-..." app/.../executor secret-put anthropic_api_key
# (ou: make secret NAME=anthropic_api_key VALUE=sk-ant-...)`}</Cmd>
      </Step>

      <Step n={4} title="Conecte um repositório" done={repoOk}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...input, width: 160 }} placeholder="nome" value={repo.name} onChange={(e) => setRepo({ ...repo, name: e.target.value })} />
          <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="clone_url (https/ssh/file://)" value={repo.url} onChange={(e) => setRepo({ ...repo, url: e.target.value })} />
          <button style={btn} onClick={addRepo} disabled={!logged}>conectar</button>
          {repoOk && <span style={badge("merged")}>repositório conectado</span>}
        </div>
      </Step>

      <div style={{ ...card, padding: 16, borderColor: "#F5A623" }}>
        Pronto! Crie sua primeira tarefa na <a href="/queue" style={{ color: "#F5A623" }}>Fila</a> e acompanhe ao vivo no{" "}
        <a href="/" style={{ color: "#F5A623" }}>Live</a>. Precisa de mais workers/horas? Veja <a href="/pricing" style={{ color: "#F5A623" }}>Planos</a>.
      </div>
    </Page>
  );
}
