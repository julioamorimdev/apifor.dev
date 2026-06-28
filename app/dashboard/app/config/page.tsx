"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, badge, btn, card, CardHead, cell, codeAmber, codeDim, input, Modal, Page, PageHead, short, tableStyle, thCell, usePoll, useT } from "../ui";

type Repo = { id: string; name: string; default_branch: string; clone_url: string };
type Secret = { id: string; name: string; type: string; fingerprint: string; location: string };
type Usage = { plan: string; active_workers: number; max_workers: number | null; week_seconds_used: number; week_cap_seconds: number; lease_ttl_seconds: number };

const fmtSec = (s: number) => (s ? (s >= 3600 ? (s / 3600).toFixed(1) + "h" : s + "s") : "∞");

export default function Config() {
  const t = useT();
  const { data: repos, reload } = usePoll<Repo[]>("/v1/repos", 4000);
  const { data: secrets } = usePoll<Secret[]>("/v1/secrets", 4000);
  const [u, setU] = useState<Usage | null>(null);
  const [tab, setTab] = useState("repos");
  const [open, setOpen] = useState(false);
  const [r, setR] = useState({ name: "sample", url: "file:///remotes/sample.git", branch: "main" });
  useEffect(() => { apiGet<Usage>("/v1/usage").then((x) => { if (!(x as any)?.error) setU(x); }).catch(() => {}); }, []);

  async function addRepo() {
    if (!r.name.trim() || !r.url.trim()) return;
    await apiPost("/v1/repos", { name: r.name, clone_url: r.url, default_branch: r.branch });
    setOpen(false); reload();
  }

  const TABS: [string, string][] = [["workers", "Workers"], ["repos", "Repositórios"], ["limits", "Limites"], ["secrets", "Segredos"]];
  const Row = ({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
      <div><div style={{ fontWeight: 500 }}>{k}</div>{sub && <div style={{ color: "var(--mute)", fontSize: 12.5, marginTop: 2 }}>{sub}</div>}</div>
      <div>{v}</div>
    </div>
  );

  return (
    <Page>
      <PageHead eyebrow="Sistema" title="Configuração" subtitle={t("Ajustes do pipeline — workers, repositórios, limites e segredos.", "Pipeline settings — workers, repositories, limits and secrets.")}
        right={tab === "repos" ? <button style={btn} onClick={() => setOpen(true)}>+ {t("Registrar repositório", "Register repository")}</button> : undefined} />

      {/* abas */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: "10px 14px", fontSize: 14, fontWeight: tab === k ? 600 : 500, color: tab === k ? "var(--ink)" : "var(--dim)", borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>{t(label)}</button>
        ))}
      </div>

      {tab === "workers" && (
        <>
          <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ position: "relative", width: 40, height: 40, borderRadius: 40, background: u && u.active_workers > 0 ? "var(--green-tint)" : "var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {u && u.active_workers > 0 && <span style={{ position: "absolute", inset: 6, borderRadius: 40, border: "2px solid var(--green)", animation: "pulsering 2.6s ease-out infinite" }} />}
              <span className={u && u.active_workers > 0 ? "apf-live" : ""} style={{ width: 12, height: 12, borderRadius: 12, background: u && u.active_workers > 0 ? "var(--green)" : "var(--mute)" }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 16 }}>{t("Pool de workers", "Worker pool")}</div>
              <div style={{ color: "var(--dim)", fontSize: 13 }}>{t("Workers compartilhados com config global — qualquer um pega qualquer tarefa.", "Shared workers with global config — any one picks any task.")}</div>
            </div>
            <span style={badge(u && u.active_workers > 0 ? "open" : "idle")}>{u?.active_workers ?? 0}/{u?.max_workers ?? "∞"}</span>
          </div>
          <div style={card}>
            <CardHead title="Configuração global do pool" />
            <Row k={t("Workers em paralelo", "Parallel workers")} sub={t("Máximo pelo plano atual", "Max by current plan")} v={<b>{u?.max_workers ?? "∞"}</b>} />
            <Row k={t("Isolamento por container", "Container isolation")} sub={t("Cada tarefa roda em ambiente isolado", "Each task runs in an isolated environment")} v={<span style={badge("open")}>{t("ativo", "active")}</span>} />
            <Row k={t("Identidade", "Identity")} sub={t("Enrollment por mTLS (CSR assinado pela CA)", "mTLS enrollment (CSR signed by the CA)")} v={<span style={badge("open")}>mTLS</span>} />
          </div>
        </>
      )}

      {tab === "repos" && (
        <div style={card}>
          <CardHead title="Repositórios do pool" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(repos || []).length}</span>} />
          <div style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            {(repos || []).map((x) => (
              <span key={x.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent-tint)", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 8, padding: "5px 10px", fontSize: 13 }}>
                {x.name} <code style={{ fontSize: 11, color: "var(--mute)" }}>{x.default_branch}</code>
              </span>
            ))}
            {!repos?.length && <span style={{ color: "var(--mute)", fontSize: 13 }}>{t("nenhum repositório", "no repositories")} — {t("registre o primeiro.", "register the first one.")}</span>}
          </div>
          <table style={tableStyle}>
            <thead><tr><th style={thCell}>{t("Nome", "Name")}</th><th style={thCell}>{t("Branch", "Branch")}</th><th style={thCell}>{t("Clone URL", "Clone URL")}</th></tr></thead>
            <tbody>
              {(repos || []).map((x) => <tr key={x.id}><td style={cell}>{x.name}</td><td style={cell}>{x.default_branch}</td><td style={cell}><span style={codeDim}>{x.clone_url}</span></td></tr>)}
              {!repos?.length && <tr><td style={cell} colSpan={3}>{t("nenhum repositório", "no repositories")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "limits" && (
        <div style={card}>
          <CardHead title="Limites do plano" right={<span style={badge(u?.plan === "free" ? "queued" : "open")}>{u?.plan || "—"}</span>} />
          <Row k={t("Workers simultâneos", "Concurrent workers")} sub={t("máximo do plano", "plan maximum")} v={<b>{u?.active_workers ?? 0} / {u?.max_workers ?? "∞"}</b>} />
          <Row k={t("Worker-hours (semana)", "Worker-hours (week)")} sub={t("uso vs cap semanal", "usage vs weekly cap")} v={<b>{fmtSec(u?.week_seconds_used ?? 0)} / {fmtSec(u?.week_cap_seconds ?? 0)}</b>} />
          <Row k={t("Lease TTL", "Lease TTL")} sub={t("validade do lease (renovação por heartbeat)", "lease lifetime (heartbeat renewal)")} v={<b>{fmtSec(u?.lease_ttl_seconds ?? 0)}</b>} />
          <Row k={t("Rate limit", "Rate limit")} sub={t("requisições/min por org", "requests/min per org")} v={<b>{u?.plan === "free" ? 60 : u?.plan === "pro" ? 300 : u?.plan === "team" ? 1000 : "∞"}/min</b>} />
        </div>
      )}

      {tab === "secrets" && (
        <div style={card}>
          <CardHead title="Segredos" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{t("metadado", "metadata")} · {(secrets || []).length}</span>} />
          <div style={{ padding: "10px 16px", color: "var(--mute)", fontSize: 13, borderBottom: "1px solid var(--border)" }}>
            {t("O valor nunca passa por aqui: é gravado no vault local via IPC (executor secret-put / make secret). Abaixo só o metadado (secret_ref).",
              "The value never passes through here: it's stored in the local vault via IPC (executor secret-put / make secret). Below, only the metadata (secret_ref).")}
          </div>
          <table style={tableStyle}>
            <thead><tr><th style={thCell}>{t("Nome", "Name")}</th><th style={thCell}>{t("Tipo", "Type")}</th><th style={thCell}>{t("Fingerprint", "Fingerprint")}</th><th style={thCell}>{t("Local", "Location")}</th></tr></thead>
            <tbody>
              {(secrets || []).map((s) => <tr key={s.id}><td style={cell}>{s.name}</td><td style={cell}>{s.type || "—"}</td><td style={cell}><span style={codeAmber}>{short(s.fingerprint, 12)}</span></td><td style={cell}>{s.location}</td></tr>)}
              {!secrets?.length && <tr><td style={cell} colSpan={4}>{t("nenhum segredo registrado", "no secret registered")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal title="Registrar repositório" onClose={() => setOpen(false)}
          footer={<><button style={{ ...btn, background: "var(--elev)", color: "var(--dim)" }} onClick={() => setOpen(false)}>{t("Cancelar", "Cancel")}</button><button style={btn} onClick={addRepo}>{t("Registrar")}</button></>}>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={input} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder={t("nome")} />
            <input style={input} value={r.url} onChange={(e) => setR({ ...r, url: e.target.value })} placeholder="clone_url (file:///… ou https://github.com/owner/repo.git)" />
            <input style={input} value={r.branch} onChange={(e) => setR({ ...r, branch: e.target.value })} placeholder={t("branch")} />
          </div>
        </Modal>
      )}
    </Page>
  );
}
