"use client";
import { useEffect, useState, useRef } from "react";
import { apiDelete, apiPost, btn, input, Modal, Page, PageHead, short, usePoll } from "../ui";

type Memory = { id: string; scope: string; repo_id: string; instruction: string; source: string };
type KBDoc  = { id: string; name: string; category: string; file_ref: string; indexed: boolean; size?: number; content?: string };
type Repo   = { id: string; name: string };

const PAGE_SIZE = 20;

const CATEGORIES = ["Manual", "Especificação", "API", "Guia", "Referência", "Anotação", "Outro"];
const SCOPES     = ["global", "repo"];

const sCard: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--shadow)", overflow: "hidden" };
const sTabBtn = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 2px",
  border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5,
  fontWeight: active ? 600 : 500, color: active ? "var(--ink)" : "var(--dim)",
  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
  marginBottom: -1, whiteSpace: "nowrap",
});
const sFilledBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--accent-ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const sOutlineBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const sPill = (active: boolean): React.CSSProperties => ({
  padding: "4px 11px", borderRadius: 6, border: "none", fontSize: 12.5,
  fontWeight: active ? 600 : 500, cursor: "pointer",
  background: active ? "var(--card)" : "transparent",
  color: active ? "var(--ink)" : "var(--dim)",
  boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
});

function catColor(c: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    "Manual":       ["var(--blue-tint,rgba(88,166,255,.12))",  "var(--blue)"],
    "Especificação":["var(--accent-tint)",                      "var(--accent)"],
    "API":          ["var(--green-tint)",                       "var(--green)"],
    "Guia":         ["var(--orange-tint,rgba(255,166,0,.12))",  "var(--orange)"],
    "Referência":   ["var(--elev)",                             "var(--dim)"],
    "Anotação":     ["var(--red-tint)",                         "var(--red)"],
  };
  const [bg, col] = map[c] || ["var(--elev)", "var(--dim)"];
  return { display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 5, background: bg, color: col };
}

function DocIcon({ name, size = 32 }: { name: string; size?: number }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconMap: Record<string, [string, string]> = {
    pdf:  ["var(--red-tint)",         "var(--red)"],
    md:   ["var(--accent-tint)",      "var(--accent)"],
    txt:  ["var(--elev)",             "var(--dim)"],
    ts:   ["var(--blue-tint,rgba(88,166,255,.12))",  "var(--blue)"],
    js:   ["var(--accent-tint)",      "var(--accent)"],
    json: ["var(--green-tint)",       "var(--green)"],
    yaml: ["var(--orange-tint,rgba(255,166,0,.12))", "var(--orange)"],
  };
  const [bg, col] = iconMap[ext] || ["var(--elev)", "var(--dim)"];
  return (
    <span style={{ width: size, height: size, flexShrink: 0, borderRadius: size * 0.25, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: col }}>
      {ext === "pdf" ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M10 13c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/></svg>
      ) : ext === "md" ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 9l9-6 9 6"/></svg>
      ) : (["ts","js","json","yaml"].includes(ext)) ? (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l-3 3 3 3M16 9l3 3-3 3"/></svg>
      ) : (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M9 13h6M9 17h4"/></svg>
      )}
    </span>
  );
}

function fmtSize(bytes?: number) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function NavBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: disabled ? "var(--border)" : "var(--dim)", cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

export default function Knowledge() {
  const { data: memories, reload: reloadMem } = usePoll<Memory[]>("/v1/memories", 3000);
  const { data: kbRaw,    reload: reloadKB }  = usePoll<KBDoc[]>("/v1/kb-documents", 3000);
  const { data: repos }                        = usePoll<Repo[]>("/v1/repos", 5000);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (memories !== undefined) setLoading(false); }, [memories]);

  const [tab,    setTab]    = useState<"docs"|"mem">("docs");
  const [catFilter, setCatFilter] = useState("todos");
  const [q, setQ]           = useState("");
  const [page, setPage]     = useState(0);

  // local docs (written inline) — merged with backend
  const [localDocs, setLocalDocs] = useState<KBDoc[]>([]);
  const allDocs = [...(kbRaw || []), ...localDocs];

  // memory form
  const [mf, setMf] = useState({ scope: "global", repo: "", instr: "" });
  const setM = (k: string, v: string) => setMf((p) => ({ ...p, [k]: v }));

  // write doc modal
  const [writeOpen, setWriteOpen] = useState(false);
  const [wd, setWd]               = useState({ title: "", category: "Anotação", content: "" });
  const [saving, setSaving]       = useState(false);

  // preview modal
  const [preview, setPreview] = useState<KBDoc | null>(null);

  // file import ref
  const fileRef = useRef<HTMLInputElement>(null);

  async function addMem() {
    if (!mf.instr.trim()) return;
    await apiPost("/v1/memories", { scope: mf.scope, repo_id: mf.repo || undefined, instruction: mf.instr });
    setM("instr", ""); reloadMem();
  }
  const delMem = async (id: string) => { await apiDelete(`/v1/memories/${id}`); reloadMem(); };

  async function saveDoc() {
    if (!wd.title.trim() || !wd.content.trim()) return;
    setSaving(true);
    try {
      const res = await apiPost("/v1/kb-documents", { name: wd.title + ".md", category: wd.category, content: wd.content, file_ref: "inline" });
      if ((res as any)?.id) {
        reloadKB();
      } else {
        // backend may not support POST yet — store locally
        const local: KBDoc = { id: "local-" + Date.now(), name: wd.title + ".md", category: wd.category, file_ref: "inline", indexed: false, content: wd.content, size: new TextEncoder().encode(wd.content).length };
        setLocalDocs((p) => [local, ...p]);
      }
      setWd({ title: "", category: "Anotação", content: "" });
      setWriteOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      const local: KBDoc = { id: "local-" + Date.now(), name: file.name, category: "Importado", file_ref: file.name, indexed: false, content, size: file.size };
      setLocalDocs((p) => [local, ...p]);
      // try posting to backend
      await apiPost("/v1/kb-documents", { name: file.name, category: "Importado", content, file_ref: file.name }).catch(() => {});
      reloadKB();
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const delDoc = async (d: KBDoc) => {
    if (d.id.startsWith("local-")) {
      setLocalDocs((p) => p.filter((x) => x.id !== d.id));
    } else {
      await apiDelete(`/v1/kb-documents/${d.id}`); reloadKB();
    }
  };

  // filter docs
  const filtered = allDocs
    .filter((d) => catFilter === "todos" || d.category === catFilter)
    .filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || (d.content || "").toLowerCase().includes(q.toLowerCase()));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const docsPage   = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const cats = ["todos", ...CATEGORIES];
  const memList = memories || [];

  return (
    <Page loading={loading}>
      <PageHead eyebrow="Conhecimento & IA" title="Base de Conhecimento"
        subtitle="Documentos e instruções injetados nos agentes durante o planejamento e execução."
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button style={sOutlineBtn} onClick={() => fileRef.current?.click()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12"/></svg>
              Importar arquivo
              <input ref={fileRef} type="file" accept=".md,.txt,.pdf,.ts,.js,.json,.yaml,.yml,.csv" style={{ display: "none" }} onChange={handleFileImport} />
            </button>
            <button style={sFilledBtn} onClick={() => setWriteOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              Novo documento
            </button>
          </div>
        }
      />

      {/* ── tab bar ── */}
      <div style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--border)", marginBottom: 18 }}>
        <button onClick={() => setTab("docs")} style={sTabBtn(tab === "docs")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          Documentos
          {allDocs.length > 0 && <span style={{ fontFamily: "var(--mono)", fontSize: 11, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px", color: "var(--dim)" }}>{allDocs.length}</span>}
        </button>
        <button onClick={() => setTab("mem")} style={sTabBtn(tab === "mem")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/>
          </svg>
          Memórias
          {memList.length > 0 && <span style={{ fontFamily: "var(--mono)", fontSize: 11, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px", color: "var(--dim)" }}>{memList.length}</span>}
        </button>
      </div>

      {/* ═══════ DOCS TAB ═══════ */}
      {tab === "docs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 11px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, flex: 1, minWidth: 200 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar documentos…" style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--ink)", font: "inherit", fontSize: 13 }} />
            </div>
            {/* category filter pills */}
            <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, flexWrap: "wrap" }}>
              {cats.map((c) => (
                <button key={c} onClick={() => { setCatFilter(c); setPage(0); }} style={sPill(catFilter === c)}>
                  {c === "todos" ? "Todos" : c}
                </button>
              ))}
            </div>
          </div>

          {/* doc list */}
          {docsPage.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {docsPage.map((d) => {
                const sz = fmtSize(d.size);
                return (
                  <div key={d.id}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", flexWrap: "wrap" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-2,var(--border))"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                    <DocIcon name={d.name} size={38} />
                    <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{d.name}</span>
                        <span style={catColor(d.category)}>{d.category}</span>
                        {d.indexed && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--green)", background: "var(--green-tint)", borderRadius: 5, padding: "2px 6px", fontWeight: 600 }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)" }} />indexado
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {sz && <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{sz}</span>}
                        {d.file_ref && d.file_ref !== "inline" && <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{short(d.file_ref, 40)}</span>}
                        {d.content && <span style={{ fontSize: 11.5, color: "var(--mute)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>{d.content.slice(0, 80).replace(/\n/g, " ")}…</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {d.content && (
                        <button onClick={() => setPreview(d)} title="Visualizar" style={{ height: 32, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
                          Ver
                        </button>
                      )}
                      <button onClick={() => delDoc(d)} title="Remover" style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* empty state */
            <div style={{ ...sCard, padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <span style={{ width: 52, height: 52, borderRadius: 14, background: "var(--elev)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>Base vazia</span>
                <span style={{ fontSize: 13, color: "var(--mute)", maxWidth: 340, lineHeight: 1.55 }}>Importe manuais, especificações e docs ou escreva um documento novo — os agentes consultam tudo aqui durante as tarefas.</span>
              </div>
              <div style={{ display: "flex", gap: 9 }}>
                <button style={sOutlineBtn} onClick={() => fileRef.current?.click()}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5-5 5 5M12 5v12"/></svg>
                  Importar arquivo
                </button>
                <button style={sFilledBtn} onClick={() => setWriteOpen(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                  Escrever
                </button>
              </div>
            </div>
          )}

          {/* pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 4px" }}>
              <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{filtered.length} documento(s)</span>
              <div style={{ display: "flex", gap: 6 }}>
                <NavBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </NavBtn>
                <span style={{ fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center" }}>{safePage + 1} / {totalPages}</span>
                <NavBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </NavBtn>
              </div>
            </div>
          )}

          {/* info note */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 11.5, color: "var(--mute)", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 10, padding: "12px 15px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
            <span>Documentos são injetados no contexto dos agentes durante planejamento e execução. Formatos suportados: <b>.md · .txt · .ts · .js · .json · .yaml · .csv · .pdf</b>. Arquivos binários (PDF) ficam indexados para busca semântica quando disponível.</span>
          </div>
        </div>
      )}

      {/* ═══════ MEMORIES TAB ═══════ */}
      {tab === "mem" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* add form */}
          <div style={sCard}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--ink)", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/></svg>
              Nova instrução de memória
            </div>
            <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer", minWidth: 120 }}
                  value={mf.scope} onChange={(e) => setM("scope", e.target.value)}>
                  {SCOPES.map((s) => <option key={s} value={s}>{s === "global" ? "Global (todos os workers)" : "Repositório específico"}</option>)}
                </select>
                {mf.scope === "repo" && (
                  <select style={{ height: 36, padding: "0 11px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", font: "inherit", fontSize: 12.5, cursor: "pointer", minWidth: 160 }}
                    value={mf.repo} onChange={(e) => setM("repo", e.target.value)}>
                    <option value="">(escolha o repositório)</option>
                    {(repos || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <input style={{ ...input, flex: 1 }} value={mf.instr} onChange={(e) => setM("instr", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addMem(); } }}
                  placeholder="Ex.: sempre adicione testes unitários · não quebre a API pública · prefira funções puras" />
                <button style={btn} onClick={addMem}>Adicionar</button>
              </div>
            </div>
          </div>

          {/* memory list */}
          {memList.length > 0 ? (
            <div style={sCard}>
              <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Memórias ativas</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mute)", fontWeight: 400 }}>{memList.length} instrução(ões)</span>
              </div>
              {memList.map((m) => {
                const scopeColor = m.scope === "global" ? "var(--accent)" : "var(--blue)";
                const scopeBg    = m.scope === "global" ? "var(--accent-tint)" : "var(--blue-tint,rgba(88,166,255,.12))";
                return (
                  <div key={m.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "13px 18px", borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                      <path d="M9 11l3 3 8-8M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>{m.instruction}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 5, background: scopeBg, color: scopeColor }}>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                          {m.scope}{m.repo_id ? " · " + short(m.repo_id, 10) : ""}
                        </span>
                        {m.source && <span style={{ fontSize: 10.5, color: "var(--mute)" }}>{m.source}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => delMem(m.id)} title="Remover" style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "1px solid rgba(248,81,73,.4)", background: "var(--red-tint)", color: "var(--red)", cursor: "pointer" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ ...sCard, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/></svg>
              <span style={{ fontSize: 13.5, color: "var(--dim)", fontWeight: 500 }}>Nenhuma instrução ainda</span>
              <span style={{ fontSize: 12, color: "var(--mute)", maxWidth: 340, lineHeight: 1.5 }}>Adicione regras que orientam todos os agentes — como padrões de código, convenções do projeto ou restrições de negócio.</span>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 11.5, color: "var(--mute)", background: "var(--accent-tint)", border: "1px solid rgba(245,166,35,.2)", borderRadius: 10, padding: "12px 15px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
            <span>Memórias são injetadas no prompt de planejamento de cada worker. Instruções globais valem para todos os repositórios; instruções de repositório só ativam quando o worker trabalha naquele repo.</span>
          </div>
        </div>
      )}

      {/* ═══════ WRITE MODAL ═══════ */}
      {writeOpen && (
        <Modal title="Novo documento" onClose={() => setWriteOpen(false)}
          footer={<>
            <button style={{ height: 38, padding: "0 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer" }} onClick={() => setWriteOpen(false)}>Cancelar</button>
            <button style={{ ...btn, opacity: saving ? .6 : 1 }} onClick={saveDoc} disabled={saving}>{saving ? "Salvando…" : "Salvar documento"}</button>
          </>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Título</span>
                <input style={input} value={wd.title} onChange={(e) => setWd({ ...wd, title: e.target.value })} placeholder="Ex.: Guia de contribuição, Padrões de API…" />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Categoria</span>
                <select style={{ ...input, minWidth: 130 }} value={wd.category} onChange={(e) => setWd({ ...wd, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--dim)" }}>Conteúdo <span style={{ color: "var(--mute)", fontWeight: 400 }}>(Markdown suportado)</span></span>
              <textarea
                style={{ ...input, minHeight: 280, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--mono)", fontSize: 12.5 }}
                value={wd.content}
                onChange={(e) => setWd({ ...wd, content: e.target.value })}
                placeholder={"# Título\n\nDescreva aqui o conhecimento que os agentes devem usar…\n\n## Seção\n\n- item 1\n- item 2"}
              />
            </label>
            <div style={{ fontSize: 11, color: "var(--mute)" }}>
              {wd.content.length > 0 && `${wd.content.length} caracteres · ${new TextEncoder().encode(wd.content).length} bytes`}
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════ PREVIEW MODAL ═══════ */}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}
          footer={<button style={{ ...btn }} onClick={() => setPreview(null)}>Fechar</button>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={catColor(preview.category)}>{preview.category}</span>
              {fmtSize(preview.size) && <span style={{ fontSize: 11.5, color: "var(--mute)", fontFamily: "var(--mono)" }}>{fmtSize(preview.size)}</span>}
            </div>
            <pre style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 9, padding: "14px 16px", fontSize: 12.5, lineHeight: 1.65, overflowX: "auto", maxHeight: "50vh", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--mono)", color: "var(--ink)", margin: 0 }}>
              {preview.content || "(sem conteúdo)"}
            </pre>
          </div>
        </Modal>
      )}
    </Page>
  );
}
