"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Aiuto } from "@/components/Aiuto";
import { Dropzone } from "@/components/Dropzone";
import { eliminaPortale, mostraPassword, salvaPortali } from "./actions";

type Portale = { id: string; portale: string; url: string | null; username: string | null; haPassword: boolean; note: string | null; aggiornatoIl: string; aggiornatoDa: string | null };
type Riga = { portale: string; url: string | null; username: string | null; password: string | null; note: string | null };

const cella = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") { const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string }; return o.richText ? o.richText.map((x) => x.text).join("") : String(o.text ?? o.result ?? o.hyperlink ?? ""); }
  return String(v).trim();
};

/** Foglio "Portali" del passaggio di consegne: Portale | URL | Username | Password | Note. */
async function leggiPortali(f: File): Promise<Riga[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await f.arrayBuffer());
  for (const ws of wb.worksheets) {
    const righe: string[][] = [];
    ws.eachRow((r) => righe.push((r.values as unknown[]).slice(1).map(cella)));
    const hi = righe.findIndex((r) => r.some((c) => /^portale$/i.test(c)) && r.some((c) => /^password$/i.test(c)));
    if (hi < 0) continue;
    const h = righe[hi].map((c) => c.toLowerCase());
    const col = (n: string) => h.findIndex((c) => c.startsWith(n));
    return righe.slice(hi + 1).filter((r) => r[col("portale")]).map((r) => ({ portale: r[col("portale")], url: r[col("url")] || null, username: r[col("username")] || null, password: r[col("password")] || null, note: r[col("note")] || null }));
  }
  return [];
}

function Mostra({ p }: { p: Portale }) {
  const [aperto, setAperto] = useState(false);
  const [pw, setPw] = useState("");
  const [chiara, setChiara] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [lavoro, setLavoro] = useState(false);
  useEffect(() => { if (!chiara) return; const t = setTimeout(() => setChiara(null), 30_000); return () => clearTimeout(t); }, [chiara]);
  if (!p.haPassword) return <span className="text-ink-muted">—</span>;
  if (chiara) return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <code className="rounded bg-surface-sunken px-2 py-1">{chiara}</code>
      <button type="button" className="btn-secondary" onClick={() => navigator.clipboard.writeText(chiara).catch(() => {})}>Copia</button>
      <button type="button" className="btn-secondary" onClick={() => setChiara(null)}>Nascondi</button>
    </span>
  );
  if (!aperto) return <span className="inline-flex items-center gap-2"><span className="font-mono tracking-widest">••••••••</span><button type="button" className="btn-secondary" onClick={() => setAperto(true)}>Mostra</button></span>;
  return (
    <form className="inline-flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); setLavoro(true); setErrore(null); const r = await mostraPassword({ id: p.id, passwordAdmin: pw }); setLavoro(false); setPw(""); if ("password" in r && r.password) { setChiara(r.password); setAperto(false); } else setErrore(r.errore ?? "Errore"); }}>
      <input className="input w-48" type="password" autoComplete="current-password" placeholder="la tua password admin" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus aria-label={`Password admin per vedere ${p.portale}`} />
      <button className="btn-primary" disabled={lavoro}>{lavoro ? "Controllo…" : "Vedi"}</button>
      <button type="button" className="btn-secondary" onClick={() => { setAperto(false); setErrore(null); }}>Annulla</button>
      {errore && <span className="text-sm text-danger">{errore}</span>}
    </form>
  );
}

export function PortaliClient({ portali }: { portali: Portale[] }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState<Riga>({ portale: "", url: null, username: null, password: null, note: null });

  const importa = async (files: File[]) => {
    setLavoro(true); setErrore(null); setMsg(null);
    try {
      const righe = (await Promise.all(files.map(leggiPortali))).flat();
      if (!righe.length) { setErrore("Nel file non c'è un foglio con le colonne Portale e Password (es. foglio \"Portali\" del passaggio di consegne)."); return; }
      const r = await salvaPortali({ righe, fonte: files.map((f) => f.name).join(", ") });
      setMsg(`${r.righe} portali salvati, password cifrate.`); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  return (
    <>
      <section className="card p-4 md:p-5">
        <div className="overflow-x-auto"><table className="table-base text-sm">
          <thead><tr><th>Portale</th><th>Indirizzo</th><th>Utente</th><th>Password</th><th>Note</th><th></th></tr></thead>
          <tbody>{portali.length === 0 ? <tr><td colSpan={6} className="text-ink-muted">Nessun portale salvato: caricali dal file qui sotto o aggiungili a mano.</td></tr> : portali.map((p) => (
            <tr key={p.id}>
              <td className="font-semibold">{p.portale}</td>
              <td className="max-w-56 break-all text-xs">{p.url && /^https?:\/\//.test(p.url) ? <a className="underline" href={p.url.split(" ")[0]} target="_blank" rel="noreferrer noopener">{p.url}</a> : p.url}</td>
              <td className="break-all">{p.username}</td>
              <td><Mostra p={p} /></td>
              <td className="max-w-72 text-xs">{p.note}</td>
              <td><button type="button" className="btn-secondary" onClick={async () => { if (confirm(`Eliminare ${p.portale}?`)) { await eliminaPortale(p.id); router.refresh(); } }}>Elimina</button></td>
            </tr>))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-ink-muted">La password resta visibile 30 secondi, poi si nasconde da sola. Ogni visualizzazione (e ogni tentativo sbagliato) è nel log di audit.</p>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="mb-2 text-[19px] font-semibold">Carica da file</h2>
        <Dropzone archivio={false} titolo="Trascina il file con il foglio Portali" accept=".xlsx" lavoro={lavoro} onFiles={importa} aiuto="portali.importa"
          testo={<>Es. <code>Passaggio_Consegne_Mezzi.xlsx</code>, foglio Portali (colonne Portale, URL, Username, Password, Note). Il file si legge nel browser e non si salva; sul sito va solo la password cifrata.</>} />
        {msg && <p className="mt-2 rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">{msg}</p>}
        {errore && <p className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{errore}</p>}
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="mb-2 text-[19px] font-semibold">Aggiungi o cambia un portale</h2>
        <p className="mb-3 text-sm text-ink-muted">Stesso nome di un portale esistente = lo aggiorni. Password vuota = resta quella salvata.</p>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await salvaPortali({ righe: [nuovo], fonte: "manuale" }); setMsg(`${nuovo.portale} salvato.`); setNuovo({ portale: "", url: null, username: null, password: null, note: null }); router.refresh(); }}>
          <label className="flex flex-col text-sm">Portale<input className="input" required value={nuovo.portale} onChange={(e) => setNuovo({ ...nuovo, portale: e.target.value })} /></label>
          <label className="flex flex-col text-sm">Indirizzo<input className="input" value={nuovo.url ?? ""} onChange={(e) => setNuovo({ ...nuovo, url: e.target.value || null })} /></label>
          <label className="flex flex-col text-sm">Utente<input className="input" autoComplete="off" value={nuovo.username ?? ""} onChange={(e) => setNuovo({ ...nuovo, username: e.target.value || null })} /></label>
          <label className="flex flex-col text-sm">Password<input className="input" type="password" autoComplete="new-password" value={nuovo.password ?? ""} onChange={(e) => setNuovo({ ...nuovo, password: e.target.value || null })} /></label>
          <label className="flex flex-col text-sm sm:col-span-2">Note<input className="input" value={nuovo.note ?? ""} onChange={(e) => setNuovo({ ...nuovo, note: e.target.value || null })} /></label>
          <div className="flex items-center gap-2"><button className="btn-primary">Salva portale</button> <Aiuto k="portali.salva" /></div>
        </form>
      </section>
    </>
  );
}
