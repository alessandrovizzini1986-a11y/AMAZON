import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { analisi, ETICHETTA_LIVELLO, indicatori, mesiValidi, riepilogo, somma, type Livello, type RigaMese } from "@/domain/personale/analisi";

export const dynamic = "force-dynamic";

const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const nomeMese = (m: string) => `${MESI[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const FONDO: Record<Livello, string> = { OK: "FFDCFCE7", ATTENZIONE: "FFFEF9C3", CRITICA: "FFFFEDD5", PRIORITARIA: "FFFEE2E2" };
const BLU = "FF1E3A5F", GRIGIO = "FFF1F5F9";

/** Excel "Rotte e assenze SIC e STD": primo foglio = recap da leggere in un minuto, poi i fogli di dettaglio. Solo super admin. */
export async function GET() {
  await requireSuperAdmin();
  const tutte = await db.personaleMese.findMany({ where: { mese: { gte: "2026-01" } }, orderBy: [{ mese: "asc" }, { station: "asc" }, { gruppo: "asc" }] });
  const righe: RigaMese[] = tutte.map((r) => ({ mese: r.mese, station: r.station, gruppo: r.gruppo as "SIC" | "STD", teste: r.teste, calendario: r.calendario, rotte: r.rotte, rotteTd: r.rotteTd, ggMalattia: r.ggMalattia, ggInfortunio: r.ggInfortunio, persMalattia: r.persMalattia, persInfortunio: r.persInfortunio, persAssenti: r.persAssenti }));
  const stations = [...new Set(tutte.map((r) => r.station))].sort();

  // --- rotte: i mesi in cui ci sono le buste dei SIC (arrivano un mese dopo)
  const mesiRotte = [...new Set(tutte.filter((r) => r.gruppo === "SIC" && r.rotte !== null).map((r) => r.mese))].sort();
  const cella = (m: string, st: string) => {
    const sic = tutte.find((r) => r.mese === m && r.station === st && r.gruppo === "SIC"), std = tutte.find((r) => r.mese === m && r.station === st && r.gruppo === "STD");
    return { std: std?.rotte ?? 0, ind: (sic?.rotte ?? 0) - (sic?.rotteTd ?? 0), det: sic?.rotteTd ?? 0, mancaStd: !std || std.rotte === null, stimate: !!std?.rotteStimate };
  };
  const rotteDi = (st: string) => mesiRotte.map((m) => cella(m, st)).reduce((a, c) => ({ std: a.std + c.std, ind: a.ind + c.ind, det: a.det + c.det }), { std: 0, ind: 0, det: 0 });
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

  // ===== 1. Recap
  const rc = wb.addWorksheet("Recap");
  rc.columns = [16, 13, 15, 15, 12, 10, 14, 14, 16].map((width) => ({ width }));
  titolo(rc, "Rotte e assenze: SIC e STD", "Fonte: buste paga (LUL). STD = somministrati, tutti a termine. SIC = assunti da noi.");
  rc.addRow([]);
  titolo(rc, `1. Chi ha fatto le rotte (${periodo(mesiRotte)})`);
  testa(rc, ["Station", "STD", "SIC indeterminati", "SIC determinati", "Totale", "% STD", "% SIC indeterminati"]);
  const tot = { std: 0, ind: 0, det: 0 };
  for (const st of stations) { const x = rotteDi(st), t = x.std + x.ind + x.det; tot.std += x.std; tot.ind += x.ind; tot.det += x.det; rc.addRow([st, x.std, x.ind, x.det, t, pct(x.std, t), pct(x.ind, t)]); }
  const T = tot.std + tot.ind + tot.det; totale(rc.addRow(["Totale", tot.std, tot.ind, tot.det, T, pct(tot.std, T), pct(tot.ind, T)]));
  rc.addRow([`In una riga: su ${T.toLocaleString("it-IT")} rotte, ${Math.round(pct(tot.std, T) * 100)}% le hanno fatte gli STD, ${Math.round(pct(tot.ind, T) * 100)}% i SIC indeterminati, ${Math.round(pct(tot.det, T) * 100)}% i SIC determinati.`]).font = { bold: true };
  if (stimati.length) rc.addRow([`Nota: per ${stimati.map(nomeMese).join(", ")} le rotte STD sono stimate: quota media STD della station nel resto dell'anno, applicata alle rotte fatturate ad Amazon in quel mese (la busta non ha il calendario).`]).font = { italic: true, color: { argb: "FF64748B" } };
  if (buchi.length) rc.addRow([`Nota: manca la busta STD di ${buchi.join(", ")}: quelle rotte non sono contate.`]).font = { italic: true, color: { argb: "FF64748B" } };
  rc.addRow([]);
  titolo(rc, `2. Malattia e infortuni (${periodo(mesiAss)})`, "Giorni ogni 100 lavoratori al mese. Priorità: da 0 a 100, più è alta più serve intervenire.");
  testa(rc, ["Station", "Persone (media)", "% persone assenti", "Giorni malattia /100", "Giorni infortunio /100", "Priorità", "Stato", "Ultimi 3 mesi"]);
  for (const s of a.stations) { const r = rc.addRow([s.station, s.ind.headcount, s.ind.assentiPct / 100, s.ind.malattia100, s.ind.infortunio100, s.priorita, ETICHETTA_LIVELLO[s.livello], s.tendenza ? `${s.tendenza.verso === "PEGGIORA" ? "peggiora" : s.tendenza.verso === "MIGLIORA" ? "migliora" : "stabile"} ${s.tendenza.variazione > 0 ? "+" : ""}${s.tendenza.variazione}%` : ""]); r.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FONDO[s.livello] } }; }
  totale(rc.addRow(["Network", a.network.headcount, a.network.assentiPct / 100, a.network.malattia100, a.network.infortunio100, "", "", ""]));
  rc.addRow([]);
  titolo(rc, "3. SIC contro STD");
  testa(rc, ["Gruppo", "Persone (media)", "% persone assenti", "Giorni malattia /100", "Giorni infortunio /100", "Giorni di infortunio", "Persone infortunate", "Infortunio ogni 1.000 rotte"]);
  for (const g of ["SIC", "STD"] as const) { const rr = righe.filter((r) => r.gruppo === g && mesiAss.includes(r.mese)), s = somma(rr), i = indicatori(s); rc.addRow([g, i.headcount, i.assentiPct / 100, i.malattia100, i.infortunio100, s.ggInfortunio, rr.reduce((x, r) => x + r.persInfortunio, 0), i.infortunio1000Rotte]); }
  rc.addRow(["Persone infortunate: somma dei mesi (chi è in infortunio per due mesi conta due volte)."]).font = { italic: true, color: { argb: "FF64748B" } };
  rc.addRow([]);
  titolo(rc, "4. In breve");
  for (const f of frasi) { const r = rc.addRow([`• ${f.testo.replace(/(\d)\.(\d)(?!\d)/g, "$1,$2")}`]); rc.mergeCells(r.number, 1, r.number, 9); r.getCell(1).alignment = { wrapText: true, vertical: "top" }; r.height = f.testo.length > 120 ? 32 : 18; }
  rc.eachRow((r) => r.eachCell((c, n) => { if (typeof c.value === "number") c.numFmt = c.value > 0 && c.value < 1 && (n === 3 || n === 6 || n === 7) ? "0.0%" : Number.isInteger(c.value) ? "#,##0" : "#,##0.0"; }));

  // ===== 2. Rotte per mese
  const rm = wb.addWorksheet("Rotte per mese");
  rm.columns = [16, 10, 10, 16, 15, 10, 10, 26].map((width) => ({ width }));
  testa(rm, ["Mese", "Station", "STD", "SIC indeterminati", "SIC determinati", "Totale", "% STD", "Nota"]);
  for (const m of mesiRotte) for (const st of stations) { const c = cella(m, st), t = c.std + c.ind + c.det; rm.addRow([nomeMese(m), st, c.mancaStd ? "" : c.std, c.ind, c.det, t, c.mancaStd ? "" : pct(c.std, t), c.mancaStd ? "manca la busta STD" : c.stimate ? "rotte STD stimate: quota media dell'anno sulle rotte fatturate" : ""]); }
  rm.getColumn(7).numFmt = "0.0%";

  // ===== 3. Station: SIC e STD
  const sg = wb.addWorksheet("Station SIC e STD");
  sg.columns = [10, 9, 14, 14, 14, 14, 13, 13, 14, 16].map((width) => ({ width }));
  testa(sg, ["Station", "Gruppo", "Persone (media)", "% persone assenti", "Giorni malattia /100", "Giorni infortunio /100", "Giorni di malattia", "Giorni di infortunio", "Rotte", "Infortunio ogni 1.000 rotte"]);
  for (const st of stations) for (const g of ["SIC", "STD"] as const) { const s = somma(righe.filter((r) => r.station === st && r.gruppo === g && mesiAss.includes(r.mese))), i = indicatori(s); if (s.mesi) sg.addRow([st, g, i.headcount, i.assentiPct / 100, i.malattia100, i.infortunio100, s.ggMalattia, s.ggInfortunio, s.rotte, i.infortunio1000Rotte]); }
  sg.getColumn(4).numFmt = "0.0%";

  // ===== 4. Dettaglio per mese
  const dm = wb.addWorksheet("Dettaglio per mese");
  dm.columns = [16, 10, 9, 10, 10, 14, 12, 13, 9, 9, 12, 13, 14, 13, 22].map((width) => ({ width }));
  testa(dm, ["Mese", "Station", "Gruppo", "Persone", "Rotte", "di cui a termine", "Giorni malattia", "Giorni infortunio", "Giorni ferie", "Giorni ROL", "Giorni ex festività", "Persone in malattia", "Persone in infortunio", "Persone assenti", "Nota"]);
  for (const r of tutte) dm.addRow([nomeMese(r.mese), r.station, r.gruppo, r.teste, r.rotte ?? "", r.gruppo === "STD" ? r.rotte ?? "" : r.rotteTd, ...(r.calendario ? [r.ggMalattia, r.ggInfortunio, r.ggFerie, r.ggRol, r.ggExfest, r.persMalattia, r.persInfortunio, r.persAssenti] : ["", "", "", "", "", "", "", ""]), !r.calendario ? "busta senza calendario: assenze non note" : r.rotteStimate ? "rotte stimate" : ""]);

  // ===== 5. Come leggere
  const cl = wb.addWorksheet("Come leggere");
  cl.columns = [{ width: 28 }, { width: 110 }];
  testa(cl, ["Voce", "Cosa vuol dire"]);
  for (const [k, v] of [
    ["Fonte", "Buste paga (LUL) di SIC e STD. Solo totali per station, mese e gruppo: nessun nome, nessun importo."],
    ["Rotta", "Una giornata di consegna. SIC: i giorni di trasferta pagati in busta. STD: i giorni lavorati per più di 4 ore sul calendario della busta."],
    ["SIC determinati / indeterminati", "Si distinguono dalla scadenza del contratto scritta in busta. Gli STD sono tutti a termine."],
    ["Mese", "Il mese in cui si è lavorato. La busta dei SIC paga le trasferte del mese prima, quindi i SIC arrivano con un mese di ritardo."],
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
