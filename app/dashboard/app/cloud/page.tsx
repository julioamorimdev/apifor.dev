"use client";
import { useState } from "react";
import { btn, input, Modal, Page, PageHead } from "../ui";

type CloudNode = {
  id: string; region: string; specs: string; type: string;
  workers: number; cpuPct: number; memPct: number;
  status: "ativo" | "escalando" | "ocioso"; pinned: boolean; paused: boolean;
};
type CloudRegion = {
  code: string; city: string; status: "operacional" | "degradado" | "manutenção";
  nodes: number; lat: string;
};

const INIT_NODES: CloudNode[] = [
  { id: "cld-1a2b3c", region: "sa-east-1", specs: "4 vCPU · 8 GB",  type: "standard",  workers: 3, cpuPct: 68, memPct: 54, status: "ativo",    pinned: true,  paused: false },
  { id: "cld-4d5e6f", region: "sa-east-1", specs: "2 vCPU · 4 GB",  type: "standard",  workers: 1, cpuPct: 22, memPct: 31, status: "ocioso",   pinned: false, paused: false },
  { id: "cld-7g8h9i", region: "us-east-1", specs: "8 vCPU · 16 GB", type: "compute",   workers: 5, cpuPct: 91, memPct: 72, status: "escalando", pinned: false, paused: false },
  { id: "cld-0j1k2l", region: "us-east-1", specs: "4 vCPU · 8 GB",  type: "standard",  workers: 4, cpuPct: 55, memPct: 48, status: "ativo",    pinned: true,  paused: false },
  { id: "cld-3m4n5o", region: "eu-west-1", specs: "2 vCPU · 4 GB",  type: "standard",  workers: 0, cpuPct: 4,  memPct: 9,  status: "ocioso",   pinned: false, paused: true  },
  { id: "cld-6p7q8r", region: "eu-west-1", specs: "16 vCPU · 32 GB",type: "memory",    workers: 8, cpuPct: 43, memPct: 85, status: "ativo",    pinned: false, paused: false },
  { id: "cld-9s0t1u", region: "us-west-2", specs: "4 vCPU · 8 GB",  type: "compute",   workers: 2, cpuPct: 37, memPct: 28, status: "ativo",    pinned: false, paused: false },
];

const REGIONS: CloudRegion[] = [
  { code: "sa-east-1", city: "São Paulo, Brasil",    status: "operacional", nodes: 2, lat: "12 ms"  },
  { code: "us-east-1", city: "N. Virginia, EUA",     status: "operacional", nodes: 2, lat: "98 ms"  },
  { code: "eu-west-1", city: "Irlanda, Europa",      status: "degradado",   nodes: 2, lat: "214 ms" },
  { code: "us-west-2", city: "Oregon, EUA",          status: "operacional", nodes: 1, lat: "173 ms" },
];

const STATUS_COLOR: Record<string, [string, string]> = {
  ativo:     ["var(--green)",  "var(--green-tint)"],
  escalando: ["var(--orange)", "var(--orange-tint,rgba(240,136,62,.15))"],
  ocioso:    ["var(--mute)",   "var(--elev)"],
};
const REGION_STATUS_COLOR: Record<string, [string, string]> = {
  operacional: ["var(--green)",  "var(--green-tint)"],
  degradado:   ["var(--orange)", "var(--orange-tint,rgba(240,136,62,.15))"],
  manutenção:  ["var(--red)",    "var(--red-tint)"],
};

const PAGE_SIZE = 5;
const REGION_OPTS = ["todas", "sa-east-1", "us-east-1", "eu-west-1", "us-west-2"];
const STATUS_OPTS: { k: "todos"|"ativo"|"escalando"|"ocioso"; l: string }[] = [
  { k: "todos", l: "Todos" }, { k: "ativo", l: "Ativos" },
  { k: "escalando", l: "Escalando" }, { k: "ocioso", l: "Ociosos" },
];

const sCard: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13,
  boxShadow: "var(--shadow)", overflow: "hidden",
};
const sPill = (active: boolean): React.CSSProperties => ({
  padding: "4px 11px", borderRadius: 6, border: "none", fontSize: 12,
  fontWeight: active ? 600 : 500, cursor: "pointer",
  background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
});
const sFilledBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 15px",
  borderRadius: 9, border: "none", background: "var(--accent)", color: "var(--accent-ink)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "var(--shadow)", whiteSpace: "nowrap",
};
const sIconBtn = (del?: boolean): React.CSSProperties => ({
  width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 7, cursor: "pointer", flexShrink: 0,
  border: del ? "1px solid rgba(248,81,73,.4)" : "1px solid var(--border)",
  background: del ? "var(--red-tint)" : "transparent",
  color: del ? "var(--red)" : "var(--dim)",
});
const sThCell: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase",
  color: "var(--mute)",
};
const sFieldLabel: React.CSSProperties = { fontSize: 11.5, fontWeight: 500, color: "var(--dim)" };

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: 48, height: 6, borderRadius: 3, background: "var(--bg)", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const [color, bg] = STATUS_COLOR[status] || ["var(--mute)", "var(--elev)"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, color, background: bg, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {status}
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

const fieldStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", borderRadius: 9, border: "1px solid var(--border)",
  background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 13, outline: "none",
};

export default function Cloud() {
  const [nodes, setNodes] = useState<CloudNode[]>(INIT_NODES);
  const [q, setQ]         = useState("");
  const [region, setRegion] = useState("todas");
  const [status, setStatus] = useState<"todos"|"ativo"|"escalando"|"ocioso">("todos");
  const [page, setPage]   = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [nf, setNf]       = useState({ region: "sa-east-1", type: "standard", minW: "1", maxW: "4" });
  const setN = (k: string, v: string) => setNf((p) => ({ ...p, [k]: v }));
  const [creating, setCreating] = useState(false);

  const filtered = nodes
    .filter((n) => region === "todas" || n.region === region)
    .filter((n) => status === "todos" || n.status === status)
    .filter((n) => !q || n.id.includes(q) || n.region.includes(q) || n.specs.toLowerCase().includes(q));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const rows       = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const totalInst  = nodes.length;
  const totalVcpu  = nodes.reduce((s, n) => s + parseInt(n.specs), 0);
  const totalWork  = nodes.filter((n) => !n.paused).reduce((s, n) => s + n.workers, 0);
  const costPerH   = (totalVcpu * 0.048).toFixed(2);

  const togglePause = (id: string) => setNodes((p) => p.map((n) => n.id === id ? { ...n, paused: !n.paused } : n));
  const delNode     = (id: string) => { setNodes((p) => p.filter((n) => n.id !== id)); };

  async function createNode() {
    setCreating(true);
    await new Promise((r) => setTimeout(r, 600));
    const id = "cld-" + Math.random().toString(36).slice(2, 8);
    const node: CloudNode = {
      id, region: nf.region, specs: nf.type === "memory" ? "8 vCPU · 32 GB" : nf.type === "compute" ? "8 vCPU · 16 GB" : "4 vCPU · 8 GB",
      type: nf.type, workers: 0, cpuPct: 0, memPct: 0, status: "ocioso", pinned: false, paused: false,
    };
    setNodes((p) => [node, ...p]);
    setCreating(false);
    setNewOpen(false);
    setNf({ region: "sa-east-1", type: "standard", minW: "1", maxW: "4" });
  }

  return (
    <Page>
      <PageHead
        eyebrow="Sistema"
        title="Cloud"
        subtitle="Infraestrutura onde os workers são executados — regiões, instâncias e capacidade."
        right={
          <button style={sFilledBtn} onClick={() => setNewOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Nova instância
          </button>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── KPI cards ── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Instâncias ativas",   value: String(totalInst),         color: "var(--ink)"   },
          { label: "vCPUs provisionadas", value: String(totalVcpu),          color: "var(--ink)"   },
          { label: "Custo estimado/h",    value: "$" + costPerH,             color: "var(--accent)"},
          { label: "Disponibilidade 30d", value: "99,95%",                   color: "var(--green)" },
        ].map((c) => (
          <div key={c.label}
            style={{ flex: "1 1 160px", minWidth: 150, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 5 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2,var(--border))"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
            <span style={{ fontSize: 11, color: "var(--mute)", fontWeight: 500 }}>{c.label}</span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* ── Regiões ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mute)" }}>Regiões</span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {REGIONS.map((r) => {
            const [rc, rbg] = REGION_STATUS_COLOR[r.status];
            return (
              <div key={r.code}
                style={{ flex: "1 1 220px", minWidth: 200, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2,var(--border))"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{r.code}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: rc }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: rc, flexShrink: 0 }} />
                    {r.status}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{r.city}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 18, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--mute)" }}>Instâncias</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.nodes}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--mute)" }}>Latência</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{r.lat}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Instances table ── */}
      <div style={sCard}>
        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flex: 1, minWidth: 150 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar instância…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 12.5 }} />
          </div>
          <select value={region} onChange={(e) => { setRegion(e.target.value); setPage(0); }}
            style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12, cursor: "pointer" }}>
            {REGION_OPTS.map((r) => <option key={r} value={r}>{r === "todas" ? "Todas as regiões" : r}</option>)}
          </select>
          <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "wrap" }}>
            {STATUS_OPTS.map((s) => (
              <button key={s.k} onClick={() => { setStatus(s.k); setPage(0); }} style={sPill(status === s.k)}>{s.l}</button>
            ))}
          </div>
        </div>

        {/* column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto auto auto", gap: 0, ...sThCell, padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
          <span>Instância</span>
          <span style={{ padding: "0 12px" }}>Tipo</span>
          <span style={{ padding: "0 12px" }}>Workers</span>
          <span style={{ padding: "0 12px" }}>CPU</span>
          <span style={{ padding: "0 12px" }}>Memória</span>
          <span style={{ textAlign: "right", width: 96 }}>Estado</span>
          <span style={{ textAlign: "right", width: 100 }}>Ações</span>
        </div>

        {/* rows */}
        {rows.map((n) => {
          const cpuBar = n.cpuPct > 80 ? "var(--red)" : n.cpuPct > 60 ? "var(--orange)" : "var(--accent)";
          const memBar = n.memPct > 80 ? "var(--red)" : n.memPct > 60 ? "var(--orange)" : "var(--blue)";
          return (
            <div key={n.id}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto auto auto", alignItems: "center", gap: 0, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
              {/* id + pinned + region */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--accent)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.id}</span>
                  {n.pinned && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, padding: "1px 6px 1px 5px", borderRadius: 999, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--accent)", fontSize: 9, fontWeight: 700, letterSpacing: ".02em", textTransform: "uppercase" }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 10.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.5l2 2.5H7l2-2.5Z"/></svg>
                      fixado
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mute)" }}>{n.region} · {n.specs}</span>
              </div>
              {/* type */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)", padding: "0 12px", whiteSpace: "nowrap" }}>{n.type}</span>
              {/* workers */}
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", padding: "0 12px", whiteSpace: "nowrap" }}>{n.workers}</span>
              {/* cpu */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 12px" }}>
                <Bar pct={n.cpuPct} color={cpuBar} />
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", width: 34 }}>{n.cpuPct}%</span>
              </span>
              {/* mem */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "0 12px" }}>
                <Bar pct={n.memPct} color={memBar} />
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--dim)", width: 34 }}>{n.memPct}%</span>
              </span>
              {/* status */}
              <span style={{ display: "flex", justifyContent: "flex-end", width: 96 }}>
                {n.paused ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "var(--mute)", background: "var(--elev)", whiteSpace: "nowrap" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mute)", flexShrink: 0 }} />pausada
                  </span>
                ) : <StatusPill status={n.status} />}
              </span>
              {/* actions */}
              <span style={{ display: "flex", justifyContent: "flex-end", gap: 5, width: 100 }}>
                <button title={n.paused ? "Retomar" : "Pausar"} style={sIconBtn()} onClick={() => togglePause(n.id)}>
                  {n.paused ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                  )}
                </button>
                <button title="Editar" style={sIconBtn()}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </button>
                <button title="Excluir" style={sIconBtn(true)} onClick={() => delNode(n.id)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                </button>
              </span>
            </div>
          );
        })}

        {/* empty */}
        {rows.length === 0 && (
          <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--mute)", fontSize: 13 }}>
            nenhuma instância
          </div>
        )}

        {/* pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} instância(s)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              </NavBtn>
              <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </NavBtn>
            </div>
          </div>
        )}

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 16px", borderTop: totalPages > 1 ? "none" : "1px solid var(--border)" }}>
          <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{nodes.length} instâncias · {totalWork} workers em uso</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />
            Autoescala ativa
          </span>
        </div>
      </div>

      </div>{/* end flex-column gap-16 */}

      {/* ── Nova instância modal ── */}
      {newOpen && (
        <Modal title="Nova instância" onClose={() => setNewOpen(false)}
          footer={<>
            <button onClick={() => setNewOpen(false)} style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button onClick={createNode} disabled={creating} style={{ ...btn, opacity: creating ? .6 : 1 }}>{creating ? "Criando…" : "Criar instância"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={sFieldLabel}>Região</span>
              <select style={{ ...fieldStyle }} value={nf.region} onChange={(e) => setN("region", e.target.value)}>
                <option value="sa-east-1">sa-east-1 — São Paulo</option>
                <option value="us-east-1">us-east-1 — N. Virginia</option>
                <option value="eu-west-1">eu-west-1 — Irlanda</option>
                <option value="us-west-2">us-west-2 — Oregon</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={sFieldLabel}>Tipo de instância</span>
              <select style={{ ...fieldStyle }} value={nf.type} onChange={(e) => setN("type", e.target.value)}>
                <option value="standard">Standard — 4 vCPU · 8 GB</option>
                <option value="compute">Compute-optimized — 8 vCPU · 16 GB</option>
                <option value="memory">Memory-optimized — 8 vCPU · 32 GB</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                <span style={sFieldLabel}>Workers mínimos</span>
                <input type="number" min="0" max="16" style={{ ...fieldStyle, width: "100%" }} value={nf.minW} onChange={(e) => setN("minW", e.target.value)} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                <span style={sFieldLabel}>Workers máximos</span>
                <input type="number" min="1" max="32" style={{ ...fieldStyle, width: "100%" }} value={nf.maxW} onChange={(e) => setN("maxW", e.target.value)} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, color: "var(--mute)", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 9, padding: "10px 12px" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
              Instâncias são cobradas por vCPU/hora de uso efetivo. O autoescala mantém o mínimo idle e sobe até o máximo conforme a fila cresce.
            </div>
          </div>
        </Modal>
      )}
    </Page>
  );
}
