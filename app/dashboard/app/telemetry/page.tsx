"use client";
import { useEffect, useState } from "react";
import { apiGet, Page, PageHead, Sparkline, useSeries } from "../ui";

type Tel = {
  tasks_total: number; tasks_merged: number; tasks_failed: number; tasks_active: number;
  tokens_used: number; pull_requests: number; week_worker_seconds: number;
};

function fmtH(s: number) { return s >= 3600 ? (s / 3600).toFixed(1) + "h" : Math.round(s) + "s"; }
function fmtTok(n: number) { return n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n); }

const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", overflow: "hidden",
};

function Bar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 7, borderRadius: 6, background: "var(--bg)", overflow: "hidden", border: "1px solid var(--border)" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 6, transition: "width .4s ease", animation: "barflow 2.5s ease infinite" }} />
    </div>
  );
}

function CardHead({ title }: { title: string }) {
  return (
    <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
      {title}
    </div>
  );
}

function KpiCard({ label, value, unit, sub, series, color = "--accent" }: { label: string; value: string; unit?: string; sub: string; series: number[]; color?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "13px 14px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.02em" }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 500 }}>{unit}</span>}
      </div>
      <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{sub}</span>
      {series.length > 1 && <Sparkline data={series} color={color} w={110} h={26} />}
    </div>
  );
}

export default function Telemetria() {
  const [t, setT] = useState<Tel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => apiGet<Tel>("/v1/telemetry").then((r) => { if (!(r as unknown as {error: unknown})?.error) setT(r); }).catch(() => {});
    load();
    const i = setInterval(load, 3000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { if (t !== null) setLoading(false); }, [t]);

  const sTot  = useSeries(t?.tasks_total          ?? 0);
  const sMer  = useSeries(t?.tasks_merged         ?? 0);
  const sFail = useSeries(t?.tasks_failed         ?? 0);
  const sAct  = useSeries(t?.tasks_active         ?? 0);
  const sPr   = useSeries(t?.pull_requests        ?? 0);
  const sTok  = useSeries(t?.tokens_used          ?? 0);

  const tot    = t?.tasks_total          ?? 0;
  const merged = t?.tasks_merged         ?? 0;
  const failed = t?.tasks_failed         ?? 0;
  const active = t?.tasks_active         ?? 0;
  const prs    = t?.pull_requests        ?? 0;
  const tokens = t?.tokens_used          ?? 0;
  const wsec   = t?.week_worker_seconds  ?? 0;
  const passRate = tot ? Math.round(100 * merged / tot) : 0;

  // sys meters: derived from telemetry proxies
  const sysMeters = [
    { label: "Workers ativos",    val: String(active),        pctLabel: `${active} em uso`,       pct: Math.min(100, active * 20),  color: "var(--blue)"   },
    { label: "Tarefas concluídas",val: String(merged),        pctLabel: `${passRate}% taxa`,       pct: passRate,                    color: "var(--green)"  },
    { label: "Tarefas com falha", val: String(failed),        pctLabel: tot ? `${Math.round(100*failed/tot)}%` : "—", pct: tot ? Math.round(100*failed/tot) : 0, color: "var(--red)" },
    { label: "Pull requests",     val: String(prs),           pctLabel: `${prs} abertos`,          pct: Math.min(100, prs * 5),      color: "var(--orange)" },
  ];

  // pipeline 6-stat grid
  const pipeStats = [
    { label: "Total tarefas", value: String(tot),          color: "var(--mute)"  },
    { label: "Merged",        value: String(merged),       color: "var(--green)" },
    { label: "Falhas",        value: String(failed),       color: "var(--red)"   },
    { label: "Ativas",        value: String(active),       color: "var(--blue)"  },
    { label: "PRs",           value: String(prs),          color: "var(--orange)"},
    { label: "Worker-hours",  value: fmtH(wsec),           color: "var(--accent)"},
  ];

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Operação" title="Telemetria"
        subtitle="Custo, throughput, taxa de aprovação, tempo médio e tokens." />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Row 1: Recursos do sistema + Pipeline */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>

        {/* Recursos do sistema */}
        <div style={{ ...sCard, flex: "1.2 1 320px", minWidth: 280 }}>
          <CardHead title="Recursos do sistema" />
          <div style={{ padding: "6px 16px 12px" }}>
            {sysMeters.map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: 500 }}>{s.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{s.val} · {s.pctLabel}</span>
                </div>
                <Bar pct={s.pct} color={s.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline */}
        <div style={{ ...sCard, flex: "1 1 300px", minWidth: 260 }}>
          <CardHead title="Pipeline" />
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }}>
            {pipeStats.map((p) => (
              <div key={p.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--mute)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                  {p.label}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 19, fontWeight: 600, color: "var(--ink)" }}>{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Consumo por worker */}
      <div style={sCard}>
        <CardHead title="Consumo por worker" />
        <div style={{ padding: active === 0 ? "0 16px" : "6px 16px 12px" }}>
          {active === 0 ? (
            <div style={{ padding: "10px 0", fontSize: 12, color: "var(--mute)" }}>nenhum worker ativo</div>
          ) : (
            Array.from({ length: Math.min(active, 6) }).map((_, i) => {
              const pct = Math.max(10, 100 - i * 14);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 600, color: "var(--ink)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                    w-{String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1, minWidth: 80, height: 6, borderRadius: 4, background: "var(--bg)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)", flexShrink: 0, width: 54, textAlign: "right" }}>—</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink)", flexShrink: 0, width: 64, textAlign: "right" }}>$—</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* KPI cards — grid keeps all 6 equal width, no stray last-row expansion */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
        <KpiCard label="Tarefas"       value={String(tot)}    sub="total"              series={sTot}  color="--accent" />
        <KpiCard label="Merged"        value={String(merged)} sub="concluídas"         series={sMer}  color="--green" />
        <KpiCard label="Falhas"        value={String(failed)} sub="gate vermelho"      series={sFail} color="--red" />
        <KpiCard label="Ativas"        value={String(active)} sub="em andamento"       series={sAct}  color="--blue" />
        <KpiCard label="Pull Requests" value={String(prs)}    sub="abertos + merged"   series={sPr}   color="--orange" />
        <KpiCard label="Tokens"        value={fmtTok(tokens)} sub="relay/coder/review" series={sTok}  color="--accent" />
      </div>

      {/* Row 2: Consumo por modelo + mini cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* Consumo por modelo */}
        <div style={{ ...sCard, flex: "1.4 1 420px", minWidth: 300 }}>
          <CardHead title="Consumo por modelo" />
          <div style={{ padding: "6px 16px 12px" }}>
            <div style={{ padding: "16px 0", fontSize: 12.5, color: "var(--mute)", textAlign: "center" }}>
              dados por modelo indisponíveis
            </div>
          </div>
        </div>

        {/* Custo + Throughput + Tokens hoje */}
        <div style={{ flex: "1 1 300px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {/* Custo */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, padding: 13, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)" }}>
              <span style={{ fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".04em" }}>Custo</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>$—</span>
              {sTok.length > 1 && <Sparkline data={sTok} color="--accent" w={100} h={30} />}
            </div>
            {/* Throughput */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5, padding: 13, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)" }}>
              <span style={{ fontSize: 10.5, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".04em" }}>Throughput</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{merged}/sem</span>
              {sMer.length > 1 && <Sparkline data={sMer} color="--green" w={100} h={30} />}
            </div>
          </div>

          {/* Tokens hoje */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: "var(--mute)", textTransform: "uppercase", letterSpacing: ".04em" }}>Tokens hoje</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{fmtTok(tokens)}</span>
            </div>
            {sTok.length > 1 && <Sparkline data={sTok} color="--accent" w={140} h={40} />}
          </div>
        </div>
      </div>

      </div>{/* end flex-column wrapper */}
    </Page>
  );
}
