"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { workbookToGrids } from "@/lib/presenze/excelGrid";
import { aggregaAdit, isAdit, leggiAdit, VOCI_ORE, type RigaAdit } from "@/domain/costi/adit";
import { concludiImportAdit, importaAdit } from "../actions";

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Letto = { nome: string; meseFattura: string; righe: RigaAdit[]; altriCdc: number; esclusi: number };

export function ConsuntivoClient() {
  const router = useRouter();
  const [lavoro, setLavoro] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [letto, setLetto] = useState<Letto | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  const leggi = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setLavoro(true); setErrore(null); setLetto(null); setFatto(null);
    try {
      const g = await workbookToGrids(await f.arrayBuffer());
      if (!isAdit(g)) throw new Error("file non riconosciuto: serve l'estrazione ADIT (foglio \"Estrazione…\" con MeseCompetenza). I Costi del personale PS arrivano con la prossima versione.");
      setLetto({ nome: f.name, ...leggiAdit(g) });
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  const salva = async () => {
    if (!letto) return;
    setLavoro(true); setErrore(null);
    try {
      for (let i = 0; i < letto.righe.length; i += 2000) await importaAdit({ meseFattura: letto.meseFattura, righe: letto.righe.slice(i, i + 2000), primo: i === 0 });
      const costo = Math.round(letto.righe.reduce((a, r) => a + r.costo, 0) * 100) / 100;
      await concludiImportAdit({ meseFattura: letto.meseFattura, file: letto.nome, righe: letto.righe.length, costo });
      setFatto(`ADIT ${letto.meseFattura.split("-").reverse().join("/")} salvato: ${letto.righe.length} righe, ${eur(costo)} €.`);
      setLetto(null); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  const ag = letto ? aggregaAdit(letto.righe) : {};
  const stations = Object.keys(ag).sort();
  const tot = (s: string) => Object.values(ag[s]).reduce((a, v) => a + (v?.costo ?? 0), 0);
  const residui = letto ? letto.righe.filter((r) => r.residuo) : [];
  return (
    <section className="card flex flex-col gap-3 p-4 md:p-5">
      <Dropzone titolo="Trascina qui la fattura ADIT" accept=".xlsx" lavoro={lavoro} onFiles={leggi}
        testo={<><code>MMAA_Doc._emessi_ADIT_STD-SL_*.xlsx</code>: si legge nel browser; al sito vanno solo le righe CDC 5569 (station, lavoratore, voce, quantità, costo). Il file non viene salvato.</>} />
      {errore && <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      {fatto && <p className="rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">{fatto}</p>}
      {letto && (
        <div className="rounded-control border border-[#d5dbe3] p-4">
          <h3 className="mb-2 font-semibold">ADIT {letto.meseFattura.split("-").reverse().join("/")} — {letto.nome}</h3>
          <p className="mb-2 text-sm text-ink-muted">{letto.righe.length} righe CDC 5569 · {letto.altriCdc} righe di altri CDC ignorate · {letto.esclusi} righe escluse per regola · residui di altri mesi {eur(residui.reduce((a, r) => a + r.costo, 0))} € ({residui.length} righe)</p>
          <div className="overflow-x-auto"><table className="table-base text-sm">
            <thead><tr><th>Station</th><th className="text-right">Teste (Stipendio)</th>{VOCI_ORE.map((v) => <th key={v} className="text-right">{v} h</th>)}<th className="text-right">Costo €</th></tr></thead>
            <tbody>
              {stations.map((s) => <tr key={s}><td>{s}</td><td className="text-right font-mono">{ag[s].STANDARD?.teste ?? 0}</td>{VOCI_ORE.map((v) => <td key={v} className="text-right font-mono">{(ag[s][v]?.quantita ?? 0).toLocaleString("it-IT", { maximumFractionDigits: 1 })}</td>)}<td className="text-right font-mono">{eur(tot(s))}</td></tr>)}
              <tr className="font-semibold"><td>Totale</td><td /><td colSpan={VOCI_ORE.length} /><td className="text-right font-mono">{eur(stations.reduce((a, s) => a + tot(s), 0))}</td></tr>
            </tbody>
          </table></div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary" disabled={lavoro} onClick={salva}>Salva ADIT {letto.meseFattura.split("-").reverse().join("/")}</button>
            <button type="button" className="btn-secondary" onClick={() => setLetto(null)}>Annulla</button>
          </div>
        </div>
      )}
    </section>
  );
}
