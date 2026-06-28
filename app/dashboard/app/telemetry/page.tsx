"use client";
import { useEffect, useState } from "react";
import { apiGet, card, Page } from "../ui";

type Tel = {
  tasks_total: number; tasks_merged: number; tasks_failed: number; tasks_active: number;
  tokens_used: number; pull_requests: number; week_worker_seconds: number;
};

const fmtH = (s: number) => (s >= 3600 ? (s / 3600).toFixed(1) + "h" : Math.round(s) + "s");

function Metric({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ ...card, padding: 18, marginBottom: 0, minWidth: 140, flex: 1 }}>
      <div style={{ color: "#697079", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#E8EAED", marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function Telemetria() {
  const [t, setT] = useState<Tel | null>(null);
  useEffect(() => {
    const load = () => apiGet<Tel>("/v1/telemetry").then(setT).catch(() => {});
    load(); const i = setInterval(load, 2000); return () => clearInterval(i);
  }, []);

  return (
    <Page>
      <h3 style={{ color: "#9BA1A9" }}>Telemetria <span style={{ color: "#697079", fontSize: 13 }}>(agregado da org)</span></h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Metric label="Tarefas" value={t?.tasks_total ?? 0} />
        <Metric label="Merged" value={t?.tasks_merged ?? 0} color="#3FB950" />
        <Metric label="Falhas" value={t?.tasks_failed ?? 0} color="#F85149" />
        <Metric label="Ativas" value={t?.tasks_active ?? 0} color="#5BA9FF" />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric label="Pull Requests" value={t?.pull_requests ?? 0} />
        <Metric label="Tokens (relay/coder/review)" value={(t?.tokens_used ?? 0).toLocaleString()} color="#F5A623" />
        <Metric label="Worker-hours (semana)" value={fmtH(t?.week_worker_seconds ?? 0)} />
      </div>
    </Page>
  );
}
