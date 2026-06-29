"use client";
import { useEffect, useState } from "react";
import { badge, Page, PageHead, short, usePoll } from "../ui";

type CI = {
  id: string; provider: string; status: string;
  task_id: string; branch: string; repo_id: string; finished_at: string;
};

const PAGE_SIZE = 20;

const STATE_OPTS: [string, string][] = [
  ["todos", "Todos"], ["verde", "Verde"], ["falhou", "Falhou"], ["rodando", "Rodando"],
];

function matchState(f: string, s: string) {
  if (f === "todos")   return true;
  if (f === "verde")   return s === "passed";
  if (f === "falhou")  return s === "failed";
  if (f === "rodando") return s === "running";
  return true;
}

function ciColor(s: string) {
  if (s === "passed")  return "var(--green)";
  if (s === "failed")  return "var(--red)";
  if (s === "running") return "var(--blue)";
  return "var(--mute)";
}

function age(iso: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  return `${Math.floor(h / 24)}d`;
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
    <button onClick={onClick} disabled={disabled} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

export default function CITela() {
  const { data: runs } = usePoll<CI[]>("/v1/ci", 2500);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (runs !== undefined) setLoading(false); }, [runs]);
  const list = runs || [];

  const [q, setQ]       = useState("");
  const [state, setState] = useState("todos");
  const [conn, setConn] = useState("todas");
  const [page, setPage] = useState(0);

  const passed  = list.filter((c) => c.status === "passed").length;
  const failed  = list.filter((c) => c.status === "failed").length;
  const running = list.filter((c) => c.status === "running").length;
  const done    = passed + failed;
  const pct     = done ? (100 * passed / done).toFixed(1) : "—";

  const providers = [...new Set(list.map((c) => c.provider).filter(Boolean))];

  const filtered = list
    .filter((c) => matchState(state, c.status))
    .filter((c) => conn === "todas" || c.provider === conn)
    .filter((c) => q === "" || (c.task_id + c.branch + c.repo_id + c.provider).toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const pageLabel  = totalPages > 1 ? `${safePage + 1} / ${totalPages}` : "";

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="CI"
        subtitle="Integração contínua — execuções de build/teste e status por PR." />

      {/* stat cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        {([
          ["CI verde (24h)", typeof pct === "string" ? pct + "%" : pct + "%", "var(--green)"],
          ["Execuções", String(list.length),                                   "var(--ink)"],
          ["Falhas",    String(failed),                                         "var(--red)"],
          ["Rodando",   String(running),                                        "var(--blue)"],
        ] as [string, string, string][]).map(([label, value, color]) => (
          <div key={label} style={{ flex: "1 1 170px", minWidth: 150, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 5 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.transform = ""; }}>
            <span style={{ fontSize: 11, color: "var(--mute)", fontWeight: 500 }}>{label}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* main card */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" }}>

        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          {/* search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 150 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Buscar execução…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
          </div>

          {/* connection select */}
          <select value={conn} onChange={(e) => { setConn(e.target.value); setPage(0); }}
            style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12, cursor: "pointer" }}>
            <option value="todas">Todas as conexões</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            {!providers.length && <>
              <option>GitHub Actions</option>
              <option>SonarCloud</option>
              <option>CircleCI</option>
            </>}
          </select>

          {/* state pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "wrap" }}>
            {STATE_OPTS.map(([k, label]) => (
              <button key={k} onClick={() => { setState(k); setPage(0); }} style={pillStyle(state === k)}>{label}</button>
            ))}
          </div>
        </div>

        {/* col headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>Pull request</span>
          <span style={{ padding: "0 12px" }}>CI remoto</span>
          <span style={{ padding: "0 12px" }}>CI</span>
          <span style={{ padding: "0 12px" }}>Estado</span>
          <span style={{ textAlign: "right", width: 48 }}>Idade</span>
        </div>

        {/* rows */}
        {rows.map((c) => {
          const col     = ciColor(c.status);
          const isRun   = c.status === "running";
          const bstat   = c.status === "passed" ? "merged" : c.status === "failed" ? "failed" : "queued";
          return (
            <div key={c.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>

              {/* col 1: task num + branch + repo */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>
                    #{short(c.task_id.replace(/^tsk_/, ""), 6)}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.branch || c.task_id}
                  </span>
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>
                  {c.repo_id ? short(c.repo_id, 28) : "—"}
                </span>
              </div>

              {/* col 2: CI remoto / provider */}
              <span style={{ fontSize: 11.5, color: "var(--dim)", padding: "0 12px", whiteSpace: "nowrap" }}>
                {c.provider || "—"}
              </span>

              {/* col 3: CI dot */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", fontFamily: "var(--mono)", fontSize: 11, color: col }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, ...(isRun ? { animation: "livedot 1s ease-in-out infinite" } : {}) }} />
                CI
              </span>

              {/* col 4: state */}
              <span style={{ padding: "0 12px" }}>
                <span style={badge(bstat)}>{c.status}</span>
              </span>

              {/* col 5: age */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", textAlign: "right", width: 48 }}>
                {age(c.finished_at)}
              </span>
            </div>
          );
        })}

        {!rows.length && (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>
            nenhuma execução de CI
          </div>
        )}

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} execuções</span>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: "var(--dim)" }}>{pageLabel}</span>
              <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </NavBtn>
              <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </NavBtn>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
