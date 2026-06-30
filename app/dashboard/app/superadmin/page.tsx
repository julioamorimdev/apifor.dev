"use client";
import { useEffect, useState } from "react";
import { apiGet } from "../ui";
import { AdminShell, PageHeadAdmin, StatCard, PlanPill, adminCard, fmtMoney } from "./shell";

type Stats = {
  total_orgs: number; total_users: number;
  plan_free: number; plan_pro: number; plan_team: number; plan_enterprise: number;
  total_tasks: number; total_workers: number;
};
type Org = { id: string; name: string; plan: string; owner_email: string; members: number; tasks: number; created_at: string; suspended: string };
type Plan = { plan: string; price_cents: number | null; currency: string; orgs: number; seats: number };
type Audit = { id: string; action: string; org_name: string; actor_email: string; target_type: string; target_id: string; occurred_at: string };

const PLAN_BAR: Record<string, string> = { free: "var(--mute)", pro: "var(--blue)", team: "var(--accent)", enterprise: "var(--green)" };

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<Stats>("/v1/admin/stats"),
      apiGet<{ data: Org[] }>("/v1/admin/orgs"),
      apiGet<{ data: Plan[] }>("/v1/admin/plans"),
      apiGet<{ data: Audit[] }>("/v1/admin/audit?scope=admin&limit=8"),
    ]).then(([s, o, p, a]) => {
      setStats(s); setOrgs(o?.data || []); setPlans(p?.data || []); setAudit(a?.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const suspended = orgs.filter((o) => o.suspended === "true").length;
  const mrr = plans.reduce((acc, p) => {
    if (!p.price_cents) return acc;
    if (p.plan === "team") return acc + p.price_cents * p.seats; // por assento
    if (p.plan === "pro") return acc + p.price_cents * p.orgs;   // por org
    return acc;
  }, 0);

  const planRows = stats ? [
    { k: "free", n: stats.plan_free }, { k: "pro", n: stats.plan_pro },
    { k: "team", n: stats.plan_team }, { k: "enterprise", n: stats.plan_enterprise },
  ] : [];
  const maxPlan = Math.max(1, ...planRows.map((r) => r.n));

  return (
    <AdminShell loading={loading}>
      <PageHeadAdmin title="Visão geral" subtitle="Saúde e composição da plataforma — todas as organizações." />

      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <StatCard label="Organizações" value={stats.total_orgs} sub={suspended ? `${suspended} suspensa(s)` : "todas ativas"} />
          <StatCard label="Usuários" value={stats.total_users} color="var(--blue)" />
          <StatCard label="MRR estimado" value={fmtMoney(mrr)} color="var(--green)" sub="pro + team (assentos)" />
          <StatCard label="Tarefas" value={stats.total_tasks} color="var(--orange)" />
          <StatCard label="Workers" value={stats.total_workers} color="var(--accent)" />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* distribuição de planos */}
        <div style={{ ...adminCard, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Distribuição por plano</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {planRows.map((r) => (
              <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 92 }}><PlanPill plan={r.k} /></div>
                <div style={{ flex: 1, height: 8, borderRadius: 6, background: "var(--elev)", overflow: "hidden" }}>
                  <div style={{ width: `${(r.n / maxPlan) * 100}%`, height: "100%", background: PLAN_BAR[r.k], transition: "width .4s" }} />
                </div>
                <div style={{ width: 28, textAlign: "right", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600 }}>{r.n}</div>
              </div>
            ))}
          </div>
          <a href="/superadmin/billing" style={{ display: "inline-block", marginTop: 16, fontSize: 12.5, color: "var(--blue)" }}>Ver assinaturas & planos →</a>
        </div>

        {/* atividade admin recente */}
        <div style={{ ...adminCard, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Ações administrativas recentes</div>
          {audit.length === 0 && <div style={{ fontSize: 13, color: "var(--mute)" }}>Nenhuma ação registrada.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {audit.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12.5 }}>
                <span style={{ fontFamily: "var(--mono)", color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap" }}>{a.action.replace("admin.", "")}</span>
                <span style={{ color: "var(--dim)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.org_name || a.target_id} · {a.actor_email}
                </span>
                <span style={{ color: "var(--mute)", whiteSpace: "nowrap" }}>{a.occurred_at.slice(0, 10)}</span>
              </div>
            ))}
          </div>
          <a href="/superadmin/audit" style={{ display: "inline-block", marginTop: 16, fontSize: 12.5, color: "var(--blue)" }}>Ver auditoria completa →</a>
        </div>
      </div>

      {/* organizações recentes */}
      <div style={{ ...adminCard, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Organizações recentes</div>
          <a href="/superadmin/orgs" style={{ fontSize: 12.5, color: "var(--blue)" }}>Ver todas →</a>
        </div>
        {orgs.slice(0, 6).map((o) => (
          <a key={o.id} href="/superadmin/orgs" style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 90px", alignItems: "center", gap: 0, padding: "11px 18px", borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: o.suspended === "true" ? "var(--mute)" : "var(--ink)" }}>{o.name}</div>
              <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>{o.owner_email}</div>
            </div>
            <div><PlanPill plan={o.plan} /></div>
            <span style={{ fontSize: 12.5, fontFamily: "var(--mono)", color: "var(--dim)" }}>{o.members} memb.</span>
            <span style={{ fontSize: 12, color: "var(--dim)", textAlign: "right" }}>{o.created_at}</span>
          </a>
        ))}
        {orgs.length === 0 && <div style={{ padding: "24px 18px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>Nenhuma organização.</div>}
      </div>
    </AdminShell>
  );
}
