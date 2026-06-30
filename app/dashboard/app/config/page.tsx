"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, badge, btn, input, Modal, Page, PageHead, short, Toggle, usePoll } from "../ui";

type Repo    = { id: string; name: string; default_branch: string; clone_url: string };
type Secret  = { id: string; name: string; type: string; fingerprint: string; location: string };
type Conn    = { id: string; type: string; provider: string; label: string; status: string; created: string };
type Pool    = { mode: string; parallel_workers: number; timeout_min: number; retries: number; paused: boolean; auto_merge: boolean; isolamento: boolean };
type PinnedW = { id: string; focus: string; repo_id: string; repo_name: string; concurrency: number; model: string };

const MODELS = ["claude_opus", "claude_sonnet", "claude_haiku"];
const MODEL_LABELS: Record<string, string> = { claude_opus: "Claude Opus 4.8", claude_sonnet: "Claude Sonnet 4.6", claude_haiku: "Claude Haiku 4.5" };
// IDs reais da API Anthropic (p/ chamadas / referência).
const MODEL_API_IDS: Record<string, string> = { claude_opus: "claude-opus-4-8", claude_sonnet: "claude-sonnet-4-6", claude_haiku: "claude-haiku-4-5-20251001" };
const AGENTS = [
  { role: "Planejador",   desc: "Decompõe a tarefa em etapas",           model: "claude_opus" },
  { role: "Codificador",  desc: "Escreve e edita o código",               model: "claude_sonnet" },
  { role: "Revisor IA",   desc: "Revisa o PR antes do merge",             model: "claude_opus" },
  { role: "Testador",     desc: "Escreve e executa os testes",            model: "claude_haiku" },
];
const FOCOS = ["Features e correções", "Apenas segurança", "Documentação", "Testes", "Tudo"];

// ─── shared styles ───────────────────────────────────────────────────
const sCard: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" };
const sCardHead = (extra?: React.CSSProperties): React.CSSProperties => ({ padding: "13px 18px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--ink)", ...extra });
const sSel: React.CSSProperties = { height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer", minWidth: 160 };
const sTabBtn = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 2px",
  border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5,
  fontWeight: active ? 600 : 500, color: active ? "var(--ink)" : "var(--dim)",
  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  marginBottom: -1, whiteSpace: "nowrap",
});
const sConnPill = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 7,
  border: active ? "1px solid var(--border)" : "1px solid transparent",
  background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)",
  fontSize: 12.5, fontWeight: active ? 600 : 500, cursor: "pointer",
});
const sFilledBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={sCardHead({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" })}>
      <div>
        <div>{title}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--mute)", fontWeight: 400, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function CardHeadIcon({ icon, title, sub, count, right }: { icon: React.ReactNode; title: string; sub?: string; count?: number; right?: React.ReactNode }) {
  return (
    <div style={sCardHead({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" })}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>{icon}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
            {count !== undefined && <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--dim)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px" }}>{count}</span>}
          </div>
          {sub && <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 1 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

function Row({ label, sub, right, last }: { label: string; sub?: string; right: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "13px 0", ...(last ? {} : { borderBottom: "1px solid var(--border)" }) }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{label}</span>
        {sub && <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{sub}</span>}
      </div>
      {right}
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--mute)", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 10, padding: "12px 15px" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>
      </svg>
      {children}
    </div>
  );
}

function accentTile(name: string): React.CSSProperties {
  const hues = ["var(--accent)", "var(--green)", "var(--orange)", "var(--blue)", "var(--red)"];
  const h = hues[(name.charCodeAt(0) || 0) % hues.length];
  return { width: 36, height: 36, flexShrink: 0, borderRadius: 9, background: "var(--accent-tint)", color: h, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700 };
}

// ─── main component ───────────────────────────────────────────────────
export default function Config() {
  const { data: repos, reload }                = usePoll<Repo[]>("/v1/repos", 4000);
  const { data: secrets }                      = usePoll<Secret[]>("/v1/secrets", 4000);
  const { data: conns, reload: reloadConns }   = usePoll<Conn[]>("/v1/connections", 5000);
  const { data: pinned, reload: reloadPinned } = usePoll<PinnedW[]>("/v1/pinned-workers", 4000);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (repos !== undefined) setLoading(false); }, [repos]);
  const [pool, setPool]       = useState<Pool | null>(null);
  const [tab, setTab]         = useState("workers");
  const [connTab, setConnTab] = useState("codigo");

  const [agentModels, setAgentModels] = useState(() => Object.fromEntries(AGENTS.map((a) => [a.role, a.model])));
  const [mergeRules, setMergeRules]   = useState({ ciVerde: true, aprovacaoIA: true, revisaoHumana: false, deleteBranch: true, strategy: "Squash and merge" });
  const [poolBehavior, setPoolBehavior] = useState({ autoscale: false, foco: "Features e correções" });
  const [poolRepoSearch, setPoolRepoSearch] = useState("");

  const [repoOpen, setRepoOpen] = useState(false);
  const [r, setR]               = useState({ name: "", url: "file:///remotes/", branch: "main" });
  const [pwOpen, setPwOpen]     = useState(false);
  const [pw, setPw]             = useState({ focus: "backend", repo_id: "", model: "claude_opus", concurrency: 1 });
  const [iaModal, setIaModal]   = useState<"subscription" | "api" | null>(null);
  const [iaApiKey, setIaApiKey] = useState("");
  const [iaBusy, setIaBusy]     = useState(false);
  // fluxo OAuth assinatura: idle → aguardando código colado
  const [iaStep, setIaStep]     = useState<"idle" | "await_code">("idle");
  const [iaUrl, setIaUrl]       = useState("");
  const [iaCode, setIaCode]     = useState("");
  const [iaErr, setIaErr]       = useState("");
  // teste da API key: null = não testada; {ok,msg}
  const [iaTest, setIaTest]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [iaTesting, setIaTesting] = useState(false);

  function resetIA() {
    setIaModal(null); setIaApiKey(""); setIaStep("idle");
    setIaUrl(""); setIaCode(""); setIaErr(""); setIaBusy(false);
    setIaTest(null); setIaTesting(false);
  }

  async function testApiKey() {
    if (!iaApiKey.trim()) return;
    setIaTesting(true); setIaTest(null);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/anthropic/test", { api_key: iaApiKey.trim() });
      setIaTest({ ok: !!r?.ok, msg: r?.message || (r?.ok ? "chave válida" : "chave inválida") });
    } catch (e) {
      setIaTest({ ok: false, msg: e instanceof Error ? e.message : "falha no teste" });
    } finally { setIaTesting(false); }
  }

  // assinatura: inicia o `claude setup-token`, abre a URL de autorização e
  // pede o código de volta (PKCE — o backend dirige o CLI real).
  async function claudeStart() {
    setIaBusy(true); setIaErr("");
    try {
      const r = await apiPost<{ url?: string; error?: { message?: string } }>("/v1/connections/claude/start", {});
      if (!r?.url) throw new Error(r?.error?.message || "falha ao iniciar autorização");
      setIaUrl(r.url); setIaStep("await_code");
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setIaErr(e instanceof Error ? e.message : "falha ao iniciar autorização");
    } finally { setIaBusy(false); }
  }

  async function claudeSubmitCode() {
    if (!iaCode.trim()) return;
    setIaBusy(true); setIaErr("");
    try {
      const r = await apiPost<{ ok?: boolean; error?: { message?: string } }>("/v1/connections/claude/code", { code: iaCode.trim() });
      if (!r?.ok) throw new Error(r?.error?.message || "código rejeitado");
      reloadConns(); resetIA();
    } catch (e) {
      setIaErr(e instanceof Error ? e.message : "código rejeitado");
    } finally { setIaBusy(false); }
  }

  async function connectApiKey() {
    setIaBusy(true);
    try {
      await apiPost("/v1/connections", { kind: "api" });
      reloadConns(); resetIA();
    } finally { setIaBusy(false); }
  }

  const loadPool = useCallback(() => {
    apiGet<Pool>("/v1/pool").then((x) => { if (!(x as any)?.error) setPool(x); }).catch(() => {});
  }, []);
  useEffect(() => { loadPool(); const id = setInterval(loadPool, 5000); return () => clearInterval(id); }, [loadPool]);

  async function savePool(patch: Partial<Pool>) {
    if (!pool) return;
    const next = { ...pool, ...patch };
    setPool(next);
    await apiPost("/v1/pool", next);
  }
  async function addRepo() {
    if (!r.name.trim() || !r.url.trim()) return;
    await apiPost("/v1/repos", { name: r.name, clone_url: r.url, default_branch: r.branch });
    setRepoOpen(false); setR({ name: "", url: "file:///remotes/", branch: "main" }); reload();
  }
  async function addPinned() {
    await apiPost("/v1/pinned-workers", pw);
    setPwOpen(false); reloadPinned();
  }
  async function delPinned(id: string) { await apiDelete(`/v1/pinned-workers/${id}`); reloadPinned(); }

  const running    = pool ? !pool.paused : false;
  const mode       = pool?.mode || "pool";
  const poolColor  = running ? "var(--green)" : "var(--mute)";
  const pinnedList = pinned || [];

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Sistema" title="Configuração"
        subtitle="Ajustes do pipeline — workers, modelos, merge, limites, conexões e segredos."
      />

      {/* ── tab bar ── */}
      <div style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--border)", overflowX: "auto", marginBottom: 18 }}>
        {([
          ["workers",    "Workers",       "M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4"],
          ["repos",      "Repositórios",  "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
          ["limits",     "Limites",       "M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"],
          ["connections","Conexões",      "M9 15l6-6M11 6l1-1a4 4 0 0 1 6 6l-1 1M13 18l-1 1a4 4 0 0 1-6-6l1-1"],
          ["secrets",    "Segredos",      "M10.5 12.5L20 3l1.5 1.5-1.5 1.5 1.5 1.5-2.5 2.5-1.5-1.5"],
        ] as [string, string, string][]).map(([k, label, d]) => (
          <button key={k} onClick={() => setTab(k)} style={sTabBtn(tab === k)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {k === "secrets" && <circle cx="8" cy="15" r="4"/>}
              <path d={d}/>
            </svg>
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ WORKERS ═══════════ */}
      {tab === "workers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* mode cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {([
              ["pool",   "Pool",   "Workers compartilhados com config global — qualquer um pega qualquer tarefa, em qualquer repositório."],
              ["pinned", "Pinned", "Workers dedicados, criados e configurados um a um (máx. 8)."],
            ] as [string, string, string][]).map(([m, label, desc]) => {
              const on = mode === m;
              return (
                <button key={m} onClick={() => savePool({ mode: m })} style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", gap: 12, padding: "15px 18px", borderRadius: 13, border: on ? "2px solid var(--accent)" : "2px solid var(--border)", background: "var(--card)", cursor: "pointer", boxShadow: on ? "0 0 0 3px var(--accent-tint)" : "var(--shadow)", textAlign: "left" }}>
                  <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                    {m === "pool" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>
                        <path d="M8.6 10.7l6.8-3.4M8.6 13.3l6.8 3.4"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>
                      </svg>
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{label}</span>
                    <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.45 }}>{desc}</span>
                  </span>
                  <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: "50%", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {on && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)" }} />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── pool mode ── */}
          {mode === "pool" && (
            <>
              {/* pool status */}
              <div style={{ ...sCard, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ position: "relative", width: 11, height: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {running && <span style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "var(--green)", opacity: .3, animation: "pulsering 2.4s ease-out infinite" }} />}
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: poolColor, boxShadow: `0 0 10px ${poolColor}` }} />
                </span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Pool {running ? "rodando" : "pausado"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--mute)" }}>Liga/desliga o pool inteiro — reflete no topo e na Dashboard.</div>
                </div>
                <Toggle on={running} onChange={(v) => savePool({ paused: !v })} />
              </div>

              {/* pool config */}
              <div style={sCard}>
                <CardHead title="Configuração global do pool" sub="Aplica-se a todos os workers do pool." />
                <div style={{ padding: "4px 18px 10px" }}>
                  <Row label="Workers em paralelo" sub="Máximo de 8 no plano Pro" right={
                    <select style={sSel} value={pool?.parallel_workers ?? 1} onChange={(e) => savePool({ parallel_workers: Number(e.target.value) })}>
                      {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>{n} workers</option>)}
                    </select>
                  } />
                  <Row label="Timeout por tarefa" sub="Encerra e marca retry após o limite" right={
                    <select style={sSel} value={pool?.timeout_min ?? 30} onChange={(e) => savePool({ timeout_min: Number(e.target.value) })}>
                      {[15, 30, 45, 60].map((n) => <option key={n} value={n}>{n} min</option>)}
                      <option value={0}>Sem limite</option>
                    </select>
                  } />
                  <Row label="Tentativas antes de bloquear" sub="Quantos retries antes de pedir um humano" last right={
                    <select style={sSel} value={pool?.retries ?? 2} onChange={(e) => savePool({ retries: Number(e.target.value) })}>
                      {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} tentativa{n > 1 ? "s" : ""}</option>)}
                    </select>
                  } />
                </div>
              </div>

              {/* pool repos mini card */}
              <div style={sCard}>
                <CardHead title="Repositórios do pool" sub="Repositórios em que os workers do pool podem trabalhar."
                  right={<button onClick={() => setTab("repos")} style={{ fontSize: 11.5, color: "var(--dim)", background: "transparent", border: "none", cursor: "pointer" }}>Gerenciar →</button>}
                />
                <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 9 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {(repos || []).length > 0 ? (repos || []).map((rx) => (
                      <span key={rx.id} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px 6px 11px", borderRadius: 8, background: "var(--accent-tint)", border: "1px solid var(--accent)", fontSize: 12.5, color: "var(--ink)" }}>
                        {rx.name}
                      </span>
                    )) : (
                      <span style={{ fontSize: 12, color: "var(--mute)", padding: "4px 0" }}>Nenhum repositório selecionado.</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={poolRepoSearch} onChange={(e) => setPoolRepoSearch(e.target.value)} placeholder="Buscar repositório para adicionar…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
                  </div>
                </div>
              </div>

              {/* behavior */}
              <div style={sCard}>
                <div style={sCardHead()}>Comportamento</div>
                <div style={{ padding: "4px 18px 10px" }}>
                  <Row label="Isolamento por container" sub="Cada tarefa roda em ambiente isolado" right={<Toggle on={pool?.isolamento ?? true} onChange={(v) => savePool({ isolamento: v })} />} />
                  <Row label="Auto-scale conforme a fila" sub="Sobe workers extras quando a fila cresce" right={<Toggle on={poolBehavior.autoscale} onChange={(v) => setPoolBehavior({ ...poolBehavior, autoscale: v })} />} />
                  <Row label="Auto-merge quando aprovado" sub="Mescla sozinho quando CI e revisão IA passam" right={<Toggle on={pool?.auto_merge ?? false} onChange={(v) => savePool({ auto_merge: v })} />} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "13px 0" }}>
                    <Row label="Foco do pool" sub="Tipo de tarefa que o pool prioriza" last right={
                      <select style={sSel} value={poolBehavior.foco} onChange={(e) => setPoolBehavior({ ...poolBehavior, foco: e.target.value })}>
                        {FOCOS.map((f) => <option key={f}>{f}</option>)}
                      </select>
                    } />
                  </div>
                </div>
              </div>

              {/* models per agent */}
              <div style={sCard}>
                <CardHead title="Modelos por agente" sub="Modelo que cada agente usa nos workers do pool." />
                <div style={{ padding: "4px 18px 10px" }}>
                  {AGENTS.map((a, i) => (
                    <div key={a.role} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "13px 0", ...(i < AGENTS.length - 1 ? { borderBottom: "1px solid var(--border)" } : {}), flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 180 }}>
                        <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3"/></svg>
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{a.role}</span>
                          <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{a.desc}</span>
                        </div>
                      </div>
                      <select style={{ ...sSel, minWidth: 190 }} value={agentModels[a.role]} onChange={(e) => setAgentModels({ ...agentModels, [a.role]: e.target.value })}>
                        {MODELS.map((m) => <option key={m} value={m}>{MODEL_LABELS[m]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* merge rules */}
              <div style={sCard}>
                <div style={sCardHead()}>Regras de merge</div>
                <div style={{ padding: "4px 18px 10px" }}>
                  <Row label="Estratégia de merge" sub="Como os PRs são integrados" right={
                    <select style={{ ...sSel, minWidth: 190 }} value={mergeRules.strategy} onChange={(e) => setMergeRules({ ...mergeRules, strategy: e.target.value })}>
                      {["Squash and merge", "Merge commit", "Rebase and merge"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  } />
                  <Row label="Exigir CI verde" sub="Não mescla com testes falhando" right={<Toggle on={mergeRules.ciVerde} onChange={(v) => setMergeRules({ ...mergeRules, ciVerde: v })} />} />
                  <Row label="Exigir aprovação da revisão IA" sub="A segunda IA precisa aprovar o código" right={<Toggle on={mergeRules.aprovacaoIA} onChange={(v) => setMergeRules({ ...mergeRules, aprovacaoIA: v })} />} />
                  <Row label="Exigir revisão humana" sub="Bloqueia o merge até um humano aprovar" right={<Toggle on={mergeRules.revisaoHumana} onChange={(v) => setMergeRules({ ...mergeRules, revisaoHumana: v })} />} />
                  <Row label="Deletar branch após merge" sub="Mantém o repositório limpo" last right={<Toggle on={mergeRules.deleteBranch} onChange={(v) => setMergeRules({ ...mergeRules, deleteBranch: v })} />} />
                </div>
              </div>

              {/* memory + KB */}
              <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Memória e conhecimento</span>
                <span style={{ fontSize: 11.5, color: "var(--mute)" }}>Compartilhados por todos os workers do Pool.</span>
              </div>

              <div style={sCard}>
                <CardHeadIcon
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/></svg>}
                  title="Memórias" count={0}
                  sub="Instruções aprendidas que orientam decisões futuras."
                  right={<button style={{ ...btn, height: 32, padding: "0 13px", fontSize: 12 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14"/></svg>
                    Adicionar
                  </button>}
                />
                <div style={{ padding: "30px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/></svg>
                  <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Nenhuma memória ainda.</span>
                  <span style={{ fontSize: 11, color: "var(--mute)" }}>Adicione instruções ou salve decisões na Intervenção.</span>
                </div>
              </div>

              <div style={sCard}>
                <CardHeadIcon
                  icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}
                  title="Base de conhecimento" count={0}
                  sub="Documentações e arquivos locais que os agentes podem consultar."
                  right={<button style={{ height: 32, padding: "0 13px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12"/></svg>
                    Importar
                  </button>}
                />
                <div style={{ padding: "30px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/></svg>
                  <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Nenhum documento importado.</span>
                  <span style={{ fontSize: 11, color: "var(--mute)" }}>Importe docs, specs ou guias para os agentes consultarem.</span>
                </div>
              </div>
            </>
          )}

          {/* ── pinned mode ── */}
          {mode === "pinned" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Workers dedicados</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--mute)" }}>{pinnedList.length} / 8</span>
                </div>
                <button style={sFilledBtn} disabled={pinnedList.length >= 8} onClick={() => setPwOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                  Adicionar worker
                </button>
              </div>

              {running && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--red)", background: "var(--red-tint)", border: "1px solid rgba(248,81,73,.28)", borderRadius: 10, padding: "11px 14px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                  O Pool está ligado. Desligue-o para ativar workers fixos.
                </div>
              )}

              {pinnedList.map((p) => {
                const isActive    = !running;
                const pillColor   = isActive ? "var(--green)" : "var(--mute)";
                const pillBg      = isActive ? "var(--green-tint)" : "var(--border)";
                return (
                  <div key={p.id} style={{ ...sCard }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
                      <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{p.focus || "worker dedicado"}</div>
                        <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>preso a {p.repo_name || "qualquer repo"}</div>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: pillColor, background: pillBg, flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: pillColor }} />
                        {isActive ? "ativo" : "inativo"}
                      </span>
                      <button style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                        Editar
                      </button>
                      <button onClick={() => delPinned(p.id)} title="Deletar worker" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 1, background: "var(--border)" }}>
                      {[["Repositório", p.repo_name || "qualquer"], ["Foco", p.focus], ["Concorrência", String(p.concurrency)]].map(([k, v]) => (
                        <div key={k} style={{ background: "var(--card)", padding: "11px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--mute)" }}>{k}</span>
                          <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, fontFamily: "var(--mono)" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!pinnedList.length && (
                <div style={{ padding: "18px", color: "var(--mute)", fontSize: 13 }}>
                  nenhum worker dedicado — adicione o primeiro. O total de concorrências vira o teto do pool.
                </div>
              )}
              <InfoNote>No modo Pinned cada worker só pega tarefas do seu repositório, com modelo e comportamento próprios.</InfoNote>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ REPOSITÓRIOS ═══════════ */}
      {tab === "repos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Repositórios disponíveis</span>
            <button style={sFilledBtn} onClick={() => setRepoOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              Adicionar repositório
            </button>
          </div>

          {(repos || []).map((rx) => (
            <div key={rx.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", boxShadow: "var(--shadow)", flexWrap: "wrap" }}>
              <div style={accentTile(rx.name)}>{rx.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{rx.name}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--dim)", background: "var(--elev)", borderRadius: 5, padding: "1px 7px" }}>{rx.default_branch}</span>
                </div>
                <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{short(rx.clone_url, 60)}</span>
              </div>
              <button style={{ height: 32, padding: "0 13px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                Editar
              </button>
              <button title="Excluir" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
              </button>
            </div>
          ))}
          {!(repos || []).length && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>
              nenhum repositório — adicione o primeiro.
            </div>
          )}
          <InfoNote>Estes repositórios ficam disponíveis para os workers. No worker Pinned você escolhe em quais ele pode trabalhar.</InfoNote>
        </div>
      )}

      {/* ═══════════ LIMITES ═══════════ */}
      {tab === "limits" && <LimitsTab />}

      {/* ═══════════ CONEXÕES ═══════════ */}
      {tab === "connections" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* sub-tabs */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 5 }}>
            {([
              ["codigo",  "Código"],
              ["tarefas", "Fonte de tarefas"],
              ["ci",      "CI remoto"],
              ["observ",  "Observabilidade"],
              ["ia",      "Motor de IA"],
            ] as [string, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setConnTab(k)} style={sConnPill(connTab === k)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {k === "codigo"  && <><path d="M8 9l-3 3 3 3M16 9l3 3-3 3"/></>}
                  {k === "tarefas" && <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>}
                  {k === "ci"      && <><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></>}
                  {k === "observ"  && <><circle cx="12" cy="12" r="2.5"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/></>}
                  {k === "ia"      && <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>}
                </svg>
                {label}
              </button>
            ))}
          </div>

          {connTab === "ia" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                {
                  key: "subscription" as const,
                  title: "Assinatura Claude",
                  sub: "Use sua conta Claude.ai — nenhuma API key necessária.",
                  badge: "Recomendado",
                  iconPath: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
                },
                {
                  key: "api" as const,
                  title: "API Anthropic",
                  sub: "Conecte via API key — controle total de modelos e limites de uso.",
                  badge: null,
                  iconPath: "M8 9l-3 3 3 3M16 9l3 3-3 3",
                },
              ]).map(({ key, title, sub, badge: b, iconPath }) => {
                const iaConn = (conns || []).find((c) => c.type === "ai_engine");
                const active = !!iaConn && (key === "subscription" ? /assinatura/i.test(iaConn.provider) : /api/i.test(iaConn.provider));
                return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "var(--card)", border: active ? "1px solid var(--green)" : "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", flexWrap: "wrap" }}>
                  <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, background: "var(--accent-tint)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath}/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
                      {active
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "var(--green)", background: "rgba(63,185,80,.12)", border: "1px solid rgba(63,185,80,.4)", borderRadius: 5, padding: "1px 7px" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>Conectado</span>
                        : b && <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent)", background: "var(--accent-tint)", border: "1px solid var(--accent)", borderRadius: 5, padding: "1px 7px" }}>{b}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 3 }}>{sub}</div>
                  </div>
                  <button style={active ? { ...sFilledBtn, background: "transparent", color: "var(--ink)", border: "1px solid var(--border)" } : sFilledBtn} onClick={() => { setIaStep("idle"); setIaUrl(""); setIaCode(""); setIaErr(""); setIaModal(key); }}>{active ? "Reconectar" : "Conectar"}</button>
                </div>
              );})}
              <InfoNote>Escolha um método para o motor de IA processar tarefas. Assinatura usa sua conta Claude.ai; API usa chave própria faturada por token.</InfoNote>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {(conns || []).map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", boxShadow: "var(--shadow)", flexWrap: "wrap" }}>
                  <div style={accentTile(c.provider)}>{c.provider.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{c.provider}</span>
                      <span style={badge(c.status === "ok" ? "open" : c.status === "needs_setup" ? "queued" : "failed")}>{c.status}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--mute)" }}>{c.type}{c.label ? ` · ${c.label}` : ""}</div>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{c.created}</span>
                </div>
              ))}
              {!(conns || []).length && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>
                  nenhuma conexão — registre um repositório para criar uma.
                </div>
              )}
              <InfoNote>As conexões alimentam Tarefas, Pull Requests e CI. Os tokens ficam em Segredos.</InfoNote>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ SEGREDOS ═══════════ */}
      {tab === "secrets" && (
        <div style={sCard}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Segredos &amp; tokens</span>
            <button style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 13px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              Adicionar segredo
            </button>
          </div>
          {(secrets || []).map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
              <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, background: "var(--elev)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.5 12.5L20 3l1.5 1.5-1.5 1.5 1.5 1.5-2.5 2.5-1.5-1.5"/></svg>
              </span>
              <div style={{ flex: 1, minWidth: 150, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{s.name}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{s.type || s.location} · {short(s.fingerprint, 12)}</span>
              </div>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--mute)", letterSpacing: 1, flexShrink: 0 }}>••••••••••</span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {[
                  ["Revelar","M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 12m-3 0a3 3 0 1 1 6 0 3 3 0 0 1-6 0"],
                  ["Editar","M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
                ].map(([title, d]) => (
                  <button key={title} title={title} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--mute)", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
                  </button>
                ))}
                <button title="Excluir" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                </button>
              </div>
            </div>
          ))}
          {!(secrets || []).length && (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>nenhum segredo registrado</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--mute)", padding: "12px 16px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>
            Segredos são criptografados e nunca exibidos novamente após salvos.
          </div>
        </div>
      )}

      {/* ═══════════ MODALS ═══════════ */}
      {repoOpen && (
        <Modal title="Adicionar repositório" onClose={() => setRepoOpen(false)}
          footer={<>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setRepoOpen(false)}>Cancelar</button>
            <button style={btn} onClick={addRepo}>Registrar</button>
          </>}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Nome</span>
              <input style={input} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="meu-repo" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Clone URL</span>
              <input style={input} value={r.url} onChange={(e) => setR({ ...r, url: e.target.value })} placeholder="file:///remotes/… ou https://github.com/org/repo.git" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Branch padrão</span>
              <input style={input} value={r.branch} onChange={(e) => setR({ ...r, branch: e.target.value })} placeholder="main" />
            </label>
          </div>
        </Modal>
      )}

      {iaModal === "subscription" && (
        <Modal title="Conectar via Assinatura Claude" onClose={resetIA}
          footer={iaStep === "idle" ? <>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetIA}>Cancelar</button>
            <button style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8, opacity: iaBusy ? .6 : 1, pointerEvents: iaBusy ? "none" : "auto" }} onClick={claudeStart}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
              {iaBusy ? "Abrindo…" : "Autorizar com Claude"}
            </button>
          </> : <>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetIA}>Cancelar</button>
            <button style={{ ...btn, opacity: iaBusy || !iaCode.trim() ? .6 : 1, pointerEvents: iaBusy || !iaCode.trim() ? "none" : "auto" }} onClick={claudeSubmitCode}>{iaBusy ? "Verificando…" : "Confirmar"}</button>
          </>}>
          {iaStep === "idle" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, padding: "12px 8px 4px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 15, background: "var(--accent-tint)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Conectar sua conta Claude</span>
                <span style={{ fontSize: 12.5, color: "var(--mute)", lineHeight: 1.55, maxWidth: 340 }}>Abrimos o Claude.ai numa nova aba pra você autorizar. Nenhuma API key — o uso é debitado da sua assinatura.</span>
              </div>
              {iaErr && <span style={{ fontSize: 12, color: "var(--red)" }}>{iaErr}</span>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 2px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12.5, color: "var(--mute)", lineHeight: 1.55 }}>
                  Autorize no Claude.ai (abriu em nova aba) e cole aqui o código exibido ao final.
                </span>
                <a href={iaUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, wordBreak: "break-all" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                  reabrir página de autorização
                </a>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Código de autorização</span>
                <input style={input} value={iaCode} autoFocus onChange={(e) => setIaCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") claudeSubmitCode(); }} placeholder="cole o código aqui" />
              </label>
              {iaErr && <span style={{ fontSize: 12, color: "var(--red)" }}>{iaErr}</span>}
            </div>
          )}
        </Modal>
      )}

      {iaModal === "api" && (
        <Modal title="Conectar via API Anthropic" onClose={resetIA}
          footer={<>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetIA}>Cancelar</button>
            <button style={{ ...btn, opacity: iaBusy || !iaApiKey.trim() ? .6 : 1, pointerEvents: iaBusy || !iaApiKey.trim() ? "none" : "auto" }} onClick={connectApiKey}>{iaBusy ? "Salvando…" : "Salvar"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>API Key</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...input, flex: 1 }} type="password" value={iaApiKey} onChange={(e) => { setIaApiKey(e.target.value); setIaTest(null); }} placeholder="sk-ant-…" />
                <button
                  style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", opacity: iaTesting || !iaApiKey.trim() ? .6 : 1, pointerEvents: iaTesting || !iaApiKey.trim() ? "none" : "auto" }}
                  onClick={testApiKey}>{iaTesting ? "Testando…" : "Testar"}</button>
              </div>
              {iaTest && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: iaTest.ok ? "var(--green)" : "var(--red)", marginTop: 2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    {iaTest.ok ? <path d="M5 12l4 4 10-10"/> : <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>}
                  </svg>
                  {iaTest.msg}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Modelo padrão</span>
              <select style={sSel}>
                {MODELS.map((m) => <option key={m} value={m} title={MODEL_API_IDS[m]}>{MODEL_LABELS[m]} ({MODEL_API_IDS[m]})</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "14px 16px", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.25)", borderRadius: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z"/></svg>
              <span style={{ fontSize: 12, color: "var(--mute)", lineHeight: 1.5 }}>A chave é armazenada criptografada e nunca exibida novamente. Você pode revogar o acesso a qualquer momento em Segredos.</span>
            </div>
          </div>
        </Modal>
      )}

      {pwOpen && (
        <Modal title="Adicionar worker dedicado" onClose={() => setPwOpen(false)}
          footer={<>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setPwOpen(false)}>Cancelar</button>
            <button style={btn} onClick={addPinned}>Criar worker</button>
          </>}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Foco</span>
              <input style={input} value={pw.focus} onChange={(e) => setPw({ ...pw, focus: e.target.value })} placeholder="backend, frontend, tests…" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Repositório</span>
              <select style={input} value={pw.repo_id} onChange={(e) => setPw({ ...pw, repo_id: e.target.value })}>
                <option value="">(qualquer repo)</option>
                {(repos || []).map((rx) => <option key={rx.id} value={rx.id}>{rx.name}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Modelo</span>
              <select style={input} value={pw.model} onChange={(e) => setPw({ ...pw, model: e.target.value })}>
                {MODELS.map((m) => <option key={m} value={m}>{MODEL_LABELS[m]}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--dim)" }}>
              Concorrência
              <select style={{ ...input, width: 90 }} value={pw.concurrency} onChange={(e) => setPw({ ...pw, concurrency: Number(e.target.value) })}>
                {[1,2,3,4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span style={{ fontSize: 11.5, color: "var(--mute)" }}>O modelo escolhido roda nas tarefas desse repo; a soma das concorrências é o teto do pool.</span>
          </div>
        </Modal>
      )}
    </Page>
  );
}

// ─── limits tab ────────────────────────────────────────────────────────
function LimitsTab() {
  const [u, setU] = useState<{
    plan: string; active_workers: number; max_workers: number | null;
    week_seconds_used: number; week_cap_seconds: number; lease_ttl_seconds: number;
  } | null>(null);
  useEffect(() => { apiGet("/v1/usage").then((x: any) => { if (!x?.error) setU(x); }).catch(() => {}); }, []);

  const sCard2: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" };
  const sCardH = { padding: "13px 18px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--ink)" } as React.CSSProperties;
  const sBody  = { padding: "4px 18px 10px" } as React.CSSProperties;

  function R({ label, sub, right, last }: { label: string; sub?: string; right: React.ReactNode; last?: boolean }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "13px 0", ...(last ? {} : { borderBottom: "1px solid var(--border)" }) }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{label}</span>
          {sub && <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{sub}</span>}
        </div>
        <div>{right}</div>
      </div>
    );
  }

  const isPaid = u?.plan ? u.plan !== "free" : false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isPaid && (
        <div style={sCard2}>
          <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Limite por % de uso</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--accent)", background: "var(--accent-tint)", borderRadius: 5, padding: "2px 6px" }}>ASSINATURA</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 2 }}>Limita pelo percentual da cota do plano, em vez de um valor fixo.</div>
          </div>
          <div style={sBody}>
            <R label="Limitar por % do plano" sub="Usa a cota da assinatura como base" right={<Toggle on={false} onChange={() => {}} />} />
            <R label="Pausar ao atingir" sub="% da cota mensal do plano" last right={
              <select style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer", minWidth: 120 }}>
                {["50%","70%","80%","90%","100%"].map((v) => <option key={v}>{v}</option>)}
              </select>
            } />
          </div>
        </div>
      )}

      {/* gastos */}
      <div style={sCard2}>
        <div style={sCardH}>Gastos</div>
        <div style={sBody}>
          <R label="Teto de gasto diário" sub="Alimenta o card de gasto da Dashboard" right={
            <input defaultValue="R$ 800,00" style={{ height: 36, width: 140, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, fontFamily: "var(--mono)" }} />
          } />
          <R label="Teto mensal" sub="Limite agregado do ciclo" right={
            <input defaultValue="R$ 24.000,00" style={{ height: 36, width: 140, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, fontFamily: "var(--mono)" }} />
          } />
          <R label="Pausa automática ao atingir o teto" sub="Interrompe novos workers automaticamente" last right={<Toggle on={false} onChange={() => {}} />} />
        </div>
      </div>

      {/* capacidade */}
      <div style={sCard2}>
        <div style={sCardH}>Capacidade</div>
        <div style={sBody}>
          <R label="Tokens por tarefa" sub="Corta a tarefa se exceder" right={
            <input defaultValue="50.000" style={{ height: 36, width: 120, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, fontFamily: "var(--mono)" }} />
          } />
          <R label="PRs abertos simultâneos" sub="Limite de PRs aguardando merge" right={
            <input defaultValue="20" style={{ height: 36, width: 120, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, fontFamily: "var(--mono)" }} />
          } />
          <R label="Janela de operação" sub="Quando o pool pode rodar" last right={
            <select style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer", minWidth: 190 }}>
              <option>24/7</option>
              <option>Horário comercial (9h–18h)</option>
              <option>Personalizado</option>
            </select>
          } />
        </div>
      </div>
    </div>
  );
}
