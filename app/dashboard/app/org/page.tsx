"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, badge, btn, card, CardHead, cell, codeDim, input, Page, PageHead, setToken, tableStyle, thCell, useT } from "../ui";

type Me = { org_id: string; role: string };
type Member = { id: string; email: string; name: string; role: string; status: string };
type Workspace = { id: string; name: string; initial: string };

export default function Org() {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", org: "", mEmail: "", mPassword: "", mRole: "member", ws: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(() => {
    apiGet<Me>("/v1/me").then(setMe).catch(() => {});
    apiGet<{ data: Member[] }>("/v1/members").then((r) => setMembers(r.data || [])).catch(() => {});
    apiGet<{ data: Workspace[] }>("/v1/workspaces").then((r) => setWorkspaces(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const canManage = me?.role === "owner" || me?.role === "admin";

  async function auth() {
    const path = authMode === "login" ? "/v1/auth/login" : "/v1/auth/register";
    const r = await apiPost<{ access_token?: string }>(path, { email: f.email, password: f.password, org: f.org });
    if (r.access_token) { setToken(r.access_token); load(); }
  }
  function logout() { setToken(null); load(); }
  async function addMember() {
    if (!f.mEmail || !f.mPassword) return;
    await apiPost("/v1/members", { email: f.mEmail, password: f.mPassword, role: f.mRole });
    set("mEmail", ""); set("mPassword", ""); load();
  }
  async function removeMember(id: string) { await apiDelete(`/v1/members/${id}`); load(); }
  async function addWs() { if (!f.ws) return; await apiPost("/v1/workspaces", { name: f.ws }); set("ws", ""); load(); }

  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Organização" subtitle="Sessão, membros e workspaces." />

      <div style={card}>
        <CardHead title="Sessão" right={<span style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><span style={{ color: "var(--mute)" }}>{me?.org_id || "—"}</span><span style={badge(me?.role === "owner" ? "open" : "idle")}>{me?.role || "—"}</span></span>} />
        <div style={{ padding: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input style={{ ...input, width: 160 }} placeholder="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          <input style={{ ...input, width: 120 }} type="password" placeholder={t("senha")} value={f.password} onChange={(e) => set("password", e.target.value)} />
          {authMode === "register" && <input style={{ ...input, width: 130 }} placeholder="nome da org" value={f.org} onChange={(e) => set("org", e.target.value)} />}
          <button style={btn} onClick={auth}>{authMode === "login" ? "Entrar" : "Criar org"}</button>
          <a onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>{authMode === "login" ? "registrar" : "fazer login"}</a>
          <button style={{ ...btn, background: "var(--elev)", color: "var(--dim)" }} onClick={logout}>{t("sair")}</button>
        </div>
      </div>

      <div style={card}>
        <CardHead title="Membros" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{members.length}</span>} />
        {canManage && (
          <div style={{ padding: 16, display: "flex", gap: 10, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
            <input style={{ ...input, flex: 1, minWidth: 150 }} placeholder="email" value={f.mEmail} onChange={(e) => set("mEmail", e.target.value)} />
            <input style={{ ...input, width: 120 }} type="password" placeholder={t("senha")} value={f.mPassword} onChange={(e) => set("mPassword", e.target.value)} />
            <select style={{ ...input, width: 130 }} value={f.mRole} onChange={(e) => set("mRole", e.target.value)}>
              {["admin", "member", "billing", "viewer"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <button style={btn} onClick={addMember}>{t("Adicionar")}</button>
          </div>
        )}
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>{t("Email")}</th><th style={thCell}>{t("Papel")}</th><th style={thCell}>{t("Status")}</th><th style={{ ...thCell, textAlign: "right" }}></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={cell}>{m.email}</td>
                <td style={cell}><span style={badge(m.role === "owner" ? "open" : "idle")}>{m.role}</span></td>
                <td style={cell}>{m.status}</td>
                <td style={{ ...cell, textAlign: "right" }}>{canManage && m.role !== "owner" && <a onClick={() => removeMember(m.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>{t("remover")}</a>}</td>
              </tr>
            ))}
            {!members.length && <tr><td style={cell} colSpan={4}>{t("nenhum membro (faça login)")}</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <CardHead title="Workspaces" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{workspaces.length}</span>} />
        {canManage && (
          <div style={{ padding: 16, display: "flex", gap: 10, borderBottom: "1px solid var(--border)" }}>
            <input style={{ ...input, flex: 1 }} placeholder="nome do workspace" value={f.ws} onChange={(e) => set("ws", e.target.value)} />
            <button style={btn} onClick={addWs}>{t("Criar")}</button>
          </div>
        )}
        <table style={tableStyle}>
          <thead><tr><th style={thCell}>Workspace</th><th style={thCell}>ID</th></tr></thead>
          <tbody>
            {workspaces.map((ws) => (
              <tr key={ws.id}><td style={cell}>{ws.name}</td><td style={cell}><span style={codeDim}>{ws.id}</span></td></tr>
            ))}
            {!workspaces.length && <tr><td style={cell} colSpan={2}>{t("nenhum workspace")}</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
