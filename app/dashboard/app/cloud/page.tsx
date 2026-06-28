"use client";
import { badge, card, CardHead, Page, PageHead } from "../ui";

export default function Cloud() {
  const feat: [string, string][] = [
    ["Workers gerenciados", "instâncias provisionadas pela apifor (vCPU/hora), sem você manter máquina"],
    ["Vault em KMS", "chave-mestra do vault em KMS gerenciado (managed_vault_secret)"],
    ["Cobrança metered", "horas de worker e vCPU medidas e faturadas no ciclo"],
    ["Auto-scale do pool", "sobe/desce workers conforme a fila"],
  ];
  return (
    <Page>
      <PageHead eyebrow="Sistema" title="Cloud" subtitle="Workers gerenciados na nuvem (add-on Enterprise)."
        right={<span style={badge("queued")}>em breve</span>} />

      <div style={{ ...card, padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>☁️</div>
        <h2 style={{ margin: "10px 0 6px" }}>Cloud workers</h2>
        <div style={{ color: "var(--dim)", fontSize: 14, maxWidth: 520, margin: "0 auto" }}>
          Hoje a execução roda <b>local</b> (no seu executor) — chaves e código nunca saem da sua máquina.
          O add-on <b>Cloud</b> oferece workers gerenciados pra escalar sem manter infraestrutura.
          Disponível no roteiro Enterprise (M6.2).
        </div>
      </div>

      <div style={card}>
        <CardHead title="O que vem no add-on" />
        {feat.map(([t, d]) => (
          <div key={t} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--mute)" }}>○</span>
            <div><b>{t}</b><div style={{ color: "var(--dim)", fontSize: 13, marginTop: 2 }}>{d}</div></div>
          </div>
        ))}
      </div>
    </Page>
  );
}
