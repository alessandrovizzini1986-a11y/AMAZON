"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { aggregaAdit, isAdit, leggiAdit, VOCI_ORE, type RigaAdit } from "@/domain/costi/adit";
import { componentiPerStation, isPayroll, leggiPayroll, nomeKey, stationPerDipendente, type RigaPayroll } from "@/domain/costi/payroll";
import { bucket } from "@/domain/costi/sic";
import type { RigaCDL } from "@/domain/costi/anagrafica";
import { aggiornaParametri, concludiImportAdit, concludiImportPayroll, importaAdit, importaPayroll, salvaRiconciliazione } from "../actions";

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const it = (m: string) => m.split("-").reverse().join("/");

type Letto =
  | { tipo: "ADIT"; nome: string; meseFattura: string; righe: RigaAdit[]; altriCdc: number; esclusi: number }
  | { tipo: "PAYROLL"; nome: string; mesePaga: string; righe: (RigaPayroll & { station: string | null })[]; dipendenti: number; altriCdc: number };

/** Import dal contenuto: estrazione ADIT o "Costi del personale PS". */
export function ConsuntivoClient({ righeCdl }: { righeCdl: Pick<RigaCDL, "cognome" | "nome" | "station" | "contratto">[] }) {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [letto, setLetto] = useState<Letto | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  const leggi = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setLavoro(true); setErrore(null); setLetto(null); setFatto(null); setStato(`Lettura ${f.name}…`);
    try {
      const g = await workbookToGrids(await f.arrayBuffer());
      if (isAdit(g)) setLetto({ tipo: "ADIT", nome: f.name, ...leggiAdit(g) });
      else if (isPayroll(g)) {
        const p = leggiPayroll(g);
        const st = stationPerDipendente(p.righe, righeCdl);
        const contr = new Map(righeCdl.map((a) => [nomeKey(`${a.cognome} ${a.nome}`), a.contratto]));
        const righe = p.righe.map((r) => {
          let istituto = r.istituto;
          if (istituto === "STR") { const c = contr.get(nomeKey(r.dipe)); const b = c === undefined ? null : bucket(c); istituto = b === null ? "STR_ND" : b === "CTI FT" || b === "DISPATCHER" ? "STR_FT" : "STR_PT"; }
          return { ...r, istituto, station: st.get(r.dipe) ?? null };
        });
        const mm = /_(\d{2})(\d{2})_/.exec(f.name);
        setLetto({ tipo: "PAYROLL", nome: f.name, mesePaga: mm ? `20${mm[2]}-${mm[1]}` : "", righe, dipendenti: p.dipendenti, altriCdc: p.altriCdc });
      } else throw new Error("file non riconosciuto: servono l'estrazione ADIT (foglio \"Estrazione…\") o i Costi del personale PS (foglio \"det\")");
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); setStato(""); }
  };

  const salva = async () => {
    if (!letto) return;
    setLavoro(true); setErrore(null);
    try {
      if (letto.tipo === "ADIT") {
        for (let i = 0; i < letto.righe.length; i += 2000) { setStato(`Invio ${Math.min(i + 2000, letto.righe.length)}/${letto.righe.length}…`); await importaAdit({ meseFattura: letto.meseFattura, righe: letto.righe.slice(i, i + 2000), primo: i === 0 }); }
        const costo = Math.round(letto.righe.reduce((a, r) => a + r.costo, 0) * 100) / 100;
        await concludiImportAdit({ meseFattura: letto.meseFattura, file: letto.nome, righe: letto.righe.length, costo });
        setFatto(`ADIT ${it(letto.meseFattura)} salvato: ${letto.righe.length} righe, ${eur(costo)} €.`);
      } else {
        if (!/^\d{4}-\d{2}$/.test(letto.mesePaga)) throw new Error("indica il mese di paga");
        for (let i = 0; i < letto.righe.length; i += 4000) { setStato(`Invio ${Math.min(i + 4000, letto.righe.length)}/${letto.righe.length}…`); await importaPayroll({ mesePaga: letto.mesePaga, righe: letto.righe.slice(i, i + 4000).map(({ station, ...r }) => ({ ...r, station })), primo: i === 0 }); }
        const per = componentiPerStation(letto.righe);
        const totale = Math.round(Object.values(per).reduce((a, x) => a + x.TOTALE, 0) * 100) / 100;
        await concludiImportPayroll({ mesePaga: letto.mesePaga, file: letto.nome, righe: letto.righe.length, totale, dipendenti: letto.dipendenti, nonInAnagrafica: per["(non in anagrafica)"]?.dipendenti ?? 0 });
        setFatto(`Costi del personale ${it(letto.mesePaga)} salvati: ${eur(totale)} €.`);
      }
      setLetto(null); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); setStato(""); }
  };

  return (
    <section className="card flex flex-col gap-3 p-4 md:p-5">
      <h2 className="text-[19px] font-semibold">Carica consuntivo</h2>
      <Dropzone titolo="Trascina qui la fattura ADIT o i Costi del personale PS" accept=".xlsx" lavoro={lavoro} onFiles={leggi}
        testo={<><code>MMAA_Doc._emessi_ADIT_STD-SL_*.xlsx</code> (STD) o <code>Costi_del_Personale_PS_MMAA_*.xlsx</code> (SIC, dopo il 27): riconosciuti dal contenuto, letti nel browser. Al sito vanno solo le righe CDC 5569; il file non viene salvato.</>} />
      {stato && <p className="text-sm text-ink-muted">{stato}</p>}
      {errore && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      {fatto && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">{fatto}</p>}
      {letto?.tipo === "ADIT" && <AnteprimaAdit l={letto} />}
      {letto?.tipo === "PAYROLL" && <AnteprimaPayroll l={letto} onMese={(m) => setLetto({ ...letto, mesePaga: m })} />}
      {letto && (
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={lavoro} onClick={salva}>{letto.tipo === "ADIT" ? `Salva ADIT ${it(letto.meseFattura)}` : `Salva Costi del personale ${letto.mesePaga ? it(letto.mesePaga) : ""}`}</button>
          <button type="button" className="btn-secondary" onClick={() => setLetto(null)}>Annulla</button>
        </div>
      )}
    </section>
  );
}

function AnteprimaAdit({ l }: { l: Extract<Letto, { tipo: "ADIT" }> }) {
  const ag = aggregaAdit(l.righe);
  const stations = Object.keys(ag).sort();
  const tot = (s: string) => Object.values(ag[s]).reduce((a, v) => a + (v?.costo ?? 0), 0);
  const residui = l.righe.filter((r) => r.residuo);
  return (
    <div className="rounded-control border border-[#d5dbe3] p-4">
      <h3 className="mb-2 font-semibold">ADIT {it(l.meseFattura)} — {l.nome}</h3>
      <p className="mb-2 text-sm text-ink-muted">{l.righe.length} righe CDC 5569 · {l.altriCdc} righe di altri CDC ignorate · {l.esclusi} righe escluse per regola · residui di altri mesi {eur(residui.reduce((a, r) => a + r.costo, 0))} € ({residui.length} righe)</p>
      <div className="overflow-x-auto"><table className="table-base text-sm">
        <thead><tr><th>Station</th><th className="text-right">Teste (Stipendio)</th>{VOCI_ORE.map((v) => <th key={v} className="text-right">{v} h</th>)}<th className="text-right">Costo €</th></tr></thead>
        <tbody>
          {stations.map((s) => <tr key={s}><td>{s}</td><td className="text-right font-mono">{ag[s].STANDARD?.teste ?? 0}</td>{VOCI_ORE.map((v) => <td key={v} className="text-right font-mono">{(ag[s][v]?.quantita ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })}</td>)}<td className="text-right font-mono">{eur(tot(s))}</td></tr>)}
          <tr className="font-semibold"><td>Totale</td><td /><td colSpan={VOCI_ORE.length} /><td className="text-right font-mono">{eur(stations.reduce((a, s) => a + tot(s), 0))}</td></tr>
        </tbody>
      </table></div>
    </div>
  );
}

const COMP = ["BASE", "ASSENZE", "TRASFERTA", "STR_SUPP_MAGG", "FESTIVITA", "CARENZA_INTEGR", "ONERI", "RATEI_13_14", "RATEI_FERIE", "TFR", "INDENNITA_FISSE", "UNA_TANTUM", "ALTRO_VOCI", "ALTRO"];

function AnteprimaPayroll({ l, onMese }: { l: Extract<Letto, { tipo: "PAYROLL" }>; onMese: (m: string) => void }) {
  const per = componentiPerStation(l.righe);
  const st = Object.keys(per).sort((a, b) => (a.startsWith("(") ? 1 : b.startsWith("(") ? -1 : a.localeCompare(b)));
  const comp = COMP.filter((c) => st.some((s) => per[s][c as never]));
  const tot = st.reduce((a, s) => a + per[s].TOTALE, 0);
  return (
    <div className="rounded-control border border-[#d5dbe3] p-4">
      <h3 className="mb-2 font-semibold">Costi del personale PS — {l.nome}</h3>
      <label className="mb-2 flex items-center gap-2 text-sm">Mese di paga <input className="input w-36" type="month" value={l.mesePaga} onChange={(e) => onMese(e.target.value)} /> <span className="text-ink-muted">(confronta con la stima SIC del mese prima)</span></label>
      <p className="mb-2 text-sm text-ink-muted">CDC 5569, conti 6*: {eur(tot)} € · {l.dipendenti} dipendenti · {per["(non in anagrafica)"]?.dipendenti ?? 0} non trovati nell&apos;anagrafica CDL per nome · riclassifiche a somma zero (Cod1 = 6, tredicesime e liquidazioni) tenute ma non contate</p>
      <div className="overflow-x-auto"><table className="table-base text-xs">
        <thead><tr><th>Componente</th>{st.map((s) => <th key={s} className="text-right">{s}</th>)}<th className="text-right">Totale</th></tr></thead>
        <tbody>
          {comp.map((c) => <tr key={c}><td>{c}</td>{st.map((s) => <td key={s} className="text-right font-mono">{eur(per[s][c as never] ?? 0)}</td>)}<td className="text-right font-mono">{eur(st.reduce((a, s) => a + (per[s][c as never] ?? 0), 0))}</td></tr>)}
          <tr className="font-semibold"><td>TOTALE</td>{st.map((s) => <td key={s} className="text-right font-mono">{eur(per[s].TOTALE)}</td>)}<td className="text-right font-mono">{eur(tot)}</td></tr>
          <tr><td>Dipendenti</td>{st.map((s) => <td key={s} className="text-right font-mono">{per[s].dipendenti}</td>)}<td /></tr>
        </tbody>
      </table></div>
    </div>
  );
}

export function SalvaRiconciliazione({ mese, popolazione, righe }: { mese: string; popolazione: "STD" | "SIC"; righe: { station: string; voce: string; stima: number; consuntivo: number; delta: number }[] }) {
  const router = useRouter();
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={async () => { setBusy(true); try { await salvaRiconciliazione({ mese, popolazione, righe }); setOk("salvata"); router.refresh(); } finally { setBusy(false); } }}>Salva riconciliazione {popolazione}</button>
      {ok && <span className="text-xs text-ok">{ok}</span>}
    </span>
  );
}

export function AggiornaParametri({ validaDal, valori, fonte }: { validaDal: string; valori: Record<string, number>; fonte: string }) {
  const router = useRouter();
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn-primary" disabled={busy || !Object.keys(valori).length} onClick={async () => {
        if (!confirm(`Salvare ${Object.keys(valori).length} coefficienti con validità dal ${it(validaDal)}? Fallo solo se Alessandro ha confermato.`)) return;
        setBusy(true); try { await aggiornaParametri({ validaDal, valori, fonte }); setOk(`Salvati, validi dal ${it(validaDal)}.`); router.refresh(); } finally { setBusy(false); }
      }}>Aggiorna parametri</button>
      {ok && <span className="text-sm text-ok">{ok}</span>}
    </span>
  );
}
