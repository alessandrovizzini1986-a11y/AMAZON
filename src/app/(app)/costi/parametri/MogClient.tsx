"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { useAvvisoUscita } from "@/components/Percorso";
import { leggiFoglio } from "@/lib/fatture/xlsxStream";
import { consolidamentiPrevisti, contrattoDaRiga, isIntestazioneMog, type ContrattoMog } from "@/domain/mog/mog";
import { aggiungiVariazioneMog, anteprimaMog, importaMog, importaVariazioniMog } from "../actions";
import { aumentiDaExcel, aumentiDaPdf, meseDaNomeFile, unisciAumenti, type AumentoLetto, type AumentoUnito } from "@/domain/mog/aumenti";
import { pagineDaPdf } from "@/lib/fatture/pdf";

const it = (s: string) => s.split("-").reverse().join("/");

/** Import del file ADECCO_PS (foglio PS): si legge a flusso nel browser (il foglio ha un milione di righe vuote). */
export function MogClient() {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);
  const [dati, setDati] = useState<{ nome: string; versione: string; righe: ContrattoMog[]; ante: Awaited<ReturnType<typeof anteprimaMog>> } | null>(null);
  useAvvisoUscita(!!dati);

  const leggi = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setLavoro(true); setErrore(null); setDati(null); setFatto(null);
    try {
      const righe: ContrattoMog[] = [];
      const r = await leggiFoglio(await f.arrayBuffer(), "PS", { intestazione: isIntestazioneMog, onRiga: (riga) => { const c = contrattoDaRiga(riga, Object.keys(riga)); if (c) righe.push(c); }, onProgress: (fase, b) => setStato(`Lettura ${fase}: ${Math.round(b / 1e6)} MB…`) });
      if (!r.intestazioni.length) throw new Error('nel foglio PS non trovo l\'intestazione con "Codice fiscale" e "% MOG": non sembra il file ADECCO_PS');
      const a3 = r.rigaIntestazione[0];
      const m = /ADECCO_PS_(\d{4})_(\d{2})/i.exec(f.name);
      const versione = typeof a3 === "number" ? new Date(Date.UTC(1899, 11, 30) + Math.round(a3) * 864e5).toISOString().slice(0, 10) : m ? `${m[1]}-${m[2]}-01` : "";
      if (!versione) throw new Error("non trovo la data di chiusura payroll (cella A3)");
      if (!righe.length) throw new Error("nessun lavoratore con codice fiscale nel foglio PS");
      setDati({ nome: f.name, versione, righe, ante: await anteprimaMog({ versione, righe }) });
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); setStato(""); }
  };

  const salva = async () => {
    if (!dati) return;
    setLavoro(true);
    try { const r = await importaMog({ versione: dati.versione, nomeFile: dati.nome, righe: dati.righe }); setFatto(`File MOG del ${it(dati.versione)} salvato: ${r.righe} lavoratori.`); setDati(null); router.refresh(); }
    catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  const per = dati ? dati.righe.reduce<Record<string, number>>((m, r) => { m[r.station ?? `? ${r.sito}`] = (m[r.station ?? `? ${r.sito}`] ?? 0) + 1; return m; }, {}) : {};
  return (
    <div className="flex flex-col gap-3">
      <Dropzone titolo="Trascina qui il file MOG di Adecco" accept=".xlsx" lavoro={lavoro} onFiles={leggi} aiuto="costi.mog"
        testo={<><code>ADECCO_PS_AAAA_MM.xlsx</code> (foglio PS) che manda Erika ogni mese: si legge nel browser, al sito vanno solo CF, nome, sito, contratto e ore MOG.</>} />
      {stato && <p className="text-sm text-ink-muted">{stato}</p>}
      {errore && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      {fatto && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">{fatto}</p>}
      {dati && (
        <div className="rounded-control border border-line p-4 text-sm">
          <h3 className="mb-2 font-semibold">{dati.nome} — chiusura payroll {it(dati.versione)}{dati.ante.esiste && <span className="ml-2 text-warn">(esiste già: verrà sostituito)</span>}</h3>
          <p className="mb-2">{dati.righe.length} lavoratori: {Object.entries(per).sort().map(([s, n]) => `${s} ${n}`).join(" · ")}</p>
          {Object.keys(per).some((s) => s.startsWith("?")) && <p className="mb-2 text-warn">Alcuni siti non hanno una station: controlla la colonna Sito.</p>}
          {dati.ante.precedente ? <p>Rispetto al file del {it(dati.ante.precedente)}: <b>{dati.ante.nCambi}</b> % MOG cambiate (aumenti applicati), <b>{dati.ante.nuovi}</b> nuovi, <b>{dati.ante.usciti}</b> usciti.</p> : <p className="text-ink-muted">Primo file MOG: nessun confronto.</p>}
          {(() => { const k = dati.righe.filter((r) => /^s/i.test(r.supera20 ?? "") && r.nuovaPct !== null); return k.length > 0 && <p>Consolidamenti previsti dal file (media 6 mesi oltre il MOG + 20 %): <b>{k.length}</b>, già consolidati in passato: <b>{dati.righe.filter((r) => /^s/i.test(r.giaConsolidato ?? "")).length}</b>.</p>; })()}
          {dati.ante.cambi.length > 0 && <details className="mt-1"><summary className="cursor-pointer">% cambiate</summary><ul className="ml-4 text-xs">{dati.ante.cambi.map((c) => <li key={c.nome}>{c.nome} · {c.station}: {c.prima} % → {c.dopo} %</li>)}</ul></details>}
          <div className="mt-3 flex gap-2"><button type="button" className="btn-primary" disabled={lavoro} onClick={salva}>Salva il file MOG</button> <Aiuto k="costi.mog.salva" /><button type="button" className="btn-secondary" onClick={() => setDati(null)}>Annulla</button></div>
        </div>
      )}
    </div>
  );
}

/** Aumento MOG comunicato (PDF "Mog_Cambio…" o Excel "Aumenti MOG PS"): nuova % valida da una data. */
export function VariazioneMog({ lavoratori }: { lavoratori: { cf: string; nome: string; station: string | null; pct: number | null }[] }) {
  const router = useRouter();
  const [q, setQ] = useState(""); const [pct, setPct] = useState(""); const [dal, setDal] = useState(""); const [msg, setMsg] = useState<string | null>(null);
  const sel = lavoratori.find((l) => `${l.nome} (${l.station ?? "?"})` === q);
  return (
    <form className="mt-3 flex flex-wrap items-end gap-2 text-sm" onSubmit={async (e) => { e.preventDefault(); if (!sel) return; await aggiungiVariazioneMog({ cf: sel.cf, nome: sel.nome, pctNuova: Number(pct.replace(",", ".")), validaDal: dal, fonte: "manuale" }); setMsg(`Salvato: ${sel.nome} ${pct} % dal ${it(dal)}`); setQ(""); setPct(""); router.refresh(); }}>
      <label className="flex min-w-64 flex-col">Lavoratore<input className="input" list="mog-lav" value={q} onChange={(e) => setQ(e.target.value)} placeholder="cerca per nome" required /></label>
      <datalist id="mog-lav">{lavoratori.map((l) => <option key={l.cf} value={`${l.nome} (${l.station ?? "?"})`} />)}</datalist>
      <label className="flex flex-col">Nuova % MOG<input className="input w-24" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder={sel?.pct ? String(sel.pct) : "es. 50"} required /></label>
      <label className="flex flex-col">Valida dal<input className="input" type="date" value={dal} onChange={(e) => setDal(e.target.value)} required /></label>
      <button className="btn-primary" disabled={!sel}>Aggiungi aumento</button> <Aiuto k="costi.mog.variazione" />
      {msg && <span className="text-ok">{msg}</span>}
    </form>
  );
}

/** Consolidamenti previsti dal file MOG salvato, per mese e station. */
export function ConsolidamentiMog({ contratti, daMese, variazioni }: { contratti: ContrattoMog[]; daMese: string; variazioni: { cf: string; pctNuova: number; validaDal: string }[] }) {
  const cons = consolidamentiPrevisti(contratti, daMese, variazioni);
  if (!cons.length) return null;
  const mesi = [...new Set(cons.map((c) => c.dal.slice(0, 7)))].sort();
  const st = [...new Set(cons.map((c) => c.station))].sort();
  const extra = (c: (typeof cons)[number]) => (c.nuovoMonteOre ?? 0) - (c.oreMogMese ?? 0);
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-semibold">Consolidamenti previsti ({cons.length})</summary>
      <p className="mt-1 text-xs text-ink-muted">Chi ha una media di ore retribuite degli ultimi 6 mesi oltre il MOG + 20 % può consolidarsi a una % più alta dal mese indicato: è un costo nascosto (monte ore garantito più alto). Il controllo MOG usa la % del file finché non arriva quello nuovo o un aumento. Se il contratto scade prima, il consolidamento scatta solo con una proroga.</p>
      <div className="mt-2 overflow-x-auto"><table className="table-base text-xs">
        <thead><tr><th>Dal</th>{st.map((s) => <th key={s} className="text-right">{s}</th>)}<th className="text-right">Totale</th><th className="text-right">di cui contratto in scadenza prima</th><th className="text-right">+ ore MOG/mese</th></tr></thead>
        <tbody>{mesi.map((m) => { const x = cons.filter((c) => c.dal.startsWith(m)); return <tr key={m}><td>{m.split("-").reverse().join("/")}</td>{st.map((s) => <td key={s} className="text-right font-mono">{x.filter((c) => c.station === s).length || ""}</td>)}<td className="text-right font-mono">{x.length}</td><td className="text-right font-mono">{x.filter((c) => c.scadePrima).length || ""}</td><td className="text-right font-mono">{x.reduce((t, c) => t + extra(c), 0).toLocaleString("it-IT", { maximumFractionDigits: 0 })}</td></tr>; })}</tbody>
      </table></div>
    </details>
  );
}

/** Aumenti MOG da file: PDF "Mog_Cambio_Lavoratore…" (data, % prima/dopo) + Excel "Aumenti MOG PS" (codice fiscale). */
export function AumentiMog({ contratti }: { contratti: ContrattoMog[] }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);
  const [dati, setDati] = useState<{ file: string[]; righe: AumentoUnito[] } | null>(null);
  useAvvisoUscita(!!dati);
  const leggi = async (files: File[]) => {
    setLavoro(true); setErrore(null); setFatto(null); setDati(null);
    try {
      const letti: AumentoLetto[] = []; let dataDefault: string | null = null; const scartati: string[] = [];
      for (const f of files) {
        const buf = await f.arrayBuffer();
        dataDefault ??= meseDaNomeFile(f.name);
        if (/\.pdf$/i.test(f.name)) {
          const testo = (await pagineDaPdf(buf)).map((p) => p.map((i) => i.str).join(" ")).join("\n");
          const x = aumentiDaPdf(testo); if (!x.length) scartati.push(f.name); letti.push(...x);
        } else {
          const ExcelJS = (await import("exceljs")).default;
          const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
          const righe: (string | number | null)[][] = [];
          for (const ws of wb.worksheets) ws.eachRow((r) => righe.push((r.values as (string | number | null)[]).slice(1).map((v) => (v && typeof v === "object" && "result" in v ? (v as { result: string | number }).result : v))));
          const x = aumentiDaExcel(righe); if (!x.length) scartati.push(f.name); letti.push(...x);
        }
      }
      if (scartati.length) setErrore(`Nessun aumento MOG trovato in: ${scartati.join(", ")}. Servono il PDF delle lettere "Mog_Cambio…" o l'Excel con le colonne "Codice fiscale" e "Nuova % MOG".`);
      if (letti.length) setDati({ file: files.map((f) => f.name), righe: unisciAumenti(letti, contratti, dataDefault) });
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };
  const validi = dati?.righe.filter((r) => r.cf && r.validaDal) ?? [];
  const salva = async () => {
    if (!dati) return; setLavoro(true);
    try {
      const r = await importaVariazioniMog({ file: dati.file, righe: validi.map((x) => ({ cf: x.cf!, nome: x.nome, pctNuova: x.pctNuova, validaDal: x.validaDal!, fonte: x.fonti.includes("pdf") ? `lettera Adecco (${dati.file.join(", ")})`.slice(0, 200) : `Excel (${dati.file.join(", ")})`.slice(0, 200) })) });
      setFatto(`${r.righe} aumenti salvati.`); setDati(null); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };
  return (
    <div className="mt-3">
      <Dropzone titolo="Trascina qui gli aumenti MOG (PDF e/o Excel)" accept=".pdf,.xlsx" multiple lavoro={lavoro} onFiles={leggi} aiuto="costi.mog.aumenti"
        testo={<>PDF <code>Mog_Cambio_Lavoratore_AAAA_MM_PS.pdf</code> e Excel <code>Aumenti MOG PS.xlsx</code>, anche insieme: si leggono nel browser e non si salvano.</>} />
      {errore && <p className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">{errore}</p>}
      {fatto && <p className="mt-2 rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">{fatto}</p>}
      {dati && (
        <div className="card mt-3 p-3 text-sm">
          <p className="font-semibold">{dati.righe.length} aumenti letti · {validi.length} pronti da salvare</p>
          <div className="mt-2 overflow-x-auto"><table className="table-base text-xs">
            <thead><tr><th>DS</th><th>Lavoratore</th><th>Contratto</th><th className="text-right">% file MOG</th><th className="text-right">Da (lettera)</th><th className="text-right">Nuova %</th><th className="text-right">Nuovo MOG h</th><th>Dal</th><th>Fonti</th><th>Avvisi</th></tr></thead>
            <tbody>{dati.righe.map((r, i) => <tr key={i}><td>{r.station ?? "?"}</td><td>{r.nome}</td><td>{r.nContratto ?? ""}</td><td className="text-right font-mono">{r.pctFileMog ?? "—"}</td><td className="text-right font-mono">{r.pctPrima ?? "—"}</td><td className="text-right font-mono font-semibold">{r.pctNuova}</td><td className="text-right font-mono">{(Math.round(r.pctNuova / 100 * 169 * 10) / 10).toLocaleString("it-IT")}</td><td>{it(r.validaDal ?? "")}</td><td>{r.fonti.join(" + ")}</td><td className={r.avvisi.length ? "text-warn" : "text-ok"}>{r.avvisi.length ? r.avvisi.join("; ") : "ok"}</td></tr>)}</tbody>
          </table></div>
          {validi.length < dati.righe.length && <p className="mt-2 text-warn">Le righe senza codice fiscale o senza data non si salvano: aggiungile a mano qui sotto.</p>}
          <div className="mt-3 flex gap-2"><button type="button" className="btn-primary" disabled={lavoro || !validi.length} onClick={salva}>Salva gli aumenti</button> <Aiuto k="costi.mog.aumenti.salva" /><button type="button" className="btn-secondary" onClick={() => setDati(null)}>Annulla</button></div>
        </div>
      )}
    </div>
  );
}
