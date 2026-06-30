"use client";
import { useEffect, useState } from "react";
import { apiGet, apiPost, btn, input, Modal } from "../../ui";
import { AdminShell, PageHeadAdmin, PlanPill, StatusPill, adminCard } from "../shell";

type Org = { id: string; name: string; plan: string; owner_email: string; members: number; workers: number; tasks: number; created_at: string; suspended: string };
type Member = { id: string; email: string; name: string; status: string; role: string; membership: string };
type Task = { id: string; title: string; status: string; created_at: string };
type Detail = { org: Org; members: Member[]; tasks: Task[] };

const PLANS = ["free", "pro", "team", "enterprise"] as const;

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("all");

  const [planModal, setPlanModal] = useState<Org | null>(null);
  const [newPlan, setNewPlan] = useState("free");
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = () => apiGet<{ data: Org[] }>("/v1/admin/orgs").then((r) => setOrgs(r?.data || [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function openDetail(o: Org) {
    setDetail({ org: o, members: [], tasks: [] }); setDetailLoading(true);
    try { const d = await apiGet<Detail>(`/v1/admin/orgs/${o.id}`); setDetail(d); } finally { setDetailLoading(false); }
  }
  async function changePlan() {
    if (!planModal) return;
    setSaving(true);
    try { await apiPost(`/v1/admin/orgs/${planModal.id}/plan`, { plan: newPlan }); setPlanModal(null); load(); } finally { setSaving(false); }
  }
  async function toggleSuspend(o: Org) {
    const action = o.suspended === "true" ? "unsuspend" : "suspend";
    await apiPost(`/v1/admin/orgs/${o.id}/${action}`, {});
    load();
    if (detail?.org.id === o.id) openDetail({ ...o, suspended: o.suspended === "true" ? "false" : "true" });
  }

  const filtered = orgs
    .filter((o) => planFilter === "all" || o.plan === planFilter)
    .filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.owner_email.toLowerCase().includes(q.toLowerCase()) || o.id.includes(q));

  return (
    <AdminShell loading={loading}>
      <PageHeadAdmin title="Organizações" subtitle={`${orgs.length} organização(ões) na plataforma.`} />

      <div style={adminCard}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 200 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, email ou ID…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
          </div>
          <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8 }}>
            {(["all", ...PLANS] as const).map((p) => (
              <button key={p} onClick={() => setPlanFilter(p)}
                style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: planFilter === p ? 600 : 500, cursor: "pointer", background: planFilter === p ? "var(--card)" : "transparent", color: planFilter === p ? "var(--ink)" : "var(--dim)" }}>
                {p === "all" ? "Todos" : p}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} org(s)</span>
        </div>

        {/* header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px 60px 60px 90px 96px", fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)", padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>Organização</span><span>Plano</span><span>Membros</span><span>Workers</span><span>Tasks</span><span>Estado</span><span style={{ textAlign: "right" }}>Ações</span>
        </div>

        {filtered.map((o) => (
          <div key={o.id} className="apf-navitem" style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px 60px 60px 90px 96px", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
            onClick={() => openDetail(o)}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: o.suspended === "true" ? "var(--mute)" : "var(--ink)" }}>{o.name}</div>
              <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>{o.owner_email} · {o.id.slice(0, 16)}</div>
            </div>
            <div><PlanPill plan={o.plan} /></div>
            <span style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{o.members}</span>
            <span style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{o.workers}</span>
            <span style={{ fontSize: 13, fontFamily: "var(--mono)" }}>{o.tasks}</span>
            <StatusPill ok={o.suspended !== "true"} on="ativo" off="suspenso" />
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setPlanModal(o); setNewPlan(o.plan); }}
                style={{ height: 28, padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Plano</button>
              <button onClick={() => toggleSuspend(o)}
                style={{ height: 28, padding: "0 10px", borderRadius: 6, border: `1px solid ${o.suspended === "true" ? "var(--green)" : "rgba(248,81,73,.4)"}`, background: o.suspended === "true" ? "var(--green-tint)" : "var(--red-tint)", color: o.suspended === "true" ? "var(--green)" : "var(--red)", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                {o.suspended === "true" ? "Ativar" : "Suspender"}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>Nenhuma organização encontrada.</div>}
      </div>

      {/* modal plano */}
      {planModal && (
        <Modal title={`Alterar plano — ${planModal.name}`} onClose={() => setPlanModal(null)} width={420}
          footer={<>
            <button onClick={() => setPlanModal(null)} style={{ height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={changePlan} disabled={saving} style={{ ...btn, opacity: saving ? .6 : 1 }}>{saving ? "Salvando…" : "Salvar"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: "var(--dim)" }}>Plano atual: <PlanPill plan={planModal.plan} /></div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11.5, color: "var(--dim)" }}>Novo plano</span>
              <select value={newPlan} onChange={(e) => setNewPlan(e.target.value)} style={{ ...input, height: 40, fontFamily: "inherit", fontSize: 13 } as React.CSSProperties}>
                {PLANS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </label>
          </div>
        </Modal>
      )}

      {/* modal detalhe */}
      {detail && (
        <Modal title={detail.org.name} onClose={() => setDetail(null)} width={620}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
            <DetailStat label="Plano" value={<PlanPill plan={detail.org.plan} />} />
            <DetailStat label="Estado" value={<StatusPill ok={detail.org.suspended !== "true"} on="ativo" off="suspenso" />} />
            <DetailStat label="Membros" value={detail.org.members} />
            <DetailStat label="Workers" value={detail.org.workers} />
            <DetailStat label="Tasks" value={detail.org.tasks} />
            <DetailStat label="Criada" value={detail.org.created_at} />
          </div>
          <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)", marginBottom: 18 }}>{detail.org.id}</div>

          <SectionTitle>Membros</SectionTitle>
          {detailLoading && <div style={{ fontSize: 12.5, color: "var(--mute)", padding: "6px 0" }}>Carregando…</div>}
          {detail.members.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name || m.email.split("@")[0]}</div>
                <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)" }}>{m.email}</div>
              </div>
              <span style={{ fontSize: 12, color: "var(--dim)" }}>{m.role}</span>
              <StatusPill ok={m.status === "active"} on="ativo" off="suspenso" />
            </div>
          ))}
          {!detailLoading && detail.members.length === 0 && <div style={{ fontSize: 12.5, color: "var(--mute)", padding: "6px 0" }}>Sem membros.</div>}

          <SectionTitle style={{ marginTop: 18 }}>Tarefas recentes</SectionTitle>
          {(detail.tasks || []).slice(0, 8).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || t.id}</span>
              <span style={{ fontSize: 11.5, color: "var(--dim)", fontFamily: "var(--mono)" }}>{t.status}</span>
            </div>
          ))}
          {!detailLoading && (!detail.tasks || detail.tasks.length === 0) && <div style={{ fontSize: 12.5, color: "var(--mute)", padding: "6px 0" }}>Nenhuma tarefa.</div>}
        </Modal>
      )}
    </AdminShell>
  );
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ flex: "1 1 90px", minWidth: 80, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--mute)", marginBottom: 6, ...style }}>{children}</div>;
}
