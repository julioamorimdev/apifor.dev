"use client";
import { useEffect, useState } from "react";
import { badge, Page, PageHead, short, usePoll } from "../ui";

type QA = {
  id: string; task_id: string; status: string;
  tests_total: number; tests_passed: number;
  coverage: number; duration_ms: number;
  repo_id: string; branch: string; created_at: string;
};

const PAGE_SIZE = 20;

const STATE_OPTS: [string, string][] = [
  ["todos", "Todos"], ["pass", "Aprovado"], ["fail", "Falhou"], ["flaky", "Flaky"],
];

function matchState(f: string, s: string) {
  if (f === "todos") return true;
  if (f === "pass")  return s === "passed";
  if (f === "fail")  return s === "failed";
  if (f === "flaky") return s === "flaky";
  return true;
}

function fmtDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${m}m${ss}s`;
}

function fmtCov(n: number) {
  if (!n && n !== 0) return "—";
  return `${Number(n).toFixed(1)}%`;
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 11px", borderRadius: 6, border: "none", fontSize: 12.5,
  fontWeight: active ? 600 : 500, cursor: "pointer",
  background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
});

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

export default function QATela() {
  const { data: reports } = usePoll<QA[]>("/v1/qa", 2500);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (reports !== undefined) setLoading(false); }, [reports]);
  const list = reports || [];

  const [q, setQ]       = useState("");
  const [state, setState] = useState("todos");
  const [repo, setRepo]   = useState("todos");
  const [page, setPage]   = useState(0);

  // KPI computations
  const tot     = list.reduce((a, x) => a + (x.tests_total  || 0), 0);
  const ok      = list.reduce((a, x) => a + (x.tests_passed || 0), 0);
  const passRate = tot ? (100 * ok / tot).toFixed(1) + "%" : "—";
  const covVals  = list.filter((x) => x.coverage > 0).map((x) => x.coverage);
  const avgCov   = covVals.length ? (covVals.reduce((a, b) => a + b, 0) / covVals.length).toFixed(1) + "%" : "—";
  const failCount = list.filter((x) => x.status === "failed").length;

  const repos = [...new Set(list.map((x) => x.repo_id).filter(Boolean))];

  const filtered = list
    .filter((x) => matchState(state, x.status))
    .filter((x) => repo === "todos" || x.repo_id === repo)
    .filter((x) => q === "" || (x.task_id + x.branch + x.repo_id).toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const pageLabel  = `${filtered.length} execuções`;

  const KPIS: [string, string, string][] = [
    ["Taxa de aprovação", passRate, "var(--green)"],
    ["Cobertura média",   avgCov,   "var(--ink)"],
    ["Falhas",           String(failCount), "var(--red)"],
    ["Total de testes",  String(tot),       "var(--ink)"],
  ];

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="QA"
        subtitle="Qualidade do código gerado — testes, cobertura e revisões da IA." />

      {/* KPI cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {KPIS.map(([label, value, color]) => (
          <div key={label} style={{ flex: "1 1 200px", minWidth: 180, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 15px", display: "flex", flexDirection: "column", gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--mute)" }}>{label}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, color, letterSpacing: "-.02em" }}>{value}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--mute)" }}>— <span style={{ fontWeight: 400 }}>vs ontem</span></span>
          </div>
        ))}
      </div>

      {/* main card */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
          Execuções recentes de QA
        </div>

        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          {/* search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 150 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Buscar por tarefa, PR ou repo…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
          </div>

          {/* repo select */}
          <select value={repo} onChange={(e) => { setRepo(e.target.value); setPage(0); }}
            style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12, cursor: "pointer" }}>
            <option value="todos">Todos os repos</option>
            {repos.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          {/* state pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "wrap" }}>
            {STATE_OPTS.map(([k, label]) => (
              <button key={k} onClick={() => { setState(k); setPage(0); }} style={pillStyle(state === k)}>{label}</button>
            ))}
          </div>
        </div>

        {/* col headers — 7 cols */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto auto", gap: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>PR / Tarefa</span>
          <span style={{ padding: "0 12px" }}>Repositório</span>
          <span style={{ padding: "0 12px" }}>Testes</span>
          <span style={{ padding: "0 12px" }}>Cobertura</span>
          <span style={{ padding: "0 12px" }}>Status</span>
          <span style={{ textAlign: "right" }}>Tempo</span>
          <span style={{ width: 96, textAlign: "right" }}>Detalhes</span>
        </div>

        {/* rows */}
        {rows.map((x) => {
          const bstat = x.status === "passed" ? "merged" : x.status === "failed" ? "failed" : "queued";
          return (
            <div key={x.id}
              style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>

              {/* col 1: PR + task */}
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                  {x.branch ? short(x.branch, 18) : `#${short(x.task_id.replace(/^tsk_/, ""), 6)}`}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>
                  #{short(x.task_id.replace(/^tsk_/, ""), 6)}
                </span>
              </div>

              {/* col 2: repo */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)", padding: "0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {x.repo_id ? short(x.repo_id, 24) : "—"}
              </span>

              {/* col 3: tests */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", padding: "0 12px" }}>
                {x.tests_passed}/{x.tests_total}
              </span>

              {/* col 4: coverage */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", padding: "0 12px" }}>
                {fmtCov(x.coverage)}
              </span>

              {/* col 5: status */}
              <span style={{ padding: "0 12px" }}>
                <span style={badge(bstat)}>{x.status}</span>
              </span>

              {/* col 6: time */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textAlign: "right" }}>
                {fmtDuration(x.duration_ms)}
              </span>

              {/* col 7: details button */}
              <span style={{ display: "flex", justifyContent: "flex-end", width: 96 }}>
                <button style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}
                  onMouseEnter={(e) => { const b = e.currentTarget; b.style.color = "var(--accent)"; b.style.borderColor = "var(--accent)"; b.style.background = "var(--elev)"; }}
                  onMouseLeave={(e) => { const b = e.currentTarget; b.style.color = "var(--dim)"; b.style.borderColor = "var(--border)"; b.style.background = "transparent"; }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                  </svg>
                  Ver
                </button>
              </span>
            </div>
          );
        })}

        {!rows.length && (
          <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 12.5, color: "var(--mute)" }}>
            Nenhuma execução encontrada.
          </div>
        )}

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{pageLabel}</span>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </NavBtn>
              <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </NavBtn>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
