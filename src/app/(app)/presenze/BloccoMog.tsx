"use client";

import { useMemo, useState } from "react";
import ExcelJS from "exceljs";
import Link from "next/link";
import { leggiLavoratori } from "@/domain/presenze/lavoratori";
import type { TrackingInput } from "@/domain/presenze/controlloSettimanale";
import { controlloMog, riepilogoMog, type ContrattoMog, type EsitoMog, type VariazioneMog } from "@/domain/mog/mog";
import { scarica, tabella } from "@/lib/presenze/excelUtil";
import { Aiuto } from "@/components/Aiuto";
import { salvaEsitiMog } from "../costi/actions";

export type DatiMogClient = { versione: string | null; contratti: ContrattoMog[]; variazioni: VariazioneMog[]; tariffa: number; meseTariffa: string | null };

const h = (x: number | null) => (x === null ? "—" : x.toLocaleString("it-IT", { maximumFractionDigits: 1 }));
const eur = (x: number) => x.toLocaleString("it-IT", { maximumFractionDigits: 0 });
const it = (s: string | null) => (s ? s.split("-").reverse().join("/") : "—");
const TONO: Record<string, string> = { OK: "badge-ok", "SOTTO MOG": "badge-danger", "A RISCHIO": "badge-warn", "ZERO ORE": "badge-danger", "NON IN FILE MOG": "badge-info", "NON NEL TRACKING": "badge-neutral" };

/**
 * Blocco MOG per Presenze. Settimanale (finoA < fine mese): lavoratori A RISCHIO / ZERO ORE con la
 * proiezione e una riga per Teams. Fine mese: tabella completa per station, Excel e salvataggio.
 */
export function BloccoMog({ mese, finoA, tracking, mog, modo, canSave }: { mese: string; finoA: string; tracking: TrackingInput[]; mog: DatiMogClient; modo: "settimanale" | "finemese"; canSave: boolean }) {
  const [anno, mm] = mese.split("-").map(Number);
  const [salvato, setSalvato] = useState<string | null>(null);
  const [copiato, setCopiato] = useState<string | null>(null);
  const esiti = useMemo(() => tracking.filter((t) => t.tipo === "STD").flatMap((t) => {
    try { return controlloMog({ station: t.station, mese, lavoratori: leggiLavoratori(t.sheets, anno, mm).lavoratori, contratti: mog.contratti, variazioni: mog.variazioni, finoA, tariffa: mog.tariffa }); } catch { return []; }
  }), [tracking, mog, mese, finoA, anno, mm]);
  if (!mog.versione) return <section className="card p-4 text-sm"><h2 className="mb-1 text-[19px] font-semibold">MOG</h2><p className="text-warn">Nessun file MOG di Adecco caricato: caricalo in <Link className="underline" href="/costi/parametri#mog">Costi → Parametri e anagrafica</Link>.</p></section>;
  const stations = [...new Set(esiti.map((e) => e.station))].sort();
  const visibili = modo === "settimanale" ? esiti.filter((e) => e.stato === "A RISCHIO" || e.stato === "ZERO ORE" || e.stato === "NON IN FILE MOG") : esiti;
  const vecchio = (Date.parse(finoA) - Date.parse(mog.versione)) / 864e5 > 40;

  const teams = (st: string) => {
    const x = esiti.filter((e) => e.station === st && (e.stato === "A RISCHIO" || e.stato === "ZERO ORE"));
    if (!x.length) return `MOG ${st}: nessun lavoratore sotto proiezione.`;
    return `MOG ${st}: ${x.length} lavoratori sotto proiezione (${x.map((e) => `${e.nome} ${h(e.oreMancanti)} h`).join(", ")}) — assegnare rotte entro fine mese.`;
  };
  const excel = async () => {
    const wb = new ExcelJS.Workbook(); wb.creator = "FleetDSP";
    for (const st of stations) tabella(wb.addWorksheet(`MOG_${st}`), `MOG_${st}`, [{ name: "Lavoratore", width: 30 }, { name: "Ore MOG mese", numFmt: "0.0" }, { name: "% MOG" }, { name: "Fine contratto", date: true }, { name: "Ore lavorate", numFmt: "0.0" }, { name: "Assenze retribuite", numFmt: "0.0" }, { name: "Non retribuite", numFmt: "0.0" }, { name: "Computo", numFmt: "0.0" }, { name: "Gap", numFmt: "0.0" }, { name: "Stato", width: 18 }, { name: "Costo integrazione €", numFmt: "#,##0.00" }],
      esiti.filter((e) => e.station === st).map((e) => [e.nome, e.oreMog, e.pctMog, e.dataFine, e.oreLavorate, e.assenzeRetribuite, e.nonRetribuite, e.computo, e.gap, e.stato, e.costo]));
    await scarica(wb, `Controllo_MOG_${stations.length === 1 ? stations[0] : "tutte"}_${mese}.xlsx`);
  };
  const salva = async () => {
    await salvaEsitiMog({ mese, righe: esiti.map((e) => ({ station: e.station, cf: e.cf, nome: e.nome, oreLav: e.oreLavorate, oreAssRetrib: e.assenzeRetribuite, computo: e.computo, oreMog: e.oreMog, gap: e.gap, stato: e.stato, proiezioneFineMese: e.proiezione, costoIntegrazione: e.costo })) });
    setSalvato("Esiti MOG salvati: la riga Integrazione MOG dei costi li userà.");
  };
  const riga = (e: EsitoMog) => (
    <tr key={`${e.station}|${e.cf}|${e.nome}`}>
      <td>{e.station}</td><td>{e.nome}{e.abbinatoPerNome && <span className="ml-1 text-xs text-ink-muted">(per nome)</span>}{e.soloAssenze && <span className="ml-1 text-xs text-warn">(solo assenze)</span>}{e.rischioConsolidamento && <span className="ml-1 badge-warn">consolidamento</span>}</td>
      <td className="text-right font-mono">{h(e.oreMog)}</td><td className="text-right font-mono">{e.pctMog ?? "—"}</td><td>{it(e.dataFine)}</td>
      <td className="text-right font-mono">{h(e.oreLavorate)}</td><td className="text-right font-mono">{h(e.assenzeRetribuite)}</td><td className="text-right font-mono">{h(e.computo)}</td>
      {modo === "settimanale" && <><td className="text-right font-mono">{h(e.proiezione)}</td><td className="text-right font-mono">{e.giorniResidui}</td></>}
      <td className="text-right font-mono">{h(e.gap)}</td><td className="text-right font-mono">{e.oreMancanti ? h(e.oreMancanti) : ""}</td><td><span className={TONO[e.stato]}>{e.stato}</span></td><td className="text-right font-mono">{e.costo ? eur(e.costo) : ""}</td>
    </tr>
  );
  return (
    <section className="card flex flex-col gap-3 p-4 md:p-5" aria-label="Controllo MOG">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[19px] font-semibold">MOG somministrati STD — {modo === "settimanale" ? `proiezione a fine mese (dati al ${it(finoA)})` : `fine mese ${it(mese)}`}</h2>
        <span className="text-xs text-ink-muted">file MOG del {it(mog.versione)} · tariffa {mog.tariffa.toLocaleString("it-IT")} €/h{mog.meseTariffa ? ` (ADIT ${it(mog.meseTariffa)})` : ""}</span>
      </div>
      {vecchio && <p className="rounded-control bg-warn-soft px-4 py-2 text-sm text-warn">Il file MOG ha più di 40 giorni: chiedi a Erika il file aggiornato.</p>}
      <div className="overflow-x-auto"><table className="table-base text-sm">
        <thead><tr><th>Station</th><th className="text-right">OK</th><th className="text-right">{modo === "settimanale" ? "A rischio" : "Sotto MOG"}</th><th className="text-right">Zero ore</th><th className="text-right">Non in file MOG</th><th className="text-right">Non nel tracking</th><th className="text-right">Ore mancanti</th><th className="text-right">€ integrazione</th>{modo === "settimanale" && <th>Teams</th>}</tr></thead>
        <tbody>{stations.map((st) => { const r = riepilogoMog(esiti.filter((e) => e.station === st)); const ore = esiti.filter((e) => e.station === st && (e.stato === "A RISCHIO" || e.stato === "SOTTO MOG")).reduce((t, e) => t + e.oreMancanti, 0); return (
          <tr key={st}><td className="font-semibold">{st}</td><td className="text-right font-mono">{r.ok}</td><td className={`text-right font-mono ${(modo === "settimanale" ? r.aRischio : r.sotto) ? "bg-danger-soft text-danger" : ""}`}>{modo === "settimanale" ? r.aRischio : r.sotto}</td><td className={`text-right font-mono ${r.zeroOre ? "bg-danger-soft text-danger" : ""}`}>{r.zeroOre}</td><td className={`text-right font-mono ${r.nonInFile ? "bg-info-soft text-info" : ""}`}>{r.nonInFile}</td><td className="text-right font-mono">{r.nonNelTracking}</td><td className="text-right font-mono">{h(Math.round(ore * 10) / 10)}</td><td className="text-right font-mono">{eur(r.costo + r.costoZeroOre)}</td>
            {modo === "settimanale" && <td><button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={async () => { await navigator.clipboard.writeText(teams(st)).catch(() => {}); setCopiato(teams(st)); }}>Copia riga</button></td>}</tr>); })}</tbody>
      </table></div>
      {copiato && <p className="rounded-control bg-ok-soft px-3 py-2 text-xs">Copiato: {copiato}</p>}
      <details open={modo === "settimanale"}>
        <summary className="cursor-pointer text-sm font-semibold">{modo === "settimanale" ? `Lavoratori da seguire (${visibili.length})` : `Tutti i lavoratori (${visibili.length})`}</summary>
        <div className="mt-2 overflow-x-auto"><table className="table-base text-xs">
          <thead><tr><th>DS</th><th>Lavoratore</th><th className="text-right">MOG h</th><th className="text-right">%</th><th>Fine contratto</th><th className="text-right">Lavorate</th><th className="text-right">Ass. retrib.</th><th className="text-right">Computo</th>{modo === "settimanale" && <><th className="text-right">Proiezione</th><th className="text-right">Gg residui</th></>}<th className="text-right">Gap</th><th className="text-right">Mancano</th><th>Stato</th><th className="text-right">€</th></tr></thead>
          <tbody>{visibili.sort((a, b) => a.station.localeCompare(b.station) || (a.gap ?? 999) - (b.gap ?? 999)).map(riga)}</tbody>
        </table></div>
      </details>
      <p className="text-xs text-ink-muted">Computo = ore lavorate (Standard, Straordinario, Supplementare, Accordo) + assenze retribuite (ferie, ROL, ExF, 104, malattia, infortunio, permessi sindacali e altri). Non contano permessi non retribuiti e assenze ingiustificate. {modo === "settimanale" ? "A rischio = la proiezione a fine mese resta sotto il MOG di oltre 4 h: chiedi agli Ops di assegnare rotte." : "Non in file MOG = assunto dopo la chiusura payroll del file: MOG da chiedere a Erika."}</p>
      {modo === "finemese" && <div className="flex flex-wrap items-center gap-2"><button type="button" className="btn-secondary" onClick={excel}>Excel MOG</button>{canSave && <><button type="button" className="btn-primary" onClick={salva} disabled={!!salvato}>{salvato ? "Salvati ✓" : "Salva esiti MOG"}</button> <Aiuto k="presenze.mog.salva" /></>}{salvato && <span className="text-sm text-ok">{salvato}</span>}</div>}
    </section>
  );
}
