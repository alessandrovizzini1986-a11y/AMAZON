"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropzone } from "@/components/Dropzone";
import { elencoFile, salvaFile } from "@/lib/presenze/archivioLocale";
import { riconosci } from "@/lib/presenze/riconosci";
import { caricaDatiMese } from "@/lib/presenze/carica";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import { STATIONS_COSTI, festiviMese, type Festivo } from "@/domain/costi/festivi";
import { oreStation, stimaStd, totaleStime, type OreStation, type StimaStdStation } from "@/domain/costi/std";
import { accordoDomenica, giorniOltre10, letturaFile, rapportiAdit, rapportoMesePrec, sforamentiTetto, type Rapporto } from "@/domain/costi/controlli";
import { parametriAlla } from "@/domain/costi/parametri";
import type { AggregatoAdit, TariffeStd } from "@/domain/costi/adit";
import type { ValorePerData } from "@/domain/costi/tariffe";
import { salvaStima } from "../actions";

type Props = {
  mese: string; fineMese: string; canRun: boolean; tariffe: ValorePerData[]; parametri: ValorePerData[]; versioneParametri: string | null;
  festivi: Festivo[]; tariffeStd: TariffeStd | null; meseTariffe: string | null; aditCtrl: AggregatoAdit; meseCtrl: string | null;
  anagrafica: { mese: string; eta: number } | null; zucchetti: { il: string; da: string } | null; oreLavoroPrec: Record<string, number> | null;
};

type ControlliStation = {
  station: string; file: string; foglio: string; totaliFile: number; oreLette: number; trasfAMano: number; tetto: { nome: string; settimana: string; ore: number; tetto: number }[];
  accDom: { nome: string; data: string; ore: number }[]; oltre10: number; rapporti: Rapporto[]; mesePrec: ReturnType<typeof rapportoMesePrec>;
};

const eur = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const h1 = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const it = (m: string) => m.split("-").reverse().join("/");

function Semaforo({ ok, warn, children }: { ok: boolean; warn?: boolean; children: React.ReactNode }) {
  const c = ok ? "bg-ok" : warn ? "bg-warn" : "bg-danger";
  return <li className="flex items-start gap-2"><span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c}`} aria-hidden /> <span>{children}</span></li>;
}

export function FineMeseClient(p: Props) {
  const router = useRouter();
  const [archivio, setArchivio] = useState<{ station: string; tipo: string; nome: string }[]>([]);
  const [lavoro, setLavoro] = useState(false);
  const [stato, setStato] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [ris, setRis] = useState<{ ore: OreStation[]; stime: StimaStdStation[]; ctrl: ControlliStation[] } | null>(null);
  const [salvata, setSalvata] = useState<string | null>(null);

  const aggiorna = async () => {
    const f = await elencoFile().catch(() => []);
    setArchivio(f.filter((x) => x.kind === "TRACKING" && x.mesi.includes(p.mese)).map((x) => ({ station: x.station!, tipo: x.tipo!, nome: x.nome })));
  };
  useEffect(() => { aggiorna(); }, [p.mese]); // eslint-disable-line react-hooks/exhaustive-deps

  const aggiungi = async (files: File[]) => {
    setLavoro(true); setErrore(null);
    const msg: string[] = [];
    for (const f of files) {
      try { const r = await riconosci(f); if (r.kind !== "TRACKING") throw new Error("non è un tracking"); await salvaFile(r); msg.push(`${f.name}: ${r.station} ${r.tipo}, mesi ${r.mesi.join(", ")}`); }
      catch (e) { msg.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setAvvisi(msg); await aggiorna(); setLavoro(false);
  };

  const stdPresenti = new Set(archivio.filter((a) => a.tipo === "STD").map((a) => a.station));
  const sicPresenti = new Set(archivio.filter((a) => a.tipo === "SIC").map((a) => a.station));
  const nTracking = stdPresenti.size + sicPresenti.size;

  const calcola = async () => {
    if (!p.tariffeStd) return;
    setLavoro(true); setErrore(null); setRis(null); setSalvata(null);
    try {
      const [anno, mm] = p.mese.split("-").map(Number);
      const dati = await caricaDatiMese(p.mese, setStato);
      setAvvisi(dati.avvisi);
      const par = parametriAlla(p.parametri.map((x) => ({ chiave: x.voce, validaDal: x.validaDal, valore: x.valore })), p.fineMese);
      const ore: OreStation[] = [], stime: StimaStdStation[] = [], ctrl: ControlliStation[] = [];
      for (const t of dati.tracking.filter((x) => x.tipo === "STD").sort((a, b) => a.station.localeCompare(b.station))) {
        setStato(`Calcolo ${t.station} STD…`);
        const { lavoratori } = leggiLavoratori(t.sheets, anno, mm);
        const o = oreStation(t.station, lavoratori, p.festivi, p.tariffe);
        const nf = festiviMese(anno, mm, t.station, p.festivi).length;
        ore.push(o);
        stime.push(stimaStd(o, p.tariffeStd, { CTRB_H: par.STD_CTRB_H ?? 0.1, ALTRO_PCT: par.STD_ALTRO_PCT ?? 0.002, GG_MESE: par.STD_GG_MESE ?? 26, MOG: par.STD_MOG ?? 0 }, nf));
        const l = letturaFile(t.sheets, anno, mm);
        const oreL = o.standard + o.straord + o.suppl + o.accordo;
        ctrl.push({
          station: t.station, file: t.fileName, foglio: l.foglio, totaliFile: l.totali, oreLette: Math.round(oreL * 100) / 100, trasfAMano: l.trasfAMano,
          tetto: sforamentiTetto(lavoratori, p.parametri), accDom: accordoDomenica(lavoratori), oltre10: giorniOltre10(lavoratori),
          rapporti: rapportiAdit(o, p.aditCtrl[t.station]), mesePrec: rapportoMesePrec(oreL, p.oreLavoroPrec?.[t.station] ?? null),
        });
      }
      if (!ore.length) throw new Error("nessun tracking STD del mese nell'archivio: trascinali qui sopra");
      setRis({ ore, stime, ctrl });
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setStato(""); setLavoro(false); }
  };

  const salva = async () => {
    if (!ris) return;
    setLavoro(true);
    try {
      const righe = ris.stime.flatMap((s) => {
        const o = ris.ore.find((x) => x.station === s.station)!;
        return [
          ...s.righe.map((r) => ({ station: s.station, voce: r.voce, quantita: r.quantita, tariffa: r.tariffa, importo: r.importo })),
          { station: s.station, voce: "ORE_LAVORO", quantita: Math.round((o.standard + o.straord + o.suppl + o.accordo) * 100) / 100, tariffa: null, importo: 0 },
          { station: s.station, voce: "ACCORDO_ORE", quantita: o.accordo, tariffa: null, importo: 0 },
          { station: s.station, voce: "TESTE", quantita: o.teste, tariffa: null, importo: 0 },
          { station: s.station, voce: "TOTALE", quantita: null, tariffa: null, importo: s.totale },
        ];
      });
      const r = await salvaStima({ mese: p.mese, popolazione: "STD", righe, versioneAnagrafica: null, versioneParametri: `parametri ${p.versioneParametri ?? "—"} · tariffe ADIT ${p.meseTariffe}` });
      void r; setSalvata(`Stima STD ${it(p.mese)} salvata (${eur(totaleStime(ris.stime))} €).`); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  const vai = (m: string) => router.push(`/costi/fine-mese?mese=${m}`);
  const righeTab: [string, (o: OreStation, s: StimaStdStation) => number, "h" | "€" | "n"][] = [
    ["Teste", (o) => o.teste, "n"], ["Ore Standard (ordinarie)", (o) => o.standard - o.standardDF, "h"], ["Ore MAGG50 (Standard dom/festivi)", (o) => o.standardDF, "h"],
    ["Ore STR30", (o) => o.straord - o.straordDom, "h"], ["Ore STR65 (dom/festivi)", (o) => o.straordDom, "h"], ["Ore SUPP18", (o) => o.suppl - o.supplDom, "h"], ["Ore SUPP65 (dom/festivi)", (o) => o.supplDom, "h"],
    ["Ore Accordo 39-44 h (esposte, non valorizzate)", (o) => o.accordo, "h"], ["Trasferta gg (di cui dom)", (o) => o.trasfGg, "n"],
    ["€ Ore × tariffe ADIT", (_o, s) => s.costoOre, "€"], ["€ Trasferte", (_o, s) => s.trasferte, "€"],
    ...(["FESTIVITA", "FERIE_PERM_GOD", "CARENZA", "CTRB_DIGNITA", "ALTRO", "INTEGR_MOG"] as const).map((v) => [`€ ${{ FESTIVITA: "Festività", FERIE_PERM_GOD: "Ferie/ROL/ExF godute", CARENZA: "Carenza malattia", CTRB_DIGNITA: "CTRB Decr. Dignità", ALTRO: "Altro", INTEGR_MOG: "Integrazione MOG" }[v]}`, (_o: OreStation, s: StimaStdStation) => s.righe.find((r) => r.voce === v)!.importo, "€"] as [string, (o: OreStation, s: StimaStdStation) => number, "€"]),
    ["€ TOTALE STD competenza", (_o, s) => s.totale, "€"],
  ];
  const fmt = (v: number, u: string) => (u === "€" ? eur(v) : u === "h" ? h1(v) : v.toLocaleString("it-IT"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-sm">Mese di competenza<input className="input" type="month" value={p.mese} onChange={(e) => e.target.value && vai(e.target.value)} /></label>
      </div>

      <section className="card p-4 md:p-5">
        <h2 className="mb-3 text-[19px] font-semibold">Prerequisiti {it(p.mese)}</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          <Semaforo ok={nTracking === 14} warn={nTracking > 0}>Tracking nell&apos;archivio di questo PC: <b>{nTracking}/14</b> (STD {stdPresenti.size}/7, SIC {sicPresenti.size}/7){nTracking < 14 && <> — mancano {STATIONS_COSTI.filter((s) => !stdPresenti.has(s)).map((s) => `${s} STD`).concat(STATIONS_COSTI.filter((s) => !sicPresenti.has(s)).map((s) => `${s} SIC`)).join(", ")}</>}</Semaforo>
          <Semaforo ok={!!p.zucchetti} warn>Controllo Zucchetti di fine mese: {p.zucchetti ? <>eseguito il {new Date(p.zucchetti.il).toLocaleDateString("it-IT")} da {p.zucchetti.da}</> : <>non ancora eseguito (Presenze → Fine mese)</>}</Semaforo>
          <Semaforo ok={!!p.anagrafica && p.anagrafica.eta <= 3} warn={!!p.anagrafica}>Anagrafica CDL: {p.anagrafica ? <>versione {it(p.anagrafica.mese)} ({p.anagrafica.eta} mesi){p.anagrafica.eta > 3 && " — più di 3 mesi, chiedi a HR quella nuova"}</> : "nessuna (serve per la stima SIC)"}</Semaforo>
          <Semaforo ok={!!p.tariffeStd}>Tariffe STD dall&apos;ADIT: {p.meseTariffe ? <>ADIT {it(p.meseTariffe)} (Standard {eur(p.tariffeStd!.STANDARD)} · MAGG50 {eur(p.tariffeStd!.MAGG50)} · STR30 {eur(p.tariffeStd!.STR30)} · SUPP18 {eur(p.tariffeStd!.SUPP18)} · STR65 {eur(p.tariffeStd!.STR65)} €/h)</> : <>nessun ADIT fino al mese precedente: caricalo in <a className="underline" href="/costi/consuntivo">Consuntivo</a></>}</Semaforo>
        </ul>
        <div className="mt-4"><Dropzone titolo="Aggiungi tracking all'archivio di questo PC" accept=".xlsx,.xlsm" multiple lavoro={lavoro} onFiles={aggiungi}
          testo={<>Gli stessi file del modulo Presenze: se li hai già caricati lì non serve. Restano solo in questo browser.</>} /></div>
        {avvisi.length > 0 && <ul className="mt-3 text-sm text-ink-muted">{avvisi.map((a) => <li key={a}>• {a}</li>)}</ul>}
        {p.canRun && <button type="button" className="btn-primary mt-4" disabled={lavoro || !p.tariffeStd || stdPresenti.size === 0} onClick={calcola}>Calcola costi</button>}
        {stato && <p className="mt-2 text-sm text-ink-muted">{stato}</p>}
        {errore && <p className="mt-3 rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      </section>

      {ris && (
        <>
          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[19px] font-semibold">STD competenza {it(p.mese)} — {eur(totaleStime(ris.stime))} €</h2>
              {p.canRun && <button type="button" className="btn-primary" disabled={lavoro} onClick={salva}>Salva stima STD</button>}
            </div>
            {salvata && <p className="mb-3 rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">{salvata}</p>}
            <div className="overflow-x-auto"><table className="table-base text-sm">
              <thead><tr><th>Voce</th>{ris.stime.map((s) => <th key={s.station} className="text-right">{s.station}</th>)}<th className="text-right">Totale</th></tr></thead>
              <tbody>{righeTab.map(([l, f, u]) => {
                const v = ris.stime.map((s, i) => f(ris.ore[i], s));
                const tot = l.startsWith("€ TOTALE") ? totaleStime(ris.stime) : v.reduce((a, x) => a + x, 0);
                return <tr key={l} className={l.startsWith("€ TOTALE") ? "font-semibold" : ""}><td>{l}</td>{v.map((x, i) => <td key={i} className="text-right font-mono">{fmt(x, u)}{l.startsWith("Trasferta") ? ` (${ris.ore[i].trasfDom})` : ""}</td>)}<td className="text-right font-mono">{fmt(tot, u)}</td></tr>;
              })}</tbody>
            </table></div>
            <p className="mt-2 text-xs text-ink-muted">Tariffe dall&apos;ADIT {p.meseTariffe ? it(p.meseTariffe) : "—"}; trasferta alla tariffa della data di ogni giorno; festività = ore Standard / 26 × festivi del mese della station (patrono incluso); parametri validi dal {p.versioneParametri ?? "—"}.</p>
          </section>

          <section className="card p-4 md:p-5">
            <h2 className="mb-3 text-[19px] font-semibold">Controlli</h2>
            <div className="overflow-x-auto"><table className="table-base text-sm">
              <thead><tr><th>Controllo</th>{ris.ctrl.map((c) => <th key={c.station} className="text-right">{c.station}</th>)}</tr></thead>
              <tbody>
                <tr><td>Ore lette = riga Totali del file</td>{ris.ctrl.map((c) => { const ok = Math.abs(c.totaliFile - c.oreLette) < 0.5; return <td key={c.station} className={`text-right font-mono ${ok ? "" : "bg-danger-soft text-danger"}`} title={`${c.file} · foglio ${c.foglio}`}>{h1(c.oreLette)}{ok ? "" : ` ≠ ${h1(c.totaliFile)}`}</td>; })}</tr>
                {["Standard", "MAGG50", "STR30", "SUPP18", "Teste"].map((v) => (
                  <tr key={v}><td>{v === "Teste" ? "Teste tracking / teste" : `Ore ${v} stima /`} ADIT {p.meseCtrl ? it(p.meseCtrl) : "—"}</td>
                    {ris.ctrl.map((c) => { const r = c.rapporti.find((x) => x.voce === v)!; return <td key={c.station} className={`text-right font-mono ${r.rosso ? "bg-danger-soft text-danger" : ""}`} title={`${h1(r.stima)} / ${h1(r.riferimento)}`}>{r.rapporto === null ? "—" : r.rapporto.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>; })}</tr>
                ))}
                <tr><td>Ore lavoro / mese precedente (stima salvata)</td>{ris.ctrl.map((c) => <td key={c.station} className={`text-right font-mono ${c.mesePrec.rosso ? "bg-danger-soft text-danger" : ""}`}>{c.mesePrec.rapporto === null ? "—" : c.mesePrec.rapporto.toLocaleString("it-IT", { maximumFractionDigits: 2 })}</td>)}</tr>
                <tr><td>Celle trasferta scritte a mano</td>{ris.ctrl.map((c) => <td key={c.station} className={`text-right font-mono ${c.trasfAMano ? "bg-warn-soft text-warn" : ""}`}>{c.trasfAMano}</td>)}</tr>
                <tr><td>Settimane oltre il tetto CCNL (Standard + Accordo)</td>{ris.ctrl.map((c) => <td key={c.station} className={`text-right font-mono ${c.tetto.length ? "bg-warn-soft text-warn" : ""}`} title={c.tetto.slice(0, 20).map((t) => `${t.nome} sett. ${it(t.settimana)}: ${h1(t.ore)} h > ${t.tetto}`).join("\n")}>{c.tetto.length}</td>)}</tr>
                <tr><td>Accordo di domenica (R4)</td>{ris.ctrl.map((c) => <td key={c.station} className={`text-right font-mono ${c.accDom.length ? "bg-warn-soft text-warn" : ""}`} title={c.accDom.map((a) => `${a.nome} ${it(a.data)} ${h1(a.ore)} h`).join("\n")}>{c.accDom.length}</td>)}</tr>
                <tr><td>Giorni con più di 10 ore (R2)</td>{ris.ctrl.map((c) => <td key={c.station} className={`text-right font-mono ${c.oltre10 ? "bg-warn-soft text-warn" : ""}`}>{c.oltre10}</td>)}</tr>
              </tbody>
            </table></div>
            <p className="mt-2 text-xs text-ink-muted">Rosso: ore stima/ADIT fuori 0,85–1,15, ore mese/mese precedente fuori 0,7–1,4, ore lette diverse dalla riga Totali. Passa il mouse sulle celle per il dettaglio.</p>
          </section>
          <p className="text-sm text-ink-muted">Stima SIC (busta del 27), Excel e testo per Teams: arrivano con la prossima versione.</p>
        </>
      )}
    </div>
  );
}
