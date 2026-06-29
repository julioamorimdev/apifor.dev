"use client";
import { useState } from "react";
import { apiGet, Modal, Page, PageHead, useT } from "../ui";

const FAQS = [
  { q: "Como o apifor.dev protege meu código?", a: "Código e segredos ficam no seu executor local (vault cifrado via IPC). O cérebro só recebe metadados: plano estruturado, branch e URL do PR — nunca o código-fonte." },
  { q: "O que acontece se o executor ficar offline?", a: "Workers em andamento concluem o ciclo atual e pausam. Ao voltar, eles retomam automaticamente via heartbeat mTLS. Tarefas pendentes ficam na fila." },
  { q: "Posso usar minha própria chave de IA?", a: "Sim. Rode make secret NAME=anthropic_api_key VALUE=sk-ant-… para armazenar no vault local. A chave nunca trafega pelo cérebro." },
  { q: "Como conectar um repositório?", a: "Acesse Configuração → Repositórios, clique em Adicionar repo e siga as instruções para instalar o GitHub App ou configurar o webhook manual." },
  { q: "Como cancelar a assinatura?", a: "Em Assinatura, clique em Cancelar plano. O acesso continua até o fim do período pago. Seus dados são mantidos por 30 dias após o cancelamento." },
  { q: "Quantos repositórios posso conectar?", a: "No plano Free: 1 repositório e até 3 workers simultâneos. No Pro: ilimitado. Veja a tabela completa em Assinatura." },
  { q: "O que é o kill-switch de dispositivos?", a: "Em Uso → Dispositivos você pode revogar certificados mTLS de qualquer executor imediatamente. Útil se um worker for comprometido ou descartado." },
  { q: "Como exportar os dados da minha organização?", a: "Acesse Conta → Exportar dados (disponível no plano Team e acima). Gera um ZIP com tarefas, PRs e logs em formato JSON." },
];

const STATUS_COMPS = [
  { name: "API REST",       state: "Operacional" },
  { name: "Workers",        state: "Operacional" },
  { name: "Webhooks",       state: "Operacional" },
  { name: "Banco de dados", state: "Operacional" },
  { name: "CDN / Assets",   state: "Operacional" },
];

const STATE_COLOR: Record<string, string> = {
  "Operacional": "var(--green)",
  "Degradado":   "var(--orange)",
  "Interrupção": "var(--red)",
};

type Ticket = { id: string; subject: string; cat: string; prio: string; prioColor: string; status: string; statusColor: string; statusBg: string; date: string };

const MOCK_TICKETS: Ticket[] = [
  { id: "#1042", subject: "Worker não retoma após reinicialização do servidor",  cat: "Executor",     prio: "Alta",   prioColor: "var(--red)",    status: "Aberto",    statusColor: "var(--accent)", statusBg: "var(--accent-tint)", date: "28/jun/2026" },
  { id: "#1038", subject: "Webhook do GitHub não dispara em PRs de fork",        cat: "Integração",  prio: "Média",  prioColor: "var(--orange)", status: "Em análise",statusColor: "var(--blue)",   statusBg: "rgba(88,166,255,.1)",date: "25/jun/2026" },
  { id: "#1031", subject: "Exportar dados retorna 403 no plano Pro",             cat: "Faturamento",  prio: "Média",  prioColor: "var(--orange)", status: "Resolvido", statusColor: "var(--green)", statusBg: "var(--green-tint)",  date: "19/jun/2026" },
];

const TICKET_CATS = ["Executor", "Integração", "Faturamento", "API", "Outro"];

const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", overflow: "hidden",
};
const sField: React.CSSProperties = {
  height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 13, outline: "none", width: "100%",
};
const sFilledBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 16px",
  borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-ink)",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};
const sSmallFilledBtn: React.CSSProperties = {
  ...sFilledBtn, height: 32, padding: "0 13px", fontSize: 12,
};

const QUICK_LINKS = [
  { label: "Documentação",     labelEn: "Documentation",    sub: "Guias de setup e conceitos",  subEn: "Setup guides and concepts",  iconColor: "var(--accent)", iconBg: "var(--accent-tint)", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h7v18H6a2 2 0 0 0-2 2z"/><path d="M20 3h-7v18h7z"/></svg> },
  { label: "Referência da API",labelEn: "API Reference",     sub: "Endpoints e SDKs",            subEn: "Endpoints and SDKs",          iconColor: "var(--blue)",   iconBg: "rgba(88,166,255,.12)", icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12"/></svg> },
  { label: "Status do serviço",labelEn: "Service status",    sub: "Disponibilidade ao vivo",     subEn: "Live availability",           iconColor: "var(--green)",  iconBg: "var(--green-tint)",   icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2.5-7 4 14 2.5-7H21"/></svg> },
  { label: "Comunidade",       labelEn: "Community",          sub: "Discord e fórum",             subEn: "Discord and forum",           iconColor: "var(--dim)",    iconBg: "var(--elev)",         icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
];

export default function Ajuda() {
  const t = useT();
  const [q, setQ] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [tkt, setTkt] = useState({ subject: "", cat: "Executor", prio: "Média", msg: "" });
  const setT = (k: string, v: string) => setTkt((p) => ({ ...p, [k]: v }));
  const [submitting, setSubmitting] = useState(false);

  const faqsFiltered = FAQS.filter((f) =>
    !q || f.q.toLowerCase().includes(q.toLowerCase()) || f.a.toLowerCase().includes(q.toLowerCase())
  );

  const overallOk = STATUS_COMPS.every((c) => c.state === "Operacional");
  const overallColor = overallOk ? "var(--green)" : "var(--orange)";
  const overallLabel = overallOk ? t("Todos os sistemas operacionais", "All systems operational") : t("Degradação parcial", "Partial degradation");

  async function submitTicket() {
    if (!tkt.subject || !tkt.msg) return;
    setSubmitting(true);
    try {
      await apiGet("/v1/me"); // stub — no ticket endpoint yet
    } finally {
      setSubmitting(false);
      setTicketOpen(false);
      setTkt({ subject: "", cat: "Executor", prio: "Média", msg: "" });
    }
  }

  return (
    <Page>
      <PageHead eyebrow={t("Suporte", "Support")} title={t("Ajuda", "Help")} subtitle={t("Documentação, status do serviço e canais de suporte.", "Documentation, service status and support channels.")} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Search bar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 15px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 11, boxShadow: "var(--shadow)", maxWidth: 560 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Como podemos ajudar?", "How can we help?")} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 13.5 }} />
        </div>

        {/* ── Quick link cards ── */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {QUICK_LINKS.map((ql) => (
            <button key={ql.label}
              style={{ flex: "1 1 220px", minWidth: 200, textAlign: "left", display: "flex", alignItems: "flex-start", gap: 12, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 15, cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.background = "var(--bg)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.background = "var(--card)"; }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: ql.iconBg, display: "flex", alignItems: "center", justifyContent: "center", color: ql.iconColor }}>
                {ql.icon}
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t(ql.label, ql.labelEn)}</span>
                <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{t(ql.sub, ql.subEn)}</span>
              </span>
            </button>
          ))}
        </div>

        {/* ── Mid row: FAQ + Status/Support ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* FAQ card */}
          <div style={{ flex: "1.4 1 380px", minWidth: 300, ...sCard }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
              {t("Perguntas frequentes", "Frequently asked questions")}
            </div>
            <div style={{ padding: "4px 16px 8px" }}>
              {faqsFiltered.map((f) => (
                <div key={f.q} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "13px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                    <span style={{ color: "var(--accent)", flexShrink: 0 }}>›</span>
                    {t(f.q)}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.55, paddingLeft: 16 }}>{t(f.a)}</span>
                </div>
              ))}
              {faqsFiltered.length === 0 && (
                <div style={{ padding: "26px 8px", textAlign: "center", fontSize: 12.5, color: "var(--mute)" }}>
                  {t("Nenhuma pergunta corresponde à busca.", "No questions match your search.")}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Status card */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: overallColor, boxShadow: `0 0 8px ${overallColor}`, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{overallLabel}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                {STATUS_COMPS.map((s) => {
                  const col = STATE_COLOR[s.state] || "var(--mute)";
                  return (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, color: "var(--dim)" }}>{s.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: col }}>{t(s.state, s.state === "Operacional" ? "Operational" : s.state === "Degradado" ? "Degraded" : "Outage")}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Support CTA card */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t("Ainda precisa de ajuda?", "Still need help?")}</span>
              <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.5 }}>
                {t("Suporte prioritário incluso no plano Pro · resposta em até 4 h úteis.", "Priority support included in the Pro plan · response within 4 business hours.")}
              </span>
              <button onClick={() => setTicketOpen(true)} style={{ ...sFilledBtn, width: "100%", justifyContent: "center" }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}>
                {t("Abrir chamado", "Open ticket")}
              </button>
            </div>

          </div>
        </div>

        {/* ── Meus chamados ── */}
        <div style={sCard}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("Meus chamados", "My tickets")}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--dim)", background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px" }}>
                {MOCK_TICKETS.length}
              </span>
            </div>
            <button onClick={() => setTicketOpen(true)} style={sSmallFilledBtn}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "")}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              {t("Novo chamado", "New ticket")}
            </button>
          </div>

          {MOCK_TICKETS.map((tk) => (
            <div key={tk.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--accent)", fontWeight: 600, flexShrink: 0 }}>{tk.id}</span>
              <span style={{ flex: 1, minWidth: 140, fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.subject}</span>
              <span style={{ fontSize: 11, color: "var(--mute)", flexShrink: 0 }}>{t(tk.cat, tk.cat === "Integração" ? "Integration" : tk.cat === "Faturamento" ? "Billing" : tk.cat === "Outro" ? "Other" : tk.cat)}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: tk.prioColor, flexShrink: 0 }}>{t(tk.prio, tk.prio === "Alta" ? "High" : tk.prio === "Média" ? "Medium" : tk.prio === "Baixa" ? "Low" : tk.prio === "Crítica" ? "Critical" : tk.prio)}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, color: tk.statusColor, background: tk.statusBg, flexShrink: 0 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                {t(tk.status, tk.status === "Aberto" ? "Open" : tk.status === "Em análise" ? "In review" : tk.status === "Resolvido" ? "Resolved" : tk.status)}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)", flexShrink: 0, width: 74, textAlign: "right" }}>{tk.date}</span>
            </div>
          ))}

          {MOCK_TICKETS.length === 0 && (
            <div style={{ padding: "30px 16px", textAlign: "center", fontSize: 12.5, color: "var(--mute)" }}>
              {t("Nenhum chamado encontrado.", "No tickets found.")}
            </div>
          )}
        </div>

      </div>

      {/* ── Novo chamado modal ── */}
      {ticketOpen && (
        <Modal title={t("Abrir chamado", "Open ticket")} onClose={() => setTicketOpen(false)}
          footer={<>
            <button onClick={() => setTicketOpen(false)} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("Cancelar", "Cancel")}</button>
            <button onClick={submitTicket} disabled={submitting || !tkt.subject || !tkt.msg} style={{ ...sFilledBtn, height: 38, padding: "0 18px", borderRadius: 9, opacity: (submitting || !tkt.subject || !tkt.msg) ? .5 : 1 }}>
              {submitting ? t("Enviando…", "Sending…") : t("Enviar chamado", "Send ticket")}
            </button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{t("Assunto", "Subject")}</span>
              <input style={sField} placeholder={t("Descreva o problema brevemente…", "Briefly describe the issue…")} value={tkt.subject} onChange={(e) => setT("subject", e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 140px" }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{t("Categoria", "Category")}</span>
                <select style={{ ...sField, cursor: "pointer", colorScheme: "dark" as any }} value={tkt.cat} onChange={(e) => setT("cat", e.target.value)}>
                  {TICKET_CATS.map((c) => <option key={c} value={c}>{t(c, c === "Integração" ? "Integration" : c === "Faturamento" ? "Billing" : c === "Outro" ? "Other" : c)}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 120px" }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{t("Prioridade", "Priority")}</span>
                <select style={{ ...sField, cursor: "pointer", colorScheme: "dark" as any }} value={tkt.prio} onChange={(e) => setT("prio", e.target.value)}>
                  {["Baixa", "Média", "Alta", "Crítica"].map((p) => <option key={p} value={p}>{t(p, p === "Baixa" ? "Low" : p === "Média" ? "Medium" : p === "Alta" ? "High" : "Critical")}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>{t("Mensagem", "Message")}</span>
              <textarea value={tkt.msg} onChange={(e) => setT("msg", e.target.value)}
                placeholder={t("Descreva o problema com detalhes: passos para reproduzir, mensagens de erro, logs relevantes…", "Describe the issue in detail: steps to reproduce, error messages, relevant logs…")}
                style={{ ...sField, height: "auto", minHeight: 96, padding: "10px 11px", resize: "vertical", lineHeight: 1.5 }} />
            </label>
          </div>
        </Modal>
      )}
    </Page>
  );
}
