"use client";
import { useState } from "react";
import { apiPost, btn, card, CardHead, cell, codeAmber, codeDim, input, Page, PageHead, short, tableStyle, thCell, usePoll, useT } from "../ui";

type Repo = { id: string; name: string; default_branch: string; clone_url: string };
type Secret = { id: string; name: string; type: string; fingerprint: string; location: string };

export default function Config() {
  const t = useT();
  const { data: repos, reload } = usePoll<Repo[]>("/v1/repos", 4000);
  const { data: secrets } = usePoll<Secret[]>("/v1/secrets", 4000);
  const [name, setName] = useState("sample");
  const [url, setUrl] = useState("file:///remotes/sample.git");
  const [branch, setBranch] = useState("main");

  async function addRepo() {
    if (!name.trim() || !url.trim()) return;
    await apiPost("/v1/repos", { name, clone_url: url, default_branch: branch });
    reload();
  }

  return (
    <Page>
      <PageHead eyebrow="Conhecimento & sistema" title="Configuração" subtitle="Repositórios e segredos." />

      <div style={card}>
        <CardHead title="Registrar repositório" />
        <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 1, minWidth: 120 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("nome")} />
          <input style={{ ...input, flex: 2, minWidth: 200 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="clone_url (file:///… ou https://github.com/owner/repo.git)" />
          <input style={{ ...input, width: 110 }} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={t("branch")} />
          <button style={btn} onClick={addRepo}>{t("Registrar")}</button>
        </div>
      </div>
      <div style={card}>
        <CardHead title="Repositórios" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(repos || []).length}</span>} />
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Nome")}</th><th style={thCell}>{t("Branch")}</th><th style={thCell}>{t("Clone URL")}</th></tr></thead>
          <tbody>
            {(repos || []).map((r) => (
              <tr key={r.id}><td style={cell}>{r.name}</td><td style={cell}>{r.default_branch}</td><td style={cell}><span style={codeDim}>{r.clone_url}</span></td></tr>
            ))}
            {!repos?.length && <tr><td style={cell} colSpan={3}>{t("nenhum repositório")}</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <CardHead title="Segredos" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>metadado · {(secrets || []).length}</span>} />
        <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
          O <b>valor</b> nunca passa por aqui: é gravado no vault local via IPC
          (<code>executor secret-put &lt;name&gt;</code> / <code>make secret</code>). Abaixo só o
          metadado (<code>secret_ref</code>) — nome, tipo e fingerprint.
        </div>
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Nome")}</th><th style={thCell}>{t("Tipo")}</th><th style={thCell}>{t("Fingerprint")}</th><th style={thCell}>{t("Local")}</th></tr></thead>
          <tbody>
            {(secrets || []).map((s) => (
              <tr key={s.id}><td style={cell}>{s.name}</td><td style={cell}>{s.type || "—"}</td><td style={cell}><span style={codeAmber}>{short(s.fingerprint, 12)}</span></td><td style={cell}>{s.location}</td></tr>
            ))}
            {!secrets?.length && <tr><td style={cell} colSpan={4}>{t("nenhum segredo registrado")}</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
