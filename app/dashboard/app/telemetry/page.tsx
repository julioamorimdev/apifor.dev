"use client";
import { useEffect, useState } from "react";
import { apiGet, Page, PageHead, StatCard, useSeries } from "../ui";

type Tel = {
  tasks_total: number; tasks_merged: number; tasks_failed: number; tasks_active: number;
  tokens_used: number; pull_requests: number; week_worker_seconds: number;
};
const fmtH = (s: number) => (s >= 3600 ? (s / 3600).toFixed(1) + "h" : Math.round(s) + "s");

export default function Telemetria() {
  const [t, setT] = useState<Tel | null>(null);
  useEffect(() => {
    const load = () => apiGet<Tel>("/v1/telemetry").then((r) => { if (!(r as any)?.error) setT(r); }).catch(() => {});
    load(); const i = setInterval(load, 3000); return () => clearInterval(i);
  }, []);

  const sTot = useSeries(t?.tasks_total ?? 0), sMer = useSeries(t?.tasks_merged ?? 0), sFail = useSeries(t?.tasks_failed ?? 0);
  const sAct = useSeries(t?.tasks_active ?? 0), sPr = useSeries(t?.pull_requests ?? 0), sTok = useSeries(t?.tokens_used ?? 0);

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Telemetria" subtitle="Métricas agregadas da org." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        <StatCard label="Tarefas" value={t?.tasks_total ?? 0} tone="accent" series={sTot} sub="total" />
        <StatCard label="Merged" value={t?.tasks_merged ?? 0} tone="green" series={sMer} sub="concluídas" />
        <StatCard label="Falhas" value={t?.tasks_failed ?? 0} tone="red" series={sFail} sub="gate vermelho" />
        <StatCard label="Ativas" value={t?.tasks_active ?? 0} tone="blue" series={sAct} sub="em andamento" />
        <StatCard label="Pull Requests" value={t?.pull_requests ?? 0} tone="orange" series={sPr} sub="abertos + merged" />
        <StatCard label="Tokens" value={(t?.tokens_used ?? 0).toLocaleString()} tone="accent" series={sTok} sub="relay/coder/review" />
        <StatCard label="Worker-hours" value={fmtH(t?.week_worker_seconds ?? 0)} tone="green" sub="na semana" />
      </div>
    </Page>
  );
}
