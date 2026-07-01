"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost, badge, btn, input, Modal, Page, PageHead, short, toast, Toggle, usePoll } from "../ui";

type Repo    = { id: string; name: string; default_branch: string; clone_url: string };
type Secret  = { id: string; name: string; type: string; fingerprint: string; location: string };
type Conn    = { id: string; type: string; provider: string; label: string; status: string; created: string };
type Pool    = { mode: string; parallel_workers: number; timeout_min: number; retries: number; paused: boolean; auto_merge: boolean; isolamento: boolean };
type PinnedW = { id: string; focus: string; repo_id: string; repo_name: string; concurrency: number; model: string; rules?: string; enabled?: boolean; cap_open_pr?: boolean; cap_run_tests?: boolean; cap_auto_merge?: boolean };

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

// CI remoto + Observabilidade + Documentação: config de cada provider.
type IntField = "token" | "username" | "project" | "email" | "site";
const INT_META: Record<string, { title: string; ctype: "ci" | "observability" | "docs"; fields: IntField[]; tokenLabel: string; help: string; docs: string; noTest?: boolean; oauth?: "docs" | "ci"; iconPath: string }> = {
  cypress:             { title: "Cypress Cloud",       ctype: "ci",            fields: ["project", "token"], tokenLabel: "Record key",           help: "Cypress Cloud → Project Settings → Record Keys.",      docs: "https://cloud.cypress.io",                       noTest: true, iconPath: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 9c-1.5 0-2.5 1.3-2.5 3s1 3 2.5 3c1 0 1.7-.5 2-1.3M16 8.7c-.4-.5-1-.7-1.7-.7-1.5 0-2.5 1.3-2.5 3s1 3 2.5 3l-1.3 3" },
  github_actions:      { title: "GitHub Actions",      ctype: "ci",            fields: ["token"],            tokenLabel: "Personal access token", help: "Token GitHub com escopo repo + workflow.",            docs: "https://github.com/settings/tokens",             oauth: "ci", iconPath: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.3 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" },
  gitlab_ci:           { title: "GitLab CI",           ctype: "ci",            fields: ["token"],            tokenLabel: "Personal access token", help: "Token GitLab com escopos api e read_api.",            docs: "https://gitlab.com/-/user_settings/personal_access_tokens", iconPath: "M12 21l3.5-7H8.5L12 21zM12 21L3 10l1.5-5L8.5 14M12 21l9-11-1.5-5L15.5 14" },
  bitbucket_pipelines: { title: "Bitbucket Pipelines", ctype: "ci",            fields: ["username", "token"], tokenLabel: "App password",          help: "Usuário + app password com escopo pipeline.",         docs: "https://bitbucket.org/account/settings/app-passwords/", iconPath: "M3 4h18l-2.5 16H5.5L3 4zM9 9h6l-.7 5h-4.6L9 9z" },
  sonarcloud:          { title: "SonarCloud",          ctype: "observability", fields: ["token"],            tokenLabel: "Token",                 help: "SonarCloud → My Account → Security → Generate Token.", docs: "https://sonarcloud.io/account/security",          iconPath: "M5 18c0-7 4-11 11-11M8 18c0-5 2.5-8 8-8M11 18c0-3 1.5-5 5-5" },
  sentry:              { title: "Sentry",              ctype: "observability", fields: ["token"],            tokenLabel: "Auth token",            help: "Sentry → Settings → Auth Tokens (org).",              docs: "https://sentry.io/settings/account/api/auth-tokens/", iconPath: "M12 3l9 16H3l9-16zM12 9l4.5 8M12 9l-4.5 8" },
  playwright:          { title: "Playwright",          ctype: "observability", fields: ["token"],            tokenLabel: "Access token",          help: "Microsoft Playwright Testing — access token do serviço.",         docs: "https://aka.ms/mpt/access-tokens", noTest: true, iconPath: "M12 3c-4 0-7 3-8 7 3-2 5-2 7 0 1.5 1.5 3 1.5 5 .5-1 4-3 6-7 6.5C19 7 16 3 12 3z" },
  confluence:          { title: "Confluence",          ctype: "docs",          fields: ["site", "email", "token"], tokenLabel: "API token",       help: "Confluence Cloud (Atlassian) — site + e-mail + API token.",       docs: "https://id.atlassian.com/manage-profile/security/api-tokens", iconPath: "M5 17c4-7 7-7 14 1M19 7c-4 7-7 7-14-1" },
  github_wiki:         { title: "GitHub Wiki",         ctype: "docs",          fields: ["token"],            tokenLabel: "Personal access token", help: "Token GitHub com escopo repo (wikis fazem parte do repo).",      docs: "https://github.com/settings/tokens", oauth: "docs", iconPath: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" },
  notion:              { title: "Notion",              ctype: "docs",          fields: ["token"],            tokenLabel: "Integration token",     help: "Notion → Settings → Integrations (internal integration token).", docs: "https://www.notion.so/my-integrations", iconPath: "M4 4h13l3 3v13H4zM8 8v8M8 8l8 8M16 8v8" },
};

// fontes de código (p/ o seletor de "Adicionar repositório").
const CODE_PROVS: Record<string, { title: string; iconPath: string }> = {
  github:    { title: "GitHub",    iconPath: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.3 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" },
  gitlab:    { title: "GitLab",    iconPath: "M12 21l3.5-7H8.5L12 21zM12 21L3 10l1.5-5L8.5 14M12 21l9-11-1.5-5L15.5 14" },
  bitbucket: { title: "Bitbucket", iconPath: "M3 4h18l-2.5 16H5.5L3 4zM9 9h6l-.7 5h-4.6L9 9z" },
};

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
  // fluxo "Adicionar repositório": escolhe fonte conectada → escolhe repo remoto → diretório local → salva
  type RemoteRepo = { full_name: string; clone_url: string; default_branch: string; private: boolean };
  const [repoStep, setRepoStep]       = useState<"source" | "repo" | "dir">("source");
  const [repoProv, setRepoProv]       = useState("");
  const [repoList, setRepoList]       = useState<RemoteRepo[] | null>(null);
  const [repoListErr, setRepoListErr] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoSearch, setRepoSearch]   = useState("");
  const [repoSel, setRepoSel]         = useState<RemoteRepo | null>(null);
  const [repoDir, setRepoDir]         = useState("");
  const [repoSaving, setRepoSaving]   = useState(false);
  const [isTauri, setIsTauri]         = useState(false);
  const [repoEdit, setRepoEdit]       = useState<Repo | null>(null);
  const [editName, setEditName]       = useState("");
  const [editBranch, setEditBranch]   = useState("");
  const [editBusy, setEditBusy]       = useState(false);
  const [repoDel, setRepoDel]         = useState<Repo | null>(null);
  const [delBusy, setDelBusy]         = useState(false);
  const [pwOpen, setPwOpen]     = useState(false);
  const [pwEditId, setPwEditId] = useState<string | null>(null);
  const [pwBusy, setPwBusy]     = useState(false);
  const [pw, setPw]             = useState({ focus: "backend", repo_id: "", model: "claude_opus", concurrency: 1, rules: "", enabled: true, cap_open_pr: true, cap_run_tests: true, cap_auto_merge: false });
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
      await openExternal(r.url);
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

  // ── conexões de código: GitHub / GitLab / Bitbucket (token) ──
  const [gitModal, setGitModal] = useState<"github" | "gitlab" | "bitbucket" | null>(null);
  const [gitToken, setGitToken] = useState("");
  const [gitUser, setGitUser]   = useState("");
  const [gitBusy, setGitBusy]   = useState(false);
  const [gitTesting, setGitTesting] = useState(false);
  const [gitTest, setGitTest]   = useState<{ ok: boolean; msg: string } | null>(null);

  // GitHub device-flow (OAuth) — alternativa ao token (código e tarefas)
  const [ghMethod, setGhMethod] = useState<"oauth" | "token">("oauth");
  const [ghDevice, setGhDevice] = useState<{ user_code: string; verification_uri: string } | null>(null);
  const [ghStatus, setGhStatus] = useState("");
  const [ghErr, setGhErr]       = useState("");
  const [ghStarting, setGhStarting] = useState(false);
  const ghPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopGhPoll() { if (ghPoll.current) { clearInterval(ghPoll.current); ghPoll.current = null; } }

  // abre URL externa. No desktop (Tauri) o window.open do webview não abre o
  // browser do sistema — usa o shell nativo. No navegador, window.open normal.
  async function openExternal(url: string) {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try { const { open } = await import("@tauri-apps/plugin-shell"); await open(url); return; }
      catch { /* cai no window.open */ }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function resetGit() {
    stopGhPoll();
    setGitModal(null); setGitToken(""); setGitUser("");
    setGitBusy(false); setGitTesting(false); setGitTest(null);
    setGhMethod("oauth"); setGhDevice(null); setGhStatus(""); setGhErr(""); setGhStarting(false);
  }

  // faz o polling do status do OAuth do GitHub (mesmo endpoint p/ web-flow e
  // device-flow); ao autorizar, recarrega as conexões e fecha os modais.
  function pollGhStatus(intervalMs: number) {
    stopGhPoll();
    ghPoll.current = setInterval(async () => {
      try {
        const s = await apiGet<{ status?: string; login?: string; error?: string }>("/v1/connections/git/github/device/status");
        setGhStatus(s?.status || "");
        if (s?.status === "authorized") { stopGhPoll(); reloadConns(); resetGit(); resetTask(); resetInt(); }
        else if (s?.status === "expired" || s?.status === "denied" || s?.status === "error") {
          stopGhPoll(); setGhDevice(null); setGhErr(s?.error || "autorização falhou");
        }
      } catch { /* segue tentando */ }
    }, intervalMs);
  }

  // conecta o GitHub via OAuth. Tenta o web-flow (clicar → autorizar no GitHub
  // → pronto, sem colar código); se o OAuth App não estiver configurado no
  // servidor, cai no device-flow (código colado). purpose roteia onde gravar.
  async function startGithubDevice(purpose: "code" | "tasks" | "ci" | "docs") {
    setGhStarting(true); setGhErr(""); setGhStatus(""); setGhDevice(null);
    try {
      // 1) web-flow: abre a autorização do GitHub direto numa aba.
      const w = await apiPost<{ url?: string; error?: { code?: string; message?: string } }>("/v1/connections/git/github/oauth/start", { purpose });
      if (w?.url) {
        setGhStatus("pending");
        await openExternal(w.url);
        pollGhStatus(2000);
        return;
      }
      if (w?.error && w.error.code !== "not_configured") throw new Error(w.error.message || "falha ao iniciar OAuth");
      // 2) fallback device-flow (servidor sem client secret): código colado.
      const r = await apiPost<{ user_code?: string; verification_uri?: string; interval?: number; error?: { message?: string } }>("/v1/connections/git/github/device", { purpose });
      if (!r?.user_code || !r?.verification_uri) throw new Error(r?.error?.message || "falha ao iniciar OAuth");
      setGhDevice({ user_code: r.user_code, verification_uri: r.verification_uri });
      setGhStatus("pending");
      await openExternal(r.verification_uri);
      pollGhStatus(Math.max(2, r.interval || 5) * 1000);
    } catch (e) {
      setGhErr(e instanceof Error ? e.message : "falha ao iniciar OAuth");
    } finally { setGhStarting(false); }
  }

  useEffect(() => () => stopGhPoll(), []);

  // volta do web-flow do GitHub (?github=ok|denied|error). Esta aba (aberta
  // pelo "Conectar") aterrissa aqui já conectada; a aba original também atualiza
  // pelo poll. Limpa a URL e, no sucesso, recarrega as conexões.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("github");
    if (!p) return;
    window.history.replaceState({}, "", "/config");
    if (p === "ok") reloadConns();
    else setGhErr(p === "denied" ? "autorização negada no GitHub" : "falha na autorização do GitHub");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function testGit() {
    if (!gitToken.trim() || !gitModal) return;
    setGitTesting(true); setGitTest(null);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/git/test", { provider: gitModal, token: gitToken.trim(), username: gitUser.trim() });
      setGitTest({ ok: !!r?.ok, msg: r?.message || (r?.ok ? "válido" : "inválido") });
    } catch (e) {
      setGitTest({ ok: false, msg: e instanceof Error ? e.message : "falha no teste" });
    } finally { setGitTesting(false); }
  }

  async function connectGit() {
    if (!gitToken.trim() || !gitModal) return;
    setGitBusy(true);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/git", { provider: gitModal, token: gitToken.trim(), username: gitUser.trim() });
      if (!r?.ok) { setGitTest({ ok: false, msg: r?.message || "falha ao conectar" }); return; }
      reloadConns(); resetGit();
    } catch (e) {
      setGitTest({ ok: false, msg: e instanceof Error ? e.message : "falha ao conectar" });
    } finally { setGitBusy(false); }
  }

  async function disconnectGit(provider: string) {
    await apiDelete(`/v1/connections/git?provider=${provider}`);
    reloadConns();
  }

  // ── fonte de tarefas: GitHub / GitLab / Bitbucket / Jira / Trello ──
  type TaskProv = "github" | "gitlab" | "bitbucket" | "jira" | "trello" | "atlassian_goals";
  const [taskModal, setTaskModal] = useState<TaskProv | null>(null);
  const [taskF, setTaskF] = useState({ token: "", username: "", email: "", site: "", key: "" });
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskTesting, setTaskTesting] = useState(false);
  const [taskTest, setTaskTest] = useState<{ ok: boolean; msg: string } | null>(null);

  function resetTask() {
    stopGhPoll();
    setTaskModal(null); setTaskF({ token: "", username: "", email: "", site: "", key: "" });
    setTaskBusy(false); setTaskTesting(false); setTaskTest(null);
    setGhMethod("oauth"); setGhDevice(null); setGhStatus(""); setGhErr(""); setGhStarting(false);
  }

  function taskPayload(provider: TaskProv) {
    return { provider, token: taskF.token.trim(), username: taskF.username.trim(), email: taskF.email.trim(), site: taskF.site.trim(), key: taskF.key.trim() };
  }

  async function testTask() {
    if (!taskModal) return;
    setTaskTesting(true); setTaskTest(null);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/tasks/test", taskPayload(taskModal));
      setTaskTest({ ok: !!r?.ok, msg: r?.message || (r?.ok ? "válido" : "inválido") });
    } catch (e) {
      setTaskTest({ ok: false, msg: e instanceof Error ? e.message : "falha no teste" });
    } finally { setTaskTesting(false); }
  }

  async function connectTask() {
    if (!taskModal) return;
    setTaskBusy(true);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/tasks", taskPayload(taskModal));
      if (!r?.ok) { setTaskTest({ ok: false, msg: r?.message || "falha ao conectar" }); return; }
      reloadConns(); resetTask();
    } catch (e) {
      setTaskTest({ ok: false, msg: e instanceof Error ? e.message : "falha ao conectar" });
    } finally { setTaskBusy(false); }
  }

  async function disconnectTask(provider: string) {
    await apiDelete(`/v1/connections/tasks?provider=${provider}`);
    reloadConns();
  }

  // ── CI remoto + observabilidade ──
  const [intModal, setIntModal] = useState<string | null>(null); // provider key
  const [intF, setIntF] = useState({ token: "", username: "", project: "", email: "", site: "" });
  const [intBusy, setIntBusy] = useState(false);
  const [intTesting, setIntTesting] = useState(false);
  const [intTest, setIntTest] = useState<{ ok: boolean; msg: string } | null>(null);

  function resetInt() {
    stopGhPoll();
    setIntModal(null); setIntF({ token: "", username: "", project: "", email: "", site: "" });
    setIntBusy(false); setIntTesting(false); setIntTest(null);
    setGhMethod("oauth"); setGhDevice(null); setGhStatus(""); setGhErr(""); setGhStarting(false);
  }
  function intReady(provider: string) {
    const m = INT_META[provider]; if (!m) return false;
    return m.fields.every((f) => (intF as any)[f]?.trim());
  }
  async function testInt() {
    if (!intModal) return;
    setIntTesting(true); setIntTest(null);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/integration/test", { provider: intModal, ...intF });
      setIntTest({ ok: !!r?.ok, msg: r?.message || (r?.ok ? "válido" : "inválido") });
    } catch (e) {
      setIntTest({ ok: false, msg: e instanceof Error ? e.message : "falha no teste" });
    } finally { setIntTesting(false); }
  }
  async function connectInt() {
    if (!intModal) return;
    setIntBusy(true);
    try {
      const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/integration", { provider: intModal, ...intF });
      if (!r?.ok) { setIntTest({ ok: false, msg: r?.message || "falha ao conectar" }); return; }
      reloadConns(); resetInt();
    } catch (e) {
      setIntTest({ ok: false, msg: e instanceof Error ? e.message : "falha ao conectar" });
    } finally { setIntBusy(false); }
  }
  async function disconnectInt(provider: string) {
    await apiDelete(`/v1/connections/integration?provider=${provider}`);
    reloadConns();
  }

  // ── reaproveitar identidade já conectada (github/gitlab/bitbucket) ──
  function providerFamily(p: string): "github" | "gitlab" | "bitbucket" | null {
    if (p.startsWith("github")) return "github";
    if (p.startsWith("gitlab")) return "gitlab";
    if (p.startsWith("bitbucket")) return "bitbucket";
    return null;
  }
  function familyIdentity(fam: string): string | null {
    return (conns || []).find((c) => providerFamily(c.provider) === fam)?.label || null;
  }
  async function reuseConn(family: string, target: "code" | "tasks" | "ci" | "docs") {
    const r = await apiPost<{ ok?: boolean; message?: string }>("/v1/connections/reuse", { family, target });
    if (r?.ok === false) { toast(r?.message || "não foi possível reaproveitar", "error"); return; }
    toast("conexão reaproveitada", "success");
    reloadConns();
  }
  // botão "Reaproveitar @login" quando a família já está conectada em outra aba
  function reuseBtn(provider: string, target: "code" | "tasks" | "ci" | "docs") {
    const fam = providerFamily(provider);
    if (!fam) return null;
    const id = familyIdentity(fam);
    if (!id) return null;
    return (
      <button title={`Usar a conexão ${fam} já autenticada (@${id})`} style={{ ...sFilledBtn, background: "transparent", color: "var(--accent)", border: "1px solid var(--accent)" }} onClick={() => reuseConn(fam, target)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 6.9 4M20 4v4h-4M20 12a8 8 0 0 1-8 8 8 8 0 0 1-6.9-4M4 20v-4h4"/></svg>
        Reaproveitar @{id}
      </button>
    );
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
  function openRepoModal() {
    setRepoStep("source"); setRepoProv(""); setRepoList(null); setRepoListErr("");
    setRepoLoading(false); setRepoSearch(""); setRepoSel(null); setRepoDir(""); setRepoSaving(false);
    setRepoOpen(true);
  }
  // fontes de código conectadas (github/gitlab/bitbucket) — base do passo 1
  const codeConns = (conns || []).filter((c) => c.type === "code" && c.status === "ok");

  async function pickRepoSource(provider: string) {
    setRepoProv(provider); setRepoStep("repo"); setRepoList(null); setRepoListErr("");
    setRepoSearch(""); setRepoLoading(true);
    try {
      const res = await apiGet<{ repos?: RemoteRepo[]; error?: { message?: string } }>(`/v1/connections/code/repos?provider=${provider}`);
      if (res?.error) throw new Error(res.error.message || "falha ao listar repositórios");
      setRepoList(res?.repos || []);
    } catch (e) {
      setRepoListErr(e instanceof Error ? e.message : "falha ao listar repositórios");
    } finally { setRepoLoading(false); }
  }
  function pickRemoteRepo(x: RemoteRepo) {
    setRepoSel(x);
    const leaf = x.full_name.split("/").pop() || x.full_name;
    setRepoDir(`~/apifor/${leaf}`);
    setRepoStep("dir");
  }
  // clona o repo na pasta escolhida, no app desktop (git via shell do Tauri).
  // Usa uma clone-url autenticada do cerebro p/ repos privados. Devolve msg de
  // erro (string) ou "" em sucesso. Só roda no desktop.
  async function cloneToLocal(provider: string, cloneUrl: string, dir: string): Promise<string> {
    try {
      const auth = await apiPost<{ url?: string }>("/v1/repos/clone-url", { provider, clone_url: cloneUrl });
      const url = auth?.url || cloneUrl;
      let target = dir.trim();
      if (target.startsWith("~")) {
        const { homeDir } = await import("@tauri-apps/api/path");
        target = (await homeDir()).replace(/\/$/, "") + target.slice(1);
      }
      const { Command } = await import("@tauri-apps/plugin-shell");
      const out = await Command.create("git", ["clone", url, target]).execute();
      if (out.code === 0) return "";
      return out.stderr?.trim() || `git saiu com código ${out.code}`;
    } catch (e) { return e instanceof Error ? e.message : "falha ao clonar"; }
  }
  async function saveRepo() {
    if (!repoSel) return;
    setRepoSaving(true);
    try {
      const leaf = repoSel.full_name.split("/").pop() || repoSel.full_name;
      await apiPost("/v1/repos", {
        name: leaf, clone_url: repoSel.clone_url, default_branch: repoSel.default_branch || "main",
        provider: repoProv, local_dir: repoDir.trim(),
      });
      // no desktop, clona de fato na pasta escolhida.
      if (isTauri && repoDir.trim()) {
        const err = await cloneToLocal(repoProv, repoSel.clone_url, repoDir);
        if (err) toast("repo cadastrado, mas o clone falhou: " + err, "error");
        else toast("repositório clonado em " + repoDir.trim(), "success");
      }
      setRepoOpen(false); reload();
    } finally { setRepoSaving(false); }
  }
  function openRepoEdit(rx: Repo) { setRepoEdit(rx); setEditName(rx.name); setEditBranch(rx.default_branch || "main"); }
  async function saveRepoEdit() {
    if (!repoEdit || !editName.trim()) return;
    setEditBusy(true);
    try {
      const r = await apiPost<{ ok?: boolean; error?: { message?: string } }>(`/v1/repos/${repoEdit.id}`, { name: editName.trim(), default_branch: editBranch.trim() || "main" });
      if (r?.error) { toast(r.error.message || "falha ao salvar", "error"); return; }
      toast("repositório atualizado", "success"); setRepoEdit(null); reload();
    } catch (e) { toast(e instanceof Error ? e.message : "falha ao salvar", "error"); }
    finally { setEditBusy(false); }
  }
  async function confirmDelRepo() {
    if (!repoDel) return;
    setDelBusy(true);
    try {
      const r = await apiDelete<{ ok?: boolean; error?: { message?: string } }>(`/v1/repos/${repoDel.id}`);
      if (r?.error) { toast(r.error.message || "falha ao excluir", "error"); return; }
      toast("repositório removido", "success"); setRepoDel(null); reload();
    } catch (e) { toast(e instanceof Error ? e.message : "falha ao excluir", "error"); }
    finally { setDelBusy(false); }
  }
  // detecta app desktop (Tauri v2) p/ habilitar o seletor de pasta nativo.
  useEffect(() => { setIsTauri(typeof window !== "undefined" && "__TAURI_INTERNALS__" in window); }, []);
  // abre o diálogo nativo de pasta (só no desktop) e preenche o caminho. No
  // browser não há acesso ao FS local (e o clone é na máquina do worker), então
  // orienta o usuário a digitar.
  async function pickLocalDir() {
    if (!isTauri) { toast("Seleção de pasta disponível no app desktop — digite o caminho.", "info"); return; }
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const sel = await open({ directory: true, multiple: false, title: "Escolha a pasta para clonar", defaultPath: repoDir || undefined });
      if (typeof sel === "string" && sel) setRepoDir(sel);
    } catch { toast("não foi possível abrir o seletor de pasta", "error"); }
  }
  function pwBody(x: typeof pw) {
    return {
      focus: x.focus, repo_id: x.repo_id, model: x.model, concurrency: x.concurrency,
      rules: x.rules, enabled: x.enabled,
      capabilities: { open_pr: x.cap_open_pr, run_tests: x.cap_run_tests, auto_merge: x.cap_auto_merge },
    };
  }
  function openPwCreate() {
    setPwEditId(null);
    setPw({ focus: "backend", repo_id: "", model: "claude_opus", concurrency: 1, rules: "", enabled: true, cap_open_pr: true, cap_run_tests: true, cap_auto_merge: false });
    setPwOpen(true);
  }
  function openPwEdit(p: PinnedW) {
    setPwEditId(p.id);
    setPw({
      focus: p.focus || "", repo_id: p.repo_id || "", model: p.model || "claude_opus", concurrency: p.concurrency || 1,
      rules: p.rules || "", enabled: p.enabled !== false,
      cap_open_pr: p.cap_open_pr !== false, cap_run_tests: p.cap_run_tests !== false, cap_auto_merge: !!p.cap_auto_merge,
    });
    setPwOpen(true);
  }
  async function savePw() {
    setPwBusy(true);
    try {
      if (pwEditId) await apiPost(`/v1/pinned-workers/${pwEditId}`, pwBody(pw));
      else await apiPost("/v1/pinned-workers", pwBody(pw));
      toast(pwEditId ? "worker atualizado" : "worker criado", "success");
      setPwOpen(false); reloadPinned();
    } catch (e) { toast(e instanceof Error ? e.message : "falha ao salvar", "error"); }
    finally { setPwBusy(false); }
  }
  async function togglePinned(p: PinnedW) {
    const next = p.enabled === false;
    await apiPost(`/v1/pinned-workers/${p.id}`, {
      focus: p.focus, repo_id: p.repo_id, model: p.model, concurrency: p.concurrency,
      rules: p.rules || "", enabled: next,
      capabilities: { open_pr: p.cap_open_pr !== false, run_tests: p.cap_run_tests !== false, auto_merge: !!p.cap_auto_merge },
    });
    toast(next ? "worker ligado" : "worker desligado", "success");
    reloadPinned();
  }
  async function delPinned(id: string) { await apiDelete(`/v1/pinned-workers/${id}`); reloadPinned(); }
  async function toggleAllPinned(enabled: boolean) {
    try {
      await apiPost("/v1/pinned-workers/bulk", { enabled });
      toast(enabled ? "todos os workers ligados" : "todos os workers desligados", "success");
      reloadPinned();
    } catch (e) { toast(e instanceof Error ? e.message : "falha ao alterar workers", "error"); }
  }

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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {pinnedList.length > 0 && (() => {
                    const allOn = pinnedList.every((p) => p.enabled !== false);
                    return (
                      <button title={allOn ? "Desligar todos os workers" : "Ligar todos os workers"} onClick={() => toggleAllPinned(!allOn)}
                        style={{ height: 34, padding: "0 13px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: allOn ? "var(--green)" : "var(--mute)" }} />
                        {allOn ? "Desligar todos" : "Ligar todos"}
                      </button>
                    );
                  })()}
                  <button style={sFilledBtn} disabled={pinnedList.length >= 8} onClick={openPwCreate}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    Adicionar worker
                  </button>
                </div>
              </div>

              {running && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--red)", background: "var(--red-tint)", border: "1px solid rgba(248,81,73,.28)", borderRadius: 10, padding: "11px 14px" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
                  O Pool está ligado. Desligue-o para ativar workers fixos.
                </div>
              )}

              {pinnedList.map((p) => {
                const on          = p.enabled !== false;
                const pillColor   = on ? "var(--green)" : "var(--mute)";
                const pillBg      = on ? "var(--green-tint)" : "var(--border)";
                const caps = [
                  ["Abrir PR", p.cap_open_pr !== false],
                  ["Rodar testes", p.cap_run_tests !== false],
                  ["Auto-merge", !!p.cap_auto_merge],
                ] as [string, boolean][];
                return (
                  <div key={p.id} style={{ ...sCard, opacity: on ? 1 : .7 }}>
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
                        {on ? "ligado" : "desligado"}
                      </span>
                      <Toggle on={on} onChange={() => togglePinned(p)} />
                      <button onClick={() => openPwEdit(p)} style={{ height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                        Editar
                      </button>
                      <button onClick={() => delPinned(p.id)} title="Deletar worker" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 1, background: "var(--border)" }}>
                      {[["Repositório", p.repo_name || "qualquer"], ["Foco", p.focus || "—"], ["Modelo", MODEL_LABELS[p.model] || p.model], ["Concorrência", String(p.concurrency)]].map(([k, v]) => (
                        <div key={k} style={{ background: "var(--card)", padding: "11px 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--mute)" }}>{k}</span>
                          <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500, fontFamily: "var(--mono)" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
                      {caps.map(([label, ok]) => (
                        <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, color: ok ? "var(--green)" : "var(--mute)", background: ok ? "var(--green-tint)" : "var(--elev)" }}>
                          {ok ? "✓" : "✕"} {label}
                        </span>
                      ))}
                    </div>
                    {p.rules && (
                      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
                        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--mute)" }}>Regras</span>
                        <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5, marginTop: 3, whiteSpace: "pre-wrap" }}>{p.rules}</div>
                      </div>
                    )}
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
            <button style={sFilledBtn} onClick={openRepoModal}>
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
              <button onClick={() => openRepoEdit(rx)} style={{ height: 32, padding: "0 13px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                Editar
              </button>
              <button onClick={() => setRepoDel(rx)} title="Excluir" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer", flexShrink: 0 }}>
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
              ["docs",    "Documentação"],
              ["ia",      "Motor de IA"],
            ] as [string, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setConnTab(k)} style={sConnPill(connTab === k)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {k === "codigo"  && <><path d="M8 9l-3 3 3 3M16 9l3 3-3 3"/></>}
                  {k === "tarefas" && <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>}
                  {k === "ci"      && <><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></>}
                  {k === "observ"  && <><circle cx="12" cy="12" r="2.5"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/></>}
                  {k === "docs"    && <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>}
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
          ) : connTab === "codigo" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { key: "github" as const,    title: "GitHub",    sub: "Personal access token (repo, workflow).", iconPath: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.3 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" },
                { key: "gitlab" as const,    title: "GitLab",    sub: "Personal access token (api, read_repository).", iconPath: "M12 21l3.5-7H8.5L12 21zM12 21L3 10l1.5-5L8.5 14M12 21l9-11-1.5-5L15.5 14" },
                { key: "bitbucket" as const, title: "Bitbucket", sub: "Usuário + app password (repository, pull request).", iconPath: "M3 4h18l-2.5 16H5.5L3 4zM9 9h6l-.7 5h-4.6L9 9z" },
              ]).map(({ key, title, sub, iconPath }) => {
                const c = (conns || []).find((x) => x.type === "code" && x.provider === key);
                const active = !!c;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "var(--card)", border: active ? "1px solid var(--green)" : "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", flexWrap: "wrap" }}>
                    <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, background: "var(--accent-tint)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath}/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
                        {active && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "var(--green)", background: "rgba(63,185,80,.12)", border: "1px solid rgba(63,185,80,.4)", borderRadius: 5, padding: "1px 7px" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>{c?.label || "Conectado"}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 3 }}>{sub}</div>
                    </div>
                    {active ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...sFilledBtn, background: "transparent", color: "var(--ink)", border: "1px solid var(--border)" }} onClick={() => { resetGit(); setGitModal(key); }}>Reconectar</button>
                        <button title="Desconectar" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer" }} onClick={() => disconnectGit(key)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {reuseBtn(key, "code")}
                        <button style={sFilledBtn} onClick={() => { resetGit(); setGitModal(key); }}>Conectar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <InfoNote>Conecte os provedores de código. O token é validado na hora contra a API do provedor. Os tokens ficam em Segredos.</InfoNote>
            </div>
          ) : connTab === "tarefas" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { key: "github" as const,    title: "GitHub Issues & PRs",    sub: "Tarefas de issues e pull requests do GitHub.",       iconPath: "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.3 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" },
                { key: "gitlab" as const,    title: "GitLab Issues & MRs",    sub: "Tarefas de issues e merge requests do GitLab.",       iconPath: "M12 21l3.5-7H8.5L12 21zM12 21L3 10l1.5-5L8.5 14M12 21l9-11-1.5-5L15.5 14" },
                { key: "bitbucket" as const, title: "Bitbucket Issues & PRs", sub: "Tarefas de issues e pull requests do Bitbucket.",   iconPath: "M3 4h18l-2.5 16H5.5L3 4zM9 9h6l-.7 5h-4.6L9 9z" },
                { key: "jira" as const,      title: "Jira",                  sub: "Tarefas dos seus projetos Jira (e-mail + API token).", iconPath: "M12 2L3 11l9 9 9-9-9-9zM12 7l4 4-4 4-4-4 4-4z" },
                { key: "atlassian_goals" as const, title: "Atlassian Goals",  sub: "Goals do Atlassian (Atlas) como tarefas — site + e-mail + API token.", iconPath: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7v5l3 3" },
                { key: "trello" as const,    title: "Trello",                sub: "Cards dos seus boards Trello (API key + token).",     iconPath: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 7h4v9H7zM13 7h4v5h-4z" },
              ]).map(({ key, title, sub, iconPath }) => {
                const c = (conns || []).find((x) => x.type === "tasks" && x.provider === key);
                const active = !!c;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "var(--card)", border: active ? "1px solid var(--green)" : "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", flexWrap: "wrap" }}>
                    <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, background: "var(--accent-tint)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPath}/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
                        {active && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "var(--green)", background: "rgba(63,185,80,.12)", border: "1px solid rgba(63,185,80,.4)", borderRadius: 5, padding: "1px 7px" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>{c?.label || "Conectado"}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 3 }}>{sub}</div>
                    </div>
                    {active ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...sFilledBtn, background: "transparent", color: "var(--ink)", border: "1px solid var(--border)" }} onClick={() => { resetTask(); setTaskModal(key); }}>Reconectar</button>
                        <button title="Desconectar" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer" }} onClick={() => disconnectTask(key)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {reuseBtn(key, "tasks")}
                        <button style={sFilledBtn} onClick={() => { resetTask(); setTaskModal(key); }}>Conectar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <InfoNote>De onde vêm as tarefas dos workers. GitHub aceita OAuth ou token; os demais por token/API. Credenciais validadas na hora.</InfoNote>
            </div>
          ) : (connTab === "ci" || connTab === "observ" || connTab === "docs") ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(connTab === "ci"
                ? ["cypress", "github_actions", "gitlab_ci", "bitbucket_pipelines"]
                : connTab === "observ"
                ? ["sonarcloud", "sentry", "playwright"]
                : ["confluence", "github_wiki", "notion"]
              ).map((key) => {
                const m = INT_META[key];
                const c = (conns || []).find((x) => x.type === m.ctype && x.provider === key);
                const active = !!c;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: "var(--card)", border: active ? "1px solid var(--green)" : "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", flexWrap: "wrap" }}>
                    <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, background: "var(--accent-tint)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={m.iconPath}/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{m.title}</span>
                        {active && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, color: "var(--green)", background: "rgba(63,185,80,.12)", border: "1px solid rgba(63,185,80,.4)", borderRadius: 5, padding: "1px 7px" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>{c?.label || "Conectado"}</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--mute)", marginTop: 3 }}>{m.help}</div>
                    </div>
                    {active ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={{ ...sFilledBtn, background: "transparent", color: "var(--ink)", border: "1px solid var(--border)" }} onClick={() => { resetInt(); setIntModal(key); }}>Reconectar</button>
                        <button title="Desconectar" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer" }} onClick={() => disconnectInt(key)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {reuseBtn(key, m.ctype === "docs" ? "docs" : "ci")}
                        <button style={sFilledBtn} onClick={() => { resetInt(); setIntModal(key); }}>Conectar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <InfoNote>{connTab === "ci" ? "CI remoto: dispara e lê pipelines/testes. Credenciais validadas na hora." : connTab === "observ" ? "Observabilidade: erros e qualidade de código. Tokens validados contra a API." : "Documentação: bases de conhecimento que os workers leem/escrevem. GitHub Wiki aceita OAuth."}</InfoNote>
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
          footer={
            repoStep === "dir" ? <>
              <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setRepoStep("repo")}>Voltar</button>
              <button style={{ ...btn, opacity: repoSaving || !repoDir.trim() ? .6 : 1, pointerEvents: repoSaving || !repoDir.trim() ? "none" : "auto" }} onClick={saveRepo}>{repoSaving ? "Salvando…" : "Salvar"}</button>
            </> : repoStep === "repo" ? (
              <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setRepoStep("source")}>Voltar</button>
            ) : (
              <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setRepoOpen(false)}>Cancelar</button>
            )
          }>
          {/* passo 1 — escolher a fonte de código conectada */}
          {repoStep === "source" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5 }}>Escolha uma fonte de código conectada para puxar os repositórios da conta.</span>
              {codeConns.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 14px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: 11 }}>
                  <span style={{ fontSize: 12.5, color: "var(--mute)" }}>Nenhuma fonte de código conectada.</span>
                  <button style={{ ...sFilledBtn, alignSelf: "center" }} onClick={() => { setRepoOpen(false); setTab("connections"); setConnTab("codigo"); }}>Conectar em Conexões → Código</button>
                </div>
              ) : codeConns.map((c) => {
                const meta = CODE_PROVS[c.provider] || { title: c.provider, iconPath: "" };
                return (
                  <button key={c.id} onClick={() => pickRepoSource(c.provider)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--card)", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={meta.iconPath}/></svg>
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{meta.title}</div>
                      {c.label && <div style={{ fontSize: 11.5, color: "var(--mute)" }}>@{c.label}</div>}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                );
              })}
            </div>
          )}

          {/* passo 2 — escolher o repositório remoto */}
          {repoStep === "repo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--mute)" }}>
                <span style={{ fontWeight: 600, color: "var(--dim)" }}>{CODE_PROVS[repoProv]?.title || repoProv}</span>
                <span>· escolha o repositório</span>
              </div>
              {repoLoading ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "var(--mute)", fontSize: 12.5 }}>Carregando repositórios…</div>
              ) : repoListErr ? (
                <div style={{ padding: "16px 14px", textAlign: "center", color: "var(--red)", fontSize: 12.5 }}>{repoListErr}</div>
              ) : (repoList || []).length === 0 ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--mute)", fontSize: 12.5 }}>Nenhum repositório nessa conta.</div>
              ) : (
                <>
                  <input style={input} value={repoSearch} autoFocus onChange={(e) => setRepoSearch(e.target.value)} placeholder="Buscar repositório…" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 320, overflowY: "auto" }}>
                    {(repoList || []).filter((x) => x.full_name.toLowerCase().includes(repoSearch.trim().toLowerCase())).map((x) => (
                      <button key={x.full_name} onClick={() => pickRemoteRepo(x)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.full_name}</div>
                          <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>{x.default_branch || "main"}</div>
                        </div>
                        {x.private && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 6px" }}>privado</span>}
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* passo 3 — diretório local + salvar */}
          {repoStep === "dir" && repoSel && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--elev)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={CODE_PROVS[repoProv]?.iconPath || ""}/></svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{repoSel.full_name}</div>
                  <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>branch {repoSel.default_branch || "main"}</div>
                </div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Diretório local para clonar</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...input, flex: 1 }} value={repoDir} autoFocus onChange={(e) => setRepoDir(e.target.value)} placeholder="~/apifor/meu-repo" />
                  <button type="button" onClick={pickLocalDir} title={isTauri ? "Escolher pasta" : "Disponível no app desktop"}
                    style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: isTauri ? 1 : .55 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    Procurar
                  </button>
                </div>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>Caminho na máquina onde o repositório será clonado.{!isTauri && " No navegador, digite manualmente."}</span>
              </label>
            </div>
          )}
        </Modal>
      )}

      {repoEdit && (
        <Modal title="Editar repositório" onClose={() => setRepoEdit(null)}
          footer={
            <button style={{ ...btn, opacity: editBusy || !editName.trim() ? .6 : 1, pointerEvents: editBusy || !editName.trim() ? "none" : "auto" }} onClick={saveRepoEdit}>{editBusy ? "Salvando…" : "Salvar"}</button>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Nome</span>
              <input style={input} value={editName} autoFocus onChange={(e) => setEditName(e.target.value)} placeholder="meu-repo" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Branch padrão</span>
              <input style={input} value={editBranch} onChange={(e) => setEditBranch(e.target.value)} placeholder="main" />
            </label>
          </div>
        </Modal>
      )}

      {repoDel && (
        <Modal title="Excluir repositório" onClose={() => setRepoDel(null)}
          footer={
            <button style={{ ...btn, background: "var(--red)", borderColor: "var(--red)", opacity: delBusy ? .6 : 1, pointerEvents: delBusy ? "none" : "auto" }} onClick={confirmDelRepo}>{delBusy ? "Excluindo…" : "Excluir"}</button>
          }>
          <p style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.6, margin: 0 }}>
            Remover <strong style={{ color: "var(--ink)" }}>{repoDel.name}</strong> da lista? Isso apaga só o registro no apifor — <strong>não</strong> apaga a pasta clonada no seu disco.
          </p>
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

      {gitModal && (() => {
        const meta: Record<string, { title: string; tokenLabel: string; tokenHint: string; help: string; docs: string }> = {
          github:    { title: "GitHub",    tokenLabel: "Personal access token", tokenHint: "ghp_… ou github_pat_…", help: "Crie em github.com/settings/tokens com escopo repo (e workflow para CI).", docs: "https://github.com/settings/tokens" },
          gitlab:    { title: "GitLab",    tokenLabel: "Personal access token", tokenHint: "glpat-…",               help: "Crie em GitLab → Settings → Access Tokens com escopos api e read_repository.", docs: "https://gitlab.com/-/user_settings/personal_access_tokens" },
          bitbucket: { title: "Bitbucket", tokenLabel: "App password",          tokenHint: "app password",            help: "Crie em Bitbucket → Personal settings → App passwords (repository, pull requests).", docs: "https://bitbucket.org/account/settings/app-passwords/" },
        };
        const m = meta[gitModal];
        const oauthMode = gitModal === "github" && ghMethod === "oauth";
        return (
        <Modal title={`Conectar ${m.title}`} onClose={resetGit}
          footer={oauthMode ? (
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetGit}>Fechar</button>
          ) : <>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetGit}>Cancelar</button>
            <button style={{ ...btn, opacity: gitBusy || !gitToken.trim() || (gitModal === "bitbucket" && !gitUser.trim()) ? .6 : 1, pointerEvents: gitBusy || !gitToken.trim() || (gitModal === "bitbucket" && !gitUser.trim()) ? "none" : "auto" }} onClick={connectGit}>{gitBusy ? "Conectando…" : "Conectar"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {gitModal === "github" && (
              <div style={{ display: "flex", gap: 6, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, padding: 4 }}>
                {([["oauth", "OAuth"], ["token", "Token"]] as [typeof ghMethod, string][]).map(([k, lbl]) => (
                  <button key={k} onClick={() => { setGhMethod(k); setGitTest(null); }} style={{ flex: 1, height: 32, borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: ghMethod === k ? "var(--card)" : "transparent", color: ghMethod === k ? "var(--ink)" : "var(--dim)" }}>{lbl}</button>
                ))}
              </div>
            )}
            {oauthMode ? (
              !ghDevice ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, padding: "10px 8px 4px" }}>
                  <div style={{ width: 52, height: 52, borderRadius: 13, background: "var(--accent-tint)", border: "1px solid var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.3 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--mute)", lineHeight: 1.55, maxWidth: 340 }}>Abrimos o GitHub numa aba para você autorizar o acesso (repositórios, incl. privados). Sem criar token manualmente.</span>
                  {ghErr && <span style={{ fontSize: 12, color: "var(--red)" }}>{ghErr}</span>}
                  {ghStatus === "pending"
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--mute)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>aguardando autorização na aba do GitHub…</span>
                    : <button style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 8, opacity: ghStarting ? .6 : 1, pointerEvents: ghStarting ? "none" : "auto" }} onClick={() => startGithubDevice("code")}>{ghStarting ? "Iniciando…" : "Autorizar com GitHub"}</button>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "6px 8px" }}>
                  <span style={{ fontSize: 12.5, color: "var(--mute)" }}>Em <a href={ghDevice.verification_uri} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>{ghDevice.verification_uri.replace("https://", "")}</a> digite o código:</span>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "var(--ink)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 20px" }}>{ghDevice.user_code}</div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--mute)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>
                    {ghStatus === "pending" ? "aguardando autorização no GitHub…" : ghStatus}
                  </span>
                </div>
              )
            ) : (<>
            {gitModal === "bitbucket" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Usuário Bitbucket</span>
                <input style={input} value={gitUser} onChange={(e) => { setGitUser(e.target.value); setGitTest(null); }} placeholder="seu_usuario" />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{m.tokenLabel}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...input, flex: 1 }} type="password" value={gitToken} onChange={(e) => { setGitToken(e.target.value); setGitTest(null); }} placeholder={m.tokenHint} />
                <button style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", opacity: gitTesting || !gitToken.trim() ? .6 : 1, pointerEvents: gitTesting || !gitToken.trim() ? "none" : "auto" }} onClick={testGit}>{gitTesting ? "Testando…" : "Testar"}</button>
              </div>
              {gitTest && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: gitTest.ok ? "var(--green)" : "var(--red)", marginTop: 2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    {gitTest.ok ? <path d="M5 12l4 4 10-10"/> : <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>}
                  </svg>
                  {gitTest.msg}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "14px 16px", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.25)", borderRadius: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
              <span style={{ fontSize: 12, color: "var(--mute)", lineHeight: 1.5 }}>{m.help} <a href={m.docs} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>Abrir página de tokens →</a></span>
            </div>
            </>)}
          </div>
        </Modal>
        );
      })()}

      {taskModal && (() => {
        const titles: Record<TaskProv, string> = { github: "GitHub Issues & PRs", gitlab: "GitLab Issues & MRs", bitbucket: "Bitbucket Issues & PRs", jira: "Jira", trello: "Trello", atlassian_goals: "Atlassian Goals" };
        const isAtlassian = taskModal === "jira" || taskModal === "atlassian_goals";
        const ready = taskModal === "bitbucket" ? !!(taskF.username.trim() && taskF.token.trim())
          : isAtlassian ? !!(taskF.site.trim() && taskF.email.trim() && taskF.token.trim())
          : taskModal === "trello" ? !!(taskF.key.trim() && taskF.token.trim())
          : !!taskF.token.trim();
        const oauthMode = taskModal === "github" && ghMethod === "oauth";
        const lbl = (s: string) => <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{s}</span>;
        const field = (s: string, k: "token" | "username" | "email" | "site" | "key", ph: string, pwd?: boolean) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{lbl(s)}
            <input style={input} type={pwd ? "password" : "text"} value={(taskF as any)[k]} onChange={(e) => { setTaskF({ ...taskF, [k]: e.target.value }); setTaskTest(null); }} placeholder={ph} />
          </div>
        );
        return (
        <Modal title={`Conectar ${titles[taskModal]}`} onClose={resetTask}
          footer={oauthMode ? (
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetTask}>Fechar</button>
          ) : <>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetTask}>Cancelar</button>
            <button style={{ ...btn, opacity: taskBusy || !ready ? .6 : 1, pointerEvents: taskBusy || !ready ? "none" : "auto" }} onClick={connectTask}>{taskBusy ? "Conectando…" : "Conectar"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {taskModal === "github" && (
              <div style={{ display: "flex", gap: 6, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, padding: 4 }}>
                {([["oauth", "OAuth"], ["token", "Token"]] as [typeof ghMethod, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => { setGhMethod(k); setTaskTest(null); }} style={{ flex: 1, height: 32, borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: ghMethod === k ? "var(--card)" : "transparent", color: ghMethod === k ? "var(--ink)" : "var(--dim)" }}>{l}</button>
                ))}
              </div>
            )}
            {oauthMode ? (
              !ghDevice ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, padding: "10px 8px 4px" }}>
                  <span style={{ fontSize: 12.5, color: "var(--mute)", lineHeight: 1.55, maxWidth: 340 }}>Abrimos o GitHub numa aba para você autorizar o acesso. Sem criar token manualmente.</span>
                  {ghErr && <span style={{ fontSize: 12, color: "var(--red)" }}>{ghErr}</span>}
                  {ghStatus === "pending"
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--mute)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>aguardando autorização na aba do GitHub…</span>
                    : <button style={{ ...btn, opacity: ghStarting ? .6 : 1, pointerEvents: ghStarting ? "none" : "auto" }} onClick={() => startGithubDevice("tasks")}>{ghStarting ? "Iniciando…" : "Autorizar com GitHub"}</button>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "6px 8px" }}>
                  <span style={{ fontSize: 12.5, color: "var(--mute)" }}>Em <a href={ghDevice.verification_uri} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>{ghDevice.verification_uri.replace("https://", "")}</a> digite o código:</span>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "var(--ink)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 20px" }}>{ghDevice.user_code}</div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--mute)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>
                    {ghStatus === "pending" ? "aguardando autorização no GitHub…" : ghStatus}
                  </span>
                </div>
              )
            ) : (<>
              {isAtlassian && field("Site Atlassian", "site", "empresa.atlassian.net")}
              {isAtlassian && field("E-mail", "email", "voce@empresa.com")}
              {taskModal === "bitbucket" && field("Usuário Bitbucket", "username", "seu_usuario")}
              {taskModal === "trello" && field("API key", "key", "sua api key")}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lbl(isAtlassian ? "API token" : taskModal === "trello" ? "Token" : taskModal === "bitbucket" ? "App password" : "Personal access token")}
                <div style={{ display: "flex", gap: 8 }}>
                  <input style={{ ...input, flex: 1 }} type="password" value={taskF.token} onChange={(e) => { setTaskF({ ...taskF, token: e.target.value }); setTaskTest(null); }} placeholder="cole aqui" />
                  <button style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", opacity: taskTesting || !ready ? .6 : 1, pointerEvents: taskTesting || !ready ? "none" : "auto" }} onClick={testTask}>{taskTesting ? "Testando…" : "Testar"}</button>
                </div>
                {taskTest && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: taskTest.ok ? "var(--green)" : "var(--red)", marginTop: 2 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{taskTest.ok ? <path d="M5 12l4 4 10-10"/> : <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>}</svg>
                    {taskTest.msg}
                  </span>
                )}
              </div>
            </>)}
          </div>
        </Modal>
        );
      })()}

      {intModal && (() => {
        const m = INT_META[intModal];
        const ready = intReady(intModal);
        const intOauth = !!m.oauth && ghMethod === "oauth";
        const fieldLabels: Record<IntField, string> = { token: m.tokenLabel, username: "Usuário", project: "Project ID", email: "E-mail", site: "Site" };
        const placeholders: Record<IntField, string> = { token: "cole aqui", username: "seu_usuario", project: "ex: abc123", email: "voce@empresa.com", site: "empresa.atlassian.net" };
        return (
        <Modal title={`Conectar ${m.title}`} onClose={resetInt}
          footer={intOauth ? (
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetInt}>Fechar</button>
          ) : <>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={resetInt}>Cancelar</button>
            <button style={{ ...btn, opacity: intBusy || !ready ? .6 : 1, pointerEvents: intBusy || !ready ? "none" : "auto" }} onClick={connectInt}>{intBusy ? "Conectando…" : "Conectar"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {m.oauth && (
              <div style={{ display: "flex", gap: 6, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, padding: 4 }}>
                {([["oauth", "OAuth"], ["token", "Token"]] as [typeof ghMethod, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => { setGhMethod(k); setIntTest(null); }} style={{ flex: 1, height: 32, borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: ghMethod === k ? "var(--card)" : "transparent", color: ghMethod === k ? "var(--ink)" : "var(--dim)" }}>{l}</button>
                ))}
              </div>
            )}
            {intOauth ? (
              !ghDevice ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16, padding: "10px 8px 4px" }}>
                  <span style={{ fontSize: 12.5, color: "var(--mute)", lineHeight: 1.55, maxWidth: 340 }}>Abrimos o GitHub numa aba para você autorizar o acesso. Sem criar token manualmente.</span>
                  {ghErr && <span style={{ fontSize: 12, color: "var(--red)" }}>{ghErr}</span>}
                  {ghStatus === "pending"
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--mute)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>aguardando autorização na aba do GitHub…</span>
                    : <button style={{ ...btn, opacity: ghStarting ? .6 : 1, pointerEvents: ghStarting ? "none" : "auto" }} onClick={() => startGithubDevice(m.oauth!)}>{ghStarting ? "Iniciando…" : "Autorizar com GitHub"}</button>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, padding: "6px 8px" }}>
                  <span style={{ fontSize: 12.5, color: "var(--mute)" }}>Em <a href={ghDevice.verification_uri} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>{ghDevice.verification_uri.replace("https://", "")}</a> digite o código:</span>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: "var(--ink)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 20px" }}>{ghDevice.user_code}</div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--mute)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>
                    {ghStatus === "pending" ? "aguardando autorização no GitHub…" : ghStatus}
                  </span>
                </div>
              )
            ) : (<>
            {m.fields.filter((f) => f !== "token").map((f) => (
              <div key={f} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{fieldLabels[f]}</span>
                <input style={input} value={(intF as any)[f]} onChange={(e) => { setIntF({ ...intF, [f]: e.target.value }); setIntTest(null); }} placeholder={placeholders[f]} />
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{m.tokenLabel}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...input, flex: 1 }} type="password" value={intF.token} onChange={(e) => { setIntF({ ...intF, token: e.target.value }); setIntTest(null); }} placeholder="cole aqui" />
                {!m.noTest && <button style={{ height: 38, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", opacity: intTesting || !ready ? .6 : 1, pointerEvents: intTesting || !ready ? "none" : "auto" }} onClick={testInt}>{intTesting ? "Testando…" : "Testar"}</button>}
              </div>
              {intTest && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: intTest.ok ? "var(--green)" : "var(--red)", marginTop: 2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{intTest.ok ? <path d="M5 12l4 4 10-10"/> : <><path d="M18 6L6 18"/><path d="M6 6l12 12"/></>}</svg>
                  {intTest.msg}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "14px 16px", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.25)", borderRadius: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
              <span style={{ fontSize: 12, color: "var(--mute)", lineHeight: 1.5 }}>{m.help} <a href={m.docs} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>Abrir →</a>{m.noTest ? " A record key do Cypress não é validada online." : ""}</span>
            </div>
            </>)}
          </div>
        </Modal>
        );
      })()}

      {pwOpen && (
        <Modal title={pwEditId ? "Editar worker dedicado" : "Adicionar worker dedicado"} onClose={() => setPwOpen(false)}
          footer={<>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setPwOpen(false)}>Cancelar</button>
            <button style={{ ...btn, opacity: pwBusy ? .6 : 1, pointerEvents: pwBusy ? "none" : "auto" }} onClick={savePw}>{pwBusy ? "Salvando…" : pwEditId ? "Salvar" : "Criar worker"}</button>
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
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Regras do worker</span>
              <textarea style={{ ...input, minHeight: 74, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} value={pw.rules} onChange={(e) => setPw({ ...pw, rules: e.target.value })} placeholder="Ex.: sempre adicione testes; não altere migrations; siga o padrão de commits…" />
              <span style={{ fontSize: 11, color: "var(--mute)" }}>Injetado no plano das tarefas desse repo.</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>O que o worker pode fazer</span>
              {([["cap_open_pr","Abrir Pull Request","se desligado, só faz push do branch (sem PR)"],["cap_run_tests","Rodar testes (CI)","pula a etapa de testes se desligado"],["cap_auto_merge","Auto-merge","se desligado, exige revisão humana"]] as [keyof typeof pw, string, string][]).map(([k, label, hint]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{hint}</span>
                  </div>
                  <Toggle on={!!pw[k]} onChange={(v) => setPw({ ...pw, [k]: v })} />
                </div>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: "var(--mute)" }}>O modelo roda nas tarefas desse repo; a soma das concorrências dos workers ligados é o teto do pool.</span>
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
