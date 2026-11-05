/**
 * Excel della stima di fine mese con la struttura di Stima_AMZ_*_v2: pagina a
 * formula (SUMIFS sui fogli DWH), Rettifiche, Parametri, DWH_Ore_STD,
 * DWH_Ore_SIC, DWH_SIC, DWH_ADIT, Festivi. Tabelle native, stile standard.
 * Ogni formula porta anche il risultato calcolato qui, così il file si legge
 * subito anche senza ricalcolo.
 */
import ExcelJS from "exceljs";
import { tabella } from "@/lib/presenze/excelUtil";
import type { OreStation, StimaStdStation } from "@/domain/costi/std";
import type { BustaLavoratore, LavoratoreSic, ParametriSic, SicLordo } from "@/domain/costi/sic";
import type { TariffeStd } from "@/domain/costi/adit";

export type InputExcel = {
  mese: string; stations: string[];
  oreStd: OreStation[]; stimeStd: StimaStdStation[]; tariffeStd: TariffeStd; meseTariffe: string;
  aditDwh: { station: string; voce: string; quantita: number; costo: number; teste: number }[];
  parStd: { TRASF: number; TRASFDOM: number; CTRB: number; ALTRO: number; GGMESE: number; MOG: number };
  sic: { lav: LavoratoreSic[]; busta: BustaLavoratore[] } | null; sicLordo: SicLordo[]; parSic: ParametriSic | null; dispTrasferta: boolean;
  festivi: { data: string; descrizione: string; station: string }[]; nFestivi: Record<string, number>;
  rettifiche: [string, string, string][]; versioneAnagrafica: string | null;
  /** integrazione MOG per station (controllo MOG): se c'è, la riga MOG usa questi valori come a schermo */
  mogPerStation?: Record<string, number>;
};

const MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const L = (n: number) => { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const F = (formula: string, result: number) => ({ formula, result: Number.isFinite(result) ? Math.round(result * 1e6) / 1e6 : 0 });
const r2 = (x: number) => Math.round(x * 100) / 100;

export function excelStima(x: InputExcel): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const [anno, mm] = x.mese.split("-").map(Number);
  // nome diverso dal foglio AMZ_<MMM>_<AA> di Stima_Costo_personale (struttura diversa: niente confusione nel copia-incolla)
  const pg = wb.addWorksheet(`STIMA_SITO_${MESI[mm - 1]}_${String(anno).slice(2)}`);
  const wr = wb.addWorksheet("Rettifiche");
  const wp = wb.addWorksheet("Parametri");

  // ── DWH_Ore_STD / DWH_Ore_SIC
  type RigaOre = [string, string, number, number];
  const oreStd: RigaOre[] = [];
  for (const o of x.oreStd) {
    oreStd.push([o.station, "Standard", o.standard, o.standardDF], [o.station, "Straordinario", o.straord, o.straordDom], [o.station, "Supplementare", o.suppl, o.supplDom], [o.station, "Accordo", o.accordo, 0],
      [o.station, "Ferie", o.ferie, 0], [o.station, "ROL", o.rol, 0], [o.station, "ExF", o.exf, 0], [o.station, "Malattia", o.malattia, 0], [o.station, "Infortunio", o.infortunio, 0],
      [o.station, "Carenza malattia (ore primi 3 gg)", o.carenzaOre, 0], [o.station, "Trasferta gg", o.trasfGg, o.trasfDom], [o.station, "Trasferta €", o.trasfEuro, 0], [o.station, "Teste", o.teste, 0]);
  }
  const wOs = wb.addWorksheet("DWH_Ore_STD");
  tabella(wOs, "DWH_Ore_STD", [{ name: "Station" }, { name: "Voce", width: 34 }, { name: "Ore_tot", numFmt: "#,##0.00" }, { name: "Ore_domfest", numFmt: "#,##0.00" }], oreStd);
  const nOs = oreStd.length + 1;
  const oreSic: RigaOre[] = [];
  const lav = x.sic?.lav ?? [];
  for (const st of x.stations) {
    const l = lav.filter((y) => y.station === st);
    if (!l.length) continue;
    const S = (f: (y: LavoratoreSic) => number, ll = l) => r2(ll.reduce((a, y) => a + f(y), 0));
    const d = l.filter((y) => y.bucket === "DISPATCHER");
    oreSic.push([st, "Standard", S((y) => y.standard), S((y) => y.standardDF)], [st, "Straordinario", S((y) => y.straord), S((y) => y.straordDom)], [st, "Supplementare", S((y) => y.suppl), S((y) => y.supplDom)],
      [st, "Accordo", S((y) => y.accordo), 0], [st, "Ferie", S((y) => y.ferie), 0], [st, "ROL", S((y) => y.rol), 0], [st, "ExF", S((y) => y.exf), 0], [st, "Malattia", S((y) => y.malattia), 0],
      [st, "Infortunio", S((y) => y.infortunio), 0], [st, "Trasferta gg", S((y) => y.trasfGg), S((y) => y.trasfDom)], [st, "Trasferta gg dispatcher", S((y) => y.trasfGg, d), S((y) => y.trasfDom, d)], [st, "Teste", l.length, 0]);
  }
  const wOc = wb.addWorksheet("DWH_Ore_SIC");
  tabella(wOc, "DWH_Ore_SIC", [{ name: "Station" }, { name: "Voce", width: 34 }, { name: "Ore_tot", numFmt: "#,##0.00" }, { name: "Ore_domfest", numFmt: "#,##0.00" }], oreSic);
  const nOc = Math.max(2, oreSic.length + 1);

  // ── DWH_SIC (un lavoratore per riga)
  const colSic = ["Station", "Lavoratore", "CF", "Contratto", "Bucket", "CDL in anagrafica", "CDL", "Ore Standard", "Ore Standard dom/fest", "Ore Straord", "Ore Straord dom/fest", "Ore Suppl", "Ore Suppl dom/fest",
    "Ore Accordo", "Ore lavorate dom/fest", "Trasferta gg", "Trasferta gg dom", "Trasferta €", "gg Ferie", "h ROL", "h ExF", "Ore malattia+infortunio", "Saving FE €/gg", "Saving ROL €/h", "Saving EXF €/h",
    "Costo festività non goduta €/gg", "Festività non godute gg", "Busta base", "Busta trasferta", "Busta istituti", "Busta assenze", "Busta ferie godute", "Busta totale"];
  const wS = wb.addWorksheet("DWH_SIC");
  tabella(wS, "DWH_SIC", colSic.map((name, i) => ({ name, numFmt: i >= 6 ? "#,##0.00" : undefined, width: i === 1 ? 28 : undefined })), lav.map((y, i) => {
    const b = x.sic!.busta[i];
    return [y.station, y.nome, y.cf, y.contratto, y.bucket, y.inAnagrafica ? "SI" : "NO", r2(y.cdl), y.standard, y.standardDF, y.straord, y.straordDom, y.suppl, y.supplDom, y.accordo, y.oreDomFest,
      y.trasfGg, y.trasfDom, y.trasfEuro, y.ggFerie, y.rol, y.exf, y.malattia + y.infortunio, y.anag?.savingFeGg ?? null, y.anag?.savingRolH ?? null, y.anag?.savingExfH ?? null,
      y.anag?.costoFestNonGodutaGg ?? null, y.festNonGoduteGg, r2(b.base), r2(b.trasferta), r2(b.istituti), r2(b.assenze), r2(b.ferieGodute), r2(b.totale)];
  }));
  const nS = Math.max(2, lav.length + 1);
  const ks = (nome: string) => `DWH_SIC!$${L(colSic.indexOf(nome))}$2:$${L(colSic.indexOf(nome))}$${nS}`;

  // ── DWH_ADIT
  const wA = wb.addWorksheet("DWH_ADIT");
  tabella(wA, "DWH_ADIT", [{ name: "Station" }, { name: "Voce", width: 18 }, { name: "Quantita", numFmt: "#,##0.00" }, { name: "Costo", numFmt: "#,##0.00" }, { name: "Teste" }], x.aditDwh.map((a) => [a.station, a.voce, r2(a.quantita), r2(a.costo), a.teste]));
  const nA = Math.max(2, x.aditDwh.length + 1);
  const AV = `DWH_ADIT!$B$2:$B$${nA}`, AQ = `DWH_ADIT!$C$2:$C$${nA}`, AC = `DWH_ADIT!$D$2:$D$${nA}`;

  // ── Festivi
  const wF = wb.addWorksheet("Festivi");
  tabella(wF, "Festivi", [{ name: "Data", date: true }, { name: "Descrizione", width: 34 }, { name: "Station" }], x.festivi.map((f) => [f.data, f.descrizione, f.station]));
  const nF = Math.max(2, x.festivi.length + 1);

  // ── Parametri
  const P: Record<string, string> = {};
  wp.getCell("A1").value = `Tariffe STD = costo / quantità dell'ADIT ${x.meseTariffe.split("-").reverse().join("/")} (DWH_ADIT). Celle gialle = parametri dal sito (Parametri e anagrafica).`;
  wp.getCell("A1").font = { bold: true };
  ["Voce", "Valore", "Origine"].forEach((h, i) => { wp.getCell(3, i + 1).value = h; wp.getCell(3, i + 1).font = { bold: true }; });
  let r = 4;
  const giallo: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  const metti = (k: string, lab: string, v: number | { formula: string; result: number }, orig: string, fmt = "0.00", yel = false) => {
    wp.getCell(r, 1).value = lab; wp.getCell(r, 2).value = v as ExcelJS.CellValue; wp.getCell(r, 2).numFmt = fmt; wp.getCell(r, 3).value = orig;
    if (yel) wp.getCell(r, 2).fill = giallo;
    P[k] = `Parametri!$B$${r}`; r++;
  };
  const t = x.tariffeStd;
  for (const [k, lab, v] of [["STANDARD", "Standard €/h", t.STANDARD], ["STR30", "STR 30% €/h", t.STR30], ["SUPP18", "SUPP 18% €/h", t.SUPP18], ["MAGG50", "MAGG 50% €/h", t.MAGG50], ["STR65", "STR 65% €/h", t.STR65], ["FESTIVITA", "Festività €/h", t.FESTIVITA], ["FERIE_PERM_GOD", "Ferie/ROL/ExF godute €/h", t.FERIE_PERM_GOD]] as const)
    metti(k, lab, F(`IFERROR(SUMIFS(${AC},${AV},"${k}")/SUMIFS(${AQ},${AV},"${k}"),0)`, v), `ADIT: ${k}`);
  metti("CARENZAPCT", "Carenza malattia/infortunio % su costo ore", F(`IFERROR(SUMIFS(${AC},${AV},"CARENZA")/(${["STANDARD", "MAGG50", "SUPP18", "STR30", "STR65"].map((v) => `SUMIFS(${AC},${AV},"${v}")`).join("+")}),0)`, t.CARENZA_PCT), "ADIT: carenza / costo ore", "0.00%");
  metti("SUPP65", "SUPP 65% €/h", F(P.STR65.replace("Parametri!", "Parametri!"), t.SUPP65), "in fattura non esiste: tariffa STR65");
  metti("TRASF", "Trasferta feriale €/gg", x.parStd.TRASF, "tariffa alla data (Parametri del sito)", "0.00", true);
  metti("TRASFDOM", "Trasferta domenica €/gg", x.parStd.TRASFDOM, "feriale + extra domenica", "0.00", true);
  metti("CTRB", "CTRB Decr. Dignità €/h", x.parStd.CTRB, "0,10 €/h su tutte le ore lavorate", "0.00", true);
  metti("ALTRO", "Altro % su costo ore", x.parStd.ALTRO, "clausola costo lavoro, ASRE, corsi…", "0.00%", true);
  metti("GGMESE", "Giorni retribuiti/mese (festività)", x.parStd.GGMESE, "ore festività per festivo = ore Standard / gg", "0", true);
  metti("MOG", "Integrazione MOG € (totale, se manca il controllo MOG)", x.parStd.MOG, "parametro STD_MOG, diviso per le station", "#,##0.00", true);
  if (x.mogPerStation) for (const st of x.stations) metti(`MOG_${st}`, `Integrazione MOG € ${st}`, x.mogPerStation[st] ?? 0, "dal controllo MOG (sotto MOG + zero ore × tariffa Standard)", "#,##0.00", true);
  metti("DISPTR", "Trasferta ai dispatcher SIC nel lordo (1 = sì)", x.dispTrasferta ? 1 : 0, "in busta i dispatcher non hanno trasferta", "0", true);
  if (x.parSic) {
    const p = x.parSic;
    for (const [k, lab, v, f] of [["MOLT", "SIC moltiplicatore oneri + TFR", p.MOLT_ONERI, "0.000"], ["STRFT", "SIC straordinario FT €/h", p.STR_FT, "0.00"], ["STRPT", "SIC straordinario PT €/h", p.STR_PT, "0.00"], ["SUPP", "SIC supplementare €/h", p.SUPP, "0.00"],
      ["DOMFEST", "SIC lavoro dom/festivo €/h", p.DOMFEST, "0.00"], ["MAL", "SIC ora di malattia €/h", p.MALATTIA_H, "0.00"], ["CARSIC", "SIC carenza/integrazione %", p.CARENZA_PCT, "0.0%"]] as const)
      metti(k, lab, v, "Parametri SIC del sito (busta calcolata per lavoratore in DWH_SIC)", f, true);
  }
  r++;
  wp.getCell(r, 1).value = "Festivi nel mese per station (foglio Festivi: TUTTE + patrono)"; wp.getCell(r, 1).font = { bold: true }; r++;
  const fine = new Date(Date.UTC(anno, mm, 0)).toISOString().slice(0, 10);
  metti("INIZIO", "inizio", { formula: `DATE(${anno},${mm},1)`, result: 0 } as never, "", "dd/mm/yyyy");
  wp.getCell(r - 1, 2).value = new Date(`${x.mese}-01T00:00:00Z`);
  metti("FINE", "fine", 0, "", "dd/mm/yyyy");
  wp.getCell(r - 1, 2).value = new Date(`${fine}T00:00:00Z`);
  const FA = `Festivi!$A$2:$A$${nF}`, FC = `Festivi!$C$2:$C$${nF}`;
  for (const st of x.stations) metti(`NF_${st}`, st, F(`COUNTIFS(${FA},">="&${P.INIZIO},${FA},"<="&${P.FINE},${FC},"TUTTE")+COUNTIFS(${FA},">="&${P.INIZIO},${FA},"<="&${P.FINE},${FC},"${st}")`, x.nFestivi[st] ?? 0), "", "0");
  wp.getColumn(1).width = 52; wp.getColumn(2).width = 14; wp.getColumn(3).width = 70;

  // ── pagina: una colonna per station + totale
  const ST = x.stations;
  pg.getCell("A1").value = `${["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"][mm - 1]} ${anno} — stima costi del personale (tutto a formula: STD da DWH_Ore_STD, SIC da DWH_SIC/DWH_Ore_SIC, tariffe da Parametri)`;
  pg.getCell("A1").font = { bold: true, size: 13 };
  pg.getCell("A2").value = `Anagrafica CDL ${x.versioneAnagrafica ?? "—"} · tariffe ADIT ${x.meseTariffe} · STD = competenza del mese; SIC busta = paga del 27 del mese successivo`;
  pg.getRow(4).values = ["Voce", ...ST, "Totale"];
  pg.getRow(4).font = { bold: true };
  const OS = (c: string) => `DWH_Ore_STD!$${c}$2:$${c}$${nOs}`, OC = (c: string) => `DWH_Ore_SIC!$${c}$2:$${c}$${nOc}`;
  const sStd = (st: string, voce: string, col: "C" | "D") => `SUMIFS(${OS(col)},${OS("A")},"${st}",${OS("B")},"${voce}")`;
  const sSic = (st: string, voce: string, col: "C" | "D") => `SUMIFS(${OC(col)},${OC("A")},"${st}",${OC("B")},"${voce}")`;
  const ROW: Record<string, number> = {};
  let rr = 5;
  type Def = { k: string; lab: string; f?: (st: string, c: string) => string; v: (st: string) => number; fmt?: string; titolo?: boolean; noTot?: boolean; bold?: boolean };
  const scrivi = (d: Def) => {
    const row = pg.getRow(rr);
    row.getCell(1).value = d.lab;
    if (d.titolo) { row.font = { bold: true }; row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } }; rr++; return; }
    ROW[d.k] = rr;
    ST.forEach((st, i) => { const c = L(i + 1); const cell = row.getCell(i + 2); cell.value = d.f ? F(d.f(st, c), d.v(st)) : d.v(st); cell.numFmt = d.fmt ?? "#,##0.00"; });
    if (!d.noTot) { const tc = row.getCell(ST.length + 2); tc.value = F(`SUM(B${rr}:${L(ST.length)}${rr})`, ST.reduce((a, st) => a + d.v(st), 0)); tc.numFmt = d.fmt ?? "#,##0.00"; }
    if (d.bold) row.font = { bold: true };
    rr++;
  };
  const o = (st: string) => x.oreStd.find((y) => y.station === st);
  const s = (st: string) => x.stimeStd.find((y) => y.station === st);
  const imp = (st: string, voce: string) => s(st)?.righe.find((y) => y.voce === voce)?.importo ?? 0;
  const ref = (k: string, c: string) => `${c}${ROW[k]}`;
  const defs: Def[] = [
    { k: "t1", lab: "STD — competenza del mese (Adecco)", v: () => 0, titolo: true },
    { k: "teste", lab: "Teste tracking STD", f: (st) => sStd(st, "Teste", "C"), v: (st) => o(st)?.teste ?? 0, fmt: "0" },
    { k: "hSTD", lab: "Ore Standard ordinarie", f: (st) => `${sStd(st, "Standard", "C")}-${sStd(st, "Standard", "D")}`, v: (st) => (o(st) ? o(st)!.standard - o(st)!.standardDF : 0), fmt: "#,##0.0" },
    { k: "hMAGG", lab: "Ore MAGG50 (Standard dom/festivi)", f: (st) => sStd(st, "Standard", "D"), v: (st) => o(st)?.standardDF ?? 0, fmt: "#,##0.0" },
    { k: "hSTR30", lab: "Ore STR30", f: (st) => `${sStd(st, "Straordinario", "C")}-${sStd(st, "Straordinario", "D")}`, v: (st) => (o(st) ? o(st)!.straord - o(st)!.straordDom : 0), fmt: "#,##0.0" },
    { k: "hSTR65", lab: "Ore STR65 (dom/festivi)", f: (st) => sStd(st, "Straordinario", "D"), v: (st) => o(st)?.straordDom ?? 0, fmt: "#,##0.0" },
    { k: "hSUPP18", lab: "Ore SUPP18", f: (st) => `${sStd(st, "Supplementare", "C")}-${sStd(st, "Supplementare", "D")}`, v: (st) => (o(st) ? o(st)!.suppl - o(st)!.supplDom : 0), fmt: "#,##0.0" },
    { k: "hSUPP65", lab: "Ore SUPP65 (dom/festivi)", f: (st) => sStd(st, "Supplementare", "D"), v: (st) => o(st)?.supplDom ?? 0, fmt: "#,##0.0" },
    { k: "hACC", lab: "Ore Accordo 39-44 h (esposte, non valorizzate)", f: (st) => sStd(st, "Accordo", "C"), v: (st) => o(st)?.accordo ?? 0, fmt: "#,##0.0" },
    { k: "eOre", lab: "€ Ore × tariffe ADIT", f: (st, c) => `${ref("hSTD", c)}*${P.STANDARD}+${ref("hMAGG", c)}*${P.MAGG50}+${ref("hSTR30", c)}*${P.STR30}+${ref("hSTR65", c)}*${P.STR65}+${ref("hSUPP18", c)}*${P.SUPP18}+${ref("hSUPP65", c)}*${P.SUPP65}`, v: (st) => s(st)?.costoOre ?? 0 },
    { k: "eTr", lab: "€ Trasferte (feriali + domeniche)", f: (st) => `(${sStd(st, "Trasferta gg", "C")}-${sStd(st, "Trasferta gg", "D")})*${P.TRASF}+${sStd(st, "Trasferta gg", "D")}*${P.TRASFDOM}`, v: (st) => s(st)?.trasferte ?? 0 },
    { k: "eFest", lab: "€ Festività (ore Standard / gg × festivi × tariffa)", f: (st) => `${sStd(st, "Standard", "C")}/${P.GGMESE}*${P[`NF_${st}`]}*${P.FESTIVITA}`, v: (st) => imp(st, "FESTIVITA") },
    { k: "eFer", lab: "€ Ferie/ROL/ExF godute", f: (st) => `(${sStd(st, "Ferie", "C")}+${sStd(st, "ROL", "C")}+${sStd(st, "ExF", "C")})*${P.FERIE_PERM_GOD}`, v: (st) => imp(st, "FERIE_PERM_GOD") },
    { k: "eCar", lab: "€ Carenza malattia/infortunio (% su costo ore)", f: (st, c) => `${ref("eOre", c)}*${P.CARENZAPCT}`, v: (st) => imp(st, "CARENZA") },
    { k: "eCtrb", lab: "€ CTRB Decr. Dignità", f: (st) => `(${sStd(st, "Standard", "C")}+${sStd(st, "Straordinario", "C")}+${sStd(st, "Supplementare", "C")})*${P.CTRB}`, v: (st) => imp(st, "CTRB_DIGNITA") },
    { k: "eAltro", lab: "€ Altro (% su costo ore)", f: (st, c) => `${ref("eOre", c)}*${P.ALTRO}`, v: (st) => imp(st, "ALTRO") },
    { k: "eMog", lab: "€ Integrazione MOG", f: (st) => (x.mogPerStation ? P[`MOG_${st}`] : `${P.MOG}/${ST.length}`), v: (st) => imp(st, "INTEGR_MOG") },
    { k: "totStd", lab: "TOT COSTO STD €", f: (_st, c) => `SUM(${c}${ROW.eOre ?? 0}:${c}${(ROW.eOre ?? 0) + 7})`, v: (st) => s(st)?.totaleEsatto ?? 0, bold: true },
  ];
  for (const d of defs) scrivi(d);
  if (x.sic) {
    const sl = (st: string) => x.sicLordo.find((y) => y.station === st);
    const bs = (st: string, k: keyof BustaLavoratore) => lav.reduce((a, y, i) => a + (y.station === st ? (x.sic!.busta[i][k] as number) : 0), 0);
    const ksS = ks("Station");
    const sicDefs: Def[] = [
      { k: "t2", lab: "SIC — dipendenti interni", v: () => 0, titolo: true },
      { k: "sTeste", lab: "Teste SIC tracciate", f: (st) => `COUNTIFS(${ksS},"${st}")`, v: (st) => sl(st)?.teste ?? 0, fmt: "0" },
      { k: "sNo", lab: "di cui senza CDL in anagrafica (CDL = media bucket station)", f: (st) => `COUNTIFS(${ksS},"${st}",${ks("CDL in anagrafica")},"NO")`, v: (st) => sl(st)?.senzaCdl ?? 0, fmt: "0" },
      { k: "sCdl", lab: "CDL base (anagrafica)", f: (st) => `SUMIFS(${ks("CDL")},${ksS},"${st}")`, v: (st) => sl(st)?.cdl ?? 0 },
      { k: "sTr", lab: "€ Trasferte SIC (dispatcher × DISPTR)", f: (st) => `SUMIFS(${ks("Trasferta €")},${ksS},"${st}",${ks("Bucket")},"<>DISPATCHER")+${P.DISPTR}*SUMIFS(${ks("Trasferta €")},${ksS},"${st}",${ks("Bucket")},"DISPATCHER")`, v: (st) => sl(st)?.trasferte ?? 0 },
      { k: "sOre", lab: "€ Ore SIC × tariffe STD", f: (st) => `(${sSic(st, "Straordinario", "C")}-${sSic(st, "Straordinario", "D")})*${P.STR30}+(${sSic(st, "Supplementare", "C")}-${sSic(st, "Supplementare", "D")})*${P.SUPP18}+${sSic(st, "Standard", "D")}*${P.MAGG50}+${sSic(st, "Straordinario", "D")}*${P.STR65}+${sSic(st, "Supplementare", "D")}*${P.SUPP65}`, v: (st) => sl(st)?.ore ?? 0 },
      { k: "sLordo", lab: "TOT COSTO SIC lordo (metodo v2)", f: (_st, c) => `${ref("sCdl", c)}+${ref("sTr", c)}+${ref("sOre", c)}`, v: (st) => sl(st)?.lordo ?? 0, bold: true },
      { k: "sAcc", lab: "Ore Accordo SIC (esposte)", f: (st) => sSic(st, "Accordo", "C"), v: (st) => sl(st)?.accordo ?? 0, fmt: "#,##0.0" },
      { k: "sSav", lab: "€ Saving ratei goduti (ferie gg × FE + ROL × ROL + ExF × EXF)", f: (st) => `SUMPRODUCT((${ksS}="${st}")*${ks("gg Ferie")}*${ks("Saving FE €/gg")})+SUMPRODUCT((${ksS}="${st}")*${ks("h ROL")}*${ks("Saving ROL €/h")})+SUMPRODUCT((${ksS}="${st}")*${ks("h ExF")}*${ks("Saving EXF €/h")})`, v: (st) => sl(st)?.savingRatei ?? 0 },
      { k: "sFest", lab: "€ Festività non godute (festivi mese × Σ costo, potenziale max)", f: (st) => `${P[`NF_${st}`]}*SUMIFS(${ks("Costo festività non goduta €/gg")},${ksS},"${st}")`, v: (st) => sl(st)?.festNonGodute ?? 0 },
      { k: "t3", lab: "SIC — busta del 27 del mese successivo (per lavoratore in DWH_SIC)", v: () => 0, titolo: true },
      ...(["base", "trasferta", "istituti", "assenze", "ferieGodute", "totale"] as const).map((k): Def => ({
        k: `b_${k}`, lab: { base: "Base CDL", trasferta: "di cui trasferta (dispatcher esclusi)", istituti: "Istituti (trasferta + lordi × oneri)", assenze: "Assenze (malattia, infortunio, non retribuite)", ferieGodute: "Ferie/ROL/ExF godute", totale: "TOT COSTO SIC busta" }[k],
        f: (st) => `SUMIFS(${ks({ base: "Busta base", trasferta: "Busta trasferta", istituti: "Busta istituti", assenze: "Busta assenze", ferieGodute: "Busta ferie godute", totale: "Busta totale" }[k])},${ksS},"${st}")`, v: (st) => bs(st, k), bold: k === "totale",
      })),
    ];
    for (const d of sicDefs) scrivi(d);
  }
  pg.getColumn(1).width = 62;
  for (let i = 2; i <= ST.length + 2; i++) pg.getColumn(i).width = 14;
  pg.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];

  tabella(wr, "Rettifiche", [{ name: "Cella/area", width: 36 }, { name: "Valore", width: 50 }, { name: "Nota", width: 70 }], x.rettifiche);
  return wb;
}
