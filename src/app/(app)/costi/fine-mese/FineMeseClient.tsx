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
import { bustaLavoratore, bustaStation, lavoratoriSic, sicLordo, type BustaLavoratore, type BustaStation, type LavoratoreSic, type ParametriSic, type SicLordo } from "@/domain/costi/sic";
import type { RigaCDL } from "@/domain/costi/anagrafica";
import { testoTeams, type RigaTeams } from "@/domain/costi/teams";
import { valoreAlla } from "@/domain/costi/tariffe";
import { excelStima } from "@/lib/costi/excelStima";
import { scarica } from "@/lib/presenze/excelUtil";
import { salvaStima } from "../actions";
import { Aiuto, Motivo } from "@/components/Aiuto";

type Props = {
  mese: string; fineMese: string; canRun: boolean; tariffe: ValorePerData[]; parametri: ValorePerData[]; versioneParametri: string | null;
  festivi: Festivo[]; tariffeStd: TariffeStd | null; meseTariffe: string | null; aditCtrl: AggregatoAdit; meseCtrl: string | null;
  anagrafica: { mese: string; eta: number } | null; zucchetti: { il: string; da: string } | null; oreLavoroPrec: Record<string, number> | null;
  righeCdl: RigaCDL[]; aditDwh: { station: string; voce: string; quantita: number; costo: number; teste: number }[]; utente: string;
};

type Sic = { lav: LavoratoreSic[]; busta: BustaLavoratore[]; perStation: BustaStation[]; lordo: SicLordo[]; nonTracciati: { nome: string; station: string; cdl: number }[]; par: ParametriSic };

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
  const [ris, setRis] = useState<{ ore: OreStation[]; stime: StimaStdStation[]; ctrl: ControlliStation[]; sic: Sic | null } | null>(null);
  const [salvataSic, setSalvataSic] = useState<string | null>(null);
  const [teams, setTeams] = useState<string | null>(null);
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
    setLavoro(true); setErrore(null); setRis(null); setSalvata(null); setSalvataSic(null); setTeams(null);
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
      let sic: Sic | null = null;
      const trkSic = dati.tracking.filter((x) => x.tipo === "SIC").sort((a, b) => a.station.localeCompare(b.station));
      if (trkSic.length && p.righeCdl.length) {
        const idx = new Map(p.righeCdl.map((r) => [r.cf, r]));
        const parS: ParametriSic = { MOLT_ONERI: par.SIC_MOLT_ONERI ?? 1.434, STR_FT: par.SIC_STR_FT ?? 17.9, STR_PT: par.SIC_STR_PT ?? 16.1, SUPP: par.SIC_SUPP ?? 14.1, DOMFEST: par.SIC_DOMFEST ?? 4.6, MALATTIA_H: par.SIC_MALATTIA_H ?? -9.5, CARENZA_PCT: par.SIC_CARENZA_PCT ?? 0.025 };
        const lav: LavoratoreSic[] = [];
        for (const t of trkSic) {
          setStato(`Calcolo ${t.station} SIC…`);
          const { lavoratori } = leggiLavoratori(t.sheets, anno, mm);
          lav.push(...lavoratoriSic(t.station, lavoratori, idx, p.festivi, p.tariffe, festiviMese(anno, mm, t.station, p.festivi).map((f) => f.data)));
        }
        const st = [...new Set(lav.map((x) => x.station))];
        const tracciati = new Set(lav.filter((x) => x.anag).map((x) => x.anag!.cf));
        sic = {
          lav, busta: lav.map((x) => bustaLavoratore(x, parS)), par: parS,
          perStation: st.map((s) => bustaStation(s, lav.filter((x) => x.station === s), parS)),
          lordo: st.map((s) => sicLordo(s, lav.filter((x) => x.station === s), p.tariffeStd!, { dispatcherTrasferta: true })),
          nonTracciati: p.righeCdl.filter((r) => !tracciati.has(r.cf)).map((r) => ({ nome: `${r.cognome} ${r.nome}`, station: r.station, cdl: r.cdl })),
        };
      }
      setRis({ ore, stime, ctrl, sic });
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

  /** Ore per il ricalcolo dei coefficienti dal payroll del mese dopo (gruppo FT = FT + dispatcher). */
  const oreSicStation = (st: string): [string, number][] => {
    const l = ris!.sic!.lav.filter((x) => x.station === st);
    const S = (f: (x: LavoratoreSic) => number, ll = l) => Math.round(ll.reduce((a, x) => a + f(x), 0) * 100) / 100;
    const ft = l.filter((x) => x.bucket === "CTI FT" || x.bucket === "DISPATCHER"), pt = l.filter((x) => !ft.includes(x));
    return [["ORE_STR_FT", S((x) => x.straord, ft)], ["ORE_STR_PT", S((x) => x.straord, pt)], ["ORE_SUPP", S((x) => x.suppl)], ["ORE_DOMFEST", S((x) => x.oreDomFest)], ["ORE_MALATTIA", S((x) => x.malattia + x.infortunio)]];
  };

  const salvaSic = async () => {
    if (!ris?.sic) return;
    setLavoro(true);
    try {
      const righe = ris.sic.perStation.flatMap((b) => {
        const l = ris.sic!.lordo.find((x) => x.station === b.station)!;
        return [["BASE", b.base], ["TRASFERTA", b.trasferte], ["ISTITUTI", b.istituti], ["ASSENZE", b.assenze], ["FERIE_GODUTE", b.ferieGodute], ["LORDO_V2", l.lordo], ["SAVING_RATEI", l.savingRatei], ["FEST_NON_GODUTE", l.festNonGodute]]
          .map(([voce, importo]) => ({ station: b.station, voce: voce as string, quantita: null as number | null, tariffa: null as number | null, importo: importo as number }))
          .concat([{ station: b.station, voce: "TESTE", quantita: b.teste, tariffa: null, importo: 0 }, { station: b.station, voce: "CDL_STIMATI", quantita: b.cdlStimati, tariffa: null, importo: 0 }, { station: b.station, voce: "TOTALE", quantita: null, tariffa: null, importo: b.totale }])
          .concat(oreSicStation(b.station).map(([voce, q]) => ({ station: b.station, voce, quantita: q, tariffa: null, importo: 0 })));
      });
      await salvaStima({ mese: p.mese, popolazione: "SIC", righe, versioneAnagrafica: p.anagrafica?.mese ?? null, versioneParametri: `parametri ${p.versioneParametri ?? "—"} · tariffe ADIT ${p.meseTariffe}` });
      setSalvataSic(`Stima SIC ${it(p.mese)} (busta del 27 del mese dopo) salvata: ${eur(ris.sic.perStation.reduce((a, b) => a + b.totaleEsatto, 0))} €.`); router.refresh();
    } catch (e) { setErrore(e instanceof Error ? e.message : String(e)); } finally { setLavoro(false); }
  };

  const avvisiStation = (st: string) => {
    const c = ris!.ctrl.find((x) => x.station === st);
    const out: { peso: number; testo: string }[] = [];
    if (c) {
      if (Math.abs(c.totaliFile - c.oreLette) >= 0.5) out.push({ peso: 9, testo: `ore STD lette ${h1(c.oreLette)} ≠ Totali ${h1(c.totaliFile)}` });
      for (const r of c.rapporti.filter((x) => x.rosso)) out.push({ peso: 5 + Math.abs((r.rapporto ?? 1) - 1), testo: `${r.voce} stima/ADIT ${r.rapporto!.toLocaleString("it-IT", { maximumFractionDigits: 2 })}` });
      if (c.mesePrec.rosso) out.push({ peso: 4, testo: `ore/mese prec. ${c.mesePrec.rapporto!.toLocaleString("it-IT", { maximumFractionDigits: 2 })}` });
      if (c.trasfAMano) out.push({ peso: 3, testo: `${c.trasfAMano} trasferte scritte a mano` });
      if (c.tetto.length) out.push({ peso: 2, testo: `${c.tetto.length} settimane oltre il tetto CCNL` });
      if (c.accDom.length) out.push({ peso: 2, testo: `${c.accDom.length} Accordo di domenica` });
    }
    const b = ris!.sic?.perStation.find((x) => x.station === st);
    if (b?.cdlStimati) out.push({ peso: 6, testo: `${b.cdlStimati} SIC senza CDL (media bucket)` });
    const disp = ris!.sic?.lordo.find((x) => x.station === st)?.trasfDispatcherGg;
    if (disp) out.push({ peso: 1, testo: `${disp} gg trasferta dispatcher in tracking (in busta 0)` });
    return out;
  };

  const righeTeams = (): RigaTeams[] => [...new Set([...ris!.stime.map((s) => s.station), ...(ris!.sic?.perStation.map((b) => b.station) ?? [])])].sort().map((st) => {
    const s = ris!.stime.find((x) => x.station === st), o = ris!.ore.find((x) => x.station === st), b = ris!.sic?.perStation.find((x) => x.station === st);
    return { station: st, std: s?.totale ?? null, stdTeste: o?.teste ?? null, sic: b?.totale ?? null, sicTeste: b?.teste ?? null, avvisi: avvisiStation(st) };
  });

  const testo = async () => {
    const t = testoTeams(p.mese, righeTeams(), [`STD = competenza del mese (tariffe ADIT ${p.meseTariffe ? it(p.meseTariffe) : "—"}); SIC = busta del 27 del mese successivo (anagrafica CDL ${p.anagrafica ? it(p.anagrafica.mese) : "—"}).`]);
    setTeams(t);
    try { await navigator.clipboard.writeText(t); } catch { /* copia a mano dal riquadro */ }
  };

  const excel = async () => {
    if (!ris || !p.tariffeStd) return;
    const [anno, mm] = p.mese.split("-").map(Number);
    const primo = `${p.mese}-01`;
    const par = parametriAlla(p.parametri.map((x) => ({ chiave: x.voce, validaDal: x.validaDal, valore: x.valore })), p.fineMese);
    const tr = valoreAlla(p.tariffe, "TRASFERTA", primo) ?? 0, ex = valoreAlla(p.tariffe, "TRASFERTA_DOM_EXTRA", primo) ?? 0;
    const stations = [...new Set([...ris.stime.map((s) => s.station), ...(ris.sic?.perStation.map((b) => b.station) ?? [])])].sort();
    const rett: [string, string, string][] = [];
    for (const x of ris.sic?.lav.filter((y) => !y.inAnagrafica) ?? []) rett.push([`${x.station} ${x.nome}`, `CDL assente in anagrafica ${p.anagrafica?.mese ?? ""}`, `CDL = media bucket ${x.bucket} della station (${eur(x.cdl)} €)`]);
    for (const x of ris.sic?.lav.filter((y) => y.cfCorretto) ?? []) rett.push([`${x.station} ${x.nome}`, "codice fiscale con 0/O finale", "abbinato all'anagrafica con la correzione O↔0"]);
    for (const x of ris.sic?.nonTracciati ?? []) rett.push([`${x.station} ${x.nome}`, `in anagrafica CDL (${eur(x.cdl)} €)`, "non presente nel tracking SIC del mese: escluso"]);
    for (const st of stations) for (const a of avvisiStation(st)) rett.push([st, "controllo", a.testo]);
    const wb = excelStima({
      mese: p.mese, stations, oreStd: ris.ore, stimeStd: ris.stime, tariffeStd: p.tariffeStd, meseTariffe: p.meseTariffe ?? "", aditDwh: p.aditDwh,
      parStd: { TRASF: tr, TRASFDOM: tr + ex, CTRB: par.STD_CTRB_H ?? 0.1, ALTRO: par.STD_ALTRO_PCT ?? 0.002, GGMESE: par.STD_GG_MESE ?? 26, MOG: par.STD_MOG ?? 0 },
      sic: ris.sic ? { lav: ris.sic.lav, busta: ris.sic.busta } : null, sicLordo: ris.sic?.lordo ?? [], parSic: ris.sic?.par ?? null, dispTrasferta: true,
      festivi: p.festivi, nFestivi: Object.fromEntries(stations.map((s) => [s, festiviMese(anno, mm, s, p.festivi).length])), rettifiche: rett.length ? rett : [["—", "nessuna rettifica", ""]], versioneAnagrafica: p.anagrafica?.mese ?? null,
    });
    await scarica(wb, `Stima_AMZ_${p.mese.slice(5)}_${p.mese.slice(2, 4)}.xlsx`);
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
        <div className="mt-4"><Dropzone titolo="Aggiungi tracking all'archivio di questo PC" aiuto="costi.tracking" accept=".xlsx,.xlsm" multiple lavoro={lavoro} onFiles={aggiungi}
          testo={<>Gli stessi file del modulo Presenze: se li hai già caricati lì non serve. Restano solo in questo browser.</>} /></div>
        {avvisi.length > 0 && <ul className="mt-3 text-sm text-ink-muted">{avvisi.map((a) => <li key={a}>• {a}</li>)}</ul>}
        {p.canRun && <><button type="button" className="btn-primary mt-4" disabled={lavoro || !p.tariffeStd || stdPresenti.size === 0} onClick={calcola}>Calcola costi</button> <Aiuto k="costi.calcola" /></>}
        {p.canRun && <Motivo testo={!p.tariffeStd ? "Calcola costi è spento: carica prima l'ADIT del mese precedente in Consuntivo." : stdPresenti.size === 0 ? "Calcola costi è spento: aggiungi qui sopra i tracking STD del mese." : null} href={!p.tariffeStd ? "/costi/consuntivo" : undefined} />}
        {stato && <p className="mt-2 text-sm text-ink-muted">{stato}</p>}
        {errore && <p className="mt-3 rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{errore}</p>}
      </section>

      {ris && (
        <>
          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[19px] font-semibold">STD competenza {it(p.mese)} — {eur(totaleStime(ris.stime))} €</h2>
              {p.canRun && <><button type="button" className="btn-primary" disabled={lavoro} onClick={salva}>Salva stima STD</button> <Aiuto k="costi.salva.std" /></>}
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
          {ris.sic ? (
            <section className="card p-4 md:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[19px] font-semibold">SIC busta 27 del mese dopo (tracking {it(p.mese)}) — {eur(ris.sic.perStation.reduce((a, b) => a + b.totaleEsatto, 0))} €</h2>
                {p.canRun && <><button type="button" className="btn-primary" disabled={lavoro} onClick={salvaSic}>Salva stima SIC</button> <Aiuto k="costi.salva.sic" /></>}
              </div>
              {salvataSic && <p className="mb-3 rounded-control bg-ok-soft px-4 py-3 text-sm text-ok">{salvataSic}</p>}
              <div className="overflow-x-auto"><table className="table-base text-sm">
                <thead><tr><th>Voce</th>{ris.sic.perStation.map((b) => <th key={b.station} className="text-right">{b.station}</th>)}<th className="text-right">Totale</th></tr></thead>
                <tbody>{([["Teste", (b: BustaStation) => b.teste, "n"], ["di cui CDL stimati (media bucket)", (b: BustaStation) => b.cdlStimati, "n"], ["Base CDL", (b: BustaStation) => b.base, "€"], ["Trasferte (dispatcher esclusi)", (b: BustaStation) => b.trasferte, "€"],
                  ["Istituti (trasferta + lordi × oneri)", (b: BustaStation) => b.istituti, "€"], ["Assenze", (b: BustaStation) => b.assenze, "€"], ["Ferie/ROL/ExF godute", (b: BustaStation) => b.ferieGodute, "€"], ["TOTALE busta", (b: BustaStation) => b.totale, "€"]] as [string, (b: BustaStation) => number, string][]).map(([l, f, u]) => {
                  const v = ris.sic!.perStation.map(f);
                  return <tr key={l} className={l.startsWith("TOTALE") ? "font-semibold" : ""}><td>{l}</td>{v.map((x, i) => <td key={i} className={`text-right font-mono ${l.startsWith("di cui") && x ? "bg-warn-soft text-warn" : ""}`}>{fmt(x, u)}</td>)}<td className="text-right font-mono">{fmt(l.startsWith("TOTALE") ? ris.sic!.perStation.reduce((a, b) => a + b.totaleEsatto, 0) : v.reduce((a, x) => a + x, 0), u)}</td></tr>;
                })}
                  <tr><td colSpan={ris.sic.perStation.length + 2} className="bg-surface-sunken text-xs font-semibold uppercase text-ink-muted">Metodo del file Stima v2 (confronto)</td></tr>
                  {([["SIC lordo (CDL + trasferte + ore × tariffe STD)", (l: SicLordo) => l.lordo], ["Saving ratei goduti", (l: SicLordo) => l.savingRatei], ["Festività non godute (potenziale max)", (l: SicLordo) => l.festNonGodute], ["Ore Accordo (esposte)", (l: SicLordo) => l.accordo], ["gg trasferta dispatcher nel tracking", (l: SicLordo) => l.trasfDispatcherGg]] as [string, (l: SicLordo) => number][]).map(([lab, f]) => {
                    const v = ris.sic!.lordo.map(f);
                    const u = lab.startsWith("Ore") || lab.startsWith("gg") ? "n" : "€";
                    return <tr key={lab}><td>{lab}</td>{v.map((x, i) => <td key={i} className="text-right font-mono">{fmt(x, u)}</td>)}<td className="text-right font-mono">{fmt(v.reduce((a, x) => a + x, 0), u)}</td></tr>;
                  })}
                </tbody>
              </table></div>
              <p className="mt-2 text-xs text-ink-muted">Base = CDL dell&apos;anagrafica {p.anagrafica ? it(p.anagrafica.mese) : ""} (costo pieno mensile). Istituti del mese: trasferta (esente) + straordinario {ris.sic.par.STR_FT}/{ris.sic.par.STR_PT} €/h, supplementare {ris.sic.par.SUPP} €/h, ore dom/festivo {ris.sic.par.DOMFEST} €/h e festività non godute, × {ris.sic.par.MOLT_ONERI}. Assenze: malattia/infortunio {ris.sic.par.MALATTIA_H} €/h × {ris.sic.par.MOLT_ONERI} + carenza, permessi non retribuiti al costo orario. Dispatcher: nessuna trasferta.
                {ris.sic.nonTracciati.length > 0 && <> In anagrafica ma non nel tracking: {ris.sic.nonTracciati.length} persone ({eur(ris.sic.nonTracciati.reduce((a, x) => a + x.cdl, 0))} €), escluse.</>}</p>
            </section>
          ) : <p className="text-sm text-warn">{p.righeCdl.length ? "Nessun tracking SIC del mese nell'archivio: la stima SIC non è stata calcolata." : "Nessuna anagrafica CDL: la stima SIC non è stata calcolata."}</p>}
          <section className="card flex flex-col gap-3 p-4 md:p-5">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={excel}>Excel</button> <Aiuto k="costi.excel" />
              <button type="button" className="btn-secondary" onClick={testo}>Testo per Teams</button> <Aiuto k="costi.teams" />
            </div>
            {teams && <><p className="text-sm text-ok">Copiato negli appunti: incollalo nella chat Teams (se non è stato copiato, selezionalo qui sotto).</p><textarea className="input h-56 w-full font-mono text-xs" readOnly value={teams} /></>}
          </section>
        </>
      )}
    </div>
  );
}
