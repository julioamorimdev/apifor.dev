"use client";
import { useEffect, useState } from "react";
import { apiGet } from "../../ui";
import { AdminShell, PageHeadAdmin, StatCard, PlanPill, adminCard, fmtMoney } from "../shell";

type Plan = {
  plan: string; price_cents: number | null; currency: string;
  max_workers: number | null; weekly_worker_hours: number | null; max_members: number | null;
  orgs: number; seats: number;
};

function mrrFor(p: Plan): number {
  if (!p.price_cents) return 0;
  if (p.plan === "team") return p.price_cents * p.seats; // por assento
  if (p.plan === "pro") return p.price_cents * p.orgs;   // por org
  return 0;
}
const lim = (v: number | null, suffix = "") => (v == null ? "ilimitado" : `${v}${suffix}`);
const priceLabel = (p: Plan) => {
  if (p.plan === "enterprise") return "sob consulta";
  if (!p.price_cents) return "grátis";
  return fmtMoney(p.price_cents, p.currency) + (p.plan === "team" ? " / assento" : " / mês");
};

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ data: Plan[] }>("/v1/admin/plans").then((r) => setPlans(r?.data || [])).finally(() => setLoading(false));
  }, []);

  const mrr = plans.reduce((a, p) => a + mrrFor(p), 0);
  const paidOrgs = plans.filter((p) => p.plan !== "free" && p.price_cents).reduce((a, p) => a + p.orgs, 0);
  const totalOrgs = plans.reduce((a, p) => a + p.orgs, 0);
  const arpu = totalOrgs ? mrr / totalOrgs : 0;

  return (
    <AdminShell loading={loading}>
      <PageHeadAdmin title="Assinaturas & Planos" subtitle="Receita estimada e catálogo de planos da plataforma." />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        <StatCard label="MRR estimado" value={fmtMoney(mrr)} color="var(--green)" sub="pro (org) + team (assentos)" />
        <StatCard label="ARR estimado" value={fmtMoney(mrr * 12)} color="var(--green)" />
        <StatCard label="Orgs pagantes" value={paidOrgs} color="var(--blue)" sub={`de ${totalOrgs} no total`} />
        <StatCard label="ARPU" value={fmtMoney(Math.round(arpu))} sub="receita média por org" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
        {plans.map((p) => (
          <div key={p.plan} style={{ ...adminCard, padding: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <PlanPill plan={p.plan} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{priceLabel(p)}</span>
            </div>
            <div style={{ padding: "16px 18px", display: "flex", gap: 18 }}>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700 }}>{p.orgs}</div>
                <div style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".05em" }}>orgs</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 700, color: "var(--green)" }}>{fmtMoney(mrrFor(p))}</div>
                <div style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".05em" }}>MRR</div>
              </div>
            </div>
            <div style={{ padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: 7, fontSize: 12.5, color: "var(--dim)" }}>
              <Row label="Assentos ativos" value={String(p.seats)} />
              <Row label="Max workers" value={lim(p.max_workers)} />
              <Row label="Worker-hours/sem" value={lim(p.weekly_worker_hours, "h")} />
              <Row label="Max membros" value={lim(p.max_members)} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 11.5, color: "var(--mute)" }}>
        MRR estimado a partir do catálogo de planos × orgs/assentos ativos. Enterprise não entra no cálculo (preço sob consulta).
      </div>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
      <span>{label}</span><span style={{ color: "var(--ink)", fontWeight: 500, fontFamily: "var(--mono)" }}>{value}</span>
    </div>
  );
}
