"use client";
import { badge, card, CardHead, cell, Page, PageHead, short, StateBar, StatCard, tableStyle, useSeries, usePoll, useT } from "./ui";

type Worker = { id: string; source: string; status: string; current_step: string };
type Task = { id: string; status: string };
type PR = { id: string; status: string; ai_review_status: string };
type Repo = { id: string };
const th = { ...cell, color: "var(--mute)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 };
const BUCKETS = [
  { label: "Na fila", tone: "orange", st: ["queued", "planning", "assigned"] },
  { label: "Em execução", tone: "blue", st: ["running"] },
  { label: "Em revisão", tone: "accent", st: ["in_review", "blocked"] },
  { label: "Concluídas", tone: "green", st: ["merged"] },
  { label: "Falhas", tone: "red", st: ["failed"] },
];

export default function Dashboard() {
  const t = useT();
  const { data: workers } = usePoll<Worker[]>("/v1/workers", 2500);
  const { data: tasks } = usePoll<Task[]>("/v1/tasks", 2500);
  const { data: prs } = usePoll<PR[]>("/v1/prs", 3000);
  const { data: repos } = usePoll<Repo[]>("/v1/repos", 6000);

  const w = workers || [], tk = tasks || [], pr = prs || [];
  const nWorkers = w.length;
  const nFila = tk.filter((t) => ["queued", "planning", "assigned"].includes(t.status)).length;
  const nPrsOpen = pr.filter((p) => p.status !== "merged").length;
  const nMerged = tk.filter((t) => t.status === "merged").length;
  const aiTot = pr.filter((p) => p.ai_review_status).length;
  const aiOk = pr.filter((p) => p.ai_review_status === "approved").length;
  const aiPct = aiTot ? Math.round((100 * aiOk) / aiTot) : 0;
  const running = nWorkers > 0;

  const sW = useSeries(nWorkers), sF = useSeries(nFila), sP = useSeries(nPrsOpen), sM = useSeries(nMerged), sA = useSeries(aiPct);
  const counts = BUCKETS.map((b) => ({ label: b.label, tone: b.tone, n: tk.filter((t) => b.st.includes(t.status)).length }));

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Dashboard" subtitle={`Visão geral do pipeline · ${(repos || []).length} repositório(s) · ${nWorkers} worker(s).`} />

      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ ...card, padding: 18, marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <b style={{ fontFamily: "var(--head)", fontSize: 14 }}>Estado do pool</b>
            <span style={{ color: "var(--mute)", fontSize: 12 }}>tempo real</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ position: "relative", width: 56, height: 56, borderRadius: 56, background: running ? "var(--green-tint)" : "var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {running && <span style={{ position: "absolute", inset: 8, borderRadius: 56, border: "2px solid var(--green)", animation: "pulsering 2.6s ease-out infinite" }} />}
              <span className={running ? "apf-live" : ""} style={{ width: 16, height: 16, borderRadius: 16, background: running ? "var(--green)" : "var(--mute)" }} />
            </span>
            <div>
              <div style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 26, color: running ? "var(--green)" : "var(--mute)" }}>{running ? "RODANDO" : "PARADO"}</div>
              <div style={{ color: "var(--dim)", fontSize: 13 }}>{nWorkers} worker(s) ativo(s)</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {Array.from({ length: 8 }).map((_, i) => <span key={i} style={{ width: 9, height: 22, borderRadius: 3, background: i < nWorkers ? "var(--green)" : "var(--border)" }} />)}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            {[["repositórios", (repos || []).length], ["na fila", nFila], ["PRs abertos", nPrsOpen]].map(([l, v]) => (
              <div key={l as string}><div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 22 }}>{v as number}</div><div style={{ color: "var(--mute)", fontSize: 12 }}>{l as string}</div></div>
            ))}
          </div>
        </div>
        <StateBar title="Estado das tarefas" counts={counts} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(176px,1fr))", gap: 14, marginBottom: 16 }}>
        <StatCard label="Workers ativos" value={nWorkers} tone="green" series={sW} sub="no pool" />
        <StatCard label="Fila" value={nFila} tone="orange" series={sF} sub="aguardando" />
        <StatCard label="PRs abertos" value={nPrsOpen} tone="blue" series={sP} sub="revisão/merge" />
        <StatCard label="Concluídas" value={nMerged} tone="green" series={sM} sub="merge realizado" />
        <StatCard label="Aprovação IA" value={aiPct} suffix="%" tone="accent" series={sA} sub={`${aiOk}/${aiTot} PRs`} />
      </div>

      <div style={card}>
        <CardHead title="Workers ao vivo" right={<a href="/live" style={{ color: "var(--blue)", fontSize: 13 }}>ver Live →</a>} />
        <table style={tableStyle}>
          <thead><tr><th style={th}>worker</th><th style={th}>source</th><th style={th}>status</th><th style={th}>step</th></tr></thead>
          <tbody>
            {w.map((x) => (
              <tr key={x.id}><td style={cell}><code style={{ color: "var(--accent)", fontSize: 12 }}>{short(x.id)}</code></td><td style={cell}>{x.source}</td><td style={cell}><span style={badge(x.status)}>{x.status}</span></td><td style={cell}>{x.current_step || "—"}</td></tr>
            ))}
            {!w.length && <tr><td style={cell} colSpan={4}>{t("nenhum worker ligado")}</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
