"use client";
import { useEffect, useRef, useState } from "react";
import { badge, card, Page, short, usePoll, useSeries, useT } from "./ui";

type Worker = { id: string; source: string; status: string; current_step: string; current_task_id: string; host: string };
type Task = { id: string; status: string; title: string; assigned_worker_id?: string };
type PR = { id: string; status: string; ai_review_status?: string; title?: string; repo?: string };
type Repo = { id: string };
type Intervention = { id: string; task_id: string; reason?: string };
type Log = { when: string; task_id: string; type: string; status: string; log: string };
type Telemetry = { tasks_total: number; tasks_merged: number; tasks_failed: number; tasks_active: number; pull_requests: number; tokens_used: number; week_worker_seconds: number };
type Usage = { active_workers: number; max_workers: number; plan: string; week_cap_seconds: number; week_seconds_used: number };

function sparkPath(data: number[], w: number, h: number): { line: string; area: string } {
  const d = data.length < 2 ? [0, data[0] ?? 0] : data;
  const max = Math.max(...d, 1), min = Math.min(...d, 0), span = max - min || 1;
  const pts = d.map((v, i) => [
    (i / (d.length - 1)) * w,
    (h - 4) - ((v - min) / span) * (h - 8) + 2,
  ]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w},${h} L0,${h} Z` };
}

const RANGE_OPTS = [["hoje", "Hoje"], ["24h", "24h"], ["7d", "7d"]] as [string, string][];
const LOG_FILTERS = [["all", "Todos"], ["info", "Info"], ["warn", "Aviso"], ["error", "Erro"]] as [string, string][];
const PR_TABS = [["todos", "Todos"], ["revisao", "Em revisão"], ["ci", "CI falhou"]] as [string, string][];
const BUCKETS = [
  { label: "Na fila", tone: "orange", st: ["queued", "planning", "assigned"] },
  { label: "Em execução", tone: "blue", st: ["running"] },
  { label: "Em revisão", tone: "accent", st: ["in_review", "blocked"] },
  { label: "Concluídas", tone: "green", st: ["merged"] },
  { label: "Falhas", tone: "red", st: ["failed"] },
];

function tabBtn(active: boolean) {
  return {
    height: 28, padding: "0 12px", borderRadius: 6,
    border: active ? "1px solid var(--border)" : "none",
    background: active ? "var(--card)" : "transparent",
    color: active ? "var(--ink)" : "var(--dim)",
    fontSize: 12.5, fontWeight: active ? 600 : 500, cursor: "pointer",
  } as React.CSSProperties;
}

function logTabBtn(active: boolean) {
  return {
    height: 24, padding: "0 10px", borderRadius: 5,
    border: active ? "1px solid var(--border)" : "none",
    background: active ? "var(--card)" : "transparent",
    color: active ? "var(--ink)" : "var(--dim)",
    fontSize: 11.5, fontWeight: active ? 600 : 500, cursor: "pointer",
  } as React.CSSProperties;
}

function logLevel(status: string): [string, string] {
  if (["failed", "changes", "error"].includes(status)) return ["ERRO", "var(--red)"];
  if (status === "warn") return ["AVISO", "var(--orange)"];
  if (["done", "passed", "approved", "merged"].includes(status)) return ["OK", "var(--green)"];
  return ["INFO", "var(--blue)"];
}

export default function Dashboard() {
  const t = useT();

  const { data: workers } = usePoll<Worker[]>("/v1/workers", 2500);
  const { data: tasks } = usePoll<Task[]>("/v1/tasks", 2500);
  const { data: prs } = usePoll<PR[]>("/v1/prs", 3000);
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 6000);
  const { data: interventions } = usePoll<Intervention[]>("/v1/interventions", 5000);
  const { data: logs } = usePoll<Log[]>("/v1/logs", 2500);
  const { data: telemetry } = usePoll<Telemetry>("/v1/telemetry", 5000);
  const { data: usage } = usePoll<Usage>("/v1/usage", 5000);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (workers !== undefined) setLoading(false); }, [workers]);

  const [range, setRange] = useState("hoje");
  const [poolPaused, setPoolPaused] = useState(false);
  const [prTab, setPrTab] = useState("todos");
  const [logFilter, setLogFilter] = useState("all");
  const [blockedPage, setBlockedPage] = useState(0);

  const w = workers ?? [];
  const tk = tasks ?? [];
  const pr = prs ?? [];
  const iv = interventions ?? [];
  const lg = logs ?? [];
  const tel = telemetry;
  const usg = usage;

  const nWorkers = w.length;
  const nFila = tk.filter((x) => ["queued", "planning", "assigned"].includes(x.status)).length;
  const nPrsOpen = pr.filter((x) => x.status !== "merged").length;
  const nMerged = tk.filter((x) => x.status === "merged").length;
  const nFailed = tk.filter((x) => x.status === "failed").length;
  const aiTot = pr.filter((x) => x.ai_review_status).length;
  const aiOk = pr.filter((x) => x.ai_review_status === "approved").length;
  const aiPct = aiTot ? Math.round((100 * aiOk) / aiTot) : 0;
  const running = nWorkers > 0 && !poolPaused;
  const poolColor = poolPaused ? "var(--red)" : running ? "var(--green)" : "var(--mute)";

  const sW = useSeries(nWorkers);
  const sF = useSeries(nFila);
  const sP = useSeries(nPrsOpen);
  const sM = useSeries(nMerged);
  const sA = useSeries(aiPct);
  const sFailed = useSeries(nFailed);
  const sTel = useSeries(tel?.tokens_used ?? 0);
  const sThr = useSeries(tel?.tasks_merged ?? 0);

  const weekSecsUsed = usg?.week_seconds_used ?? 0;
  const weekSecsCap = usg?.week_cap_seconds ?? 129600;
  const weekHoursUsed = weekSecsUsed / 3600;
  const weekHoursCap = weekSecsCap / 3600;
  const spendPct = weekSecsCap > 0 ? Math.min(100, (weekSecsUsed / weekSecsCap) * 100) : 0;
  const spendColor = spendPct > 80 ? "var(--red)" : spendPct > 60 ? "var(--orange)" : "var(--green)";

  const blocked = [
    ...iv.map((i) => ({ task: i.task_id, title: "Intervenção humana", reason: i.reason ?? "Aguardando decisão" })),
    ...tk.filter((x) => x.status === "blocked").map((x) => ({ task: x.id, title: x.title, reason: "Aguardando desbloqueio" })),
    ...tk.filter((x) => x.status === "failed").map((x) => ({ task: x.id, title: x.title, reason: "Falhou — verificar logs" })),
  ];
  const BLOCKED_PER_PAGE = 2;
  const blockedSlice = blocked.slice(blockedPage * BLOCKED_PER_PAGE, (blockedPage + 1) * BLOCKED_PER_PAGE);

  const filteredLogs = lg
    .filter((l) => {
      if (logFilter === "info") return !["failed", "changes", "warn", "error"].includes(l.status);
      if (logFilter === "warn") return l.status === "warn";
      if (logFilter === "error") return ["failed", "changes", "error"].includes(l.status);
      return true;
    })
    .slice(-40);

  const filteredPrs = pr.filter((p) => {
    if (prTab === "revisao") return p.status === "in_review";
    if (prTab === "ci") return p.ai_review_status === "failed";
    return true;
  });

  const counts = BUCKETS.map((b) => ({ ...b, n: tk.filter((x) => b.st.includes(x.status)).length }));
  const proximas = tk.filter((x) => ["queued", "planning"].includes(x.status)).slice(0, 3);

  const kpis = [
    { label: "Workers ativos", value: nWorkers, unit: "", dc: "var(--green)", sub: `de ${usg?.max_workers ?? 1} slot(s)`, series: sW, line: "--green", area: "--green-tint" },
    { label: "Fila", value: nFila, unit: "", dc: "var(--orange)", sub: "aguardando", series: sF, line: "--orange", area: "--orange-tint" },
    { label: "PRs abertos", value: nPrsOpen, unit: "", dc: "var(--blue)", sub: "revisão/merge", series: sP, line: "--blue", area: "--blue-tint" },
    { label: "Concluídas", value: nMerged, unit: "", dc: "var(--green)", sub: "merge realizado", series: sM, line: "--green", area: "--green-tint" },
    { label: "Aprovação IA", value: aiPct, unit: "%", dc: "var(--accent)", sub: `${aiOk}/${aiTot} PRs`, series: sA, line: "--accent", area: "--accent-tint" },
    { label: "Falhas", value: nFailed, unit: "", dc: "var(--red)", sub: "no ciclo", series: sFailed, line: "--red", area: "--red-tint" },
  ];

  const spendSeries = sW.length > 1 ? sW.map((v, i) => (i / sW.length) * spendPct) : [0, spendPct];
  const spendSpark = sparkPath(spendSeries, 240, 42);
  const telCustoSpark = sparkPath(sTel.length > 1 ? sTel : [0, tel?.tokens_used ?? 0], 150, 30);
  const telThruSpark = sparkPath(sThr.length > 1 ? sThr : [0, tel?.tasks_merged ?? 0], 150, 30);

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [filteredLogs.length]);

  return (
    <Page loading={loading}>
      {/* ── PAGE HEADER ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mute)" }}>Operação</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-.02em" }}>Dashboard</h1>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--dim)" }}>
            Visão geral do pipeline · <span style={{ fontFamily: "var(--mono)" }}>{(repos ?? []).length} repositório(s)</span>{" "}
            · <span style={{ fontFamily: "var(--mono)" }}>{nWorkers} worker(s)</span>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 2, height: 34, padding: 3, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 8 }}>
            {RANGE_OPTS.map(([k, l]) => (
              <button key={k} onClick={() => setRange(k)} style={tabBtn(k === range)}>{l}</button>
            ))}
          </div>
          <button onClick={() => setPoolPaused((p) => !p)} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 8, border: `1px solid ${poolPaused ? "var(--green)" : "var(--red)"}`, background: poolPaused ? "var(--green)" : "var(--red-tint)", color: poolPaused ? "#08210f" : "var(--red)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            {poolPaused
              ? <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>
              : <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>}
            {poolPaused ? "Retomar" : "Pausar pool"}
          </button>
        </div>
      </div>

      {/* ── PAUSED BANNER ── */}
      {poolPaused && (
        <div className="apf-rise" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 15px", borderRadius: 10, background: "var(--red-tint)", border: "1px solid rgba(248,81,73,.32)", marginBottom: 16 }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Pipeline pausado globalmente</div>
            <div style={{ fontSize: 12, color: "var(--dim)" }}>Workers atuais concluirão suas tarefas; nenhum novo será iniciado até retomar.</div>
          </div>
          <button onClick={() => setPoolPaused(false)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 13px", borderRadius: 7, border: "1px solid var(--green)", background: "var(--green)", color: "#08210f", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Retomar agora
          </button>
        </div>
      )}

      {/* ── HERO + SPEND ── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>

        {/* Pool hero */}
        <div style={{ flex: "2 1 460px", minWidth: 300, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow)", padding: 18, display: "flex", flexDirection: "column", gap: 15, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,.045) 1px,transparent 1px)", backgroundSize: "17px 17px", opacity: .7, pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--mute)" }}>Estado do pool</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" as const, color: "var(--accent)", background: "var(--accent-tint)", borderRadius: 5, padding: "2px 7px" }}>Modo {(usg?.plan ?? "free").toUpperCase()}</span>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--dim)" }}>
              <span className="apf-live" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
              tempo real
            </span>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {running && <>
                <span style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", background: poolColor, opacity: .22, animation: "pulsering 2.6s ease-out infinite" }} />
                <span style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", background: poolColor, opacity: .22, animation: "pulsering 2.6s ease-out 1.3s infinite" }} />
              </>}
              <span style={{ width: 17, height: 17, borderRadius: "50%", background: poolColor, boxShadow: `0 0 18px ${poolColor}` }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: poolColor, lineHeight: 1.1 }}>
                {poolPaused ? "PAUSADO" : running ? "RODANDO" : "PARADO"}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--dim)" }}>{nWorkers} worker(s) ativo(s)</span>
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {Array.from({ length: Math.max(usg?.max_workers ?? 1, 8) }).map((_, i) => (
              <span key={i} style={{ width: 9, height: 22, borderRadius: 3, background: i < nWorkers ? "var(--green)" : "var(--border)", transition: "background .3s" }} />
            ))}
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--dim)" }}>{nWorkers}/{usg?.max_workers ?? 1} workers</span>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "stretch", borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: "auto" }}>
            {[[(repos ?? []).length, "repositórios"], [nFila, "na fila"], [nPrsOpen, "PRs abertos"]].map(([v, l], i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, ...(i > 0 ? { paddingLeft: 16, borderLeft: "1px solid var(--border)" } : {}) }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 600, color: "var(--ink)", transition: "color .3s" }}>{v}</span>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Spend gauge */}
        <div style={{ flex: "1 1 280px", minWidth: 260, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "var(--shadow)", padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--mute)" }}>Uso da semana</span>
            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--dim)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px" }}>teto {weekHoursCap.toFixed(0)}h</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 30, fontWeight: 600, letterSpacing: "-.02em", color: "var(--ink)" }}>{weekHoursUsed.toFixed(1)}h</span>
          </div>
          <div style={{ height: 9, borderRadius: 6, background: "var(--elev)", overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
            <div style={{ width: `${spendPct}%`, height: "100%", background: spendColor, transition: "width .4s", position: "relative", overflow: "hidden" }}>
              <span style={{ position: "absolute", inset: 0, width: "40%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)", animation: "barflow 2.2s linear infinite" }} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: spendColor }}>{spendPct.toFixed(1)}% do teto</span>
            <span style={{ fontSize: 11.5, color: "var(--mute)" }}>plano <span style={{ fontFamily: "var(--mono)", color: "var(--dim)" }}>{usg?.plan ?? "free"}</span></span>
          </div>
          <svg viewBox="0 0 240 42" width="100%" height={40} preserveAspectRatio="none" style={{ display: "block", overflow: "visible", marginTop: "auto" }}>
            <path d={spendSpark.area} fill="var(--accent-tint)" />
            <path d={spendSpark.line} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" pathLength={100} style={{ strokeDasharray: 100, animation: "draw 1.3s ease-out" }} />
          </svg>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--mute)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
            </svg>
            Pausa automática ao atingir o teto semanal
          </div>
        </div>
      </div>

      {/* ── KPI ROW ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {kpis.map((k, i) => {
          const sp = sparkPath(k.series.length > 1 ? k.series : [0, k.value], 120, 30);
          return (
            <div key={i} style={{ flex: "1 1 152px", minWidth: 148, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "13px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" as const, color: "var(--mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 27, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.02em" }}>{k.value}</span>
                <span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 500 }}>{k.unit}</span>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--mute)", whiteSpace: "nowrap" }}>{k.sub}</span>
              <svg viewBox="0 0 120 30" width="100%" height={28} preserveAspectRatio="none" style={{ display: "block", overflow: "visible", marginTop: 1 }}>
                <path d={sp.area} fill={`var(${k.area})`} />
                <path d={sp.line} fill="none" stroke={`var(${k.line})`} strokeWidth={1.7} strokeLinejoin="round" pathLength={100} style={{ strokeDasharray: 100, animation: "draw 1.2s ease-out" }} />
              </svg>
            </div>
          );
        })}
      </div>

      {/* ── MAIN GRID ── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* LEFT col */}
        <div style={{ flex: "3 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Workers ao vivo */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Workers ao vivo</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: running ? "var(--green-tint)" : "var(--border)", color: running ? "var(--green)" : "var(--mute)" }}>
                  {running && <span className="apf-live" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />}
                  {poolPaused ? "pausado" : running ? "ao vivo" : "parado"}
                </span>
              </div>
              <a href="/live" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--dim)", textDecoration: "none" }}>
                ver Live →
              </a>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "13px 16px" }}>
              {w.map((x) => (
                <div key={x.id} style={{ display: "flex", flexDirection: "column", gap: 9, padding: "11px 13px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 15, width: 15, flexShrink: 0, color: x.status === "running" ? "var(--green)" : x.status === "paused" ? "var(--red)" : "var(--mute)" }}>
                      {(["0s", ".18s", ".36s"] as string[]).map((delay, di) => (
                        <span key={di} style={{ width: 3, borderRadius: 2, background: "currentColor", height: di === 0 ? "45%" : di === 1 ? "90%" : "65%", animation: x.status === "running" ? `dotpulse 1s ease-in-out ${delay} infinite` : "none", transformOrigin: "bottom", display: "inline-block" }} />
                      ))}
                    </div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>{short(x.id, 16)}</span>
                    {x.status === "paused" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, padding: "1px 7px 1px 6px", borderRadius: 999, background: "var(--red-tint)", border: "1px solid rgba(248,81,73,.3)", color: "var(--red)", fontSize: 10, fontWeight: 700, letterSpacing: ".03em", textTransform: "uppercase" }}>pausado</span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, flexShrink: 0, fontFamily: "var(--mono)" }}>{x.current_task_id ? short(x.current_task_id, 12) : ""}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.current_task_id ? "tarefa em andamento" : "aguardando"}</span>
                    <span style={badge(x.status)}>{x.status}</span>
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--dim)" }}>›</span>
                    {x.current_step || "aguardando tarefa"}
                  </div>
                </div>
              ))}
              {!w.length && (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>{t("nenhum worker ligado")}</div>
              )}
            </div>
          </div>

          {/* Pull Requests */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Pull Requests</span>
              <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 8 }}>
                {PR_TABS.map(([k, l]) => (
                  <button key={k} onClick={() => setPrTab(k)} style={tabBtn(k === prTab)}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase" as const, color: "var(--mute)", padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
              <span>Pull request</span>
              <span style={{ padding: "0 14px" }}>Revisão IA</span>
              <span style={{ padding: "0 14px" }}>Estado</span>
              <span style={{ textAlign: "right", width: 64 }}>ID</span>
            </div>
            <div>
              {filteredPrs.map((p) => (
                <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{short(p.id, 8)}</span>
                      <span style={{ fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(p as any).title ?? "Pull request"}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", padding: "0 14px" }}>
                    <span style={{ ...badge(p.ai_review_status ?? "idle"), fontSize: 11 }}>{p.ai_review_status ?? "pendente"}</span>
                  </div>
                  <div style={{ padding: "0 14px" }}>
                    <span style={badge(p.status)}>{p.status}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: 64 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{short(p.id, 6)}</span>
                  </div>
                </div>
              ))}
              {!filteredPrs.length && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "30px 16px", textAlign: "center" }}>
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" />
                  </svg>
                  <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Nenhum PR neste filtro — tudo fluindo.</span>
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px" }}>
              <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filteredPrs.length} resultado(s)</span>
              <a href="/prs" style={{ fontSize: 12, color: "var(--dim)", textDecoration: "none" }}>ver todos →</a>
            </div>
          </div>
        </div>

        {/* RIGHT col */}
        <div style={{ flex: "2 1 350px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Estado das tarefas */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Estado das tarefas</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--dim)" }}>{tk.length} no pipeline</span>
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2 }}>
              {counts.some((c) => c.n > 0)
                ? counts.filter((c) => c.n > 0).map((c, i) => (
                  <span key={i} style={{ flex: c.n, background: `var(--${c.tone})`, transition: "flex .4s" }} title={`${c.label}: ${c.n}`} />
                ))
                : <span style={{ flex: 1, background: "var(--border)" }} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
              {counts.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: `var(--${c.tone})`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--dim)", flex: 1 }}>{c.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{c.n}</span>
                </div>
              ))}
            </div>
            {proximas.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 11, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" as const, color: "var(--mute)" }}>Próximas na fila</span>
                {proximas.map((q) => (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)", flexShrink: 0 }}>{short(q.id, 8)}</span>
                    <span style={{ fontSize: 12, color: "var(--dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.title}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "var(--dim)", background: "var(--elev)", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />pronta
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Precisa de atenção */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flex: 1 }}>Precisa de atenção</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: blocked.length ? "var(--red)" : "var(--green)", background: blocked.length ? "var(--red-tint)" : "var(--green-tint)", borderRadius: 6, padding: "2px 8px" }}>{blocked.length}</span>
            </div>
            <div style={{ padding: "13px 16px", display: "flex", flexDirection: "column", gap: 11, minHeight: 120 }}>
              {blockedSlice.length > 0 ? blockedSlice.map((b, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 7, padding: "12px 13px", border: "1px solid rgba(248,81,73,.28)", borderRadius: 10, background: "var(--red-tint)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--red)", fontWeight: 600 }}>{short(b.task, 10)}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{b.reason}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <a href="/interventions" style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--red)", background: "var(--red)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "none" }}>Intervir</a>
                    <button style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Reprocessar</button>
                  </div>
                </div>
              )) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "20px 0", textAlign: "center" }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" />
                  </svg>
                  <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Tudo certo — sem bloqueios.</span>
                </div>
              )}
            </div>
            {blocked.length > BLOCKED_PER_PAGE && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 16px 13px" }}>
                <span style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>{blockedPage + 1}/{Math.ceil(blocked.length / BLOCKED_PER_PAGE)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => setBlockedPage((p) => Math.max(0, p - 1))} disabled={blockedPage === 0} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", cursor: "pointer", opacity: blockedPage === 0 ? .4 : 1 }}>‹</button>
                  <button onClick={() => setBlockedPage((p) => Math.min(Math.ceil(blocked.length / BLOCKED_PER_PAGE) - 1, p + 1))} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", cursor: "pointer" }}>›</button>
                </div>
              </div>
            )}
          </div>

          {/* Telemetria mini */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Telemetria</span>
              <a href="/telemetry" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--dim)", textDecoration: "none" }}>detalhes →</a>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { label: "Throughput", value: `${tel?.tasks_merged ?? 0} tasks`, sp: telThruSpark, stroke: "var(--green)", fill: "var(--green-tint)" },
                { label: "Tokens", value: `${((tel?.tokens_used ?? 0) / 1000).toFixed(1)}k`, sp: telCustoSpark, stroke: "var(--accent)", fill: "var(--accent-tint)" },
              ].map((item, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, padding: 11, border: "1px solid var(--border)", borderRadius: 10, background: "var(--elev)" }}>
                  <span style={{ fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase" as const, letterSpacing: ".04em" }}>{item.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{item.value}</span>
                  <svg viewBox="0 0 150 30" width="100%" height={26} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
                    <path d={item.sp.area} fill={item.fill} />
                    <path d={item.sp.line} fill="none" stroke={item.stroke} strokeWidth={1.6} strokeLinejoin="round" pathLength={100} style={{ strokeDasharray: 100, animation: "draw 1.2s ease-out" }} />
                  </svg>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 11 }}>
              <span style={{ fontSize: 12, color: "var(--dim)" }}>Worker-hours (semana)</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{weekHoursUsed.toFixed(1)}h</span>
            </div>
          </div>

          {/* Log ao vivo */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Log ao vivo</span>
                <span className="apf-live" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 7 }}>
                {LOG_FILTERS.map(([k, l]) => (
                  <button key={k} onClick={() => setLogFilter(k)} style={logTabBtn(k === logFilter)}>{l}</button>
                ))}
              </div>
            </div>
            <div ref={logRef} style={{ fontFamily: "var(--mono)", fontSize: 11.5, lineHeight: 1.75, padding: "8px 0", maxHeight: 260, overflowY: "auto", background: "var(--bg)" }}>
              {filteredLogs.map((l, i) => {
                const [lv, lc] = logLevel(l.status);
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "1px 14px", alignItems: "baseline" }}>
                    <span style={{ color: "var(--mute)", flexShrink: 0 }}>{(l.when ?? "").slice(11, 19)}</span>
                    <span style={{ color: lc, flexShrink: 0, width: 38, fontWeight: 600, fontSize: 10.5 }}>{lv}</span>
                    <span style={{ color: "var(--dim)", flexShrink: 0 }}>{l.type}#{short((l.task_id ?? "").replace(/^tsk_/, ""), 4)}</span>
                    <span style={{ color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.log ?? l.status}</span>
                  </div>
                );
              })}
              {!filteredLogs.length && (
                <div style={{ color: "var(--mute)", padding: "4px 14px" }}>sem logs — aguardando eventos do pipeline…</div>
              )}
              <div style={{ padding: "4px 14px", color: "var(--green)" }}>
                apifor@pool ~$ <span className="apf-cursor" style={{ display: "inline-block", width: 7, height: 13, background: "var(--green)", verticalAlign: "text-bottom" }} />
              </div>
            </div>
          </div>

        </div>
      </div>
    </Page>
  );
}
