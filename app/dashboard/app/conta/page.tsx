"use client";
import { useEffect, useState } from "react";
import { apiGet, badge, btn, card, CardHead, Page, PageHead, setToken, short, useLang, useTheme } from "../ui";

type Me = { user_id: string; org_id: string; role: string };

export default function Conta() {
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
        <Row k="Usuário" v={<code style={{ color: "var(--accent)" }}>{me ? short(me.user_id, 18) : "—"}</code>} />
        <Row k="Organização" v={<code style={{ color: "var(--accent)" }}>{me ? short(me.org_id, 18) : "—"}</code>} />
        <Row k="Papel" v={<span style={badge(me?.role === "owner" ? "open" : "idle")}>{me?.role || "—"}</span>} />
      </div>

      <div style={card}>
        <CardHead title="Preferências" />
        <Row k="Tema" v={<button style={{ ...btn, background: "var(--elev)", color: "var(--ink)", padding: "5px 12px" }} onClick={toggleTheme}>{theme === "dark" ? "🌙 escuro" : "☀️ claro"}</button>} />
        <Row k="Idioma" v={
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
          <span style={{ color: "var(--mute)", fontSize: 13, flex: 1 }}>O token JWT fica no navegador (localStorage). Sair limpa a sessão.</span>
          <button style={{ ...btn, background: "var(--red-tint)", color: "var(--red)" }} onClick={() => { setToken(null); location.href = "/login"; }}>Sair</button>
        </div>
      </div>
    </Page>
  );
}
