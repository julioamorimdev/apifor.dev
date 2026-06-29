"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost, Page, PageHead, setToken, useT } from "../ui";

type Me  = { user_id: string; org_id: string; role: string };
type Sub = { plan: string; status: string };

const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", padding: 18, display: "flex", flexDirection: "column", gap: 15,
};
const sLabel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
};
const sLabelTxt: React.CSSProperties = { fontSize: 11, color: "var(--dim)" };
const sInput: React.CSSProperties = {
  height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 13, outline: "none",
};
const sSaveBtn: React.CSSProperties = {
  alignSelf: "flex-start", height: 36, padding: "0 16px", borderRadius: 8,
  border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)",
  fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 2,
};
const sOutlineBtn = (red?: boolean): React.CSSProperties => ({
  height: 32, padding: "0 13px", borderRadius: 7,
  border: red ? "1px solid rgba(248,81,73,.4)" : "1px solid var(--border)",
  background: red ? "var(--red-tint)" : "transparent",
  color: red ? "var(--red)" : "var(--ink)",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
});

function SepSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11, borderTop: "1px solid var(--border)", paddingTop: 15 }}>
      {title && <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{title}</span>}
      {children}
    </div>
  );
}

export default function Conta() {
  const t = useT();

  const [me,  setMe]  = useState<Me | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [repoCount,   setRepoCount]   = useState<number | null>(null);
  const [workerCount, setWorkerCount] = useState<number | null>(null);

  const [photo, setPhoto]   = useState<string | null>(null);
  const photoRef            = useRef<HTMLInputElement>(null);

  const [name,    setName]    = useState("Rafael Souza");
  const [email,   setEmail]   = useState("rafael@apifor.dev");
  const [orgName, setOrgName] = useState("ApiFor — Núcleo");
  const [billing, setBilling] = useState("financeiro@apifor.dev");
  const [tz,      setTz]      = useState("America/Sao_Paulo (GMT-3)");

  const [pwdCur,  setPwdCur]  = useState("");
  const [pwdNew,  setPwdNew]  = useState("");
  const [pwdConf, setPwdConf] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg,    setPwdMsg]    = useState("");
  const [pwdOk,     setPwdOk]    = useState(false);

  const [loading, setLoading] = useState(true);
  const load = useCallback(() => Promise.allSettled([
    apiGet<Me>("/v1/me").then((r) => { if (!(r as any)?.error) setMe(r); }).catch(() => {}),
    apiGet<Sub>("/v1/subscription").then((r) => { if (!(r as any)?.error) setSub(r); }).catch(() => {}),
    apiGet<{ data: unknown[] }>("/v1/members").then((r) => { if (r?.data) setMemberCount(r.data.length); }).catch(() => {}),
    apiGet<{ data: unknown[] }>("/v1/repos").then((r) => { if (r?.data) setRepoCount(r.data.length); }).catch(() => {}),
    apiGet<{ active_workers: number }>("/v1/usage").then((r) => { if (!(r as any)?.error && r) setWorkerCount(r.active_workers); }).catch(() => {}),
  ]), []);
  useEffect(() => { load().then(() => setLoading(false)); }, [load]);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function savePassword() {
    if (!pwdNew || pwdNew !== pwdConf) { setPwdMsg(t("Senhas não coincidem.", "Passwords don't match.")); setPwdOk(false); return; }
    if (pwdNew.length < 8) { setPwdMsg(t("Mínimo 8 caracteres.", "Minimum 8 characters.")); setPwdOk(false); return; }
    setPwdSaving(true);
    setPwdMsg("");
    try {
      await apiPost("/v1/me/password", { current: pwdCur, password: pwdNew });
      setPwdCur(""); setPwdNew(""); setPwdConf("");
      setPwdMsg(t("Senha atualizada.", "Password updated.")); setPwdOk(true);
    } catch { setPwdMsg(t("Erro ao atualizar.", "Error updating.")); setPwdOk(false); }
    finally { setPwdSaving(false); }
  }

  const plan = sub?.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : "Free";
  const orgInitials = (me?.org_id || "AF").slice(0, 2).toUpperCase();
  const userInitials = (me?.user_id || "RS").slice(0, 2).toUpperCase();

  const PLAN_COLOR: Record<string, [string, string, string]> = {
    Free:       ["var(--mute)",   "var(--elev)",        "var(--border)"],
    Pro:        ["var(--accent)", "var(--accent-tint)", "rgba(245,166,35,.3)"],
    Team:       ["var(--blue)",   "rgba(88,166,255,.1)", "rgba(88,166,255,.3)"],
    Enterprise: ["var(--green)",  "var(--green-tint)",  "rgba(63,185,80,.3)"],
  };
  const [planColor, planBg, planBorder] = PLAN_COLOR[plan] || PLAN_COLOR.Free;

  return (
    <Page loading={loading}>
      <PageHead eyebrow={t("Conta & cobrança", "Account & billing")} title={t("Conta", "Account")} subtitle={t("Dados da organização, cobrança e preferências.", "Organization data, billing and preferences.")} />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Row 1: Perfil ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 360px", minWidth: 300, ...sCard }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mute)" }}>{t("Perfil", "Profile")}</span>

            {/* avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
              <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                {photo ? (
                  <img src={photo} alt="avatar" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,var(--accent),var(--orange))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#1c1303" }}>
                    {userInitials}
                  </div>
                )}
                <button onClick={() => photoRef.current?.click()} title={t("Trocar foto", "Change photo")}
                  style={{ position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: "50%", border: "2px solid var(--card)", background: "var(--accent)", color: "var(--accent-ink)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </button>
                <input ref={photoRef} type="file" accept="image/*" onChange={onPickPhoto} style={{ display: "none" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => photoRef.current?.click()} style={sOutlineBtn()}>{t("Enviar foto", "Upload photo")}</button>
                  {photo && (
                    <button onClick={() => setPhoto(null)} style={sOutlineBtn(true)}>{t("Remover", "Remove")}</button>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--mute)" }}>{t("JPG ou PNG, até 2 MB.", "JPG or PNG, up to 2 MB.")}</span>
              </div>
            </div>

            {/* name + email */}
            <SepSection>
              <label style={sLabel}>
                <span style={sLabelTxt}>{t("Nome", "Name")}</span>
                <input style={sInput} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label style={sLabel}>
                <span style={sLabelTxt}>{t("E-mail", "Email")}</span>
                <input style={sInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </SepSection>

            {/* password */}
            <SepSection title={t("Alterar senha", "Change password")}>
              <label style={sLabel}>
                <span style={sLabelTxt}>{t("Senha atual", "Current password")}</span>
                <input style={sInput} type="password" placeholder="••••••••" value={pwdCur} onChange={(e) => setPwdCur(e.target.value)} />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ ...sLabel, flex: "1 1 140px" }}>
                  <span style={sLabelTxt}>{t("Nova senha", "New password")}</span>
                  <input style={sInput} type="password" placeholder={t("mín. 8 caracteres", "min. 8 characters")} value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} />
                </label>
                <label style={{ ...sLabel, flex: "1 1 140px" }}>
                  <span style={sLabelTxt}>{t("Confirmar", "Confirm")}</span>
                  <input style={sInput} type="password" placeholder={t("repita a senha", "repeat password")} value={pwdConf} onChange={(e) => setPwdConf(e.target.value)} />
                </label>
              </div>
              {pwdMsg && (
                <span style={{ fontSize: 11.5, color: pwdOk ? "var(--green)" : "var(--red)" }}>{pwdMsg}</span>
              )}
              <button onClick={savePassword} disabled={pwdSaving} style={{ ...sSaveBtn, opacity: pwdSaving ? .6 : 1 }}>
                {pwdSaving ? t("Salvando…", "Saving…") : t("Atualizar senha", "Update password")}
              </button>
            </SepSection>
          </div>
        </div>

        {/* ── Row 2: Org + (Resumo + Zona de risco) ── */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* Org card */}
          <div style={{ flex: "1 1 420px", minWidth: 300, ...sCard }}>
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <div style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 11, background: "linear-gradient(135deg,var(--accent),var(--orange))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#1c1303" }}>
                {orgInitials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>ApiFor — Núcleo</div>
                <div style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>
                  {me?.org_id || "—"} · criada em jan/2026
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: planColor, background: planBg, border: `1px solid ${planBorder}`, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>
                {plan}
              </span>
            </div>

            <SepSection>
              <label style={sLabel}>
                <span style={sLabelTxt}>{t("Nome da organização", "Organization name")}</span>
                <input style={sInput} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
              </label>
              <label style={sLabel}>
                <span style={sLabelTxt}>{t("E-mail de cobrança", "Billing email")}</span>
                <input style={sInput} type="email" value={billing} onChange={(e) => setBilling(e.target.value)} />
              </label>
              <label style={sLabel}>
                <span style={sLabelTxt}>{t("Fuso horário", "Timezone")}</span>
                <input style={sInput} value={tz} onChange={(e) => setTz(e.target.value)} />
              </label>
              <button style={sSaveBtn}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}>
                {t("Salvar alterações", "Save changes")}
              </button>
            </SepSection>
          </div>

          {/* Right column */}
          <div style={{ flex: "1 1 240px", minWidth: 220, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Resumo */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mute)" }}>{t("Resumo", "Summary")}</span>
              {[
                { label: t("Membros", "Members"),        v: memberCount },
                { label: t("Repositórios", "Repositories"), v: repoCount   },
                { label: "Workers",                        v: workerCount  },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: "var(--dim)" }}>{s.label}</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink)", fontWeight: 600 }}>
                    {s.v !== null && s.v !== undefined ? s.v : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Zona de risco */}
            <div style={{ background: "var(--card)", border: "1px solid rgba(248,81,73,.28)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--red)" }}>{t("Zona de risco", "Danger zone")}</span>
              <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.5 }}>
                {t("Encerrar a conta remove workers, segredos e histórico de forma permanente.", "Closing the account permanently removes workers, secrets and history.")}
              </span>
              <button style={{ ...sOutlineBtn(true), marginTop: 2 }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}>
                {t("Encerrar conta", "Close account")}
              </button>
            </div>

            {/* Sessão */}
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", padding: 16, display: "flex", flexDirection: "column", gap: 9 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t("Sessão", "Session")}</span>
              <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.5 }}>
                {t("Token JWT no navegador (localStorage). Sair limpa a sessão.", "JWT token in browser (localStorage). Signing out clears the session.")}
              </span>
              <button onClick={() => { setToken(null); location.href = "/login"; }}
                style={{ ...sOutlineBtn(true), marginTop: 2 }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}>
                {t("Sair da conta", "Sign out")}
              </button>
            </div>

          </div>
        </div>

      </div>
    </Page>
  );
}
