"use client";
import { badge, card, CardHead, Page, PageHead, useT } from "../ui";

export default function Cloud() {
  const t = useT();
  const feat: [string, string][] = [
    [t("Workers gerenciados", "Managed workers"), t("instâncias provisionadas pela apifor (vCPU/hora), sem você manter máquina", "instances provisioned by apifor (vCPU/hour), no machine to maintain")],
    [t("Vault em KMS", "Vault in KMS"), t("chave-mestra do vault em KMS gerenciado (managed_vault_secret)", "vault master key in managed KMS (managed_vault_secret)")],
    [t("Cobrança metered", "Metered billing"), t("horas de worker e vCPU medidas e faturadas no ciclo", "worker hours and vCPU metered and billed per cycle")],
    [t("Auto-scale do pool", "Pool auto-scale"), t("sobe/desce workers conforme a fila", "scales workers up/down with the queue")],
  ];
  return (
    <Page>
      <PageHead eyebrow="Sistema" title="Cloud" subtitle={t("Workers gerenciados na nuvem (add-on Enterprise).")}
        right={<span style={badge("queued")}>{t("em breve", "coming soon")}</span>} />

      <div style={{ ...card, padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>☁️</div>
        <h2 style={{ margin: "10px 0 6px" }}>{t("Cloud workers")}</h2>
        <div style={{ color: "var(--dim)", fontSize: 14, maxWidth: 520, margin: "0 auto" }}>
          {t("Hoje a execução roda local (no seu executor) — chaves e código nunca saem da sua máquina. O add-on Cloud oferece workers gerenciados pra escalar sem manter infraestrutura. Disponível no roteiro Enterprise (M6.2).",
            "Today execution runs local (on your executor) — keys and code never leave your machine. The Cloud add-on offers managed workers to scale without maintaining infrastructure. Available on the Enterprise roadmap (M6.2).")}
        </div>
      </div>

      <div style={card}>
        <CardHead title="O que vem no add-on" />
        {feat.map(([title, d]) => (
          <div key={title} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--mute)" }}>○</span>
            <div><b>{title}</b><div style={{ color: "var(--dim)", fontSize: 13, marginTop: 2 }}>{d}</div></div>
          </div>
        ))}
      </div>
    </Page>
  );
}
