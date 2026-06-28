"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, badge, btn, card, cell, input, Page, setToken, tableStyle } from "../ui";

type Me = { org_id: string; role: string };
type Member = { id: string; email: string; name: string; role: string; status: string };
type Workspace = { id: string; name: string; initial: string };

export default function Org() {
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
      <h3 style={{ color: "var(--dim)" }}>Sessão</h3>
      <div style={{ ...card, padding: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--mute)" }}>org:</span> <code>{me?.org_id || "—"}</code>
        <span style={{ color: "var(--mute)" }}>papel:</span> <span style={badge(me?.role === "owner" ? "open" : "idle")}>{me?.role || "—"}</span>
        <span style={{ flex: 1 }} />
        <input style={{ ...input, width: 150 }} placeholder="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        <input style={{ ...input, width: 110 }} type="password" placeholder="senha" value={f.password} onChange={(e) => set("password", e.target.value)} />
        {authMode === "register" && <input style={{ ...input, width: 120 }} placeholder="nome da org" value={f.org} onChange={(e) => set("org", e.target.value)} />}
        <button style={btn} onClick={auth}>{authMode === "login" ? "Entrar" : "Criar org"}</button>
        <a onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>{authMode === "login" ? "registrar" : "fazer login"}</a>
        <button style={{ ...btn, background: "#2A2D34", color: "var(--dim)" }} onClick={logout}>sair</button>
      </div>

      <h3 style={{ color: "var(--dim)" }}>Membros</h3>
      {canManage && (
        <div style={{ ...card, padding: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input style={{ ...input, flex: 1, minWidth: 150 }} placeholder="email" value={f.mEmail} onChange={(e) => set("mEmail", e.target.value)} />
          <input style={{ ...input, width: 120 }} type="password" placeholder="senha" value={f.mPassword} onChange={(e) => set("mPassword", e.target.value)} />
          <select style={{ ...input, width: 130 }} value={f.mRole} onChange={(e) => set("mRole", e.target.value)}>
            {["admin", "member", "billing", "viewer"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button style={btn} onClick={addMember}>Adicionar</button>
        </div>
      )}
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>email</th><th style={cell}>papel</th><th style={cell}>status</th><th style={cell}></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td style={cell}>{m.email}</td>
                <td style={cell}><span style={badge(m.role === "owner" ? "open" : "idle")}>{m.role}</span></td>
                <td style={cell}>{m.status}</td>
                <td style={cell}>{canManage && m.role !== "owner" && <a onClick={() => removeMember(m.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>remover</a>}</td>
              </tr>
            ))}
            {!members.length && <tr><td style={cell} colSpan={4}>nenhum membro (faça login)</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: "var(--dim)" }}>Workspaces</h3>
      {canManage && (
        <div style={{ ...card, padding: 16, display: "flex", gap: 10 }}>
          <input style={{ ...input, flex: 1 }} placeholder="nome do workspace" value={f.ws} onChange={(e) => set("ws", e.target.value)} />
          <button style={btn} onClick={addWs}>Criar</button>
        </div>
      )}
      <div style={card}>
        <table style={tableStyle}>
          <thead><tr><th style={cell}>workspace</th><th style={cell}>id</th></tr></thead>
          <tbody>
            {workspaces.map((ws) => (
              <tr key={ws.id}><td style={cell}>{ws.name}</td><td style={cell}><code style={{ fontSize: 12 }}>{ws.id}</code></td></tr>
            ))}
            {!workspaces.length && <tr><td style={cell} colSpan={2}>nenhum workspace</td></tr>}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
