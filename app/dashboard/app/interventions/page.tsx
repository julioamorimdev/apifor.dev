"use client";
import { useState } from "react";
import { apiPost, badge, btn, card, codeAmber, codeDim, input, Page, PageHead, Pills, short, usePoll, useT } from "../ui";

type Intervention = { task_id: string; title: string; branch: string; ci_status: string; ai_review_status: string };
type Worker = { id: string };
const FILTERS: [string, string][] = [["all", "Todos"], ["ci", "CI verde"], ["ci_fail", "CI falhou"]];

export default function Intervencao() {
  const t = useT();
  const { data: items, reload } = usePoll<Intervention[]>("/v1/interventions", 2000);
  const { data: workers } = usePoll<Worker[]>("/v1/workers", 3000);
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const list = items || [];
  const running = (workers || []).length > 0;
  const rows = list
    .filter((it) => f === "all" || (f === "ci" && it.ci_status === "passed") || (f === "ci_fail" && it.ci_status !== "passed"))
    .filter((it) => (it.title + it.task_id + it.branch).toLowerCase().includes(q.toLowerCase()));

  async function answer(id: string, decision: "approve" | "reject") { await apiPost(`/v1/interventions/${id}/answer`, { decision }); reload(); }

  return (
    <Page>
      <PageHead eyebrow="Operação" title="Intervenção" subtitle="Gate de revisão humana — destrava o merge." />

      {/* banner de status do pool */}
      <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ position: "relative", width: 40, height: 40, borderRadius: 40, background: running ? "var(--green-tint)" : "var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {running && <span style={{ position: "absolute", inset: 6, borderRadius: 40, border: "2px solid var(--green)", animation: "pulsering 2.6s ease-out infinite" }} />}
          <span className={running ? "apf-live" : ""} style={{ width: 12, height: 12, borderRadius: 12, background: running ? "var(--green)" : "var(--mute)" }} />
        </span>
        <div>
          <div style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 20, color: running ? "var(--green)" : "var(--mute)" }}>{running ? (t("Em execução") === "Running" ? "RUNNING" : "RODANDO") : "PARADO"}</div>
          <div style={{ color: "var(--dim)", fontSize: 13 }}>{(workers || []).length} worker(s) {t("ativas", "active")} · {t("gates server-side", "server-side gates")}</div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
          <b style={{ fontFamily: "var(--head)", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: "var(--orange)" }}>⚠</span> {t("Precisa de atenção", "Needs attention")}</b>
          <span style={badge(rows.length ? "blocked" : "idle")}>{rows.length}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar por tarefa, repo ou worker…", "Search by task, repo or worker…")} style={{ ...input, flex: 1, minWidth: 180 }} />
          <Pills options={FILTERS} value={f} onChange={setF} />
        </div>

        {rows.map((it) => (
          <div key={it.task_id} style={{ borderLeft: "3px solid var(--accent)", borderBottom: "1px solid var(--border)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ ...badge("in_review"), fontWeight: 600 }}>⚑ {t("REVISÃO HUMANA", "HUMAN REVIEW")}</span>
              <span style={codeAmber}>#{short(it.task_id.replace(/^tsk_/, ""), 6)}</span>
              <b>{it.title}</b>
              <span style={{ marginLeft: "auto", ...codeDim }}>{short(it.branch, 28)}</span>
            </div>
            <div style={{ color: "var(--dim)", fontSize: 13, margin: "8px 0 12px" }}>
              CI <span style={{ color: it.ci_status === "passed" ? "var(--green)" : "var(--red)" }}>{it.ci_status || "—"}</span> · IA <span style={{ color: it.ai_review_status === "approved" ? "var(--green)" : "var(--orange)" }}>{it.ai_review_status || "—"}</span> — {t("aguardando aprovação humana antes do merge.", "awaiting human approval before merge.")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn, background: "var(--green)", color: "#fff" }} onClick={() => answer(it.task_id, "approve")}>✓ {t("Aprovar", "Approve")}</button>
              <button style={{ ...btn, background: "var(--red-tint)", color: "var(--red)" }} onClick={() => answer(it.task_id, "reject")}>✕ {t("Reprovar", "Reject")}</button>
            </div>
          </div>
        ))}
        {!rows.length && <div style={{ padding: 20, color: "var(--mute)" }}>{t("nenhuma intervenção pendente")} 🎉</div>}
      </div>

      <p style={{ color: "var(--mute)", fontSize: 13 }}>
        {t("Aprovar despacha o merge ao executor; reprovar marca a tarefa como falha. Os gates (CI verde, revisão IA, revisão humana) são aplicados server-side no cérebro.",
          "Approving dispatches the merge to the executor; rejecting fails the task. The gates (green CI, AI review, human review) are enforced server-side in the brain.")}
      </p>
    </Page>
  );
}
