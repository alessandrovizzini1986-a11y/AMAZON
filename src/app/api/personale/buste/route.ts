import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireSuperAdmin } from "@/lib/auth";
import { rateiFerie } from "@/lib/personale/ratei";
import { db } from "@/lib/db";
import { addebitiPerPersona, NOME_ADDEBITO, type Addebito, type TipoAddebito, CATEGORIE, COEFF_COSTO_AZIENDA, COEFF_SENZA_RATEI_FERIE, COEFF_FONTE, costo, feriePerStation, piuStraordinari, SOGLIA_FERIE, ultimiRatei, type Gruppo, type OrePersona, type RateiPersona, type TotaleMese, type VoceMese } from "@/domain/personale/buste";

export const dynamic = "force-dynamic";

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const mb = (m: string) => `${MESI[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const BLU = "FF1E3A5F", GRIGIO = "FFF1F5F9", EURO = '#,##0 "€";-#,##0 "€"', ORE = "#,##0.0";

/** Excel "Buste paga": costo per station e mese, voci variabili, straordinari, ferie residue. Solo super admin. */
export async function GET(req: NextRequest) {
  await requireSuperAdmin();
  const gls = req.nextUrl.searchParams.get("cliente") === "gls", dove = gls ? "GLS" : { not: "GLS" };
  const rateiF = gls ? [] : await rateiFerie();
  const [t0, v0, o0, r0, a0] = await Promise.all([
    db.personaleBustaMese.findMany({ where: { station: dove } }), db.personaleBustaVoce.findMany({ where: { station: dove } }),
    db.personaleOrePersona.findMany({ where: { station: dove } }), db.personaleRateiPersona.findMany({ where: { station: dove } }), db.personaleAddebito.findMany({ where: { station: dove }, orderBy: { mese: "asc" } }),
  ]);
  const tot = t0.map((t) => ({ ...t, gruppo: t.gruppo as Gruppo })) as TotaleMese[], voci = v0.map((v) => ({ ...v, gruppo: v.gruppo as Gruppo })) as VoceMese[];
  const ore = o0 as OrePersona[], ratei = r0.map((r) => ({ ...r, gruppo: r.gruppo as Gruppo, ferieUnita: r.ferieUnita as "GG" | "ORE" })) as RateiPersona[];
  const stations = [...new Set(tot.map((t) => t.station))].sort();
  const gruppi: Gruppo[] = gls ? ["SIC"] : ["SIC", "STD"];

  const wb = new ExcelJS.Workbook(); wb.creator = "FleetDSP";
  const titolo = (ws: ExcelJS.Worksheet, testo: string, sotto?: string) => { ws.addRow([testo]).font = { bold: true, size: 13, color: { argb: BLU } }; if (sotto) ws.addRow([sotto]).font = { italic: true, color: { argb: "FF64748B" } }; ws.addRow([]); };
  const intest = (ws: ExcelJS.Worksheet, v: string[]) => { const r = ws.addRow(v); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU } }; }); return r; };

  // 1. Costo
  const ws1 = wb.addWorksheet("Costo");
  titolo(ws1, `Costo del personale dalle buste${gls ? " · GLS autisti" : ""}`, `Mese = mese della busta. Costo azienda stimato (SIC) = (lordo di competenza + quota TFR) × ${COEFF_SENZA_RATEI_FERIE} + rateo di ferie e permessi del mese (maturato − goduto al valore dell'anagrafica costi); dove il rateo non si calcola, × ${COEFF_COSTO_AZIENDA}. Coefficienti dai ${COEFF_FONTE}. Per gli STD il costo vero è la fattura dell'agenzia.`);
  for (const g of gruppi) {
    const mesi = [...new Set(tot.filter((t) => t.gruppo === g).map((t) => t.mese))].sort();
    for (const [nome, f] of (g === "SIC" ? [["Costo azienda stimato", (c: ReturnType<typeof costo>) => c.stimato ?? 0], ["Lordo in busta", (c: ReturnType<typeof costo>) => c.lordo], ["Persone in busta", (c: ReturnType<typeof costo>) => c.teste]] : [["Lordo in busta", (c: ReturnType<typeof costo>) => c.lordo], ["Persone in busta", (c: ReturnType<typeof costo>) => c.teste]]) as [string, (c: ReturnType<typeof costo>) => number][]) {
      ws1.addRow([`${g} · ${nome}`]).font = { bold: true };
      intest(ws1, ["Station", ...mesi.map(mb), nome.startsWith("Persone") ? "" : "Anno"]);
      for (const s of [...stations, "Totale"]) {
        const righe = tot.filter((t) => t.gruppo === g && (s === "Totale" || t.station === s));
        const r = ws1.addRow([s, ...mesi.map((m) => f(costo(righe.filter((t) => t.mese === m), voci, rateiF))), nome.startsWith("Persone") ? null : f(costo(righe, voci, rateiF))]);
        r.eachCell((c, i) => { if (i > 1) c.numFmt = nome.startsWith("Persone") ? "0" : EURO; });
        if (s === "Totale") r.font = { bold: true };
      }
      ws1.addRow([]);
    }
  }
  ws1.getColumn(1).width = 30; for (let i = 2; i <= 14; i++) ws1.getColumn(i).width = 12;

  // 2. Voci
  const ws2 = wb.addWorksheet("Voci variabili");
  titolo(ws2, "Voci della busta per categoria", "Importi lordi per mese della busta, tutte le station. Pagato in busta, tolto dalla busta (trattenute) e anticipi per conto INPS.");
  for (const g of gruppi) {
    const mesi = [...new Set(tot.filter((t) => t.gruppo === g).map((t) => t.mese))].sort();
    for (const s of [...stations, "Tutte"]) {
      ws2.addRow([`${g} · ${s === "Tutte" ? "Tutte le station" : s}`]).font = { bold: true };
      intest(ws2, ["Categoria", "Tipo", ...mesi.map(mb), "Anno"]);
      for (const c of CATEGORIE) {
        const righe = voci.filter((v) => v.gruppo === g && v.categoria === c.id && v.voce === "" && (s === "Tutte" || v.station === s));
        if (!righe.length) continue;
        const r = ws2.addRow([c.nome, { COMPETENZA: "pagato", TRATTENUTA: "tolto", INFO: "info" }[c.tipo], ...mesi.map((m) => righe.filter((v) => v.mese === m).reduce((a, v) => a + v.importo, 0) || null), righe.reduce((a, v) => a + v.importo, 0)]);
        r.eachCell((x, i) => { if (i > 2) x.numFmt = EURO; });
      }
      ws2.addRow([]);
    }
  }
  ws2.getColumn(1).width = 40; ws2.getColumn(2).width = 9; for (let i = 3; i <= 15; i++) ws2.getColumn(i).width = 11;

  // 3. Dettaglio voci (anno)
  const ws3 = wb.addWorksheet("Dettaglio voci");
  titolo(ws3, "Dettaglio delle voci variabili, da inizio anno");
  intest(ws3, ["Gruppo", "Station", "Categoria", "Voce", "Importo", "Ore", "Persone (somma dei mesi)"]);
  const det = new Map<string, { g: string; s: string; c: string; v: string; i: number; o: number; p: number }>();
  for (const v of voci.filter((x) => x.voce !== "")) { const k = `${v.gruppo}|${v.station}|${v.categoria}|${v.voce}`; const x = det.get(k) ?? { g: v.gruppo, s: v.station, c: v.categoria, v: v.voce, i: 0, o: 0, p: 0 }; x.i += v.importo; x.o += v.ore; x.p += v.persone; det.set(k, x); }
  for (const x of [...det.values()].sort((a, b) => a.g.localeCompare(b.g) || a.s.localeCompare(b.s) || a.c.localeCompare(b.c) || b.i - a.i)) { const r = ws3.addRow([x.g, x.s, CATEGORIE.find((c) => c.id === x.c)?.nome ?? x.c, x.v, x.i, x.o || null, x.p]); r.getCell(5).numFmt = EURO; r.getCell(6).numFmt = ORE; }
  [8, 8, 34, 36, 12, 9, 12].forEach((w, i) => (ws3.getColumn(i + 1).width = w));

  // 4. Straordinari
  const ws4 = wb.addWorksheet("Straordinari");
  titolo(ws4, "Ore straordinarie e supplementari", "Ore in più pagate in busta; % sulle ore lavorate del calendario della stessa busta.");
  for (const g of gruppi) {
    const mesi = [...new Set(ore.filter((o) => o.gruppo === g).map((o) => o.mese))].sort();
    ws4.addRow([`${g} · ore in più per station`]).font = { bold: true };
    intest(ws4, ["Station", ...mesi.map(mb), "Anno", "% anno"]);
    for (const s of [...stations, "Totale"]) {
      const r0 = ore.filter((o) => o.gruppo === g && (s === "Totale" || o.station === s));
      const lav = r0.reduce((a, o) => a + (o.oreLav ?? 0), 0), st = r0.reduce((a, o) => a + o.oreStr, 0);
      const r = ws4.addRow([s, ...mesi.map((m) => r0.filter((o) => o.mese === m).reduce((a, o) => a + o.oreStr, 0)), st, lav ? st / lav : null]);
      r.eachCell((c, i) => { c.numFmt = i === mesi.length + 3 ? "0.0%" : i > 1 ? "#,##0" : "@"; }); if (s === "Totale") r.font = { bold: true };
    }
    ws4.addRow([]);
    ws4.addRow([`${g} · chi fa più straordinari (da inizio anno)`]).font = { bold: true };
    intest(ws4, ["Persona", "Station", "Ore in più", "% sulle ore lavorate", "Buste con straordinari", "Mese più alto", "Ore nel mese più alto"]);
    for (const p of piuStraordinari(ore.filter((o) => o.gruppo === g), 50)) { const r = ws4.addRow([p.nome, p.station, p.oreStr, p.oreLav ? p.oreStr / p.oreLav : null, `${p.mesiCon}/${p.mesi}`, mb(p.meseMax), p.max]); r.getCell(3).numFmt = ORE; r.getCell(4).numFmt = "0.0%"; r.getCell(7).numFmt = ORE; }
    ws4.addRow([]);
  }
  ws4.getColumn(1).width = 30; for (let i = 2; i <= 14; i++) ws4.getColumn(i).width = 11;

  // 5. Ferie residue
  const ws5 = wb.addWorksheet("Ferie residue");
  titolo(ws5, "Ferie, ROL ed ex festività residue", `Ultima busta di ogni gruppo. Ferie in giorni (SIC${gls ? "" : ", GLS"}) o in ore (STD); ROL ed ex festività in ore. In giallo chi supera ${SOGLIA_FERIE.GG} giorni o ${SOGLIA_FERIE.ORE} ore.`);
  const fs = feriePerStation(ratei);
  for (const g of gruppi) {
    const mesi = [...new Set(fs.filter((x) => x.gruppo === g).map((x) => x.mese))].sort();
    ws5.addRow([`${g} · ferie residue totali per station (saldo di fine busta)`]).font = { bold: true };
    intest(ws5, ["Station", ...mesi.map(mb)]);
    for (const s of stations) { const r = ws5.addRow([s, ...mesi.map((m) => fs.find((x) => x.gruppo === g && x.station === s && x.mese === m)?.ferie ?? null)]); r.eachCell((c, i) => { if (i > 1) c.numFmt = "#,##0"; }); }
    ws5.addRow([]);
  }
  intest(ws5, ["Persona", "Station", "Gruppo", "Qualifica", "Mese busta", "Ferie residue", "Unità", "Maturate nell'anno", "Godute nell'anno", "ROL residui (h)", "Ex fest. residue (h)"]);
  for (const x of ultimiRatei(ratei).sort((a, b) => a.gruppo.localeCompare(b.gruppo) || (b.ferieSaldo ?? 0) - (a.ferieSaldo ?? 0))) {
    const r = ws5.addRow([x.nome, x.station, x.gruppo, x.qualifica, mb(x.mese), x.ferieSaldo, x.ferieUnita === "GG" ? "giorni" : "ore", x.ferieMatur, x.ferieGoduto, x.rolSaldo, x.exfestSaldo]);
    [6, 8, 9, 10, 11].forEach((i) => (r.getCell(i).numFmt = ORE));
    if ((x.ferieSaldo ?? 0) > SOGLIA_FERIE[x.ferieUnita]) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } }; });
  }
  [28, 8, 7, 22, 9, 11, 7, 11, 11, 11, 11].forEach((w, i) => (ws5.getColumn(i + 1).width = w));
  for (const ws of [ws1, ws2, ws4]) ws.eachRow((r) => { if (!r.font?.bold && r.getCell(1).value === "Totale") r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIGIO } }; }); });

  // 6. Multe e danni
  const add = a0.map((a) => ({ ...a, gruppo: a.gruppo as Gruppo, tipo: a.tipo as TipoAddebito })) as Addebito[];
  const ws6 = wb.addWorksheet("Multe e danni");
  titolo(ws6, "Addebiti in busta: multe stradali, danni ai veicoli, multe disciplinari", "Importi trattenuti alle persone, per mese della busta. Negativo = restituito.");
  intest(ws6, ["Persona", "Station", "Gruppo", "Multe stradali", "Danni ai veicoli", "Multe disciplinari", "Totale", "Addebiti", "Mesi"]);
  for (const p of addebitiPerPersona(add)) { const r = ws6.addRow([p.nome, p.station, p.gruppo, p.MULTA || null, p.DANNO || null, p.DISCIPLINARE || null, p.totale, p.volte, p.mesi.map(mb).join(", ")]); [4, 5, 6, 7].forEach((i) => (r.getCell(i).numFmt = '#,##0.00 "€"')); }
  ws6.addRow([]); ws6.addRow(["Elenco degli addebiti"]).font = { bold: true };
  intest(ws6, ["Persona", "Station", "Gruppo", "Mese busta", "Tipo", "Voce in busta", "Importo"]);
  for (const x of [...add].sort((p, q) => p.nome.localeCompare(q.nome) || p.mese.localeCompare(q.mese))) { const r = ws6.addRow([x.nome, x.station, x.gruppo, mb(x.mese), NOME_ADDEBITO[x.tipo], x.voce, x.importo]); r.getCell(7).numFmt = '#,##0.00 "€"'; }
  [30, 8, 7, 14, 16, 16, 12, 9, 40].forEach((w, i) => (ws6.getColumn(i + 1).width = w));

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Buste_paga_${gls ? "GLS" : "Amazon"}_2026.xlsx"`, "Cache-Control": "no-store" } });
}
