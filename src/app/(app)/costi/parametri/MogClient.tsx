"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { Aiuto } from "@/components/Aiuto";
import { useAvvisoUscita } from "@/components/Percorso";
import { leggiFoglio } from "@/lib/fatture/xlsxStream";
import { contrattoDaRiga, isIntestazioneMog, type ContrattoMog } from "@/domain/mog/mog";
import { aggiungiVariazioneMog, anteprimaMog, importaMog } from "../actions";

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
