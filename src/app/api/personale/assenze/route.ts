import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { analisi, ETICHETTA_LIVELLO, indicatori, mesiValidi, riepilogo, somma, tabellaTassi, type Livello, type RigaMese, type Tasso, type Vista } from "@/domain/personale/analisi";

export const dynamic = "force-dynamic";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const nomeMese = (m: string) => `${MESI[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const FONDO: Record<Livello, string> = { OK: "FFDCFCE7", ATTENZIONE: "FFFEF9C3", CRITICA: "FFFFEDD5", PRIORITARIA: "FFFEE2E2" };
const BLU = "FF1E3A5F", GRIGIO = "FFF1F5F9";

/** Excel "Rotte e assenze SIC e STD": primo foglio = recap da leggere in un minuto, poi i fogli di dettaglio. Solo super admin. */
export async function GET() {
  await requireSuperAdmin();
  const tutte = await db.personaleMese.findMany({ where: { mese: { gte: "2026-01" } }, orderBy: [{ mese: "asc" }, { station: "asc" }, { gruppo: "asc" }] });
  const righe: RigaMese[] = tutte.map((r) => ({ mese: r.mese, station: r.station, gruppo: r.gruppo as "SIC" | "STD", teste: r.teste, calendario: r.calendario, rotte: r.rotte, rotteTd: r.rotteTd, ggLavorati: r.ggLavorati, ggMalattia: r.ggMalattia, ggInfortunio: r.ggInfortunio, persMalattia: r.persMalattia, persInfortunio: r.persInfortunio, persAssenti: r.persAssenti }));
  const stations = [...new Set(tutte.map((r) => r.station))].sort();

  // --- rotte: i mesi in cui ci sono le buste dei SIC (arrivano un mese dopo)
  const mesiRotte = [...new Set(tutte.filter((r) => r.gruppo === "SIC" && r.rotte !== null).map((r) => r.mese))].sort();
  const cella = (m: string, st: string) => {
    const sic = tutte.find((r) => r.mese === m && r.station === st && r.gruppo === "SIC"), std = tutte.find((r) => r.mese === m && r.station === st && r.gruppo === "STD");
    return { std: std?.rotte ?? 0, sic: sic?.rotte ?? 0, mancaStd: !std || std.rotte === null, stimate: !!std?.rotteStimate };
  };
  const rotteDi = (st: string) => mesiRotte.map((m) => cella(m, st)).reduce((a, c) => ({ std: a.std + c.std, sic: a.sic + c.sic }), { std: 0, sic: 0 });
  const buchi = stations.flatMap((st) => mesiRotte.filter((m) => cella(m, st).mancaStd).map((m) => `${st} ${nomeMese(m)}`));
  const stimati = [...new Set(mesiRotte.filter((m) => stations.some((st) => cella(m, st).stimate)))];

  // --- assenze: solo i mesi con tutti e due i gruppi e il calendario
  const mesiAss = mesiValidi(righe, "TOTALE"), a = analisi(righe, "TOTALE", mesiAss), frasi = riepilogo(a, righe, "TOTALE", mesiAss);
  const periodo = (mm: string[]) => (mm.length ? `${nomeMese(mm[0])} – ${nomeMese(mm[mm.length - 1])}` : "nessun mese");

  const wb = new ExcelJS.Workbook(); wb.creator = "FleetDSP";
  const titolo = (ws: ExcelJS.Worksheet, testo: string, sotto?: string) => { const r = ws.addRow([testo]); r.font = { bold: true, size: 13, color: { argb: BLU } }; if (sotto) ws.addRow([sotto]).font = { italic: true, color: { argb: "FF64748B" } }; };
  const testa = (ws: ExcelJS.Worksheet, nomi: string[]) => { const r = ws.addRow(nomi); r.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU } }; c.alignment = { wrapText: true, vertical: "middle" }; }); return r; };
  const totale = (r: ExcelJS.Row) => r.eachCell((c) => { c.font = { bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIGIO } }; });
  const pct = (x: number, su: number) => (su ? x / su : 0);

  const fr = (x: number | null) => (x === null ? "" : x / 100);
  const BORDO = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
  const riquadra = (ws: ExcelJS.Worksheet, da: number, a2: number, colonne: number) => { for (let i = da; i <= a2; i++) for (let j = 1; j <= colonne; j++) ws.getRow(i).getCell(j).border = { top: BORDO, bottom: BORDO, left: BORDO, right: BORDO }; };
  const percento = (r: ExcelJS.Row, da: number) => r.eachCell((c, n) => { if (n >= da) { c.numFmt = "0.0%"; c.alignment = { horizontal: "center" }; } });
  const tassi = { TOTALE: tabellaTassi(righe, "TOTALE"), SIC: tabellaTassi(righe, "SIC"), STD: tabellaTassi(righe, "STD") };
  // confronto da inizio anno: tutti e tre sugli stessi mesi (quelli con tutti e due i gruppi)
  const comuni = new Set(tassi.TOTALE.mesi), ytdDi = (v: Vista, st?: string) => { const t = tabellaTassi(righe.filter((r) => comuni.has(r.mese) && (!st || r.station === st)), v); return t.network.ytd; };

  // ===== 1. Recap
  const rc = wb.addWorksheet("Recap");
  rc.columns = [16, 13, 15, 15, 12, 10, 14, 14, 16].map((width) => ({ width }));
  titolo(rc, "Rotte e assenze: SIC e STD", "Fonte: buste paga (LUL). STD = somministrati. SIC = assunti da noi.");
  rc.addRow([]);
  titolo(rc, `1. Chi ha fatto le rotte (${periodo(mesiRotte)})`);
  testa(rc, ["Station", "STD", "SIC", "Totale", "% STD", "% SIC"]);
  const tot = { std: 0, sic: 0 };
  for (const st of stations) { const x = rotteDi(st), t = x.std + x.sic; tot.std += x.std; tot.sic += x.sic; const r = rc.addRow([st, x.std, x.sic, t, pct(x.std, t), pct(x.sic, t)]); r.getCell(5).numFmt = "0.0%"; r.getCell(6).numFmt = "0.0%"; }
  const T = tot.std + tot.sic; { const r = rc.addRow(["Totale", tot.std, tot.sic, T, pct(tot.std, T), pct(tot.sic, T)]); totale(r); r.getCell(5).numFmt = "0.0%"; r.getCell(6).numFmt = "0.0%"; }
  rc.addRow([`In una riga: su ${T.toLocaleString("it-IT")} rotte, ${Math.round(pct(tot.std, T) * 100)}% le hanno fatte gli STD, ${Math.round(pct(tot.sic, T) * 100)}% i SIC.`]).font = { bold: true };
  if (stimati.length) rc.addRow([`Nota: per ${stimati.map(nomeMese).join(", ")} le rotte STD sono stimate: quota media STD della station nel resto dell'anno, applicata alle rotte fatturate ad Amazon in quel mese (la busta non ha il calendario).`]).font = { italic: true, color: { argb: "FF64748B" } };
  if (buchi.length) rc.addRow([`Nota: manca la busta STD di ${buchi.join(", ")}: quelle rotte non sono contate.`]).font = { italic: true, color: { argb: "FF64748B" } };
  rc.addRow([]);
  titolo(rc, `2. Assenteismo (${periodo(tassi.TOTALE.mesi)})`, "Giorni di malattia e infortunio sui giorni in cui si doveva lavorare. Malattia + infortunio = assenteismo.");
  { const r0 = testa(rc, ["Station", "Assenteismo SIC + STD", "di cui malattia", "di cui infortunio", "Assenteismo SIC", "Assenteismo STD"]).number;
    for (const st of stations) { const t = ytdDi("TOTALE", st); percento(rc.addRow([st, fr(t.pct), fr(t.malattiaPct), fr(t.infortunioPct), fr(ytdDi("SIC", st).pct), fr(ytdDi("STD", st).pct)]), 2); }
    const t = ytdDi("TOTALE"), u = rc.addRow(["Network", fr(t.pct), fr(t.malattiaPct), fr(t.infortunioPct), fr(ytdDi("SIC").pct), fr(ytdDi("STD").pct)]); totale(u); percento(u, 2); riquadra(rc, r0, u.number, 6);
    rc.addRow([`In una riga: nel network l'assenteismo è ${String(t.pct).replace(".", ",")}%, di cui ${String(t.malattiaPct).replace(".", ",")}% malattia e ${String(t.infortunioPct).replace(".", ",")}% infortunio. SIC ${String(ytdDi("SIC").pct).replace(".", ",")}%, STD ${String(ytdDi("STD").pct).replace(".", ",")}%. Il mese per mese è nei fogli "Assenteismo".`]).font = { bold: true }; }
  rc.addRow([]);
  titolo(rc, `3. Priorità di intervento (${periodo(mesiAss)})`, "Giorni ogni 100 lavoratori al mese. Priorità: da 0 a 100, più è alta più serve intervenire.");
  testa(rc, ["Station", "Persone (media)", "% persone assenti", "Giorni malattia /100", "Giorni infortunio /100", "Priorità", "Stato", "Ultimi 3 mesi"]);
  for (const s of a.stations) { const r = rc.addRow([s.station, s.ind.headcount, s.ind.assentiPct / 100, s.ind.malattia100, s.ind.infortunio100, s.priorita, ETICHETTA_LIVELLO[s.livello], s.tendenza ? `${s.tendenza.verso === "PEGGIORA" ? "peggiora" : s.tendenza.verso === "MIGLIORA" ? "migliora" : "stabile"} ${s.tendenza.variazione > 0 ? "+" : ""}${s.tendenza.variazione}%` : ""]); r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FONDO[s.livello] } }; }
  totale(rc.addRow(["Network", a.network.headcount, a.network.assentiPct / 100, a.network.malattia100, a.network.infortunio100, "", "", ""]));
  rc.addRow([]);
  titolo(rc, "4. SIC contro STD");
  testa(rc, ["Gruppo", "Persone (media)", "% persone assenti", "Giorni malattia /100", "Giorni infortunio /100", "Giorni di infortunio", "Persone infortunate", "Infortunio ogni 1.000 rotte"]);
  for (const g of ["SIC", "STD"] as const) { const rr = righe.filter((r) => r.gruppo === g && mesiAss.includes(r.mese)), s = somma(rr), i = indicatori(s); rc.addRow([g, i.headcount, i.assentiPct / 100, i.malattia100, i.infortunio100, s.ggInfortunio, rr.reduce((x, r) => x + r.persInfortunio, 0), i.infortunio1000Rotte]); }
  rc.addRow(["Persone infortunate: somma dei mesi (chi è in infortunio per due mesi conta due volte)."]).font = { italic: true, color: { argb: "FF64748B" } };
  rc.addRow([]);
  titolo(rc, "5. In breve");
  for (const f of frasi) { const r = rc.addRow([`• ${f.testo.replace(/(\d)\.(\d)(?!\d)/g, "$1,$2")}`]); rc.mergeCells(r.number, 1, r.number, 9); r.getCell(1).alignment = { wrapText: true, vertical: "top" }; r.height = f.testo.length > 120 ? 32 : 18; }
  rc.eachRow((r) => r.eachCell((c, n) => { if (typeof c.value === "number" && !c.numFmt) c.numFmt = c.value > 0 && c.value < 1 && (n === 3 || n === 6 || n === 7) ? "0.0%" : Number.isInteger(c.value) ? "#,##0" : "#,##0.0"; }));

  // ===== Assenteismo: confronto da inizio anno, poi mese per mese per SIC + STD, SIC, STD
  const NOME_VISTA: Record<Vista, string> = { TOTALE: "SIC + STD", SIC: "SIC", STD: "STD" };
  const ay = wb.addWorksheet("Assenteismo");
  ay.columns = [14, ...Array(9).fill(13)].map((width) => ({ width }));
  titolo(ay, `Assenteismo da inizio anno (${periodo(tassi.TOTALE.mesi)})`, "Giorni di malattia e infortunio ÷ giorni in cui si doveva lavorare (lavorati + malattia + infortunio). Ferie, ROL e permessi non contano.");
  ay.addRow([]);
  { const g = ay.addRow(["", "SIC + STD", "", "", "SIC", "", "", "STD", "", ""]); for (const c0 of [2, 5, 8]) ay.mergeCells(g.number, c0, g.number, c0 + 2);
    g.eachCell((c, n) => { if (n > 1) { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { horizontal: "center" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: n < 5 ? BLU : n < 8 ? "FF257DE0" : "FF00916E" } }; } });
    const h = testa(ay, ["Station", ...Array(3).fill(["Assenteismo", "Malattia", "Infortunio"]).flat()]); h.eachCell((c) => { c.alignment = { horizontal: "center" }; });
    const riga = (nome: string, st?: string) => { const r = ay.addRow([nome, ...(["TOTALE", "SIC", "STD"] as Vista[]).flatMap((v) => { const t = ytdDi(v, st); return [fr(t.pct), fr(t.malattiaPct), fr(t.infortunioPct)]; })]); percento(r, 2); for (const c0 of [2, 5, 8]) r.getCell(c0).font = { bold: true }; return r; };
    for (const st of stations) riga(st, st); const u = riga("Network"); totale(u); riquadra(ay, g.number, u.number, 10);
    for (const c0 of ["B", "E", "H"]) ay.addConditionalFormatting({ ref: `${c0}${h.number + 1}:${c0}${u.number - 1}`, rules: [{ type: "colorScale", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FFF4A6A6" }] }] }); }
  ay.addRow([]); ay.addRow(["Come leggere: 8% vuol dire che su 100 giorni in cui si doveva lavorare, 8 sono stati di malattia o infortunio. Malattia + infortunio = assenteismo."]).font = { italic: true, color: { argb: "FF64748B" } };
  ay.addRow(["I tre gruppi sono confrontati sugli stessi mesi. I fogli seguenti hanno il mese per mese."]).font = { italic: true, color: { argb: "FF64748B" } };
  const fogliMese: ExcelJS.Worksheet[] = [];
  for (const v of ["TOTALE", "SIC", "STD"] as Vista[]) {
    const t = tassi[v], ws = wb.addWorksheet(`Assenteismo ${NOME_VISTA[v]}`); fogliMese.push(ws);
    ws.columns = [14, ...t.mesi.map(() => 10.5), 13].map((width) => ({ width }));
    titolo(ws, `Assenteismo ${NOME_VISTA[v]}: station per mese (${periodo(t.mesi)})`, v === "TOTALE" ? "Solo i mesi in cui ci sono le buste di tutti e due i gruppi." : v === "STD" ? "Da febbraio: la busta STD di gennaio non ha il calendario." : "I SIC arrivano al mese prima dell'ultima busta.");
    for (const [nome, k] of [["Assenteismo (malattia + infortunio)", "pct"], ["di cui malattia", "malattiaPct"], ["di cui infortunio", "infortunioPct"]] as [string, keyof Tasso][]) {
      ws.addRow([]); ws.addRow([nome]).font = { bold: true, size: 12 };
      const h = testa(ws, ["Station", ...t.mesi.map((m) => `${MESI[Number(m.slice(5)) - 1].slice(0, 3)} ${m.slice(2, 4)}`), "Da inizio anno"]); h.eachCell((c, n) => { if (n > 1) c.alignment = { horizontal: "center" }; });
      for (const s of t.stations) { const r = ws.addRow([s.station, ...s.perMese.map((x) => fr(x[k])), fr(s.ytd[k])]); percento(r, 2); r.getCell(t.mesi.length + 2).font = { bold: true }; }
      const u = ws.addRow(["Network", ...t.network.perMese.map((x) => fr(x[k])), fr(t.network.ytd[k])]); percento(u, 2); totale(u); riquadra(ws, h.number, u.number, t.mesi.length + 2);
      if (t.stations.length) ws.addConditionalFormatting({ ref: `B${h.number + 1}:${ws.getColumn(t.mesi.length + 1).letter}${u.number - 1}`, rules: [{ type: "colorScale", priority: 1, cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FFF4A6A6" }] }] });
    }
  }
  for (const ws of [rc, ay, ...fogliMese]) { ws.views = [{ showGridLines: false }]; ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; }

  // ===== 2. Rotte per mese
  const rm = wb.addWorksheet("Rotte per mese");
  rm.columns = [16, 10, 10, 10, 10, 10, 52].map((width) => ({ width }));
  testa(rm, ["Mese", "Station", "STD", "SIC", "Totale", "% STD", "Nota"]);
  for (const m of mesiRotte) for (const st of stations) { const c = cella(m, st), t = c.std + c.sic; rm.addRow([nomeMese(m), st, c.mancaStd ? "" : c.std, c.sic, t, c.mancaStd ? "" : pct(c.std, t), c.mancaStd ? "manca la busta STD" : c.stimate ? "rotte STD stimate: quota media dell'anno sulle rotte fatturate" : ""]); }
  rm.getColumn(6).numFmt = "0.0%";

  // ===== 3. Station: SIC e STD
  const sg = wb.addWorksheet("Station SIC e STD");
  sg.columns = [10, 9, 14, 14, 14, 14, 13, 13, 14, 16].map((width) => ({ width }));
  testa(sg, ["Station", "Gruppo", "Persone (media)", "% persone assenti", "Giorni malattia /100", "Giorni infortunio /100", "Giorni di malattia", "Giorni di infortunio", "Rotte", "Infortunio ogni 1.000 rotte"]);
  for (const st of stations) for (const g of ["SIC", "STD"] as const) { const s = somma(righe.filter((r) => r.station === st && r.gruppo === g && mesiAss.includes(r.mese))), i = indicatori(s); if (s.mesi) sg.addRow([st, g, i.headcount, i.assentiPct / 100, i.malattia100, i.infortunio100, s.ggMalattia, s.ggInfortunio, s.rotte, i.infortunio1000Rotte]); }
  sg.getColumn(4).numFmt = "0.0%";

  // ===== 4. Dettaglio per mese
  const dm = wb.addWorksheet("Dettaglio per mese");
  dm.columns = [16, 10, 9, 10, 10, 12, 12, 13, 9, 9, 12, 13, 14, 13, 22].map((width) => ({ width }));
  testa(dm, ["Mese", "Station", "Gruppo", "Persone", "Rotte", "Giorni lavorati", "Giorni malattia", "Giorni infortunio", "Giorni ferie", "Giorni ROL", "Giorni ex festività", "Persone in malattia", "Persone in infortunio", "Persone assenti", "Nota"]);
  for (const r of tutte) dm.addRow([nomeMese(r.mese), r.station, r.gruppo, r.teste, r.rotte ?? "", ...(r.calendario ? [r.ggLavorati, r.ggMalattia, r.ggInfortunio, r.ggFerie, r.ggRol, r.ggExfest, r.persMalattia, r.persInfortunio, r.persAssenti] : ["", "", "", "", "", "", "", "", ""]), !r.calendario ? "busta senza calendario: assenze non note" : r.rotteStimate ? "rotte stimate" : ""]);

  // ===== 5. Come leggere
  const cl = wb.addWorksheet("Come leggere");
  cl.columns = [{ width: 28 }, { width: 110 }];
  testa(cl, ["Voce", "Cosa vuol dire"]);
  for (const [k, v] of [
    ["Fonte", "Buste paga (LUL) di SIC e STD. Solo totali per station, mese e gruppo: nessun nome, nessun importo."],
    ["Rotta", "Una giornata di consegna. SIC: i giorni di trasferta pagati in busta. STD: i giorni lavorati per più di 4 ore sul calendario della busta."],
    ["SIC e STD", "SIC = assunti da noi, a tempo indeterminato o determinato, contati insieme. STD = somministrati."],
    ["Mese", "Il mese in cui si è lavorato. La busta dei SIC paga le trasferte del mese prima, quindi i SIC arrivano con un mese di ritardo."],
    ["Assenteismo %", "Giorni di malattia e infortunio diviso i giorni in cui si doveva lavorare (lavorati + malattia + infortunio). Ferie, ROL, ex festività e permessi non contano né sopra né sotto."],
    ["Giorno lavorato", "Un giorno del calendario della busta con più di 4 ore lavorate. Vale per tutto il personale in busta, non solo per i driver."],
    ["% persone assenti", "Persone con almeno un giorno di malattia o infortunio nel mese, sul totale delle persone in busta."],
    ["Giorni /100", "Giorni di malattia (o di infortunio) ogni 100 lavoratori in un mese. Si usano i giorni e non le ore perché una giornata STD vale 3–4 ore in busta, una SIC quasi 8."],
    ["Priorità (0–100)", "Mette insieme quanto la station è peggio della media del network (60%) e quanto pesa sui giorni persi di tutto il network (40%)."],
    ["Stato", "0–30 sotto controllo · 31–60 attenzione · 61–80 criticità · 81–100 intervento prioritario."],
    ["Ultimi 3 mesi", "Giorni persi ogni 100 lavoratori negli ultimi 3 mesi contro i 3 prima. Oltre ±15% è peggioramento o miglioramento."],
    ["Limite", "Uno STD a cui non viene rinnovata la missione dopo un infortunio esce dalle buste: i giorni di infortunio degli STD possono essere sottostimati."],
  ]) { const r = cl.addRow([k, v]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: "top" }; r.height = v.length > 110 ? 32 : 18; }

  for (const ws of [rm, sg, dm]) { ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }; ws.eachRow((r, n) => { if (n > 1) r.eachCell((c) => { if (typeof c.value === "number" && !c.numFmt) c.numFmt = Number.isInteger(c.value) ? "#,##0" : "#,##0.0"; }); }); }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Rotte_e_assenze_SIC_STD_${mesiRotte[mesiRotte.length - 1] ?? "2026"}.xlsx"`, "Cache-Control": "no-store" } });
}
