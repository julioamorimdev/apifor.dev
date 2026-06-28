"use client";
import { useEffect, useState } from "react";
import { apiGet, badge, btn, card, CardHead, Page, PageHead, setToken, short, useLang, useT, useTheme } from "../ui";

type Me = { user_id: string; org_id: string; role: string };

export default function Conta() {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [theme, toggleTheme] = useTheme();
  const [lang, setLang] = useLang();
  useEffect(() => { apiGet<Me>("/v1/me").then((r) => { if (!(r as any)?.error) setMe(r); }).catch(() => {}); }, []);

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
      <span style={{ color: "var(--mute)" }}>{k}</span><span>{v}</span>
    </div>
  );

  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Conta" subtitle="Perfil, sessão e preferências." />

      <div style={card}>
        <CardHead title="Perfil" />
        <Row k={t("Usuário", "User")} v={<code style={{ color: "var(--accent)" }}>{me ? short(me.user_id, 18) : "—"}</code>} />
        <Row k={t("Organização", "Organization")} v={<code style={{ color: "var(--accent)" }}>{me ? short(me.org_id, 18) : "—"}</code>} />
        <Row k={t("Papel", "Role")} v={<span style={badge(me?.role === "owner" ? "open" : "idle")}>{me?.role || "—"}</span>} />
      </div>

      <div style={card}>
        <CardHead title="Preferências" />
        <Row k={t("Tema", "Theme")} v={<button style={{ ...btn, background: "var(--elev)", color: "var(--ink)", padding: "5px 12px" }} onClick={toggleTheme}>{theme === "dark" ? t("🌙 escuro", "🌙 dark") : t("☀️ claro", "☀️ light")}</button>} />
        <Row k={t("Idioma", "Language")} v={
          <span style={{ display: "flex", gap: 6 }}>
            {[["pt", "Português"], ["en", "English"]].map(([c, n]) => (
              <button key={c} onClick={() => setLang(c)} style={{ ...btn, padding: "5px 12px", background: lang === c ? "var(--accent)" : "var(--elev)", color: lang === c ? "var(--accent-ink)" : "var(--dim)" }}>{n}</button>
            ))}
          </span>
        } />
      </div>

      <div style={card}>
        <CardHead title="Sessão" />
        <div style={{ padding: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "var(--mute)", fontSize: 13, flex: 1 }}>{t("O token JWT fica no navegador (localStorage). Sair limpa a sessão.", "The JWT token lives in the browser (localStorage). Signing out clears the session.")}</span>
          <button style={{ ...btn, background: "var(--red-tint)", color: "var(--red)" }} onClick={() => { setToken(null); location.href = "/login"; }}>{t("Sair", "Sign out")}</button>
        </div>
      </div>
    </Page>
  );
}
