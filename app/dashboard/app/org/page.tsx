"use client";
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, badge, btn, card, CardHead, codeDim, input, Modal, Page, PageHead, Pills, setToken, useT } from "../ui";

type Me = { org_id: string; role: string };
type Member = { id: string; email: string; name: string; role: string; status: string };
type Workspace = { id: string; name: string; initial: string };

const AV = ["--blue", "--green", "--orange", "--accent", "--red"];
const avColor = (s: string) => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
const initials = (m: Member) => (m.name || m.email).slice(0, 2).toUpperCase();
const FILTERS: [string, string][] = [["all", "Todos"], ["admin", "Admin"], ["member", "Membro"], ["billing", "Billing"], ["viewer", "Viewer"]];

export default function Org() {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [invite, setInvite] = useState(false);
  const [rf, setRf] = useState("all");
  const [f, setF] = useState({ email: "", password: "", org: "", mEmail: "", mPassword: "", mRole: "member", ws: "" });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(() => {
    apiGet<Me>("/v1/me").then((r) => { if (!(r as any)?.error) setMe(r); }).catch(() => {});
    apiGet<{ data: Member[] }>("/v1/members").then((r) => setMembers(r.data || [])).catch(() => {});
    apiGet<{ data: Workspace[] }>("/v1/workspaces").then((r) => setWorkspaces(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const canManage = me?.role === "owner" || me?.role === "admin";
  const admins = members.filter((m) => m.role === "owner" || m.role === "admin").length;
  const rows = members.filter((m) => rf === "all" || m.role === rf);

  async function auth() {
    const path = authMode === "login" ? "/v1/auth/login" : "/v1/auth/register";
    const r = await apiPost<{ access_token?: string }>(path, { email: f.email, password: f.password, org: f.org });
    if (r.access_token) { setToken(r.access_token); load(); }
  }
  async function addMember() {
    if (!f.mEmail || !f.mPassword) return;
    await apiPost("/v1/members", { email: f.mEmail, password: f.mPassword, role: f.mRole });
    set("mEmail", ""); set("mPassword", ""); setInvite(false); load();
  }
  async function removeMember(id: string) { await apiDelete(`/v1/members/${id}`); load(); }
  async function addWs() { if (!f.ws) return; await apiPost("/v1/workspaces", { name: f.ws }); set("ws", ""); load(); }

  return (
    <Page>
      <PageHead eyebrow="Conta & cobrança" title="Organização" subtitle="Membros, papéis e workspaces."
        right={canManage ? <button style={btn} onClick={() => setInvite(true)}>+ {t("Convidar membro", "Invite member")}</button> : undefined} />

      {/* banner da org */}
      <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent)", color: "var(--accent-ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontFamily: "var(--head)" }}>{(me?.org_id || "OR").slice(4, 6).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 16 }}>{me ? "Org " + me.org_id.slice(0, 12) : "—"}</div>
          <div style={codeDim}>{me?.org_id || "—"}</div>
        </div>
        {[[members.length, t("Membros", "Members")], [admins, "Admins"], [workspaces.length, "Workspaces"]].map(([v, l], i) => (
          <div key={i} style={{ textAlign: "center", minWidth: 70 }}>
            <div style={{ fontFamily: "var(--head)", fontWeight: 800, fontSize: 20 }}>{v as number}</div>
            <div style={{ color: "var(--mute)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{l as string}</div>
          </div>
        ))}
      </div>

      {!me?.role && (
        <div style={card}>
          <CardHead title="Sessão" />
          <div style={{ padding: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...input, width: 160 }} placeholder={t("email")} value={f.email} onChange={(e) => set("email", e.target.value)} />
            <input style={{ ...input, width: 120 }} type="password" placeholder={t("senha")} value={f.password} onChange={(e) => set("password", e.target.value)} />
            {authMode === "register" && <input style={{ ...input, width: 130 }} placeholder={t("nome da org", "org name")} value={f.org} onChange={(e) => set("org", e.target.value)} />}
            <button style={btn} onClick={auth}>{authMode === "login" ? t("Entrar") : t("Criar org", "Create org")}</button>
            <a onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} style={{ color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>{authMode === "login" ? t("registrar") : t("fazer login")}</a>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <b style={{ fontFamily: "var(--head)", fontSize: 13.5 }}>{t("Membros", "Members")}</b>
          <span style={{ flex: 1 }} />
          <Pills options={FILTERS} value={rf} onChange={setRf} />
        </div>
        {rows.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ width: 32, height: 32, borderRadius: 32, background: `var(${avColor(m.id)}-tint)`, color: `var(${avColor(m.id)})`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{initials(m)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name || m.email.split("@")[0]}</div>
              <div style={codeDim}>{m.email}</div>
            </div>
            <span style={badge(m.role === "owner" ? "open" : "idle")}>{m.role}</span>
            {me?.role === "owner" && m.role !== "owner" && <a onClick={() => removeMember(m.id)} style={{ color: "var(--red)", cursor: "pointer", fontSize: 13 }}>{t("remover")}</a>}
          </div>
        ))}
        {!rows.length && <div style={{ padding: 18, color: "var(--mute)" }}>{t("nenhum membro (faça login)")}</div>}
      </div>

      <div style={card}>
        <CardHead title="Workspaces" right={<span style={{ color: "var(--mute)", fontSize: 13 }}>{workspaces.length}</span>} />
        {canManage && (
          <div style={{ padding: 16, display: "flex", gap: 10, borderBottom: "1px solid var(--border)" }}>
            <input style={{ ...input, flex: 1 }} placeholder={t("nome do workspace", "workspace name")} value={f.ws} onChange={(e) => set("ws", e.target.value)} />
            <button style={btn} onClick={addWs}>{t("Criar")}</button>
          </div>
        )}
        {workspaces.map((ws) => (
          <div key={ws.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent-tint)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>{ws.initial}</span>
            <span style={{ flex: 1 }}>{ws.name}</span>
            <span style={codeDim}>{ws.id}</span>
          </div>
        ))}
        {!workspaces.length && <div style={{ padding: 18, color: "var(--mute)" }}>{t("nenhum workspace")}</div>}
      </div>

      {invite && (
        <Modal title="Convidar membro" onClose={() => setInvite(false)}
          footer={<><button style={{ ...btn, background: "var(--elev)", color: "var(--dim)" }} onClick={() => setInvite(false)}>{t("Cancelar", "Cancel")}</button><button style={btn} onClick={addMember}>{t("Adicionar")}</button></>}>
          <div style={{ display: "grid", gap: 10 }}>
            <input style={input} placeholder={t("email")} value={f.mEmail} onChange={(e) => set("mEmail", e.target.value)} />
            <input style={input} type="password" placeholder={t("senha")} value={f.mPassword} onChange={(e) => set("mPassword", e.target.value)} />
            <select style={input} value={f.mRole} onChange={(e) => set("mRole", e.target.value)}>
              {["admin", "member", "billing", "viewer"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </Modal>
      )}

      <div style={{ height: 8 }} />
      <button style={{ ...btn, background: "var(--elev)", color: "var(--dim)" }} onClick={() => { setToken(null); load(); }}>{t("sair")}</button>
    </Page>
  );
}
