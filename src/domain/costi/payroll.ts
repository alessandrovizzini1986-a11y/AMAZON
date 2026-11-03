/**
 * "Costi del personale PS" (payroll del mese, foglio "det", intestazione in riga 2):
 * righe CDC 5569 sui conti 6*, classificate per componente e istituto.
 * Le righe con Cod1 = 6 sono riclassifiche a somma zero: si tengono ma non si contano.
 */
import { at, text, type Cell, type SheetGrid } from "@/domain/presenze/grid";
import type { RigaCDL } from "./anagrafica";

export type Componente = "BASE" | "ASSENZE" | "TRASFERTA" | "STR_SUPP_MAGG" | "FESTIVITA" | "CARENZA_INTEGR" | "ONERI" | "RATEI_13_14" | "RATEI_FERIE" | "TFR" | "INDENNITA_FISSE" | "UNA_TANTUM" | "ALTRO_VOCI" | "ALTRO" | "RECLASS" | "GLS";
export const COMPONENTI: Componente[] = ["BASE", "ASSENZE", "TRASFERTA", "STR_SUPP_MAGG", "FESTIVITA", "CARENZA_INTEGR", "ONERI", "RATEI_13_14", "RATEI_FERIE", "TFR", "INDENNITA_FISSE", "UNA_TANTUM", "ALTRO_VOCI", "ALTRO", "RECLASS"];

export type RigaPayroll = { matr: string; dipe: string; cod1: string; cod2: string; descrizione: string; conto: string; importo: number; componente: Componente; istituto: string | null };

/** Componente e istituto di una riga (mappa della spec, verificata sul payroll 09/2026). */
export function classifica(cod1: string, cod2: string, descr: string): { componente: Componente; istituto: string | null } {
  const d = descr.trim(), l = d.toLowerCase(), c2 = cod2.trim().toUpperCase();
  if (cod1 === "6") return { componente: "RECLASS", istituto: null };
  if (l.includes("_gls")) return { componente: "GLS", istituto: null };
  if (["CONTRIBUTI", "INAIL", "RECUPERI", "DETTCTB"].includes(c2)) return { componente: "ONERI", istituto: null };
  if (c2 === "R_MENSILITA") return { componente: "RATEI_13_14", istituto: null };
  if (c2 === "R_FERIE") return { componente: "RATEI_FERIE", istituto: null };
  if (c2 === "TFR" || /^tfr a /i.test(d) || l.includes("vers.f.tesor")) return { componente: "TFR", istituto: null };
  if (c2 === "TOTALI") return { componente: "ALTRO", istituto: null };
  // voci che passano dal rateo (tredicesima, quattordicesima, ferie/ROL/ex fest. liquidate): coppie a somma zero
  if (/^(tredicesima|quattordicesima)|liquid\.cessati/i.test(d)) return { componente: "RECLASS", istituto: null };
  if (/indennit[àa] di trasferta_art 11q/i.test(d)) return { componente: "TRASFERTA", istituto: "TRASFERTA" };
  if (/ind\. di trasferta art\.11quinqu/i.test(d)) return { componente: "TRASFERTA", istituto: "TRASFERTA_DOM" };
  if (/^straordinario a forfait/i.test(d)) return { componente: "STR_SUPP_MAGG", istituto: "STR_FORFAIT" };
  if (/^straordinario/i.test(d)) return { componente: "STR_SUPP_MAGG", istituto: "STR" };
  if (/^lav(\.|oro) suppl/i.test(d)) return { componente: "STR_SUPP_MAGG", istituto: "SUPP" };
  if (/^maggiorazione 50/i.test(d)) return { componente: "STR_SUPP_MAGG", istituto: "MAGG" };
  if (l.includes("festivita' non goduta") || l.includes("festività non goduta")) return { componente: "FESTIVITA", istituto: "FESTIVITA" };
  if (/^carenza|^integr(\.|azione) ?(malattia|infortunio)|^integr\.malattia/i.test(d)) return { componente: "CARENZA_INTEGR", istituto: "CARENZA_INTEGR" };
  if (cod1 === "10") return { componente: "ASSENZE", istituto: /malattia|infortunio/i.test(d) ? "MALATTIA" : "ALTRE_ASSENZE" };
  if (/^retribuzione$|^e\.d\.r\. ccnl/i.test(d)) return { componente: "BASE", istituto: null };
  if (/^indennit[àa] trasfertista/i.test(d)) return { componente: "INDENNITA_FISSE", istituto: null };
  if (/una tantum|premio variabile|bonus/i.test(d)) return { componente: "UNA_TANTUM", istituto: null };
  return { componente: "ALTRO_VOCI", istituto: null };
}

const num = (v: Cell) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")) || 0);
const foglio = (s: SheetGrid[]) => s.find((x) => x.name.trim().toLowerCase() === "det" && x.rows.slice(0, 5).some((r) => r.some((v) => text(v).trim() === "IMPORTO")));
export const isPayroll = (s: SheetGrid[]) => !!foglio(s);

/** `dipendenti` = matricole con almeno una riga CDC 5569 (anche fuori dai conti 6*, es. solo debiti). */
export function leggiPayroll(sheets: SheetGrid[]): { righe: RigaPayroll[]; altriCdc: number; dipendenti: number } {
  const ws = foglio(sheets);
  if (!ws) throw new Error('foglio "det" con la colonna IMPORTO non trovato');
  const hr = ws.rows.findIndex((r) => r.some((v) => text(v).trim() === "IMPORTO"));
  const h = ws.rows[hr].map((v) => text(v).trim());
  const c = (n: string) => h.indexOf(n);
  const k = { matr: c("Matr"), dipe: c("Dipe"), cdc: c("CDC"), cod1: c("Cod1"), cod2: c("Cod2"), d: c("Descrizione"), conto: c("Conto1"), imp: c("IMPORTO") };
  const manca = Object.entries(k).filter(([, i]) => i < 0).map(([n]) => n);
  if (manca.length) throw new Error(`nel foglio det mancano colonne (${manca.join(", ")})`);
  const righe: RigaPayroll[] = [];
  let altriCdc = 0;
  const matr = new Set<string>();
  for (let r = hr + 1; r < ws.rows.length; r++) {
    const conto = text(at(ws, r, k.conto)).trim();
    if (!conto) continue;
    if (text(at(ws, r, k.cdc)).trim().replace(/\.0$/, "") !== "5569") { altriCdc++; continue; }
    matr.add(text(at(ws, r, k.matr)).trim().replace(/\.0$/, ""));
    if (!conto.startsWith("6")) continue;
    const cod1 = text(at(ws, r, k.cod1)).trim().replace(/\.0$/, ""), cod2 = text(at(ws, r, k.cod2)).trim(), descrizione = text(at(ws, r, k.d)).trim();
    righe.push({ matr: text(at(ws, r, k.matr)).trim().replace(/\.0$/, ""), dipe: text(at(ws, r, k.dipe)).trim(), cod1, cod2, descrizione, conto, importo: num(at(ws, r, k.imp)), ...classifica(cod1, cod2, descrizione) });
  }
  return { righe, altriCdc, dipendenti: matr.size };
}

/** Nome normalizzato (maiuscolo, senza accenti, parole in ordine alfabetico): cognome+nome in qualsiasi ordine. */
export const nomeKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’`]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/** Station del dipendente dall'anagrafica CDL per nome; chi manca → null ("non in anagrafica"). */
export function stationPerDipendente(righe: Pick<RigaPayroll, "dipe">[], anag: Pick<RigaCDL, "cognome" | "nome" | "station">[]): Map<string, string | null> {
  const idx = new Map(anag.map((a) => [nomeKey(`${a.cognome} ${a.nome}`), a.station]));
  return new Map([...new Set(righe.map((r) => r.dipe))].map((d) => [d, idx.get(nomeKey(d)) ?? null]));
}

/** Componenti per station (righe RECLASS e GLS escluse dal totale). */
export function componentiPerStation(righe: (RigaPayroll & { station: string | null })[]) {
  const out: Record<string, Partial<Record<Componente, number>> & { TOTALE: number; dipendenti: number }> = {};
  const dip = new Map<string, Set<string>>();
  for (const r of righe) {
    if (r.componente === "RECLASS" || r.componente === "GLS") continue;
    const s = r.station ?? "(non in anagrafica)";
    const x = (out[s] ??= { TOTALE: 0, dipendenti: 0 });
    x[r.componente] = (x[r.componente] ?? 0) + r.importo; x.TOTALE += r.importo;
    if (!dip.has(s)) dip.set(s, new Set());
    dip.get(s)!.add(r.matr);
  }
  for (const [s, set] of dip) out[s].dipendenti = set.size;
  return out;
}
