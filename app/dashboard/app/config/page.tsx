"use client";
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, badge, btn, card, CardHead, cell, codeAmber, codeDim, input, Modal, Page, PageHead, short, tableStyle, thCell, Toggle, usePoll, useT } from "../ui";

type Repo = { id: string; name: string; default_branch: string; clone_url: string };
type Secret = { id: string; name: string; type: string; fingerprint: string; location: string };
type Conn = { id: string; type: string; provider: string; label: string; status: string; created: string };
type Pool = { parallel_workers: number; timeout_min: number; retries: number; paused: boolean; auto_merge: boolean; isolamento: boolean };

export default function Config() {
  const t = useT();
  const { data: repos, reload } = usePoll<Repo[]>("/v1/repos", 4000);
  const { data: secrets } = usePoll<Secret[]>("/v1/secrets", 4000);
  const { data: conns } = usePoll<Conn[]>("/v1/connections", 5000);
  const [pool, setPool] = useState<Pool | null>(null);
  const [tab, setTab] = useState("workers");
  const [open, setOpen] = useState(false);
  const [r, setR] = useState({ name: "sample", url: "file:///remotes/sample.git", branch: "main" });

  const loadPool = useCallback(() => { apiGet<Pool>("/v1/pool").then((x) => { if (!(x as any)?.error) setPool(x); }).catch(() => {}); }, []);
  useEffect(() => { loadPool(); }, [loadPool]);

  async function savePool(patch: Partial<Pool>) {
    if (!pool) return;
    const next = { ...pool, ...patch };
    setPool(next);
    await apiPost("/v1/pool", next);
  }
  async function addRepo() {
    if (!r.name.trim() || !r.url.trim()) return;
    await apiPost("/v1/repos", { name: r.name, clone_url: r.url, default_branch: r.branch });
    setOpen(false); reload();
  }

  const TABS: [string, string][] = [["workers", "Workers"], ["repos", "Repositórios"], ["limits", "Limites"], ["connections", "Conexões"], ["secrets", "Segredos"]];
  const running = pool ? !pool.paused : false;
  const Sel = ({ val, opts, onChange }: { val: number; opts: number[]; onChange: (n: number) => void }) => (
    <select style={{ ...input, width: 140 }} value={val} onChange={(e) => onChange(Number(e.target.value))}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
  );
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

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: "10px 14px", fontSize: 14, fontWeight: tab === k ? 600 : 500, color: tab === k ? "var(--ink)" : "var(--dim)", borderBottom: tab === k ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1 }}>{t(label)}</button>
        ))}
      </div>

      {tab === "workers" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ ...card, padding: 16, marginBottom: 0, border: "1px solid var(--accent)", boxShadow: "0 0 0 1px var(--accent), var(--shadow)", display: "flex", gap: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent-tint)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>⇄</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b>Pool</b><span style={{ marginLeft: "auto", width: 14, height: 14, borderRadius: 14, border: "4px solid var(--accent)" }} /></div>
                <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 3 }}>{t("Workers compartilhados com config global — qualquer um pega qualquer tarefa.", "Shared workers with global config — any one picks any task.")}</div>
              </div>
            </div>
            <div style={{ ...card, padding: 16, marginBottom: 0, opacity: .65, display: "flex", gap: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--elev)", color: "var(--mute)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>⊙</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><b>Pinned</b><span style={badge("queued")}>{t("em breve", "soon")}</span><span style={{ marginLeft: "auto", width: 14, height: 14, borderRadius: 14, border: "2px solid var(--border)" }} /></div>
                <div style={{ color: "var(--mute)", fontSize: 12.5, marginTop: 3 }}>{t("Workers dedicados, criados e configurados um a um (máx. 8).", "Dedicated workers, created and configured one by one (max 8).")}</div>
              </div>
            </div>
          </div>

          <div style={{ ...card, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ position: "relative", width: 36, height: 36, borderRadius: 36, background: running ? "var(--green-tint)" : "var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {running && <span style={{ position: "absolute", inset: 5, borderRadius: 36, border: "2px solid var(--green)", animation: "pulsering 2.6s ease-out infinite" }} />}
              <span className={running ? "apf-live" : ""} style={{ width: 11, height: 11, borderRadius: 11, background: running ? "var(--green)" : "var(--mute)" }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 15 }}>{running ? t("Pool rodando", "Pool running") : t("Pool pausado", "Pool paused")}</div>
              <div style={{ color: "var(--dim)", fontSize: 13 }}>{t("Liga/desliga o pool inteiro — reflete no topo e na Dashboard.", "Turns the whole pool on/off — reflects on the topbar and Dashboard.")}</div>
            </div>
            <Toggle on={running} onChange={(v) => savePool({ paused: !v })} />
          </div>

          <div style={card}>
            <CardHead title="Configuração global do pool" />
            <Row k={t("Workers em paralelo", "Parallel workers")} sub={t("Quantos workers o pool roda ao mesmo tempo", "How many workers run at once")} v={<Sel val={pool?.parallel_workers ?? 1} opts={[1, 2, 4, 8, 16]} onChange={(n) => savePool({ parallel_workers: n })} />} />
            <Row k={t("Timeout por tarefa", "Per-task timeout")} sub={t("Encerra e marca retry após o limite (min)", "Ends and retries after the limit (min)")} v={<Sel val={pool?.timeout_min ?? 15} opts={[5, 10, 15, 30, 60]} onChange={(n) => savePool({ timeout_min: n })} />} />
            <Row k={t("Tentativas antes de bloquear", "Retries before blocking")} sub={t("Quantos retries antes de pedir um humano", "How many retries before asking a human")} v={<Sel val={pool?.retries ?? 2} opts={[0, 1, 2, 3, 5]} onChange={(n) => savePool({ retries: n })} />} />
          </div>

          <div style={card}>
            <CardHead title="Comportamento" />
            <Row k={t("Isolamento por container", "Container isolation")} sub={t("Cada tarefa roda em ambiente isolado", "Each task runs in an isolated environment")} v={<Toggle on={pool?.isolamento ?? true} onChange={(v) => savePool({ isolamento: v })} />} />
            <Row k={t("Auto-merge quando aprovado", "Auto-merge when approved")} sub={t("Pula a revisão humana e mescla após CI + revisão IA", "Skips human review and merges after CI + AI review")} v={<Toggle on={pool?.auto_merge ?? false} onChange={(v) => savePool({ auto_merge: v })} />} />
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
        <LimitsTab />
      )}

      {tab === "connections" && (
        <div style={card}>
          <CardHead title="Conexões" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{(conns || []).length}</span>} />
          <table style={tableStyle}>
            <thead><tr><th style={thCell}>{t("Provider", "Provider")}</th><th style={thCell}>{t("Tipo", "Type")}</th><th style={thCell}>{t("Rótulo", "Label")}</th><th style={thCell}>Status</th><th style={{ ...thCell, textAlign: "right" }}>{t("Criada", "Created")}</th></tr></thead>
            <tbody>
              {(conns || []).map((c) => (
                <tr key={c.id}>
                  <td style={cell}><b>{c.provider}</b></td>
                  <td style={cell}>{c.type}</td>
                  <td style={cell}>{c.label || "—"}</td>
                  <td style={cell}><span style={badge(c.status === "ok" ? "open" : c.status === "needs_setup" ? "queued" : "failed")}>{c.status}</span></td>
                  <td style={{ ...cell, textAlign: "right" }}><span style={codeDim}>{c.created}</span></td>
                </tr>
              ))}
              {!conns?.length && <tr><td style={cell} colSpan={5}>{t("nenhuma conexão", "no connections")} — {t("registre um repositório pra criar uma.", "register a repository to create one.")}</td></tr>}
            </tbody>
          </table>
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

function LimitsTab() {
  const t = useT();
  const [u, setU] = useState<{ plan: string; active_workers: number; max_workers: number | null; week_seconds_used: number; week_cap_seconds: number; lease_ttl_seconds: number } | null>(null);
  useEffect(() => { apiGet("/v1/usage").then((x: any) => { if (!x?.error) setU(x); }).catch(() => {}); }, []);
  const fmt = (s: number) => (s ? (s >= 3600 ? (s / 3600).toFixed(1) + "h" : s + "s") : "∞");
  const Row = ({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
      <div><div style={{ fontWeight: 500 }}>{k}</div>{sub && <div style={{ color: "var(--mute)", fontSize: 12.5, marginTop: 2 }}>{sub}</div>}</div>
      <div><b>{v}</b></div>
    </div>
  );
  return (
    <div style={card}>
      <CardHead title="Limites do plano" right={<span style={badge(u?.plan === "free" ? "queued" : "open")}>{u?.plan || "—"}</span>} />
      <Row k={t("Workers simultâneos", "Concurrent workers")} sub={t("máximo do plano", "plan maximum")} v={`${u?.active_workers ?? 0} / ${u?.max_workers ?? "∞"}`} />
      <Row k={t("Worker-hours (semana)", "Worker-hours (week)")} v={`${fmt(u?.week_seconds_used ?? 0)} / ${fmt(u?.week_cap_seconds ?? 0)}`} />
      <Row k={t("Lease TTL", "Lease TTL")} v={fmt(u?.lease_ttl_seconds ?? 0)} />
      <Row k={t("Rate limit", "Rate limit")} v={`${u?.plan === "free" ? 60 : u?.plan === "pro" ? 300 : u?.plan === "team" ? 1000 : "∞"}/min`} />
    </div>
  );
}
