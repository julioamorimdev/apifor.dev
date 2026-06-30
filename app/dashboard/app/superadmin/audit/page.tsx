"use client";
import { useEffect, useState } from "react";
import { apiGet } from "../../ui";
import { AdminShell, PageHeadAdmin, adminCard } from "../shell";

type Audit = {
  id: string; action: string; target_type: string; target_id: string; occurred_at: string;
  org_id: string; org_name: string; actor_type: string; actor_id: string; actor_email: string;
};

function actionColor(action: string): string {
  if (action.startsWith("admin.")) return "var(--red)";
  if (action.includes("delete") || action.includes("suspend") || action.includes("fail")) return "var(--orange)";
  return "var(--accent)";
}

export default function AuditPage() {
  const [rows, setRows] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"admin" | "all">("admin");
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    apiGet<{ data: Audit[] }>(`/v1/admin/audit?limit=200${scope === "admin" ? "&scope=admin" : ""}`)
      .then((r) => setRows(r?.data || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);

  const filtered = rows.filter((r) =>
    !q || r.action.toLowerCase().includes(q.toLowerCase()) || (r.actor_email || "").toLowerCase().includes(q.toLowerCase()) || (r.org_name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <AdminShell loading={loading}>
      <PageHeadAdmin title="Auditoria" subtitle="Trilha de ações em todas as organizações — server-side." />

      <div style={adminCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 200 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ação, ator ou org…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
          </div>
          <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
            {(["admin", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)}
                style={{ padding: "4px 12px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: scope === s ? 600 : 500, cursor: "pointer", background: scope === s ? "var(--card)" : "transparent", color: scope === s ? "var(--ink)" : "var(--dim)" }}>
                {s === "admin" ? "Só admin" : "Tudo"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} evento(s)</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr 160px", fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>Ação</span><span>Org</span><span>Ator / Alvo</span><span style={{ textAlign: "right" }}>Quando</span>
        </div>

        {filtered.map((r) => (
          <div key={r.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr 160px", alignItems: "center", padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 600, color: actionColor(r.action), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.action}</span>
            <span style={{ fontSize: 12.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.org_name || "—"}</span>
            <span style={{ fontSize: 12, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.actor_email || r.actor_id || r.actor_type}
              {r.target_id && <span style={{ color: "var(--mute)" }}> → {r.target_type}:{r.target_id.slice(0, 18)}</span>}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)", textAlign: "right" }}>{r.occurred_at.replace("T", " ").replace("Z", "")}</span>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>Nenhum evento.</div>}
      </div>
    </AdminShell>
  );
}
