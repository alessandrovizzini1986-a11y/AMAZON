"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { isAnagraficaCDL, leggiAnagraficaCDL, riepilogoCDL, type RigaCDL, type RiepilogoCDL } from "@/domain/costi/anagrafica";
import { aggiungiFestivo, aggiungiParametro, aggiungiTariffa, anteprimaAnagrafica, eliminaFestivo, importaAnagrafica } from "../actions";
import { Aiuto } from "@/components/Aiuto";
import { useAvvisoUscita } from "@/components/Percorso";

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numIt = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

function useAzione() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const esegui = (f: () => Promise<unknown>) => start(async () => {
    setErrore(null);
    try { await f(); router.refresh(); } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); }
  });
  return { pending, errore, esegui };
}

const Err = ({ e }: { e: string | null }) => (e ? <p className="mt-2 text-sm text-danger">{e}</p> : null);

export function NuovaTariffa() {
  const a = useAzione();
  const [f, setF] = useState({ voce: "TRASFERTA", validaDal: "", valore: "", fonte: "" });
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); a.esegui(() => aggiungiTariffa({ ...f, valore: numIt(f.valore), fonte: f.fonte || undefined })); }}>
      <label className="flex flex-col">Voce<select className="input" value={f.voce} onChange={(e) => setF({ ...f, voce: e.target.value })}><option value="TRASFERTA">Trasferta feriale</option><option value="TRASFERTA_DOM_EXTRA">Extra domenica</option><option value="TRASFERTA_GLS">Trasferta GLS (tutti i giorni)</option></select></label>
      <label className="flex flex-col">Valida dal<input className="input" type="date" required value={f.validaDal} onChange={(e) => setF({ ...f, validaDal: e.target.value })} /></label>
      <label className="flex flex-col">€/giorno<input className="input w-24" required inputMode="decimal" value={f.valore} onChange={(e) => setF({ ...f, valore: e.target.value })} /></label>
      <label className="flex flex-col">Fonte<input className="input" value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} placeholder="accordo, circolare…" /></label>
      <button className="btn-primary" disabled={a.pending}>Aggiungi tariffa</button> <Aiuto k="costi.tariffa" />
      <Err e={a.errore} />
    </form>
  );
}

export function NuovoParametro({ chiavi }: { chiavi: string[] }) {
  const a = useAzione();
  const [f, setF] = useState({ chiave: chiavi[0], validaDal: "", valore: "", note: "" });
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); a.esegui(() => aggiungiParametro({ ...f, valore: numIt(f.valore), note: f.note || undefined })); }}>
      <label className="flex flex-col">Coefficiente<select className="input" value={f.chiave} onChange={(e) => setF({ ...f, chiave: e.target.value })}>{chiavi.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="flex flex-col">Valido dal<input className="input" type="date" required value={f.validaDal} onChange={(e) => setF({ ...f, validaDal: e.target.value })} /></label>
      <label className="flex flex-col">Valore<input className="input w-28" required inputMode="decimal" value={f.valore} onChange={(e) => setF({ ...f, valore: e.target.value })} placeholder="percentuali: 0,025" /></label>
      <label className="flex flex-col">Nota<input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <button className="btn-primary" disabled={a.pending}>Aggiungi valore</button> <Aiuto k="costi.parametro" />
      <Err e={a.errore} />
    </form>
  );
}

export function NuovoFestivo({ stations }: { stations: string[] }) {
  const a = useAzione();
  const [f, setF] = useState({ data: "", descrizione: "", station: "TUTTE" });
  return (
    <form className="mt-4 flex flex-wrap items-end gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); a.esegui(() => aggiungiFestivo(f)); }}>
      <label className="flex flex-col">Data<input className="input" type="date" required value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
      <label className="flex flex-col">Descrizione<input className="input" required value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} /></label>
      <label className="flex flex-col">Station<select className="input" value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })}><option>TUTTE</option>{stations.map((s) => <option key={s}>{s}</option>)}</select></label>
      <button className="btn-primary" disabled={a.pending}>Aggiungi festivo</button> <Aiuto k="costi.festivo" />
      <Err e={a.errore} />
    </form>
  );
}

export function EliminaFestivo({ id }: { id: string }) {
  const a = useAzione();
  return <button type="button" className="text-xs text-danger underline" disabled={a.pending} onClick={() => { if (confirm("Eliminare questo festivo?")) a.esegui(() => eliminaFestivo(id)); }}>elimina</button>;
}

type Anteprima = Awaited<ReturnType<typeof anteprimaAnagrafica>>;

export function AnagraficaCDLClient() {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [dati, setDati] = useState<{ nome: string; mese: string; righe: RigaCDL[]; scartate: number; riep: RiepilogoCDL; ante: Anteprima } | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);
  useAvvisoUscita(!!dati);

  const leggi = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setLavoro(true); setErrore(null); setDati(null); setFatto(null);
    try {
      const g = await workbookToGrids(await f.arrayBuffer());
      if (!isAnagraficaCDL(g)) throw new Error('questo file non ha il foglio "SIC Amazon TR": non sembra l\'anagrafica CDL di HR');
      const a = leggiAnagraficaCDL(g);
      const mese = a.meseVersione ?? /_(\d{2})(\d{2})_/.exec(f.name)?.slice(1).reverse().map((x, i) => (i === 0 ? `20${x}` : x)).join("-") ?? "";
      if (!mese) throw new Error("non trovo il mese della versione (cella A1 o MMAA nel nome): scrivilo qui sotto");
      setDati({ nome: f.name, mese, righe: a.righe, scartate: a.scartate, riep: riepilogoCDL(a.righe), ante: await anteprimaAnagrafica({ mese, righe: a.righe }) });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally { setLavoro(false); }
  };

  const conferma = async () => {
    if (!dati) return;
    setLavoro(true); setErrore(null);
    try {
      const r = await importaAnagrafica({ mese: dati.mese, nomeFile: dati.nome, righe: dati.righe });
      setFatto(`Versione ${dati.mese.split("-").reverse().join("/")} salvata: ${r.teste} teste, CDL ${eur(r.cdl)} €${r.duplicati ? ` (${r.duplicati} CF doppi ignorati)` : ""}.`);
      setDati(null); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  const stations = dati ? Object.keys(dati.riep.perStation).sort() : [];
  const prima = dati?.ante.riepilogoPrima;
  return (
    <div className="flex flex-col gap-3">
      <Dropzone titolo="Trascina qui l'anagrafica CDL" aiuto="costi.anagrafica" accept=".xlsx" lavoro={lavoro} onFiles={leggi}
        testo={<><code>DB_CDL_base_MMAA_AmazonGLS_BO.xlsx</code>: si legge qui nel browser, al sito vanno solo le colonne del costo (CF, nome, station, contratto, CDL, saving).</>} />
      {errore && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      {fatto && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">{fatto}</p>}
      {dati && (
        <div className="rounded-control border border-[#d5dbe3] p-4">
          <h3 className="mb-2 font-semibold">Anteprima {dati.nome}</h3>
          <label className="mb-3 flex items-center gap-2 text-sm">Versione (mese)
            <input className="input w-32" type="month" value={dati.mese} onChange={(e) => setDati({ ...dati, mese: e.target.value })} />
            {dati.ante.sovrascrive && <span className="text-warn">esiste già: verrà sostituita</span>}
          </label>
          <div className="overflow-x-auto"><table className="table-base text-sm">
            <thead><tr><th>Station</th><th className="text-right">Teste</th><th className="text-right">CDL €</th>{prima && <><th className="text-right">Teste {dati.ante.precedente}</th><th className="text-right">CDL {dati.ante.precedente} €</th></>}</tr></thead>
            <tbody>
              {stations.map((s) => <tr key={s}><td>{s}</td><td className="text-right font-mono">{dati.riep.perStation[s].teste}</td><td className="text-right font-mono">{eur(dati.riep.perStation[s].cdl)}</td>
                {prima && <><td className="text-right font-mono">{prima.perStation[s]?.teste ?? 0}</td><td className="text-right font-mono">{eur(prima.perStation[s]?.cdl ?? 0)}</td></>}</tr>)}
              <tr className="font-semibold"><td>Totale</td><td className="text-right font-mono">{dati.riep.teste}</td><td className="text-right font-mono">{eur(dati.riep.cdl)}</td>{prima && <><td className="text-right font-mono">{prima.teste}</td><td className="text-right font-mono">{eur(prima.cdl)}</td></>}</tr>
            </tbody>
          </table></div>
          {dati.scartate > 0 && <p className="mt-2 text-sm text-warn">{dati.scartate} righe con CF ma senza CDL: non importate.</p>}
          {dati.ante.precedente ? (
            <div className="mt-3 text-sm">
              <p>Differenze con la versione {dati.ante.precedente}: <b>{dati.ante.nEntrati}</b> entrati, <b>{dati.ante.nUsciti}</b> usciti, <b>{dati.ante.nCambiati}</b> con CDL o station cambiati.</p>
              {[["Entrati", dati.ante.entrati], ["Usciti", dati.ante.usciti]].map(([t, l]) => (l as Anteprima["entrati"]).length > 0 && (
                <details key={t as string} className="mt-1"><summary className="cursor-pointer">{t as string}</summary>
                  <ul className="ml-4 text-xs">{(l as Anteprima["entrati"]).map((r) => <li key={r.cf}>{r.nome} · {r.station} · {eur(r.cdl)} €</li>)}</ul></details>
              ))}
              {dati.ante.cambiati.length > 0 && <details className="mt-1"><summary className="cursor-pointer">Cambiati</summary>
                <ul className="ml-4 text-xs">{dati.ante.cambiati.map((r) => <li key={r.cf}>{r.nome}: {r.prima.station} {eur(r.prima.cdl)} € → {r.dopo.station} {eur(r.dopo.cdl)} €</li>)}</ul></details>}
            </div>
          ) : <p className="mt-3 text-sm text-ink-muted">Prima versione: nessun confronto.</p>}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary" disabled={lavoro || !/^\d{4}-\d{2}$/.test(dati.mese)} onClick={conferma}>Conferma e salva la versione</button> <Aiuto k="costi.anagrafica.conferma" />
            <button type="button" className="btn-secondary" onClick={() => setDati(null)}>Annulla</button>
          </div>
        </div>
      )}
    </div>
  );
}
