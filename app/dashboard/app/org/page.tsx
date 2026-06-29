"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, btn, input, Modal, Page, PageHead, Portal, useT } from "../ui";

type Me          = { org_id: string; role: string };
type Member      = { id: string; email: string; name: string; role: string; status: string };
type Workspace   = { id: string; name: string; initial: string };
type PendingInvite = { email: string; by: string; sent: string; role: string };

const PAGE_SIZE = 8;

const ROLE_FILTER = ["todos", "admin", "member", "billing", "viewer"] as const;
const ROLE_LABEL: Record<string, string> = {
  todos: "Todos", admin: "Admin", member: "Editor", billing: "Serviço", viewer: "Leitor",
};
const ROLE_LABEL_EN: Record<string, string> = {
  todos: "All", admin: "Admin", member: "Editor", billing: "Service", viewer: "Reader",
};
const ROLE_COLOR: Record<string, [string, string]> = {
  owner:   ["var(--accent)",  "var(--accent-tint)"],
  admin:   ["var(--accent)",  "var(--accent-tint)"],
  member:  ["var(--blue)",    "var(--blue-tint,rgba(88,166,255,.12))"],
  billing: ["var(--green)",   "var(--green-tint)"],
  viewer:  ["var(--mute)",    "var(--elev)"],
};
const ROLES_LEGEND = [
  { role: "Admin",   color: "var(--accent)", desc: "Gerencia membros, workspaces, faturamento e todas as configurações.",      en: "Manages members, workspaces, billing and all settings."            },
  { role: "Editor",  color: "var(--blue)",   desc: "Cria e edita tarefas, revisa e aprova pull requests.",                    en: "Creates and edits tasks, reviews and approves pull requests."      },
  { role: "Leitor",  color: "var(--mute)",   desc: "Apenas leitura de tarefas, logs e telemetria.",                           en: "Read-only access to tasks, logs and telemetry."                    },
  { role: "Serviço", color: "var(--green)",  desc: "Acesso via API para automações, bots e integrações CI/CD.",               en: "API access for automations, bots and CI/CD integrations."          },
];
const AV_COLORS = ["var(--blue)", "var(--green)", "var(--orange)", "var(--accent)", "var(--red)"];
const avColor  = (id: string) => AV_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const initials = (m: Member) => (m.name || m.email).slice(0, 2).toUpperCase();
const isOnline = (id: string) => id.charCodeAt(id.length - 1) % 3 !== 0;

const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", overflow: "hidden",
};
const sFilledBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 16px",
  borderRadius: 9, border: "none", background: "var(--accent)", color: "var(--accent-ink)",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const sPill = (active: boolean): React.CSSProperties => ({
  padding: "4px 11px", borderRadius: 6, border: "none", fontSize: 12,
  fontWeight: active ? 600 : 500, cursor: "pointer",
  background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
});
const sFieldLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 500, color: "var(--dim)" };
const sField: React.CSSProperties = {
  height: 40, width: "100%", padding: "0 12px", borderRadius: 9,
  border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)",
  font: "inherit", fontSize: 13, outline: "none",
};
const sThCell: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--mute)",
};

function RolePill({ role }: { role: string }) {
  const t = useT();
  const [color, bg] = ROLE_COLOR[role] || ["var(--mute)", "var(--elev)"];
  const label   = ROLE_LABEL[role]    ?? role;
  const labelEn = ROLE_LABEL_EN[role] ?? role;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, color, background: bg, whiteSpace: "nowrap" }}>
      {t(label, labelEn)}
    </span>
  );
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

export default function Org() {
  const t = useT();
  const [me,         setMe]         = useState<Me | null>(null);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [pending,    setPending]    = useState<PendingInvite[]>([]);

  const [q,    setQ]    = useState("");
  const [rf,   setRf]   = useState<typeof ROLE_FILTER[number]>("todos");
  const [page, setPage] = useState(0);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inv, setInv] = useState({ email: "", password: "", role: "member" });
  const setI = (k: string, v: string) => setInv((p) => ({ ...p, [k]: v }));
  const [inviting, setInviting] = useState(false);

  const [menuMember, setMenuMember] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const load = useCallback(() => Promise.allSettled([
    apiGet<Me>("/v1/me").then((r) => { if (!(r as any)?.error) setMe(r); }).catch(() => {}),
    apiGet<{ data: Member[] }>("/v1/members").then((r) => setMembers(r?.data || [])).catch(() => {}),
    apiGet<{ data: Workspace[] }>("/v1/workspaces").then((r) => setWorkspaces(r?.data || [])).catch(() => {}),
  ]), []);
  useEffect(() => { load().then(() => setLoading(false)); }, [load]);

  const canManage = me?.role === "owner" || me?.role === "admin";
  const wsName    = workspaces[0]?.name || "workspace";
  const wsInitial = (workspaces[0]?.initial || wsName.slice(0, 2)).toUpperCase();
  const admins    = members.filter((m) => m.role === "owner" || m.role === "admin").length;

  const filtered = members
    .filter((m) => rf === "todos" || m.role === rf)
    .filter((m) => !q || m.email.toLowerCase().includes(q.toLowerCase()) || (m.name || "").toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  async function invite() {
    if (!inv.email) return;
    setInviting(true);
    try {
      await apiPost("/v1/members", { email: inv.email, password: inv.password || "invite-pending", role: inv.role });
      setPending((p) => [{ email: inv.email, by: me?.org_id?.slice(0, 8) || "você", sent: "agora", role: inv.role }, ...p]);
      setInv({ email: "", password: "", role: "member" });
      setInviteOpen(false);
      load();
    } finally { setInviting(false); }
  }

  const removeMember  = async (id: string) => { await apiDelete(`/v1/members/${id}`); setMenuMember(null); load(); };
  const cancelInvite  = (email: string)   => setPending((p) => p.filter((i) => i.email !== email));
  const resendInvite  = (_email: string)  => {};

  return (
    <Page loading={loading}>
      <PageHead
        eyebrow="Workspace"
        title={t("Organização", "Organization")}
        subtitle={t(`Membros, papéis e convites do workspace ${wsName}.`, `Members, roles and invites for workspace ${wsName}.`)}
        right={
          canManage ? (
            <button style={sFilledBtn} onClick={() => setInviteOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              {t("Convidar membro", "Invite member")}
            </button>
          ) : undefined
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Org banner ── */}
        <div style={{ ...sCard, padding: "16px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 12, background: "linear-gradient(135deg,var(--accent),var(--orange))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#1c1303" }}>
            {wsInitial}
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>ApiFor — {wsName}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--accent)", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.3)", borderRadius: 5, padding: "2px 6px" }}>
                FREE
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)", marginTop: 3 }}>
              {me?.org_id || "—"} · {t("criada em jan/2026", "created Jan/2026")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            {[
              { v: members.length,       label: t("Membros", "Members"),  color: "var(--ink)"    },
              { v: admins,               label: t("Admins", "Admins"),    color: "var(--ink)"    },
              { v: pending.length,       label: t("Convites", "Invites"), color: "var(--accent)" },
              { v: `${members.length}/5`, label: t("Assentos", "Seats"),  color: "var(--ink)"    },
            ].map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 17, fontWeight: 700, color: s.color }}>{s.v}</span>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--mute)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Members table ── */}
        <div style={sCard}>
          {/* toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 150 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("Buscar membro por nome ou e-mail…", "Search member by name or email…")} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
            </div>
            <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "wrap" }}>
              {ROLE_FILTER.map((r) => (
                <button key={r} onClick={() => { setRf(r); setPage(0); }} style={sPill(rf === r)}>{t(ROLE_LABEL[r], ROLE_LABEL_EN[r])}</button>
              ))}
            </div>
          </div>

          {/* column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 0, ...sThCell, padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
            <span>{t("Membro", "Member")}</span>
            <span style={{ padding: "0 14px" }}>{t("Papel", "Role")}</span>
            <span style={{ padding: "0 14px" }}>{t("Atividade", "Activity")}</span>
            <span style={{ width: 32 }} />
          </div>

          {/* rows */}
          {rows.map((m) => {
            const online  = isOnline(m.id);
            const col     = avColor(m.id);
            const actText = online ? t("agora", "now") : (() => {
              const h = (m.id.charCodeAt(0) % 12) + 1;
              return h < 2 ? t("1h atrás", "1h ago") : t(`${h}h atrás`, `${h}h ago`);
            })();
            return (
              <div key={m.id}
                style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                {/* avatar + name + email */}
                <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${col} 14%, var(--card))`, border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: col, fontFamily: "var(--mono)" }}>
                      {initials(m)}
                    </div>
                    <span style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: online ? "var(--green)" : "var(--mute)", border: "2px solid var(--card)" }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name || m.email.split("@")[0]}</div>
                    <div style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                  </div>
                </div>
                {/* role pill */}
                <div style={{ padding: "0 14px" }}><RolePill role={m.role} /></div>
                {/* activity */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 14px", fontSize: 11.5, color: "var(--dim)", whiteSpace: "nowrap" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: online ? "var(--green)" : "var(--mute)", flexShrink: 0 }} />
                  {actText}
                </span>
                {/* 3-dot menu */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => setMenuMember(menuMember === m.id ? null : m.id)}
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "none", background: "transparent", color: "var(--mute)", cursor: "pointer" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--elev)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--mute)"; }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                  </button>
                  {menuMember === m.id && (
                    <>
                      <Portal><div onClick={() => setMenuMember(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} /></Portal>
                      <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, width: 150, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, boxShadow: "var(--shadow-pop)", zIndex: 50, padding: 4 }}>
                        <button style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", fontSize: 12.5, color: "var(--ink)", cursor: "pointer", textAlign: "left" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--elev)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                          {t("Alterar papel", "Change role")}
                        </button>
                        {canManage && m.role !== "owner" && (
                          <button onClick={() => removeMember(m.id)}
                            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 10px", borderRadius: 7, border: "none", background: "transparent", fontSize: 12.5, color: "var(--red)", cursor: "pointer", textAlign: "left" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--red-tint)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                            {t("Remover", "Remove")}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* empty state */}
          {rows.length === 0 && (
            <div style={{ padding: "34px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0M16 11l2 2 4-4"/></svg>
              <span style={{ fontSize: 13, color: "var(--dim)" }}>{t("Nenhum membro encontrado.", "No members found.")}</span>
              <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{t("Ajuste a busca ou o filtro de papel.", "Adjust the search or role filter.")}</span>
            </div>
          )}

          {/* pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} {t("membro(s)", "member(s)")} · {t("pág.", "p.")} {safePage + 1}/{totalPages}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </NavBtn>
                <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </NavBtn>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom row: Convites + Papéis ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* Convites pendentes */}
          <div style={{ flex: "1.3 1 360px", minWidth: 300, ...sCard }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("Convites pendentes", "Pending invites")}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "var(--accent-tint)", borderRadius: 6, padding: "2px 8px" }}>{pending.length}</span>
            </div>
            {pending.map((i) => {
              const ini = i.email[0].toUpperCase();
              return (
                <div key={i.email}
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: "var(--bg)", border: "1.5px dashed var(--border-2,var(--border))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "var(--mute)", fontFamily: "var(--mono)" }}>
                    {ini}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.email}</div>
                    <div style={{ fontSize: 11, color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Convidado por", "Invited by")} {i.by} · {t(i.sent, "now")}</div>
                  </div>
                  <RolePill role={i.role} />
                  <button title={t("Reenviar", "Resend")} onClick={() => resendInvite(i.email)}
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", cursor: "pointer", flexShrink: 0 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--elev)"; (e.currentTarget as HTMLElement).style.color = "var(--ink)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--dim)"; }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/></svg>
                  </button>
                  <button title={t("Cancelar", "Cancel")} onClick={() => cancelInvite(i.email)}
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--mute)", cursor: "pointer", flexShrink: 0 }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--red-tint)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(248,81,73,.3)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--mute)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              );
            })}
            {pending.length === 0 && (
              <div style={{ padding: "22px 16px", textAlign: "center", color: "var(--mute)", fontSize: 12.5 }}>
                {t("Nenhum convite pendente.", "No pending invites.")}
              </div>
            )}
            <button onClick={() => setInviteOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "12px 16px", border: "none", background: "transparent", color: "var(--accent)", font: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer", borderTop: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              {t("Convidar por e-mail", "Invite by email")}
            </button>
          </div>

          {/* Papéis e permissões */}
          <div style={{ flex: "1 1 280px", minWidth: 260, ...sCard }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
              {t("Papéis e permissões", "Roles and permissions")}
            </div>
            <div style={{ padding: "4px 16px 10px" }}>
              {ROLES_LEGEND.map((r) => (
                <div key={r.role} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: r.color }}>{r.role}</span>
                    <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.5 }}>{t(r.desc, r.en)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>{/* end flex-col gap-16 */}

      {/* ── Invite modal ── */}
      {inviteOpen && (
        <Modal title={t("Convidar membro", "Invite member")} onClose={() => setInviteOpen(false)}
          footer={<>
            <button onClick={() => setInviteOpen(false)} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("Cancelar", "Cancel")}</button>
            <button onClick={invite} disabled={inviting} style={{ ...btn, opacity: inviting ? .6 : 1 }}>{inviting ? t("Convidando…", "Sending…") : t("Enviar convite", "Send invite")}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={sFieldLabel}>{t("E-mail", "Email")}</span>
              <input style={sField} type="email" placeholder="colaborador@empresa.com" value={inv.email} onChange={(e) => setI("email", e.target.value)} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={sFieldLabel}>{t("Papel", "Role")}</span>
              <select style={sField} value={inv.role} onChange={(e) => setI("role", e.target.value)}>
                <option value="admin">{t("Admin", "Admin")}</option>
                <option value="member">{t("Editor", "Editor")}</option>
                <option value="viewer">{t("Leitor", "Reader")}</option>
                <option value="billing">{t("Serviço", "Service")}</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={sFieldLabel}>{t("Senha inicial", "Initial password")} <span style={{ color: "var(--mute)", fontWeight: 400 }}>({t("temporária", "temporary")})</span></span>
              <input style={sField} type="password" placeholder="••••••••" value={inv.password} onChange={(e) => setI("password", e.target.value)} />
            </label>
          </div>
        </Modal>
      )}
    </Page>
  );
}
