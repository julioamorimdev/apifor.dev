"use client";
import { useState } from "react";
import { apiPost, btn, card, input, setToken, useT } from "../ui";

export default function Login() {
  const t = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", org: "" });
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setErr("");
    const path = mode === "login" ? "/v1/auth/login" : "/v1/auth/register";
    const r = await apiPost<{ access_token?: string; error?: { message: string } }>(path, { email: f.email, password: f.password, org: f.org });
    if (r.access_token) { setToken(r.access_token); location.href = "/"; }
    else setErr(r.error?.message || t("falha na autenticação", "authentication failed"));
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...card, width: 380, maxWidth: "92vw", padding: 28, marginBottom: 0 }}>
        <div style={{ fontFamily: "var(--head)", fontWeight: 900, fontSize: 26, letterSpacing: "-.03em", marginBottom: 4 }}>
          apifor<span style={{ color: "var(--accent)" }}>.</span><span style={{ fontSize: 13, color: "var(--accent)", marginLeft: 5, letterSpacing: ".14em" }}>DEV</span>
        </div>
        <div style={{ color: "var(--mute)", fontSize: 13, marginBottom: 22 }}>{mode === "login" ? t("Entre na sua organização", "Sign in to your organization") : t("Crie sua organização", "Create your organization")}</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input style={input} placeholder={t("email", "email")} value={f.email} onChange={(e) => set("email", e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <input style={input} type="password" placeholder={t("senha", "password")} value={f.password} onChange={(e) => set("password", e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {mode === "register" && <input style={input} placeholder={t("nome da organização", "organization name")} value={f.org} onChange={(e) => set("org", e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />}
          <button style={{ ...btn, width: "100%", marginTop: 4 }} onClick={submit}>{mode === "login" ? t("Entrar", "Sign in") : t("Criar organização", "Create organization")}</button>
        </div>

        {err && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{err}</div>}

        <div style={{ marginTop: 18, fontSize: 13, color: "var(--mute)", textAlign: "center" }}>
          {mode === "login" ? t("Não tem conta?", "No account?") : t("Já tem conta?", "Have an account?")}{" "}
          <a onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }} style={{ color: "var(--blue)", cursor: "pointer" }}>{mode === "login" ? t("criar org", "create org") : t("fazer login", "sign in")}</a>
        </div>
      </div>
    </div>
  );
}
