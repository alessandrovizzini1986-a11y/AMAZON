import ExcelJS from "exceljs";
import { daysBetween, GG, weekday } from "@/domain/presenze/grid";
import { righePerDriver, type EsitoSettimanale } from "@/domain/presenze/controlloSettimanale";
import { alertRighe, riepilogoStation, type DomenicaRigaSett } from "@/domain/presenze/vistaSettimanale";
import { SOGLIA_ORE, SOGLIA_PACCHI } from "@/domain/presenze/regole";
import { tabella } from "./excelUtil";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Excel del controllo settimanale (Riepilogo, Risultato, Alert, Dettaglio, Non_in_tracking, Domeniche_consecutivi, Parametri). */
export function excelSettimanale(esiti: EsitoSettimanale[], dom: DomenicaRigaSett[], par: { da: string; a: string; utente: string; giustificativi: string[]; dispatcher: number }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const giorni = daysBetween(par.da, par.a);

  const r = esiti.map(riepilogoStation);
  tabella(wb.addWorksheet("Riepilogo"), "T_Riepilogo",
    [{ name: "Station" }, { name: "Driver" }, { name: "Trasferte" }, { name: "Rotte Amazon" }, { name: "+1" }, { name: "-1" }, { name: "H" }, { name: "A" }, { name: "€ +1", numFmt: '#,##0.00 "€"' }, { name: "Giorni senza CSV", width: 30 }],
    r.map((x) => [x.station, x.driver, x.trasferte, x.rotte, x.piu1, x.meno1, x.h, x.a, x.eurPiu1, x.giorniSenzaCsv]));

  const righe = esiti.flatMap(righePerDriver);
  tabella(wb.addWorksheet("Risultato"), "T_Risultato",
    [{ name: "Station" }, { name: "Tipo" }, { name: "Driver", width: 30 }, { name: "Driver ID", width: 18 }, { name: "Contratto", width: 14 },
      { name: "gg lavorati" }, { name: "Trasferte" }, { name: "Rotte" }, { name: "+1" }, { name: "-1" }, { name: "H" }, { name: "A" },
      { name: "Giorni da verificare", width: 28 }, { name: "Nota", width: 60 },
      ...giorni.map((d) => ({ name: `${ddmm(d)} ${GG[weekday(d)]}`, width: 7 }))],
    righe.map((x) => [x.station, x.tipo, x.driver, x.driverId, x.contratto, x.giorniLavorati, x.trasferte, x.rotte, x.piu1, x.meno1, x.h, x.a, x.daVerificare, x.nota, ...giorni.map((d) => x.simboli[d] ?? "")]));

  tabella(wb.addWorksheet("Alert"), "T_Alert",
    [{ name: "Station" }, { name: "Tipo" }, { name: "Driver", width: 30 }, { name: "Driver ID", width: 18 }, { name: "Data", date: true }, { name: "Esito" }, { name: "Ore" }, { name: "Trasferta" }, { name: "Pacchi" }, { name: "Riposo" }, { name: "Nota", width: 70 }],
    esiti.flatMap(alertRighe).map((x) => [x.station, x.tipo, x.driver, x.driverId, x.data, x.categoria, x.ore, x.trasferta, x.pacchi, x.riposo, x.nota]));

  tabella(wb.addWorksheet("Dettaglio"), "T_Dettaglio",
    [{ name: "Station" }, { name: "Tipo" }, { name: "Driver", width: 30 }, { name: "Driver ID", width: 18 }, { name: "Contratto" }, { name: "Data", date: true }, { name: "Giorno" },
      { name: "Ore lavorate" }, { name: "Ore assenza" }, { name: "Trasferta" }, { name: "Trasf. ricalcolata" }, { name: "Pacchi Amazon" }, { name: "Aggancio" }, { name: "Riposo" },
      { name: "In rotta" }, { name: "Esito base" }, { name: "Categoria base", width: 30 }, { name: "Esito" }, { name: "Nota", width: 70 }, { name: "Commenti cella", width: 40 }],
    esiti.flatMap((e) => e.dettaglio).map((x) => [x.station, x.tipo, x.driver, x.driverId.startsWith("NOID|") ? "" : x.driverId, x.contratto, x.data, x.giorno, x.ore, x.oreAssenza, x.trasferta, x.trasfRicalcolata, x.pacchi, x.match, x.riposo, x.inRotta, x.esitoBase, x.categoriaBase, x.categoria, x.nota, x.noteCelle]));

  tabella(wb.addWorksheet("Non_in_tracking"), "T_NonInTracking",
    [{ name: "Station" }, { name: "Data", date: true }, { name: "Driver", width: 30 }, { name: "Driver ID", width: 18 }, { name: "Pacchi" }, { name: "In rotta" }, { name: "Esito" }, { name: "Nota", width: 60 }],
    esiti.flatMap((e) => e.nonInTracking.map((n) => [e.station, n.data, n.driver, n.driverId, n.pacchi, n.inRotta, n.categoria, n.nota])));

  tabella(wb.addWorksheet("Domeniche_consecutivi"), "T_Domeniche",
    [{ name: "Station" }, { name: "Tipo" }, { name: "Lavoratore", width: 30 }, { name: "Contratto" }, ...giorni.map((d) => ({ name: `${ddmm(d)} ${GG[weekday(d)]}`, width: 7 })),
      { name: "gg lavorati" }, { name: "6+dom", width: 16 }, { name: "Max consecutivi (mese)" }, { name: "Dal", date: true }, { name: "Al", date: true }, { name: ">6 consecutivi" }],
    dom.map((x) => [x.station, x.tipo, x.lavoratore, x.contratto, ...giorni.map((d) => x.ore[d] ?? null), x.giorniLavorati, x.seiPiuDom.map(ddmm).join(", "), x.maxConsecutivi, x.consecDal || null, x.consecAl || null, x.oltre6 ? "SI" : "NO"]));

  const p = wb.addWorksheet("Parametri");
  p.columns = [{ width: 30 }, { width: 80 }];
  p.addRows([
    ["Periodo", `${ddmm(par.da)}/${par.da.slice(0, 4)} – ${ddmm(par.a)}/${par.a.slice(0, 4)}`],
    ["Station", esiti.map((e) => e.station).join(", ")],
    ["Soglia pacchi (rotta Amazon)", `> ${SOGLIA_PACCHI}`],
    ["Soglia ore trasferta", `> ${SOGLIA_ORE}`],
    ["Giustificativi riga RIPOSO", par.giustificativi.join(", ")],
    ["Dispatcher esclusi", par.dispatcher],
    ["Eseguito da", par.utente],
    ["Eseguito il", new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })],
    ["Legenda", "+1 trasferta senza rotta Amazon · -1 rotta Amazon senza ore · H ore senza Amazon né trasferta · A in Amazon ma non nei tracking · ok coincidono · ? CSV mancante"],
  ]);
  p.getColumn(1).font = { bold: true };
  return wb;
}
