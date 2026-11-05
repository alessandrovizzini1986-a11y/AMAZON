/**
 * Foglio "AMZ_<MMM>_<AA>" con la stessa struttura di Stima_Costo_personale.xlsx (blocco di 5 colonne per
 * station da G, colonne A–F di totale), già compilato con i dati del sito: si sposta nel file di
 * Alessandro con "Sposta o copia foglio". Le formule sono quelle del modello, rese uguali per tutte
 * le station; tre correzioni rispetto al modello di ottobre 2026 (vedi NOTE_MODELLO).
 */
import ExcelJS from "exceljs";
import type { Bucket } from "@/domain/costi/sic";

export type OreBlocco = { standardTot: number; magg: number; strTot: number; str65: number; suppTot: number; supp65: number; trasfTot: number; trasfDom: number };
export type BloccoStation = {
  station: string;
  sic: (OreBlocco & { teste: Record<Bucket, number>; costoMedio: Record<Bucket, number> }) | null;
  std: (OreBlocco & { ft: number; pt: number; mog: number }) | null;
};
export type InputStimaPersonale = {
  mese: string; blocchi: BloccoStation[]; cdlBase: number;
  tariffe: { trasf: number; trasfDom: number; STANDARD: number; STR30: number; SUPP18: number; MAGG50: number; STR65: number; SUPP65: number };
  fonte: string;
};

export const STATION_ORDINE = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"];
export const NOTE_MODELLO = [
  "Riga 2: ogni station somma le proprie ore (nel modello da DER2 in poi sommava il blocco della station dopo).",
  "F6, F43, F45 e CORSO (C30, C31): DER2 inclusa (nel modello mancava).",
  "Straordinari STD: per tutte le station si inserisce il totale (riga 37) e il 65% (riga 39); il 30% è la differenza (in DER1 era il contrario).",
];

const MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
const MESI_LUNGHI = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];
const L = (n: number) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const BUCKET_RIGA: [Bucket, number][] = [["CTI FT", 8], ["CTI PT", 9], ["CTI PT 32h", 10], ["DISPATCHER", 11]];
const r2 = (x: number) => Math.round(x * 100) / 100;

export const nomeFoglio = (mese: string) => `AMZ_${MESI[Number(mese.slice(5, 7)) - 1]}_${mese.slice(2, 4)}`;

export function foglioStimaPersonale(x: InputStimaPersonale): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  wb.calcProperties.fullCalcOnLoad = true; // Excel ricalcola tutto all'apertura
  const ws = wb.addWorksheet(nomeFoglio(x.mese));
  const set = (ref: string, v: ExcelJS.CellValue, fmt?: string) => { const c = ws.getCell(ref); c.value = v; if (fmt) c.numFmt = fmt; };
  const f = (formula: string) => ({ formula: formula.replace(/^=/, "") });
  const giallo: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
  const input = (ref: string, v: number | null, fmt = "#,##0.##") => { set(ref, v === null ? null : r2(v), fmt); ws.getCell(ref).fill = giallo; };

  // colonne di ogni blocco: c0 etichetta, c1 SIC / teste, c2 STD / costo, c3 importo, c4 totale
  const base = (i: number) => 7 + 5 * i; // G = 7
  const col = (i: number, o: number) => L(base(i) + o);
  const tutte = (r: number, o = 1) => STATION_ORDINE.map((_, i) => `${col(i, o)}${r}`).join("+");

  // ── colonne A–F
  set("A1", MESI_LUNGHI[Number(x.mese.slice(5, 7)) - 1]);
  set("B2", "ORE TOT"); set("E2", "costo sic (ERIKA) cdl base"); input("F2", x.cdlBase, "#,##0.00");
  set("A3", "TOTALE STATION");
  set("A4", "TOT. COSTO SIC"); set("B4", f("=+F8+F12+F14"));
  set("A5", "TOT. COSTO STD"); set("B5", f("=+F22+F28"));
  set("A6", "ROTTE"); set("F6", f(`=${STATION_ORDINE.map((_, i) => `${col(i, 4)}6`).join("+")}`));
  set("C7", "#teste/ore"); set("D7", "Costo");
  const t = x.tariffe;
  const sicRighe: [number, string, number][] = [[12, "TRASFERTE", t.trasf], [13, "TRASFERTE DOM.", t.trasfDom], [14, "STR 30%", t.STR30], [15, "SUPP 18%", t.SUPP18], [16, "MAGG 50%", t.MAGG50], [17, "STR 65%", t.STR65], [18, "SUPP 65%", t.SUPP65]];
  set("A8", "SIC");
  for (const [b, r] of BUCKET_RIGA) {
    set(`B${r}`, b); set(`C${r}`, f(`=+${tutte(r)}`)); set(`D${r}`, f(`=IFERROR(E${r}/C${r},0)`), "#,##0.00"); set(`E${r}`, f(`=${tutte(r, 3)}`), "#,##0.00");
  }
  set("F8", f("=+SUM(E8:E11)"), "#,##0.00");
  for (const [r, lab, v] of sicRighe) { set(`B${r}`, lab); set(`C${r}`, f(`=+${tutte(r)}`)); input(`D${r}`, v, "0.00"); set(`E${r}`, f(`=+C${r}*D${r}`), "#,##0.00"); }
  set("F12", f("=SUM(E12:E13)"), "#,##0.00"); set("F14", f("=SUM(E14:E18)"), "#,##0.00");
  const stdRighe: [number, string, number][] = [[22, "Standard STD", t.STANDARD], [23, "STR STD 30%", t.STR30], [24, "SUPP STD 18%", t.SUPP18], [25, "MAGG STD 50%", t.MAGG50], [26, "STR STD 65%", t.STR65], [27, "SUPP 65%", t.SUPP65], [28, "TRASFERTA ", t.trasf], [29, "TRASFERTA DOM", t.trasfDom], [30, "CORSO", 18.21], [31, "CORSO SUP", 16]];
  set("A22", "STD");
  for (const [r, lab, v] of stdRighe) { set(`B${r}`, lab); set(`C${r}`, f(`=+${tutte(r)}`)); input(`D${r}`, v, "0.00"); if (r <= 29) set(`E${r}`, f(`=+D${r}*C${r}`), "#,##0.00"); }
  set("F22", f("=SUM(E22:E27)"), "#,##0.00"); set("F28", f("=SUM(E28:E29)"), "#,##0.00");
  set("E33", "SIC"); set("E34", "Strao"); set("F34", f("=+E14+E17"), "#,##0.00"); set("E35", "supp"); set("F35", f("=+E15+E18"), "#,##0.00"); set("E36", "magg"); set("F36", f("=+E16"), "#,##0.00");
  set("D43", "Trasf SIC"); set("F43", f(`=${tutte(43)}`)); set("D45", "Trasf tot"); set("F45", f(`=${STATION_ORDINE.map((_, i) => `${col(i, 4)}45`).join("+")}`));

  // ── blocchi station
  STATION_ORDINE.forEach((st, i) => {
    const c = (o: number) => col(i, o);
    const b = x.blocchi.find((y) => y.station === st);
    set(`${c(0)}2`, f(`=SUM(${c(1)}37:${c(2)}37,${c(1)}34:${c(2)}34,${c(1)}40:${c(2)}40)`), "#,##0.0");
    set(`${c(0)}3`, st); ws.getCell(`${c(0)}3`).font = { bold: true };
    set(`${c(0)}4`, f(`=+${c(4)}8+${c(4)}12+${c(4)}14`), "#,##0.00");
    set(`${c(0)}5`, f(`=+${c(4)}22+${c(4)}28`), "#,##0.00");
    set(`${c(1)}7`, "#teste/ore"); set(`${c(2)}7`, "Costo");
    for (const [bk, r] of BUCKET_RIGA) {
      set(`${c(0)}${r}`, bk);
      input(`${c(1)}${r}`, b?.sic?.teste[bk] ?? 0, "0"); input(`${c(2)}${r}`, b?.sic?.costoMedio[bk] ?? 0, "#,##0.00");
      set(`${c(3)}${r}`, f(`=+${c(1)}${r}*${c(2)}${r}`), "#,##0.00");
    }
    set(`${c(4)}8`, f(`=+SUM(${c(3)}8:${c(3)}11)`), "#,##0.00");
    const sicDa: [number, string, number][] = [[12, "TRASFERTE", 44], [13, "TRASFERTE DOM.", 45], [14, "STR 30%", 38], [15, "SUPP 18%", 41], [16, "MAGG 50%", 36], [17, "STR 65%", 39], [18, "SUPP 65%", 42]];
    for (const [r, lab, da] of sicDa) {
      set(`${c(0)}${r}`, lab); set(`${c(1)}${r}`, f(`=+${c(1)}${da}`)); set(`${c(2)}${r}`, f(`=$D${r}`), "0.00"); set(`${c(3)}${r}`, f(`=+${c(1)}${r}*${c(2)}${r}`), "#,##0.00");
    }
    set(`${c(4)}12`, f(`=SUM(${c(3)}12:${c(3)}13)`), "#,##0.00"); set(`${c(4)}14`, f(`=SUM(${c(3)}14:${c(3)}18)`), "#,##0.00");
    set(`${c(0)}19`, "STD FT"); input(`${c(1)}19`, b?.std?.ft ?? 0, "0");
    set(`${c(0)}20`, "STD PT"); input(`${c(1)}20`, b?.std?.pt ?? 0, "0");
    set(`${c(0)}21`, "MOG"); input(`${c(1)}21`, b?.std?.mog ?? 0, "0");
    const stdDa: [number, string, number][] = [[22, "Standard STD", 35], [23, "STR STD 30%", 38], [24, "SUPP STD 18%", 41], [25, "MAGG STD 50%", 36], [26, "STR STD 65%", 39], [27, "SUPP 65%", 42], [28, "TRASFERTA ", 44], [29, "TRASFERTA DOM", 45]];
    for (const [r, lab, da] of stdDa) {
      set(`${c(0)}${r}`, lab); set(`${c(1)}${r}`, f(`=+${c(2)}${da}`)); set(`${c(2)}${r}`, f(`=$D${r}`), "0.00"); set(`${c(3)}${r}`, f(`=+${c(2)}${r}*${c(1)}${r}`), "#,##0.00");
    }
    set(`${c(4)}22`, f(`=SUM(${c(3)}22:${c(3)}27)`), "#,##0.00"); set(`${c(4)}28`, f(`=SUM(${c(3)}28:${c(3)}29)`), "#,##0.00");
    set(`${c(0)}30`, "CORSO"); set(`${c(2)}30`, f("=$D30")); set(`${c(0)}31`, "CORSO SUP"); set(`${c(2)}31`, f("=$D31"));
    // tabella ore: SIC (c1) e STD (c2)
    set(`${c(1)}33`, "SIC"); set(`${c(2)}33`, "STD"); set(`${c(3)}33`, "SIC");
    const ore = (r: number, lab: string, k: keyof OreBlocco | null, formula?: (cc: string) => string) => {
      set(`${c(0)}${r}`, lab);
      for (const [o, pop] of [[1, b?.sic], [2, b?.std]] as const) {
        if (formula) set(`${c(o)}${r}`, f(formula(c(o))), "#,##0.0");
        else input(`${c(o)}${r}`, pop ? pop[k!] : 0, "#,##0.0");
      }
    };
    ore(34, "Standard tot", "standardTot");
    ore(35, "Ordin", null, (cc) => `=+${cc}34-${cc}36`);
    ore(36, "magg 50%", "magg");
    ore(37, "Strao tot", "strTot");
    ore(38, "STR 30%", null, (cc) => `=+${cc}37-${cc}39`);
    ore(39, "STR 65%", "str65");
    ore(40, "Supp tot", "suppTot");
    ore(41, "SUPP 18%", null, (cc) => `=+${cc}40-${cc}42`);
    ore(42, "SUPP 65%", "supp65");
    ore(43, "Trasf. TOT", "trasfTot");
    ore(44, "TRASFERTE", null, (cc) => `=+${cc}43-${cc}45`);
    ore(45, "TRASFERTE DOM.", "trasfDom");
    set(`${c(3)}34`, "Strao"); set(`${c(4)}34`, f(`=+${c(3)}14+${c(3)}17`), "#,##0.00");
    set(`${c(3)}35`, "supp"); set(`${c(4)}35`, f(`=+${c(3)}15+${c(3)}18`), "#,##0.00");
    set(`${c(3)}36`, "magg"); set(`${c(4)}36`, f(`=+${c(3)}16`), "#,##0.00");
    set(`${c(4)}37`, f(`=SUM(${c(4)}34:${c(4)}36)`), "#,##0.00");
    set(`${c(3)}45`, "trasf tot"); set(`${c(4)}45`, f(`=+${c(1)}43+${c(2)}43`), "0");
  });

  // note sotto la tabella
  let r = 51;
  set(`A${r++}`, `Compilato da FleetDSP (Costi a fine mese): ${x.fonte}. Celle gialle = dati dal sito; le altre sono formule.`);
  set(`A${r++}`, "SIC: teste e costo medio per contratto dall'anagrafica CDL; ore e trasferte dal tracking SIC. STD: ore e trasferte dal tracking STD (Standard tot = ordinarie + domeniche/festivi).");
  set(`A${r++}`, "Rotte (riga 6) e integrazione MOG non sono compilate.");
  for (const n of NOTE_MODELLO) set(`A${r++}`, `Correzione rispetto al modello: ${n}`);
  ws.getColumn(1).width = 16; ws.getColumn(2).width = 16;
  for (let i = 3; i <= base(6) + 4; i++) ws.getColumn(i).width = 11;
  ws.views = [{ state: "frozen", xSplit: 6, ySplit: 3 }];
  return wb;
}

/** Ore di un blocco da somme già fatte (SIC: per lavoratore; STD: per station). */
export const bloccoOre = (o: { standard: number; standardDF: number; straord: number; straordDom: number; suppl: number; supplDom: number; trasfGg: number; trasfDom: number }): OreBlocco => ({
  standardTot: r2(o.standard), magg: r2(o.standardDF), strTot: r2(o.straord), str65: r2(o.straordDom), suppTot: r2(o.suppl), supp65: r2(o.supplDom), trasfTot: o.trasfGg, trasfDom: o.trasfDom,
});

/** STD: MOG se il contratto lo dice, altrimenti PT se c'è "PT", altrimenti FT. */
export const tipoStd = (contratto: string): "ft" | "pt" | "mog" => { const c = contratto.toUpperCase(); return c.includes("MOG") ? "mog" : /\bPT\b|PART/.test(c) ? "pt" : "ft"; };

/** Blocchi per station dai risultati di "Calcola costi" (SIC per lavoratore, STD per station + teste per tipo). */
export function blocchiDaCalcolo(x: {
  sic: { station: string; bucket: Bucket; cdl: number; standard: number; standardDF: number; straord: number; straordDom: number; suppl: number; supplDom: number; trasfGg: number; trasfDom: number }[];
  std: { station: string; standard: number; standardDF: number; straord: number; straordDom: number; suppl: number; supplDom: number; trasfGg: number; trasfDom: number }[];
  testeStd: Record<string, { ft: number; pt: number; mog: number }>;
}): BloccoStation[] {
  return STATION_ORDINE.map((station) => {
    const l = x.sic.filter((y) => y.station === station);
    const somma = (k: "standard" | "standardDF" | "straord" | "straordDom" | "suppl" | "supplDom" | "trasfGg" | "trasfDom") => l.reduce((a, y) => a + y[k], 0);
    const teste = Object.fromEntries(BUCKET_RIGA.map(([b]) => [b, l.filter((y) => y.bucket === b).length])) as Record<Bucket, number>;
    const costoMedio = Object.fromEntries(BUCKET_RIGA.map(([b]) => { const g = l.filter((y) => y.bucket === b); return [b, g.length ? g.reduce((a, y) => a + y.cdl, 0) / g.length : 0]; })) as Record<Bucket, number>;
    const sic = l.length ? { ...bloccoOre({ standard: somma("standard"), standardDF: somma("standardDF"), straord: somma("straord"), straordDom: somma("straordDom"), suppl: somma("suppl"), supplDom: somma("supplDom"), trasfGg: somma("trasfGg"), trasfDom: somma("trasfDom") }), teste, costoMedio } : null;
    const o = x.std.find((y) => y.station === station);
    const std = o ? { ...bloccoOre(o), ...(x.testeStd[station] ?? { ft: 0, pt: 0, mog: 0 }) } : null;
    return { station, sic, std };
  });
}
