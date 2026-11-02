import ExcelJS from "exceljs";
import type { EsitoFineMese, DomenicaRiga } from "@/domain/presenze/controlloFineMese";
import { domenicheDelMese, giorniDelMese, settimaneDelMese } from "@/domain/presenze/domeniche";
import { STATIONS } from "@/domain/presenze/regole";
import { tabella } from "./excelUtil";

const MESI = ["", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** Numero colonna (1-based) → lettera Excel */
export function L(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const f = (formula: string, result: number | string) => ({ formula, result }) as ExcelJS.CellFormulaValue;
const bold = (c: ExcelJS.Cell) => { c.font = { bold: true }; };
const red: ExcelJS.Fill = { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" }, fgColor: { argb: "FFFFC7CE" } };
const orange: ExcelJS.Fill = { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" }, fgColor: { argb: "FFFFEB9C" } };

/**
 * Excel del controllo di fine mese: stessi fogli di Controllo_Zucchetti_<mese>.xlsx
 * (Riepilogo, Delta_giorni, Non_abbinati, V_<DS>, SIC, STD, Tabella 6+domenica (SIC))
 * più Alert_consecutivi. Formule come nel file originale, con il valore già calcolato.
 */
export function excelFineMese(e: EsitoFineMese): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const { anno, mese } = e;
  const nd = giorniDelMese(anno, mese).length;

  tabella(wb.addWorksheet("Riepilogo"), "T_Riepilogo",
    ["Station", "Lavoratori_tracking", "Lavoratori_zucchetti", "Abbinati", "Solo_tracking", "Solo_zucchetti", "Giorni_con_delta", "Delta_ore_tot", "Ore_tracking_tot", "Ore_zucchetti_tot"].map((name) => ({ name })),
    e.riepilogo.map((r) => [r.station, r.lavoratoriTracking, r.lavoratoriZucchetti, r.abbinati, r.soloTracking, r.soloZucchetti, r.giorniConDelta, r.deltaOreTot, r.oreTrackingTot, r.oreZucchettiTot]));

  tabella(wb.addWorksheet("Delta_giorni"), "T_Delta",
    [{ name: "Station" }, { name: "Matricola" }, { name: "Lavoratore", width: 30 }, { name: "Contratto" }, { name: "Data", date: true }, { name: "Giorno" }, { name: "Ore_tracking" }, { name: "Ore_lavoro" },
      { name: "Ore_assenze_retrib" }, { name: "Ore_assenze_non_retrib" }, { name: "Ore_zucchetti" }, { name: "Delta" }, { name: "Lettura", width: 20 }, { name: "Voci_tracking", width: 40 }],
    e.delta.map((d) => [d.station, d.matricola, d.lavoratore, d.contratto, d.data, d.giorno, d.oreTracking, d.oreLavoro, d.oreAssenzeRetrib, d.oreAssenzeNonRetrib, d.oreZucchetti, d.delta, d.lettura, d.vociTracking]));

  tabella(wb.addWorksheet("Non_abbinati"), "T_NonAbb",
    [{ name: "Station" }, { name: "Fonte" }, { name: "Matricola" }, { name: "Lavoratore", width: 30 }, { name: "CF", width: 18 }, { name: "Contratto" }, { name: "Ore_mese" }, { name: "Nota", width: 50 }],
    e.nonAbbinati.map((x) => [x.station, x.fonte, x.matricola, x.lavoratore, x.cf, x.contratto, x.oreMese, x.nota]));

  // matrici per station: TRACKING | ZUCCHETTI | DELTA (delta e totale a formula)
  for (const st of STATIONS) {
    const rows = e.matrici[st];
    if (!rows) continue;
    const ws = wb.addWorksheet(`V_${st}`);
    const b = nd + 1;
    ws.getCell(1, 1).value = "MATRICOLA"; ws.getCell(1, 2).value = "LAVORATORE";
    ws.getCell(1, 3).value = "TRACKING (lavoro + tutte le assenze, esclusi riposi)";
    ws.getCell(1, 3 + b).value = "ZUCCHETTI (riga TOTALE)";
    ws.getCell(1, 3 + 2 * b).value = "DELTA";
    ws.getCell(1, 3 + 3 * b).value = "TOT DELTA";
    for (const c of [1, 2, 3, 3 + b, 3 + 2 * b, 3 + 3 * b]) bold(ws.getCell(1, c));
    for (let d = 1; d <= nd; d++) for (let k = 0; k < 3; k++) { const c = ws.getCell(2, 2 + k * b + d); c.value = d; bold(c); }
    const per = new Map<string, { nome: string; g: Map<number, (typeof rows)[number]> }>();
    for (const x of rows) {
      if (!per.has(x.matricola)) per.set(x.matricola, { nome: x.lavoratore, g: new Map() });
      per.get(x.matricola)!.g.set(Number(x.data.slice(8)), x);
    }
    let r = 3;
    for (const [k, { nome, g }] of per) {
      ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = nome;
      let tot = 0;
      for (let d = 1; d <= nd; d++) {
        const x = g.get(d);
        const trk = Math.round((x?.tracking ?? 0) * 100) / 100, zz = Math.round((x?.zucchetti ?? 0) * 100) / 100;
        ws.getCell(r, 2 + d).value = trk;
        ws.getCell(r, 2 + b + d).value = zz;
        ws.getCell(r, 2 + 2 * b + d).value = f(`${L(2 + d)}${r}-${L(2 + b + d)}${r}`, Math.round((trk - zz) * 100) / 100);
        tot += trk - zz;
      }
      ws.getCell(r, 3 + 3 * b).value = f(`SUM(${L(3 + 2 * b)}${r}:${L(2 + 2 * b + nd)}${r})`, Math.round(tot * 100) / 100);
      r++;
    }
    const ref = `${L(3 + 2 * b)}3:${L(2 + 2 * b + nd)}${Math.max(3, r - 1)}`;
    ws.addConditionalFormatting({ ref, rules: [
      { type: "cellIs", operator: "greaterThan", formulae: ["0.01"], style: { fill: red }, priority: 1 },
      { type: "cellIs", operator: "lessThan", formulae: ["-0.01"], style: { fill: orange }, priority: 2 },
    ] });
    ws.views = [{ state: "frozen", xSplit: 2, ySplit: 2 }];
    ws.getColumn(2).width = 28;
    for (let c = 3; c <= 3 + 3 * b; c++) ws.getColumn(c).width = 5;
  }

  // check domenica / giorni consecutivi (formato del file check_domenica)
  const sett = settimaneDelMese(anno, mese);
  const domeniche = domenicheDelMese(anno, mese);
  const foglioDom = (nome: string, lista: DomenicaRiga[], sic: boolean) => {
    const ws = wb.addWorksheet(nome);
    const hdr = ["DS", "Lavoratore", "Codice Fiscale", "Tipo Contratto", ...Array.from({ length: nd }, (_, i) => String(i + 1)), ...sett.map((s) => s.label), "Max ore/sett", "≥40h", "N.sett ≥40h",
      ...(sic ? [...domeniche.map((d) => `6+dom ${d}`), "N.sett 6+dom", "6+dom"] : []), "Max gg consec", "7gg consec"];
    ws.addRow(hdr);
    ws.getRow(1).font = { bold: true };
    const c0 = 5, cN = 4 + nd;
    lista.forEach((x, i) => {
      const r = i + 2;
      const row = ws.getRow(r);
      row.getCell(1).value = x.station; row.getCell(2).value = x.lavoratore.nome; row.getCell(3).value = x.lavoratore.cf; row.getCell(4).value = x.lavoratore.contratto;
      x.check.ore.forEach((h, d) => { if (h) row.getCell(c0 + d).value = h; });
      let c = cN + 1;
      sett.forEach((s, k) => { row.getCell(c).value = f(`SUM(${L(c0 - 1 + s.dal)}${r}:${L(c0 - 1 + s.al)}${r})`, Math.round(x.check.settimane[k] * 100) / 100); c++; });
      const cs = cN + 1, ce = cN + sett.length, cmax = c;
      row.getCell(c++).value = f(`MAX(${L(cs)}${r}:${L(ce)}${r})`, Math.round(x.check.maxOreSett * 100) / 100);
      row.getCell(c++).value = f(`IF(${L(cmax)}${r}>=40,"SI","NO")`, x.check.maxOreSett >= 40 ? "SI" : "NO");
      row.getCell(c++).value = f(`COUNTIF(${L(cs)}${r}:${L(ce)}${r},">=40")`, x.check.nSett40);
      if (sic) {
        const c6 = c;
        for (const g of domeniche) {
          const a = g - 6;
          row.getCell(c).value = a >= 1
            ? f(`IF(AND(COUNTIF(${L(c0 - 1 + a)}${r}:${L(c0 - 1 + g)}${r},">0")=6,${L(c0 - 1 + g)}${r}>0),1,0)`, x.check.seiPiuDom[g] ?? 0)
            : 0;
          c++;
        }
        row.getCell(c).value = f(`SUM(${L(c6)}${r}:${L(c - 1)}${r})`, x.check.nSeiPiuDom); c++;
        row.getCell(c).value = f(`IF(${L(c - 1)}${r}>0,"SI","NO")`, x.check.nSeiPiuDom > 0 ? "SI" : "NO"); c++;
      }
      const rng = `$${L(c0)}${r}:$${L(cN)}${r}`;
      row.getCell(c).value = {
        formula: `IF(COUNTIF(${rng},">0")=0,0,IF(COUNTIF(${rng},">0")=COLUMNS(${rng}),COLUMNS(${rng}),MAX(FREQUENCY(IF(${rng}>0,COLUMN(${rng})),IF(NOT(${rng}>0),COLUMN(${rng}))))))`,
        result: x.check.maxConsecutivi, shareType: "array", ref: `${L(c)}${r}`,
      } as ExcelJS.CellFormulaValue;
      c++;
      row.getCell(c).value = f(`IF(${L(c - 1)}${r}>=7,"SI","NO")`, x.check.maxConsecutivi >= 7 ? "SI" : "NO");
    });
    ws.views = [{ state: "frozen", xSplit: 4, ySplit: 1 }];
    ws.getColumn(2).width = 30; ws.getColumn(3).width = 18; ws.getColumn(4).width = 14;
    for (let c = c0; c <= cN; c++) ws.getColumn(c).width = 4.5;
    ws.autoFilter = { from: "A1", to: `${L(hdr.length)}${Math.max(2, lista.length + 1)}` };
  };
  foglioDom("SIC", e.domSic, true);
  if (e.domStd.length) foglioDom("STD", e.domStd, false);

  const t = wb.addWorksheet("Tabella 6+domenica (SIC)");
  let r = 1;
  for (const st of STATIONS) {
    const tab = e.tabellaSeiPiuDom[st];
    if (!tab) continue;
    bold(t.getCell(r, 1)); t.getCell(r, 1).value = st; r++;
    domeniche.forEach((g, i) => { const c = t.getCell(r, i + 1); c.value = `${String(g).padStart(2, "0")}-${MESI[mese]}`; bold(c); });
    r++;
    let maxlen = 0;
    domeniche.forEach((g, i) => {
      (tab[g] ?? []).forEach((n, j) => { t.getCell(r + j, i + 1).value = n; });
      maxlen = Math.max(maxlen, (tab[g] ?? []).length);
    });
    r += maxlen + 1;
  }
  for (let i = 1; i <= domeniche.length; i++) t.getColumn(i).width = 32;

  tabella(wb.addWorksheet("Alert_consecutivi"), "T_AlertConsecutivi",
    [{ name: "Station" }, { name: "Tipo" }, { name: "Lavoratore", width: 30 }, { name: "Dal", date: true }, { name: "Al", date: true }, { name: "N. giorni" }],
    e.consecutivi.map((c) => [c.station, c.tipo, c.lavoratore, c.dal, c.al, c.giorni]));
  return wb;
}
