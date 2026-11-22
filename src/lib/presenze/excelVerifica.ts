import ExcelJS from "exceljs";
import { ETICHETTA_STATO, ETICHETTA_TIPO, ORDINE_TIPO, tettoAccordo, type EsitoVerifica, type Stato, type TipoRichiesta } from "@/domain/presenze/verifica";
import { fogliDelFile, matriceFoglio } from "@/lib/fatture/xlsxStream";
import { tabella } from "./excelUtil";

export type RigaRichiesta = { chiave: string; station: string; pop: string; driver: string; tipo: string; rif: string; periodo: string; testo: string; stato: Stato; nota: string };

const STATI_APERTI: Stato[] = ["DA_FARE", "RICHIESTA"];
const etTipo = (t: string) => ETICHETTA_TIPO[t as TipoRichiesta] ?? t;
const ordine = (a: RigaRichiesta, b: RigaRichiesta) =>
  a.station.localeCompare(b.station) || ORDINE_TIPO.indexOf(a.tipo as TipoRichiesta) - ORDINE_TIPO.indexOf(b.tipo as TipoRichiesta) || a.driver.localeCompare(b.driver) || a.rif.localeCompare(b.rif);

/**
 * Excel della verifica tracking: solo valori (nessuna formula), quindi leggero e veloce da aprire.
 * Fogli: Leggimi · Richieste (aperte, con Stato a tendina) · Chiuse · Sesto_giorno_domenica · Ore_settimana · Avvisi.
 * Lo Stato si può cambiare qui e ricaricare il file nel sito: la colonna Chiave serve a ritrovare la riga.
 */
export function excelVerifica(x: { mese: string; finoA: string; utente: string; richieste: RigaRichiesta[]; verifica: EsitoVerifica | null; avvisi: string[] }): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FleetDSP";
  const aperte = x.richieste.filter((r) => STATI_APERTI.includes(r.stato)).sort(ordine);
  const chiuse = x.richieste.filter((r) => !STATI_APERTI.includes(r.stato)).sort(ordine);

  const l = wb.addWorksheet("Leggimi");
  l.getColumn(1).width = 120;
  const tetto = tettoAccordo(x.finoA);
  [
    `Verifica tracking ${x.mese.slice(5)}/${x.mese.slice(0, 4)}, fino al ${x.finoA.split("-").reverse().join("/")} · fatta da ${x.utente}`,
    "",
    "COSA FARE, IN ORDINE",
    "1. Foglio Richieste: una riga per ogni cosa da chiedere all'Operation Supervisor. Filtra per Station.",
    "2. Manda il messaggio (dal sito: Copia messaggio) e metti lo Stato su \"Chiesta, aspetto risposta\".",
    "3. Quando l'OS risponde e corregge il tracking: Stato \"OK, chiusa\". Se serve, scrivi la risposta nella Nota.",
    "4. Ricarica il tracking corretto nel sito e rifai la verifica: le righe sistemate spariscono da sole, gli OK restano OK.",
    "5. Puoi cambiare lo Stato qui e ricaricare questo file nel sito (Verifica tracking → Carica Excel con gli stati). Non toccare la colonna Chiave.",
    "",
    "REGOLE DELLE ORE (settimana da lunedì a domenica)",
    "· Standard: fino alle ore di contratto (full time 39; part time le sue ore).",
    "· Supplementare: solo part time, per le ore oltre il contratto fino a 39.",
    `· Accordo: le ore da 39 a ${tetto} sono assorbite e vanno nella riga Accordo (43 h fino al 31/05/2026, 42 h dal 01/06/2026, 41 h dal 01/07/2027).`,
    `· Straordinario: solo oltre le ${tetto} ore della settimana; mai più di 12 h a settimana.`,
    "· Mai più di 6 giorni di lavoro di fila. Standard mai oltre 8h24 in un giorno.",
    "· Le settimane a cavallo tra due mesi si controllano solo se c'è anche il tracking del mese prima.",
    "",
    "COSA VUOL DIRE OGNI TIPO",
    ...ORDINE_TIPO.map((t) => `· ${ETICHETTA_TIPO[t]}`),
    "",
    "STATI: Da chiedere · Chiesta, aspetto risposta · OK, chiusa · Sparita da sola (il tracking è stato corretto e il controllo non la trova più).",
  ].forEach((t, i) => { const c = l.getCell(i + 1, 1); c.value = t; if (i === 0 || /^[A-Z ,()]+$/.test(t)) c.font = { bold: true }; });

  const colonne = [{ name: "Station" }, { name: "Tipo", width: 34 }, { name: "Pop." }, { name: "Driver", width: 30 }, { name: "Periodo", width: 14 }, { name: "Cosa chiedere", width: 95 }, { name: "Stato", width: 26 }, { name: "Nota", width: 40 }, { name: "Chiave", width: 12 }];
  const riga = (r: RigaRichiesta) => [r.station, etTipo(r.tipo), r.pop, r.driver, r.periodo, r.testo, ETICHETTA_STATO[r.stato], r.nota, r.chiave];
  for (const [nome, righe] of [["Richieste", aperte], ["Chiuse", chiuse]] as const) {
    const ws = wb.addWorksheet(nome);
    tabella(ws, `T_${nome}`, colonne, righe.map(riga));
    ws.getColumn(6).alignment = { wrapText: true, vertical: "top" };
    const stati = `"${Object.values(ETICHETTA_STATO).join(",")}"`;
    for (let i = 0; i < righe.length; i++) ws.getCell(i + 2, 7).dataValidation = { type: "list", allowBlank: false, formulae: [stati] };
  }

  const v = x.verifica;
  tabella(wb.addWorksheet("Sesto_giorno_domenica"), "T_SeiDom",
    [{ name: "Station" }, { name: "Pop." }, { name: "Driver", width: 30 }, { name: "Contratto", width: 16 }, { name: "Domenica", date: true }, { name: "Giorno di riposo" }, { name: "Ore della settimana" }],
    (v?.seiDomenica ?? []).map((s) => [s.station, s.pop, s.driver, s.contratto, s.domenica, s.riposo, s.ore]));
  tabella(wb.addWorksheet("Ore_settimana"), "T_Ore",
    [{ name: "Station" }, { name: "Pop." }, { name: "Driver", width: 30 }, { name: "Contratto", width: 16 }, { name: "Settimana", width: 14 }, { name: "Giorni lavorati" }, { name: "Standard" }, { name: "Supplementare" }, { name: "Accordo" }, { name: "Straordinario" }, { name: "Assenze" }, { name: "Totale lavorate" },
      { name: "Atteso Standard" }, { name: "Atteso Suppl." }, { name: "Atteso Accordo" }, { name: "Atteso Straord." }, { name: "Esito", width: 60 }],
    (v?.settimane ?? []).map((s) => [s.station, s.pop, s.driver, s.contratto, s.periodo, s.giorniLavorati, s.std, s.sup, s.acc, s.str, s.ass, s.tot, s.atteso?.std ?? null, s.atteso?.sup ?? null, s.atteso?.acc ?? null, s.atteso?.str ?? null, s.esito]));
  tabella(wb.addWorksheet("Avvisi"), "T_Avvisi", [{ name: "Avviso", width: 120 }], [...x.avvisi, ...(v?.nonVerificabili ?? [])].map((a) => [a]));
  return wb;
}

/**
 * Legge gli stati da un Excel della verifica ricaricato (fogli Richieste e Chiuse).
 * Legge l'XML direttamente (matriceFoglio): ExcelJS non riapre i file con tabelle e filtri risalvati da Excel.
 */
export async function leggiStatiExcel(buf: ArrayBuffer): Promise<{ chiave: string; stato: Stato; nota: string }[]> {
  const perEtichetta = new Map(Object.entries(ETICHETTA_STATO).map(([k, v]) => [v.toLowerCase(), k as Stato]));
  const out: { chiave: string; stato: Stato; nota: string }[] = [];
  const fogli = await fogliDelFile(buf);
  for (const nome of ["Richieste", "Chiuse"]) {
    if (!fogli.includes(nome)) continue;
    const m = await matriceFoglio(buf, nome);
    const h = (m[0] ?? []).map((v) => String(v ?? "").trim());
    const cK = h.indexOf("Chiave"), cS = h.indexOf("Stato"), cN = h.indexOf("Nota");
    if (cK < 0 || cS < 0) continue;
    for (const row of m.slice(1)) {
      const chiave = String(row[cK] ?? "").trim();
      const s = String(row[cS] ?? "").trim().toLowerCase();
      // "ok", "OK" o una x valgono come chiusa: è il modo più veloce di spuntare una riga
      const stato = perEtichetta.get(s) ?? (/^(ok|x|si|sì|fatto)$/.test(s) ? "OK" : null);
      if (chiave.includes("|") && stato) out.push({ chiave, stato, nota: cN >= 0 ? String(row[cN] ?? "").trim() : "" });
    }
  }
  if (!out.length) throw new Error("In questo file non trovo i fogli Richieste e Chiuse con le colonne Chiave e Stato: è l'Excel scaricato da questa pagina?");
  return out;
}
