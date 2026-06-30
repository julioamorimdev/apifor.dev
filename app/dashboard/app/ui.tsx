"use client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ───────────────────────── tema (dark/light) ─────────────────────────
export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState("dark");
  useEffect(() => { setTheme(document.documentElement.getAttribute("data-theme") || "dark"); }, []);
  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("apifor_theme", next); } catch {}
      return next;
    });
  }, []);
  return [theme, toggle];
}

// ───────────────────────── idioma (shell) ─────────────────────────
const STR: Record<string, Record<string, string>> = {
  pt: { search: "Buscar…", op: "Operação", sys: "Conhecimento & sistema", acct: "Conta & cobrança", wsp: "workspace", pool: "Pool ok", newWsp: "Novo workspace", noRes: "Nenhum resultado", cmdHint: "navegar" },
  en: { search: "Search…", op: "Operations", sys: "Knowledge & system", acct: "Account & billing", wsp: "workspace", pool: "Pool ok", newWsp: "New workspace", noRes: "No results", cmdHint: "navigate" },
};
const EN_LABEL: Record<string, string> = {
  "/": "Dashboard", "/live": "Live", "/queue": "Queue", "/tasks": "Tasks", "/prs": "Pull Requests", "/interventions": "Intervention",
  "/ci": "CI", "/qa": "QA", "/routines": "Routines", "/telemetry": "Telemetry", "/knowledge": "Knowledge",
  "/logs": "Logs", "/config": "Settings", "/audit": "Audit", "/org": "Organization", "/usage": "Usage", "/invoices": "Invoices", "/pricing": "Plans",
  "/web": "Web", "/cloud": "Cloud", "/conta": "Account", "/ajuda": "Help",
};
export function useLang(): [string, (l: string) => void] {
  const [lang, set] = useState("pt");
  useEffect(() => {
    const read = () => { try { set(localStorage.getItem("apifor_lang") || "pt"); } catch {} };
    read();
    window.addEventListener("apifor-lang", read);
    return () => window.removeEventListener("apifor-lang", read);
  }, []);
  const setLang = useCallback((l: string) => {
    try { localStorage.setItem("apifor_lang", l); } catch {}
    set(l);
    window.dispatchEvent(new Event("apifor-lang")); // sincroniza todas as instâncias
  }, []);
  return [lang, setLang];
}
const t = (lang: string, k: string) => (STR[lang] || STR.pt)[k] || STR.pt[k] || k;

// dicionário PT->EN do conteúdo (aplicado nos componentes compartilhados; fallback = PT)
const TR: Record<string, string> = {
  // títulos
  "Fila": "Queue", "Tarefas": "Tasks", "Intervenção": "Intervention", "Rotinas": "Routines", "Telemetria": "Telemetry",
  "Conhecimento": "Knowledge", "Configuração": "Settings", "Auditoria": "Audit", "Organização": "Organization", "Uso": "Usage",
  "Faturas": "Invoices", "Planos": "Plans", "Conta": "Account", "Ajuda": "Help", "Notificações": "Notifications",
  "Bem-vindo ao apifor.dev": "Welcome to apifor.dev", "Web & API": "Web & API",
  // eyebrows (grupos)
  "Operação": "Operations", "Sistema": "System", "Conhecimento & sistema": "Knowledge & system", "Conta & cobrança": "Account & billing",
  // subtítulos
  "Estados das tarefas e reprocessamento.": "Task states and reprocessing.",
  "Crie e acompanhe as tarefas dos workers.": "Create and track worker tasks.",
  "Status de revisão e CI, com links pro GitHub.": "Review and CI status, with GitHub links.",
  "Integração contínua — execuções de build/teste.": "Continuous integration — build/test runs.",
  "Relatórios de teste por tarefa.": "Test reports per task.",
  "Gate de revisão humana — destrava o merge.": "Human review gate — unblocks the merge.",
  "Gatilhos agendados e manuais.": "Scheduled and manual triggers.",
  "Métricas agregadas da org.": "Aggregated org metrics.",
  "Feed do pipeline (steps dos workers) em tempo real.": "Pipeline feed (worker steps) in real time.",
  "Workers e tarefas em tempo real.": "Workers and tasks in real time.",
  "Memória e base de conhecimento.": "Memory and knowledge base.",
  "Repositórios e segredos.": "Repositories and secrets.",
  "Acesso programático ao control plane (REST + SSE).": "Programmatic access to the control plane (REST + SSE).",
  "Workers gerenciados na nuvem (add-on Enterprise).": "Managed cloud workers (Enterprise add-on).",
  "Quem fez o quê — server-side.": "Who did what — server-side.",
  "Sessão, membros e workspaces.": "Session, members and workspaces.",
  "Consumo do ciclo atual frente aos limites do plano.": "Current cycle usage vs plan limits.",
  "Faturas emitidas (webhooks do Stripe).": "Issued invoices (Stripe webhooks).",
  "Comece no Free, suba quando precisar.": "Start on Free, upgrade when you need.",
  "Perfil, sessão e preferências.": "Profile, session and preferences.",
  "Primeiros passos, docs e a fronteira de privacidade.": "Getting started, docs and the privacy boundary.",
  "Eventos do cérebro em tempo real (SSE).": "Brain events in real time (SSE).",
  "4 passos pra primeira tarefa.": "4 steps to your first task.",
  // cabeçalhos de card
  "Pull requests": "Pull requests", "Execuções de CI": "CI runs", "Relatórios de QA": "QA reports", "Estado das tarefas": "Task state",
  "Workers": "Workers", "Tarefas em andamento": "In-progress tasks", "Nova tarefa": "New task", "Registrar repositório": "Register repository",
  "Repositórios": "Repositories", "Segredos": "Secrets", "Nova rotina": "New routine", "Sessão": "Session", "Membros": "Members",
  "Workspaces": "Workspaces", "Memória": "Memory", "Base de conhecimento (KB)": "Knowledge base (KB)", "Assinatura": "Subscription",
  "Dispositivos": "Devices", "Aguardando revisão humana": "Awaiting human review", "Trilha de auditoria": "Audit trail",
  "Perfil": "Profile", "Preferências": "Preferences", "Começar em 4 passos": "Get started in 4 steps", "Documentação": "Documentation",
  "Base da API": "API base", "Endpoints principais": "Main endpoints", "O que vem no add-on": "What's in the add-on",
  "Workers ao vivo": "Live workers", "Estado do pool": "Pool state", "Cloud workers": "Cloud workers",
  // labels de stat/meter card
  "Workers ativos": "Active workers", "PRs abertos": "Open PRs", "Concluídas": "Completed", "Aprovação IA": "AI approval",
  "Total": "Total", "Abertos": "Open", "CI verde": "CI green", "Merged": "Merged", "Execuções": "Runs", "Falhas": "Failures",
  "Verde": "Green", "Aprovação": "Approval", "Relatórios": "Reports", "Aprovados": "Approved", "Ativas": "Active",
  "Tokens": "Tokens", "Worker-hours": "Worker-hours", "Workers simultâneos": "Concurrent workers",
  "Worker-hours (semana)": "Worker-hours (week)", "Plano": "Plan",
  // subs de card
  "pull requests": "pull requests", "em revisão/merge": "review/merge", "revisão/merge": "review/merge", "testes passaram": "tests passed",
  "concluídos": "completed", "no pool": "in pool", "aguardando": "waiting", "vermelhas": "red", "passaram": "passed",
  "status passed": "status passed", "status failed": "status failed", "concluídas": "completed", "gate vermelho": "red gate",
  "em andamento": "running", "abertos + merged": "open + merged", "relay/coder/review": "relay/coder/review", "na semana": "this week",
  "renovação por heartbeat": "heartbeat renewal", "total": "total",
  // pills + buckets
  "Todos": "All", "Na fila": "In queue", "Em execução": "Running", "Encerradas": "Closed", "Em revisão": "In review",
  "CI falhou": "CI failed", "Falhou": "Failed", "OK": "OK",
  // cabeçalhos de tabela
  "Tarefa": "Task", "Título": "Title", "Estado": "State", "Branch": "Branch", "Status": "Status", "Nome": "Name",
  "Tipo": "Type", "Data": "Date", "Provider": "Provider", "Ações": "Actions", "Quando": "When", "Ator": "Actor",
  "Ação": "Action", "Alvo": "Target", "Humano": "Human", "Concluído": "Finished", "Testes": "Tests", "Execução": "Run",
  "Local": "Location", "Fingerprint": "Fingerprint", "Clone URL": "Clone URL", "Escopo": "Scope", "Instrução": "Instruction",
  "Origem": "Source", "Categoria": "Category", "Indexado": "Indexed", "Email": "Email", "Papel": "Role",
  "Visto por último": "Last seen", "Device": "Device", "Trigger": "Trigger", "Último": "Last", "Detalhe": "Detail", "PR": "PR",
  // botões / ações
  "Adicionar": "Add", "Registrar": "Register", "Criar": "Create", "Criar rotina": "Create routine", "Criar → planejar": "Create → plan",
  "Entrar": "Sign in", "remover": "remove", "excluir": "delete", "exportar CSV": "export CSV", "marcar todas como lidas": "mark all as read",
  "ver plano": "view plan", "ocultar": "hide", "abrir": "open", "aprovar": "approve", "reprovar": "reject", "run": "run",
  "pausar": "pause", "ativar": "enable", "conectar": "connect", "sair": "sign out", "registrar": "register", "fazer login": "sign in",
  "Assinar Pro (Stripe)": "Subscribe Pro (Stripe)",
  // placeholders
  "Buscar tarefa…": "Search task…", "Buscar PR…": "Search PR…", "Buscar execução…": "Search run…", "Buscar log…": "Search log…",
  "nome": "name", "título": "title", "senha": "password", "branch": "branch",
  // empty states
  "nenhuma tarefa": "no tasks", "nenhum PR ainda": "no PRs yet", "fila vazia": "empty queue", "nenhuma execução de CI": "no CI runs",
  "nenhum relatório de QA": "no QA reports", "nenhum worker ligado": "no worker connected", "nenhuma rotina": "no routines",
  "nenhum repositório": "no repositories", "nenhum segredo registrado": "no secret registered", "nenhuma memória": "no memory",
  "nenhum documento de KB": "no KB document", "nenhum membro (faça login)": "no members (sign in)", "nenhum workspace": "no workspace",
  "nenhuma intervenção pendente": "no pending intervention", "nenhum evento de auditoria": "no audit event",
  "nenhuma notificação": "no notification", "nenhum device": "no device", "nenhuma fatura": "no invoice", "nenhum log ainda": "no logs yet",
};
const tr = (lang: string, s?: string) => (lang === "en" && s ? TR[s] || s : s);

// hook p/ traduzir strings inline nas páginas: t("PT") usa o dicionário, ou t("PT","EN").
export function useT() {
  const [lang] = useLang();
  return useCallback((pt: string, en?: string) => (lang === "en" ? (en ?? TR[pt] ?? pt) : pt), [lang]);
}
const navLabel = (lang: string, href: string, pt: string) => (lang === "en" ? EN_LABEL[href] || pt : pt);

// ───────────────────────── tokens de estilo (CSS vars) ─────────────────────────
const TONE: Record<string, [string, string]> = {
  merged: ["--green", "--green-tint"], open: ["--green", "--green-tint"], in_review: ["--accent", "--accent-tint"],
  running: ["--blue", "--blue-tint"], planning: ["--blue", "--blue-tint"], queued: ["--orange", "--orange-tint"],
  assigned: ["--orange", "--orange-tint"], idle: ["--dim", "--border"], failed: ["--red", "--red-tint"], blocked: ["--red", "--red-tint"],
};
export const badge = (s: string) => {
  const [c, tt] = TONE[s] || ["--dim", "--border"];
  return { background: `var(${tt})`, color: `var(${c})`, padding: "2px 8px", borderRadius: 6, fontSize: 12, whiteSpace: "nowrap" as const, fontWeight: 500 };
};
export const cell = { padding: "9px 14px", borderBottom: "1px solid var(--border)", textAlign: "left" as const, fontSize: 13.5 };
export const thCell = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };
export const tableStyle = { width: "100%", borderCollapse: "collapse" as const };
export const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginBottom: 18, boxShadow: "var(--shadow)" };
export const input = { background: "var(--bg)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", fontSize: 14, outline: "none" };
export const btn = { background: "var(--accent)", color: "var(--accent-ink)", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 14 };
export function short(id: string, n = 16) { return id.length > n ? id.slice(0, n) + "…" : id; }
export const codeAmber = { fontFamily: "var(--mono)", color: "var(--accent)", fontSize: 13, fontWeight: 600 } as const;
export const codeDim = { fontFamily: "var(--mono)", color: "var(--mute)", fontSize: 12.5 } as const;

// cabeçalho de página: eyebrow + título grande + subtítulo (+ ações à direita)
export function PageHead({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  const [lang] = useLang();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
      <div>
        {eyebrow && <div style={{ color: "var(--mute)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", marginBottom: 5 }}>{tr(lang, eyebrow)}</div>}
        <h1 style={{ margin: 0, fontSize: 26 }}>{tr(lang, title)}</h1>
        {subtitle && <div style={{ color: "var(--dim)", fontSize: 14, marginTop: 6 }}>{tr(lang, subtitle)}</div>}
      </div>
      {right}
    </div>
  );
}

// portal helper — renderiza filhos no body (escapa qualquer stacking context)
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ── Toast (notificações inline no canto superior direito) ──────────────────
type ToastItem = { id: number; msg: string; type: "success" | "error" | "info" };
let _toastSeq = 0;
export function toast(msg: string, type: "success" | "error" | "info" = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("apifor-toast", { detail: { id: ++_toastSeq, msg, type } }));
}

function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const handler = (e: Event) => {
      const t = (e as CustomEvent<ToastItem>).detail;
      setItems((ts) => [...ts, t]);
      setTimeout(() => setItems((ts) => ts.filter((x) => x.id !== t.id)), 3500);
    };
    window.addEventListener("apifor-toast", handler);
    return () => window.removeEventListener("apifor-toast", handler);
  }, []);
  if (!items.length) return null;
  const COLOR: Record<string, [string, string]> = {
    success: ["var(--green)", "var(--green-tint)"],
    error:   ["var(--red)",   "var(--red-tint)"],
    info:    ["var(--accent)","var(--accent-tint)"],
  };
  const ICON: Record<string, string> = { success: "✓", error: "✕", info: "i" };
  return (
    <Portal>
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {items.map((t) => {
          const [fg, bg] = COLOR[t.type] || COLOR.info;
          return (
            <div key={t.id} className="apf-rise"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderRadius: 10,
                boxShadow: "var(--shadow-pop)", border: `1px solid ${bg}`, background: "var(--card)", fontSize: 13.5, fontWeight: 500,
                minWidth: 220, maxWidth: 380, pointerEvents: "auto" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: bg, color: fg,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                {ICON[t.type]}
              </span>
              <span style={{ color: "var(--ink)" }}>{t.msg}</span>
            </div>
          );
        })}
      </div>
    </Portal>
  );
}

// modal reutilizável (overlay + fadein/rise + Esc/backdrop p/ fechar)
export function Modal({ title, onClose, children, footer, width = 520 }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  const [lang] = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <Portal>
      <div className="apf-fadein" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className="apf-rise" onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-pop)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--card)" }}>
            <b style={{ fontFamily: "var(--head)", fontSize: 15 }}>{tr(lang, title)}</b>
            <button className="apf-iconbtn" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "transparent", color: "var(--dim)", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ padding: 18 }}>{children}</div>
          {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--border)", position: "sticky", bottom: 0, background: "var(--card)" }}>{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

// cabeçalho dentro de um card
export function CardHead({ title, right }: { title: string; right?: React.ReactNode }) {
  const [lang] = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
      <b style={{ fontFamily: "var(--head)", fontSize: 13.5, letterSpacing: "-.01em" }}>{tr(lang, title)}</b>
      {right}
    </div>
  );
}

// barra empilhada de estado + legenda (ex.: "Estado das tarefas")
export function StateBar({ title, counts }: { title: string; counts: { label: string; n: number; tone: string }[] }) {
  const [lang] = useLang();
  const total = counts.reduce((a, c) => a + c.n, 0);
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <b style={{ fontFamily: "var(--head)", fontSize: 14 }}>{tr(lang, title)}</b>
        <span style={{ color: "var(--mute)", fontSize: 13 }}>{total} {lang === "en" ? "in pipeline" : "no pipeline"}</span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", background: "var(--border)", marginBottom: 16 }}>
        {counts.filter((c) => c.n).map((c, i) => <div key={i} style={{ flex: c.n, background: `var(--${c.tone})` }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 28px" }}>
        {counts.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--dim)", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: `var(--${c.tone})` }} />{tr(lang, c.label)}</span>
            <b>{c.n}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// chave liga/desliga (switch)
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      style={{ width: 42, height: 24, borderRadius: 20, border: "none", cursor: "pointer", background: on ? "var(--green)" : "var(--border)", position: "relative", transition: "background .15s", flexShrink: 0, padding: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 18, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
    </button>
  );
}

// linha de filtros em pílulas
export function Pills({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  const [lang] = useLang();
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, padding: 3 }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)}
          style={{ border: "none", cursor: "pointer", borderRadius: 7, padding: "5px 12px", fontSize: 13, fontWeight: 500,
            background: value === val ? "var(--card)" : "transparent", color: value === val ? "var(--ink)" : "var(--dim)" }}>{tr(lang, label)}</button>
      ))}
    </div>
  );
}

// mini-gráfico de linha (série de números)
export function Sparkline({ data, color = "--accent", w = 116, h = 32 }: { data: number[]; color?: string; w?: number; h?: number }) {
  const d = data.length < 2 ? [data[0] || 0, data[0] || 0] : data;
  const max = Math.max(...d, 1), min = Math.min(...d, 0), span = max - min || 1;
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * w},${(h - 3) - ((v - min) / span) * (h - 6) + 1}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0 }}>
      <polyline className="apf-spark" points={pts} fill="none" stroke={`var(${color})`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
// acumula um valor numa janela rolante (série real ao vivo)
export function useSeries(value: number, n = 24) {
  const [s, setS] = useState<number[]>([]);
  useEffect(() => { setS((cur) => [...cur, value].slice(-n)); }, [value, n]);
  return s;
}
// card de métrica: rótulo + número grande + sparkline + sub
export function StatCard({ label, value, suffix, tone = "accent", series, sub }: { label: string; value: React.ReactNode; suffix?: string; tone?: string; series?: number[]; sub?: string }) {
  const [lang] = useLang();
  return (
    <div style={{ ...card, padding: 16, marginBottom: 0 }}>
      <div style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>{tr(lang, label)}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 28, lineHeight: 1 }}>{value}{suffix && <span style={{ fontSize: 14, color: "var(--mute)", fontWeight: 600 }}>{suffix}</span>}</div>
        {series && series.length > 1 && <Sparkline data={series} color={`--${tone}`} />}
      </div>
      {sub && <div style={{ color: "var(--mute)", fontSize: 12, marginTop: 9 }}>{tr(lang, sub)}</div>}
    </div>
  );
}

// card de medidor: rótulo + valor/limite + barra de progresso + sub
export function MeterCard({ label, value, limit, pct, tone = "accent", sub }: { label: string; value: React.ReactNode; limit?: React.ReactNode; pct: number; tone?: string; sub?: string }) {
  const [lang] = useLang();
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ ...card, padding: 16, marginBottom: 0 }}>
      <div style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>{tr(lang, label)}</div>
      <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 23, marginBottom: 12 }}>{value}{limit !== undefined && <span style={{ fontSize: 14, color: "var(--mute)", fontWeight: 600 }}> / {limit}</span>}</div>
      <div style={{ height: 6, borderRadius: 6, background: "var(--border)", overflow: "hidden" }}>
        <div style={{ width: p + "%", height: "100%", background: `var(--${tone})`, transition: "width .4s" }} />
      </div>
      <div style={{ color: "var(--mute)", fontSize: 12, marginTop: 8 }}>{sub ?? `${Math.round(p)}% do limite`}</div>
    </div>
  );
}

// ───────────────────────── navegação agrupada ─────────────────────────
type Item = [string, string, string?]; // [href, label_pt, countKey?]
const NAV: { key: string; items: Item[] }[] = [
  { key: "op", items: [["/", "Dashboard"], ["/queue", "Fila", "queue"], ["/tasks", "Tarefas"], ["/prs", "Pull Requests", "prs"], ["/interventions", "Intervenção", "interv"], ["/live", "Live", "workers"], ["/ci", "CI"], ["/qa", "QA"], ["/routines", "Rotinas"], ["/telemetry", "Telemetria"], ["/logs", "Logs"]] },
  { key: "sys", items: [["/knowledge", "Conhecimento"], ["/config", "Configuração"], ["/web", "Web"], ["/cloud", "Cloud"], ["/audit", "Auditoria"]] },
  { key: "acct", items: [["/org", "Organização"], ["/usage", "Uso"], ["/invoices", "Faturas"], ["/pricing", "Planos"], ["/conta", "Conta"], ["/ajuda", "Ajuda"]] },
];

function useCounts() {
  const [c, setC] = useState<Record<string, number>>({});
  useEffect(() => {
    let on = true;
    const load = async () => {
      const n = async (p: string, f?: (d: any[]) => number) => {
        try { const r = await apiGet<{ data: any[] }>(p); const d = r?.data || []; return f ? f(d) : d.length; } catch { return 0; }
      };
      const [workers, queue, prs, interv] = await Promise.all([
        n("/v1/workers"),
        n("/v1/tasks", (d) => d.filter((x) => ["queued", "planning", "assigned"].includes(x.status)).length),
        n("/v1/prs", (d) => d.filter((x) => x.status !== "merged").length),
        n("/v1/interventions"),
      ]);
      if (on) setC({ workers, queue, prs, interv });
    };
    load(); const tm = setInterval(load, 4000);
    return () => { on = false; clearInterval(tm); };
  }, []);
  return c;
}

function useUnread() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const es = new EventSource(sseURL("/v1/notifications/stream"));
    es.onmessage = (e) => { try { setN(JSON.parse(e.data).unread || 0); } catch {} };
    return () => es.close();
  }, []);
  return n;
}

const countBadge = (n?: number, tone = "accent") =>
  n ? <span style={{ marginLeft: "auto", background: `var(--${tone}-tint)`, color: `var(--${tone})`, borderRadius: 20, padding: "0 7px", fontSize: 11, fontWeight: 600 }}>{n}</span> : null;

// ───────────────────────── ícones (linha, currentColor) ─────────────────────────
const ICONS: Record<string, string[]> = {
  "/": ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  "/live": ["M22 12h-4l-3 9L9 3l-3 9H2"],
  "/queue": ["M8 6h13M8 12h13M8 18h13", "M3 6h.01M3 12h.01M3 18h.01"],
  "/tasks": ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  "/prs": ["M18 6v8a3 3 0 0 1-3 3H7", "M6 9V5", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
  "/interventions": ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  "/ci": ["M6 3v12", "M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M15 6a9 9 0 0 1-9 9"],
  "/qa": ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "M22 4L12 14.01l-3-3"],
  "/routines": ["M17 1l4 4-4 4", "M3 11V9a4 4 0 0 1 4-4h14", "M7 23l-4-4 4-4", "M21 13v2a4 4 0 0 1-4 4H3"],
  "/telemetry": ["M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"],
  "/logs": ["M4 17l6-6-6-6", "M12 19h8"],
  "/web": ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M2 12h20", "M12 2c3 3 4.5 6.5 4.5 10S15 19 12 22 7.5 15.5 7.5 12 9 5 12 2z"],
  "/cloud": ["M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"],
  "/conta": ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
  "/ajuda": ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 17h.01"],
  "/knowledge": ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  "/config": ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"],
  "/audit": ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  "/org": ["M3 21h18", "M5 21V7l8-4v18", "M19 21V11l-6-3"],
  "/usage": ["M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z", "M3.34 19a10 10 0 1 1 17.32 0"],
  "/invoices": ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8"],
  "/pricing": ["M1 4h22v16H1z", "M1 10h22"],
};
function Ico({ name, color }: { name: string; color: string }) {
  const paths = ICONS[name] || ["M4 12h16"];
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ───────────────────────── command palette (⌘K) ─────────────────────────
const ALL_ITEMS = NAV.flatMap((g) => g.items.map(([href, label]) => ({ href, label, group: g.key }))).concat([
  { href: "/notifications", label: "Notificações", group: "op" },
  { href: "/onboarding", label: "Início", group: "sys" },
]);
function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("apifor-cmdk", onOpen as any);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("apifor-cmdk", onOpen as any); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => ref.current?.focus(), 30); } }, [open]);
  if (!open) return null;
  const matches = ALL_ITEMS.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  const go = (href: string) => { setOpen(false); window.location.href = href; };
  return (
    <div className="apf-fadein" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}>
      <div className="apf-rise" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow-pop)", overflow: "hidden" }}>
        <input ref={ref} value={q} placeholder="Ir para…"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, matches.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter" && matches[sel]) go(matches[sel].href);
          }}
          style={{ width: "100%", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 16, padding: "16px 18px", outline: "none", fontFamily: "var(--sans)" }} />
        <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
          {matches.map((m, i) => (
            <div key={m.href} onMouseEnter={() => setSel(i)} onClick={() => go(m.href)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, cursor: "pointer", background: i === sel ? "var(--accent-tint)" : "transparent", color: i === sel ? "var(--accent)" : "var(--ink)" }}>
              <span style={{ fontSize: 14 }}>{m.label}</span>
              <code style={{ marginLeft: "auto", fontSize: 11, color: "var(--mute)" }}>{m.href}</code>
            </div>
          ))}
          {!matches.length && <div style={{ padding: 16, color: "var(--mute)" }}>Nenhum resultado</div>}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── workspace switcher ─────────────────────────
function WorkspaceMenu({ lang }: { lang: string }) {
  const [open, setOpen]           = useState(false);
  const [wsps, setWsps]           = useState<{ id: string; name: string; initial: string }[]>([]);
  const [curId, setCurId]         = useState<string>(() => { try { return localStorage.getItem("apifor_wsp") || ""; } catch { return ""; } });
  const [role, setRole]           = useState("");
  const [wspModal, setWspModal]   = useState(false);
  const [wspName, setWspName]     = useState("");
  const [wspSaving, setWspSaving] = useState(false);
  const menuRef                   = useRef<HTMLDivElement>(null);
  const cur = wsps.find((w) => w.id === curId) || wsps[0];

  const load = useCallback(() => {
    apiGet<{ data: any[] }>("/v1/workspaces").then((r) => {
      const list = r?.data || [];
      setWsps(list);
      // Selecionar primeiro workspace se nenhum estiver salvo
      setCurId((prev) => {
        if (!prev && list.length > 0) {
          try { localStorage.setItem("apifor_wsp", list[0].id); } catch {}
          return list[0].id;
        }
        return prev;
      });
    }).catch(() => {});
    apiGet<{ role: string }>("/v1/me").then((r) => setRole(r?.role || "")).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function switchWsp(id: string) {
    try { localStorage.setItem("apifor_wsp", id); } catch {}
    setCurId(id);
    setOpen(false);
    window.location.reload();
  }

  function openModal() { setOpen(false); setWspName(""); setWspModal(true); }

  async function createWsp() {
    if (!wspName.trim()) return;
    setWspSaving(true);
    try {
      const r = await apiPost<{ id?: string; error?: { message: string } }>("/v1/workspaces", { name: wspName.trim() });
      if (r?.id) {
        try { localStorage.setItem("apifor_wsp", r.id); } catch {}
        setCurId(r.id);
        toast(lang === "en" ? "Workspace created!" : "Workspace criado com sucesso!", "success");
        setWspModal(false);
        await load();
        window.location.reload();
      } else {
        toast(r?.error?.message || (lang === "en" ? "Failed to create workspace" : "Erro ao criar workspace"), "error");
      }
    } catch {
      toast(lang === "en" ? "Failed to create workspace" : "Erro ao criar workspace", "error");
    } finally {
      setWspSaving(false);
    }
  }

  return (
    <>
      <div ref={menuRef} style={{ position: "relative", margin: "0 12px 8px" }}>
        <button className="apf-link" onClick={() => setOpen((o) => !o)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--card)", cursor: "pointer", color: "var(--ink)", textAlign: "left" }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>{cur?.initial || "P"}</span>
          <span style={{ fontSize: 13, lineHeight: 1.2 }}><b>{cur?.name || "Principal"}</b><br /><span style={{ color: "var(--mute)", fontSize: 11 }}>{t(lang, "wsp")}{role ? " · " + role : ""}</span></span>
          <span style={{ marginLeft: "auto", color: "var(--mute)" }}>▾</span>
        </button>
        {open && (
          <div className="apf-fadein" style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 6, zIndex: 20, boxShadow: "var(--shadow-pop)" }}>
            {wsps.map((w) => (
              <div key={w.id} className="apf-link" onClick={() => switchWsp(w.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                  background: w.id === curId ? "var(--accent-tint)" : "transparent", color: w.id === curId ? "var(--accent)" : "var(--ink)" }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, background: w.id === curId ? "var(--accent)" : "var(--accent-tint)", color: w.id === curId ? "var(--accent-ink)" : "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10 }}>{w.initial}</span>
                {w.name}
                {w.id === curId && <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>}
              </div>
            ))}
            <div onClick={openModal} className="apf-link" style={{ padding: "7px 9px", borderRadius: 8, fontSize: 13, color: "var(--accent)", cursor: "pointer", borderTop: "1px solid var(--border)", marginTop: 4 }}>+ {t(lang, "newWsp")}</div>
          </div>
        )}
      </div>

      {wspModal && (
        <Modal title="Novo workspace" onClose={() => setWspModal(false)} width={400}
          footer={<>
            <button onClick={() => setWspModal(false)} style={{ height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={createWsp} disabled={wspSaving || !wspName.trim()}
              style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (wspSaving || !wspName.trim()) ? .5 : 1 }}>
              {wspSaving ? (lang === "en" ? "Creating…" : "Criando…") : (lang === "en" ? "Create" : "Criar")}
            </button>
          </>}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{lang === "en" ? "Workspace name" : "Nome do workspace"}</span>
            <input
              autoFocus
              value={wspName}
              onChange={(e) => setWspName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createWsp(); }}
              placeholder={lang === "en" ? "e.g. Production" : "ex: Produção"}
              style={{ height: 38, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
            />
          </label>
        </Modal>
      )}
    </>
  );
}

function Sidebar() {
  const path = usePathname();
  const counts = useCounts();
  const [lang] = useLang();
  return (
    <aside style={{ width: 232, flexShrink: 0, background: "var(--sidebar)", borderRight: "1px solid var(--border)", height: "100vh", position: "sticky", top: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ padding: "18px 18px 12px", display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 21, letterSpacing: "-.03em" }}>apifor<span style={{ color: "var(--accent)" }}>.</span></span>
        <span style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 11, color: "var(--accent)", letterSpacing: ".14em" }}>DEV</span>
      </div>
      <WorkspaceMenu lang={lang} />
      <nav style={{ padding: "4px 8px", flex: 1 }}>
        {NAV.map((g) => (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div style={{ color: "var(--mute)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em", padding: "4px 10px" }}>{t(lang, g.key)}</div>
            {g.items.map(([href, label, key]) => {
              const active = path === href;
              return (
                <a key={href} href={href} className={active ? "" : "apf-navitem"}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", borderRadius: 8, fontSize: 13.5, fontWeight: active ? 600 : 500, ...(active ? { color: "var(--ink)", background: "var(--elev)" } : {}) }}>
                  {active && <span style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: "var(--accent)" }} />}
                  <Ico name={href} color={active ? "var(--accent)" : "var(--mute)"} />
                  {navLabel(lang, href, label)}
                  {countBadge((counts as any)[key || ""], href === "/interventions" ? "red" : "accent")}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)", color: "var(--mute)", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: counts.workers ? "var(--green)" : "var(--mute)" }}>●</span>
        {t(lang, "pool")} · {counts.workers || 0} worker(s) · v0.9
      </div>
    </aside>
  );
}

// ───────────────────────── notificações dropdown ─────────────────────────
type Notif = { id: string; type: string; title: string; body: string; read: boolean; created_at: string };

const NOTIF_MOCK: Notif[] = [
  { id: "n1", type: "pr_merged",    title: "PR mergeado",        body: "feat/workers-pinned → main · #44",              read: false, created_at: new Date(Date.now() - 18 * 60000).toISOString() },
  { id: "n2", type: "task_done",    title: "Tarefa concluída",   body: "fix: auth middleware token expiry check",        read: false, created_at: new Date(Date.now() - 55 * 60000).toISOString() },
  { id: "n3", type: "worker_error", title: "Worker interrompido",body: "Conflito em migração 0042_alter_invoice",        read: false, created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "n4", type: "info",         title: "Plano atualizado",   body: "Conta migrada para o plano Pro com sucesso.",    read: true,  created_at: new Date(Date.now() - 24 * 3600000).toISOString() },
  { id: "n5", type: "task_done",    title: "Tarefa concluída",   body: "feat: config do pool funcional (liga/desliga)",  read: true,  created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
];

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)   return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const NOTIF_ICON: Record<string, React.ReactNode> = {
  pr_merged:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M6 8.5v7M18 9a9 9 0 0 1-9 9"/><circle cx="18" cy="6" r="2.5"/></svg>,
  task_done:    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>,
  worker_error: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  info:         <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>,
};
const NOTIF_COLOR: Record<string, [string, string]> = {
  pr_merged:    ["var(--blue)",   "rgba(88,166,255,.12)"],
  task_done:    ["var(--green)",  "var(--green-tint)"],
  worker_error: ["var(--red)",    "var(--red-tint)"],
  info:         ["var(--accent)", "var(--accent-tint)"],
};

function NotifMenu({ unread: initUnread }: { unread: number }) {
  const [open, setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [rect, setRect]   = useState<DOMRect | null>(null);
  const [winW, setWinW]   = useState(0);
  const btnRef            = useRef<HTMLButtonElement>(null);
  const unreadCount       = notifs.filter((n) => !n.read).length || (open ? 0 : initUnread);

  function openMenu() {
    if (btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
      setWinW(window.innerWidth);
    }
    setOpen(true);
    if (notifs.length) return;
    setLoading(true);
    apiGet<{ data: Notif[] }>("/v1/notifications")
      .then((r) => setNotifs(r?.data?.length ? r.data : NOTIF_MOCK))
      .catch(() => setNotifs(NOTIF_MOCK))
      .finally(() => setLoading(false));
  }

  function markAll() {
    setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
    apiGet("/v1/notifications/mark-read").catch(() => {});
  }

  function markOne(id: string) {
    setNotifs((ns) => ns.map((n) => n.id === id ? { ...n, read: true } : n));
  }

  const ic = { width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)", color: "var(--dim)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15 } as const;

  return (
    <div style={{ position: "relative" }}>
      <button ref={btnRef} className="apf-iconbtn" style={{ ...ic, position: "relative" }} title="Notificações"
        onClick={() => open ? setOpen(false) : openMenu()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "var(--red)", color: "#fff", borderRadius: 10, minWidth: 16, height: 16, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px", fontWeight: 700, pointerEvents: "none" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && rect && (
        <Portal>
          {/* backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 98 }} />
          {/* panel */}
          <div className="apf-fadein" style={{ position: "fixed", top: rect.bottom + 8, right: winW - rect.right, width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow-pop)", zIndex: 99, overflow: "hidden" }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Notificações</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {notifs.some((n) => !n.read) && (
                  <button onClick={markAll} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                    Marcar tudo como lido
                  </button>
                )}
                <button onClick={() => setOpen(false)} style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "none", background: "transparent", color: "var(--mute)", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            </div>

            {/* list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading && (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--mute)", fontSize: 12.5 }}>Carregando…</div>
              )}
              {!loading && notifs.length === 0 && (
                <div style={{ padding: "32px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  <span style={{ fontSize: 12.5, color: "var(--mute)" }}>Nenhuma notificação</span>
                </div>
              )}
              {!loading && notifs.map((n) => {
                const [color, bg] = NOTIF_COLOR[n.type] || NOTIF_COLOR.info;
                return (
                  <div key={n.id} onClick={() => markOne(n.id)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: n.read ? "transparent" : "color-mix(in srgb, var(--accent-tint) 40%, transparent)", transition: "background .12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? "transparent" : "color-mix(in srgb, var(--accent-tint) 40%, transparent)")}>
                    {/* icon */}
                    <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, background: bg, color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {NOTIF_ICON[n.type] || NOTIF_ICON.info}
                    </span>
                    {/* text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: n.read ? 500 : 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                        <span style={{ fontSize: 10.5, color: "var(--mute)", flexShrink: 0, fontFamily: "var(--mono)" }}>{timeAgo(n.created_at)}</span>
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.body}</span>
                    </div>
                    {/* unread dot */}
                    {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", flexShrink: 0, marginTop: 4 }} />}
                  </div>
                );
              })}
            </div>

            {/* footer */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
              <a href="/notifications" onClick={() => setOpen(false)} style={{ display: "block", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
                Ver todas as notificações →
              </a>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

function LangMenu({ lang, setLang }: { lang: string; setLang: (l: string) => void }) {
  const [open, setOpen] = useState(false);
  const ic = { width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)", color: "var(--dim)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12, fontWeight: 700 } as const;
  return (
    <div style={{ position: "relative" }}>
      <button className="apf-iconbtn" style={ic} onClick={() => setOpen((o) => !o)} title="Idioma">{lang.toUpperCase()}</button>
      {open && (
        <div className="apf-fadein" style={{ position: "absolute", top: "110%", right: 0, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 5, zIndex: 20, boxShadow: "var(--shadow-pop)" }}>
          {[["pt", "Português"], ["en", "English"]].map(([code, name]) => (
            <div key={code} className="apf-link" onClick={() => { setLang(code); setOpen(false); }}
              style={{ padding: "7px 12px", borderRadius: 7, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", color: lang === code ? "var(--accent)" : "var(--ink)" }}>{name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── perfil dropdown ─────────────────────────
function ProfileMenu({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const [me, setMe]     = useState<{ user_id?: string; name?: string } | null>(null);
  const menuRef         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<{ user_id?: string; name?: string }>("/v1/me").then((r) => setMe(r)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const initials = (me?.name || me?.user_id || "AP").slice(0, 2).toUpperCase();

  const ITEMS = [
    { label: lang === "en" ? "Account" : "Conta",   href: "/conta",  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
    { label: lang === "en" ? "Help"    : "Ajuda",   href: "/ajuda",  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/></svg> },
  ];

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title={lang === "en" ? "Profile" : "Perfil"}
        style={{ width: 34, height: 34, borderRadius: 9, background: "var(--accent)", color: "var(--accent-ink)", border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, fontFamily: "var(--head)", cursor: "pointer", flexShrink: 0 }}>
        {initials}
      </button>

      {open && (
        <div className="apf-fadein" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 200, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 11, boxShadow: "var(--shadow-pop)", zIndex: 20, padding: 5, overflow: "hidden" }}>
          {/* user info */}
          <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{me?.name || "—"}</div>
            <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me?.user_id || "—"}</div>
          </div>

          {ITEMS.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="apf-link"
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderRadius: 8, fontSize: 13, color: "var(--ink)", textDecoration: "none" }}>
              <span style={{ color: "var(--mute)" }}>{item.icon}</span>
              {item.label}
            </a>
          ))}

          {/* separator + logout */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
            <button onClick={() => { setOpen(false); setToken(null); location.href = "/login"; }}
              style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", fontSize: 13, color: "var(--red)", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--red-tint)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              {lang === "en" ? "Sign out" : "Sair"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Topbar() {
  const [theme, toggle] = useTheme();
  const [lang, setLang] = useLang();
  const unread = useUnread();
  const counts = useCounts();
  const running = (counts.workers || 0) > 0;
  const ic = { width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", background: "var(--card)", color: "var(--dim)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15 } as const;
  const openCmd = () => window.dispatchEvent(new Event("apifor-cmdk"));
  return (
    <header style={{ height: 56, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", position: "sticky", top: 0, background: "color-mix(in srgb, var(--bg) 86%, transparent)", backdropFilter: "blur(8px)", zIndex: 5 }}>
      <button onClick={openCmd} className="apf-iconbtn" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 420, color: "var(--mute)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 11px", fontSize: 13, cursor: "pointer", textAlign: "left" }}>
        <span>🔍</span><span style={{ flex: 1 }}>{t(lang, "search")}</span>
        <kbd style={{ fontFamily: "var(--mono)", fontSize: 11, border: "1px solid var(--border)", borderRadius: 5, padding: "1px 5px" }}>⌘K</kbd>
      </button>
      <span style={{ flex: 1 }} />
      <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: running ? "var(--green-tint)" : "var(--border)", color: running ? "var(--green)" : "var(--mute)" }}>
        <span className={running ? "apf-live" : ""} style={{ width: 7, height: 7, borderRadius: 7, background: "currentColor" }} />{running ? (lang === "en" ? "RUNNING" : "RODANDO") : (lang === "en" ? "STOPPED" : "PARADO")}
      </span>
      <LangMenu lang={lang} setLang={setLang} />
      <button className="apf-iconbtn" style={ic} onClick={toggle} title="Alternar tema">{theme === "dark" ? "☀️" : "🌙"}</button>
      <NotifMenu unread={unread} />
      <ProfileMenu lang={lang} />
    </header>
  );
}

// ───────────────────────── auth token ─────────────────────────
const TOKEN_KEY = "apifor_token";
export const getToken = () => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
export const setToken = (tk: string | null) => {
  if (typeof window === "undefined") return;
  if (tk) localStorage.setItem(TOKEN_KEY, tk); else localStorage.removeItem(TOKEN_KEY);
};
function authHeaders(): Record<string, string> {
  const tk = getToken();
  const h: Record<string, string> = tk ? { Authorization: "Bearer " + tk } : {};
  try {
    const wsp = typeof window !== "undefined" ? localStorage.getItem("apifor_wsp") : null;
    if (wsp) h["X-Workspace-ID"] = wsp;
  } catch {}
  return h;
}

// ───────────────────────── data fetching ─────────────────────────
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";
const API = (p: string) => API_BASE + p;
export const sseURL = (p: string) => API_BASE + p;

// parse tolerante: nunca quebra com corpo vazio/não-JSON (ex.: 429/204)
async function safeJson<T>(r: Response): Promise<T> {
  if (r.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.replace("/login");
    }
    return {} as T;
  }
  const t = await r.text();
  try { return (t ? JSON.parse(t) : {}) as T; } catch { return {} as T; }
}
export async function apiGet<T = any>(p: string): Promise<T> {
  return safeJson<T>(await fetch(API(p), { headers: authHeaders() }));
}
export async function apiPost<T = any>(p: string, body: unknown): Promise<T> {
  return safeJson<T>(await fetch(API(p), { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: JSON.stringify(body) }));
}
export async function apiDelete<T = any>(p: string): Promise<T> {
  return safeJson<T>(await fetch(API(p), { method: "DELETE", headers: authHeaders() }));
}

/** Faz GET em `path` e repete a cada `ms`. Retorna { data, reload }. */
export function usePoll<T = any>(path: string, ms = 2000) {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    apiGet<{ data: T }>(path).then((r) => setData((r as any).data ?? null)).catch(() => {});
  }, [path]);
  useEffect(() => { reload(); const tm = setInterval(reload, ms); return () => clearInterval(tm); }, [reload, ms]);
  return { data, reload };
}

// ───────────────────────── app shell ─────────────────────────
function PageSkeleton() {
  const sh = (w: string | number, h: number, mb = 0) => (
    <div className="apf-shimmer" style={{ width: w, height: h, marginBottom: mb }} />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* page head */}
      <div style={{ marginBottom: 8 }}>
        {sh(72, 10, 10)}
        {sh(220, 28, 10)}
        {sh(320, 13, 0)}
      </div>
      {/* stat row */}
      <div style={{ display: "flex", gap: 14 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            {sh("60%", 11)}
            {sh("40%", 22)}
          </div>
        ))}
      </div>
      {/* main cards */}
      {[180, 130, 100].map((h, i) => (
        <div key={i} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {sh("35%", 13)}
          {sh("70%", 10)}
          {sh("55%", 10)}
          {h > 130 && sh("45%", 10)}
        </div>
      ))}
    </div>
  );
}

export function Page({ children, loading }: { children: React.ReactNode; loading?: boolean }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!getToken()) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?next=${next}`);
      return;
    }
    // Superadmin não usa o orquestrador — vai pro console da plataforma.
    apiGet<{ role?: string }>("/v1/me")
      .then((r) => { if (r?.role === "superadmin") window.location.replace("/superadmin"); else setAuthed(true); })
      .catch(() => setAuthed(true));
  }, []);

  if (!authed) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar />
        {loading && <div className="apf-progress-bar" key={String(loading)} />}
        <main className="apf-rise" style={{ padding: "26px 32px", maxWidth: 1180, width: "100%" }}>
          {loading ? <PageSkeleton /> : children}
        </main>
      </div>
      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
