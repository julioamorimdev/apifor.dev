"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../ui";
import { AdminShell, PageHeadAdmin, StatusPill, adminCard, getEmail } from "../shell";

type User = { id: string; email: string; name: string; status: string; created_at: string; org_id: string; role: string };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [busy, setBusy] = useState<string>("");
  const myEmail = getEmail();

  const load = () => apiGet<{ data: User[] }>("/v1/admin/users").then((r) => setUsers(r?.data || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function toggle(u: User) {
    const action = u.status === "suspended" ? "activate" : "suspend";
    setBusy(u.id);
    try { await apiPost(`/v1/admin/users/${u.id}/${action}`, {}); await load(); } finally { setBusy(""); }
  }

  const filtered = users
    .filter((u) => statusFilter === "all" || u.status === statusFilter)
    .filter((u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || (u.name || "").toLowerCase().includes(q.toLowerCase()));

  const active = users.filter((u) => u.status === "active").length;
  const suspended = users.length - active;

  return (
    <AdminShell loading={loading}>
      <PageHeadAdmin title="Usuários" subtitle={`${users.length} usuário(s) · ${active} ativo(s) · ${suspended} suspenso(s).`} />

      <div style={adminCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 200 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por email ou nome…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
          </div>
          <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
            {(["all", "active", "suspended"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: statusFilter === s ? 600 : 500, cursor: "pointer", background: statusFilter === s ? "var(--card)" : "transparent", color: statusFilter === s ? "var(--ink)" : "var(--dim)" }}>
                {s === "all" ? "Todos" : s === "active" ? "Ativos" : "Suspensos"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} usuário(s)</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 80px 100px 80px 96px", fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>Usuário</span><span>Org</span><span>Papel</span><span>Status</span><span>Criado</span><span style={{ textAlign: "right" }}>Ações</span>
        </div>

        {filtered.map((u) => {
          const isSelf = !!myEmail && u.email.toLowerCase() === myEmail.toLowerCase();
          return (
            <div key={u.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px 80px 100px 80px 96px", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: u.status === "suspended" ? "var(--mute)" : "var(--ink)" }}>
                  {u.name || u.email.split("@")[0]}{isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--blue)", fontWeight: 700 }}>VOCÊ</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>{u.email}</div>
              </div>
              <span style={{ fontSize: 11, color: "var(--dim)", fontFamily: "var(--mono)" }}>{u.org_id ? u.org_id.slice(0, 14) : "—"}</span>
              <span style={{ fontSize: 12, color: "var(--dim)" }}>{u.role || "—"}</span>
              <StatusPill ok={u.status === "active"} on="ativo" off="suspenso" />
              <span style={{ fontSize: 12, color: "var(--dim)" }}>{u.created_at}</span>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => toggle(u)} disabled={isSelf || busy === u.id}
                  title={isSelf ? "Não é possível alterar o próprio status" : ""}
                  style={{ height: 28, padding: "0 10px", borderRadius: 6, border: `1px solid ${u.status === "suspended" ? "var(--green)" : "rgba(248,81,73,.4)"}`, background: u.status === "suspended" ? "var(--green-tint)" : "var(--red-tint)", color: u.status === "suspended" ? "var(--green)" : "var(--red)", fontSize: 11.5, fontWeight: 600, cursor: isSelf ? "not-allowed" : "pointer", opacity: isSelf ? .4 : (busy === u.id ? .6 : 1) }}>
                  {busy === u.id ? "…" : u.status === "suspended" ? "Ativar" : "Suspender"}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>Nenhum usuário encontrado.</div>}
      </div>
    </AdminShell>
  );
}
