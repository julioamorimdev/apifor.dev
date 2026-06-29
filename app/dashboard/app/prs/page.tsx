"use client";
import { useEffect, useState } from "react";
import { badge, card, codeAmber, Page, PageHead, Pills, short, usePoll } from "../ui";

type PR = {
  id: string; task_id: string; repo_id: string; branch: string; url: string;
  status: string; ci_status: string; ai_review_status: string;
  human_review_status: string; created_at: string;
};

const PAGE_SIZE = 20;

const TABS: [string, string][] = [
  ["todos",   "Todos"],
  ["revisao", "Em revisão"],
  ["ci",      "CI falhou"],
];

function matchTab(tab: string, p: PR) {
  if (tab === "todos")   return true;
  if (tab === "revisao") return p.status !== "merged" && p.status !== "failed";
  if (tab === "ci")      return p.ci_status === "failed";
  return true;
}

function ciColor(s: string) {
  if (s === "passed")  return "var(--green)";
  if (s === "failed")  return "var(--red)";
  if (s === "running") return "var(--blue)";
  return "var(--mute)";
}

function reviewPill(ai: string, human: string) {
  const s = human || ai;
  if (s === "approved") return { bg: "var(--green-tint)", color: "var(--green)", label: "aprovado" };
  if (s === "changes")  return { bg: "var(--red-tint)",   color: "var(--red)",   label: "mudanças" };
  if (s === "pending")  return { bg: "var(--orange-tint)",color: "var(--orange)",label: "pendente" };
  return { bg: "var(--border)", color: "var(--mute)", label: s || "—" };
}

function age(iso: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)   return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const selStyle: React.CSSProperties = {
  height: 32, padding: "0 9px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", fontSize: 11.5, cursor: "pointer",
};

export default function PRs() {
  const { data: prs } = usePoll<PR[]>("/v1/prs", 2500);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (prs !== undefined) setLoading(false); }, [prs]);
  const list = prs || [];

  const [q, setQ]       = useState("");
  const [tab, setTab]   = useState("todos");
  const [source, setSource] = useState("todas");
  const [page, setPage] = useState(0);

  const filtered = list
    .filter((p) => matchTab(tab, p))
    .filter((p) => q === "" || (p.branch + p.task_id + p.repo_id).toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const pageLabel  = totalPages > 1 ? `${safePage + 1} / ${totalPages}` : "";

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="Pull Requests" subtitle="Status de revisão e CI, com links para o Bitbucket / GitHub." />

      <div style={card}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flex: 1, flexWrap: "wrap", minWidth: 160 }}>
            {/* search */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, height: 32, padding: "0 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 130, maxWidth: 260 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
              </svg>
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(0); }}
                placeholder="Buscar PR…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", fontSize: 12 }}
              />
            </div>
            {/* source */}
            <select value={source} onChange={(e) => setSource(e.target.value)} style={selStyle}>
              <option value="todas">Todas as fontes</option>
              <option>Jira</option>
              <option>Linear</option>
              <option>GitHub Issues</option>
              <option>Trello</option>
            </select>
          </div>
          {/* tabs */}
          <Pills options={TABS} value={tab} onChange={(v) => { setTab(v); setPage(0); }} />
        </div>

        {/* col headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>Pull request</span>
          <span style={{ padding: "0 14px" }}>Revisão</span>
          <span style={{ padding: "0 14px" }}>Estado</span>
          <span style={{ textAlign: "right", width: 64 }}>Idade</span>
        </div>

        {/* rows */}
        {rows.map((p) => {
          const rev  = reviewPill(p.ai_review_status, p.human_review_status);
          const ciC  = ciColor(p.ci_status);
          const isRunning = p.ci_status === "running";

          return (
            <div
              key={p.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elev)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {/* col 1: PR id + branch, repo + task */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={codeAmber}>{short(p.id.replace(/^pr_/, ""), 6)}</span>
                  <span style={{ fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.branch || p.task_id}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>
                  {p.repo_id && <span>{short(p.repo_id, 20)}</span>}
                  {p.repo_id && p.task_id && <span style={{ color: "var(--border)" }}>·</span>}
                  {p.task_id && <span>{short(p.task_id.replace(/^tsk_/, "#"), 10)}</span>}
                </div>
              </div>

              {/* col 2: revisão — CI dot + review pill */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontFamily: "var(--mono)", color: ciC }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", background: ciC,
                    ...(isRunning ? { animation: "livedot 1s ease-in-out infinite" } : {}),
                  }} />
                  CI
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: rev.bg, color: rev.color }}>
                  {rev.label}
                </span>
              </div>

              {/* col 3: estado */}
              <div style={{ padding: "0 14px" }}>
                <span style={badge(p.status)}>{p.status}</span>
              </div>

              {/* col 4: idade + link */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, width: 64 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)" }}>{age(p.created_at)}</span>
                {p.url?.startsWith("http") && (
                  <a href={p.url} target="_blank" rel="noreferrer" style={{ display: "flex", color: "var(--mute)", transition: "color .12s" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--mute)")}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {/* empty state */}
        {!rows.length && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "30px 16px", textAlign: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>
            </svg>
            <span style={{ fontSize: 12.5, color: "var(--dim)" }}>Nenhum PR neste filtro — tudo fluindo.</span>
          </div>
        )}

        {/* footer / pagination */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mute)" }}>{filtered.length} pull requests</span>
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

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)",
      background: "transparent", color: disabled ? "var(--border)" : "var(--dim)",
      cursor: disabled ? "default" : "pointer",
    }}>
      {children}
    </button>
  );
}
