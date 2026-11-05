/**
 * Fatture ADIT (Adecco) "MMAA_Doc._emessi_ADIT_STD-SL_*.xlsx": foglio che
 * inizia con "Estrazione", intestazione con MeseCompetenza. Si tengono solo
 * CDC 5569 (Amazon) senza la persona esclusa per regola; voce = mappa di
 * InvoiceDescription; costo = NoTaxableIncome.
 */
import { at, text, type Cell, type SheetGrid } from "@/domain/presenze/grid";

export const CDC_AMAZON = 5569;
/** Esclusa per regola del kit (non è un driver Amazon). */
const ESCLUSI: [string, string][] = [["sacchetti", "sara"]];

export type VoceAdit = "STANDARD" | "MAGG50" | "SUPP18" | "STR30" | "STR65" | "TRASFERTA" | "FESTIVITA" | "CTRB_DIGNITA" | "FERIE_PERM_GOD" | "CARENZA" | "RIVAL_RATEI" | "INTEGR_MOG" | "ALTRO";
export const VOCI_ORE: VoceAdit[] = ["STANDARD", "MAGG50", "SUPP18", "STR30", "STR65"];

export function voceAdit(desc: string): VoceAdit {
  const s = desc.trim(); const l = s.toLowerCase();
  if (s === "Stipendio") return "STANDARD";
  if (l.includes("maggiorazion")) return "MAGG50";
  if (s === "Supplementare 18%") return "SUPP18";
  if (s === "Straordinario 30%") return "STR30";
  if (l.includes("straordinario") && l.includes("65")) return "STR65";
  if (s === "Trasferta esente") return "TRASFERTA";
  if (l.includes("festivit")) return "FESTIVITA";
  if (l.includes("decr. dignit")) return "CTRB_DIGNITA";
  if (/^(FER|PERM|EXFS|MPER)/.test(s)) return "FERIE_PERM_GOD";
  if (l.includes("carenza") || l.includes("1inf")) return "CARENZA";
  if (l.includes("rivalutazione")) return "RIVAL_RATEI";
  if (l.includes("mog")) return "INTEGR_MOG";
  return "ALTRO";
}

export type RigaAdit = { meseCompetenza: string; station: string; cf: string; cognome: string; nome: string; voceAdit: string; voce: VoceAdit; quantita: number; costo: number; residuo: boolean };

const num = (v: Cell) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".")) || 0);
const foglio = (sheets: SheetGrid[]) => sheets.find((s) => s.name.trim().toLowerCase().startsWith("estraz") && s.rows.slice(0, 10).some((r) => r.some((v) => text(v).trim() === "MeseCompetenza")));

export const isAdit = (sheets: SheetGrid[]) => !!foglio(sheets);

export function leggiAdit(sheets: SheetGrid[]): { meseFattura: string; righe: RigaAdit[]; altriCdc: number; esclusi: number } {
  const ws = foglio(sheets);
  if (!ws) throw new Error('foglio "Estrazione…" con la colonna MeseCompetenza non trovato');
  const hr = ws.rows.findIndex((r) => r.some((v) => text(v).trim() === "MeseCompetenza"));
  const hdr = ws.rows[hr].map((v) => text(v).trim());
  const c = (n: string) => hdr.indexOf(n);
  const k = { mc: c("MeseCompetenza"), cf: c("CodFiscale"), cog: c("Asurname"), nom: c("Aname"), desc: c("InvoiceDescription"), q: c("Quantity"), imp: c("NoTaxableIncome"), cdc: c("CDC"), st: c("STATION/PLANT/PV") };
  const manca = Object.entries(k).filter(([, i]) => i < 0).map(([n]) => n);
  if (manca.length) throw new Error(`nel foglio ADIT mancano colonne (${manca.join(", ")})`);
  const tmp: Omit<RigaAdit, "residuo">[] = [];
  let altriCdc = 0, esclusi = 0;
  for (let r = hr + 1; r < ws.rows.length; r++) {
    const mc = at(ws, r, k.mc);
    if (mc === null || text(mc).trim() === "") continue;
    if (num(at(ws, r, k.cdc)) !== CDC_AMAZON) { altriCdc++; continue; }
    const cognome = text(at(ws, r, k.cog)).trim(), nome = text(at(ws, r, k.nom)).trim();
    if (ESCLUSI.some(([a, b]) => cognome.toLowerCase().includes(a) && nome.toLowerCase().includes(b))) { esclusi++; continue; }
    const d = text(at(ws, r, k.desc)).trim();
    const meseCompetenza = mc instanceof Date ? mc.toISOString().slice(0, 7) : text(mc).trim().slice(0, 7);
    tmp.push({ meseCompetenza, station: text(at(ws, r, k.st)).trim().toUpperCase(), cf: text(at(ws, r, k.cf)).trim().toUpperCase(), cognome, nome, voceAdit: d, voce: voceAdit(d), quantita: num(at(ws, r, k.q)), costo: num(at(ws, r, k.imp)) });
  }
  const freq = new Map<string, number>();
  for (const x of tmp) freq.set(x.meseCompetenza, (freq.get(x.meseCompetenza) ?? 0) + 1);
  const meseFattura = [...freq].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? "";
  return { meseFattura, righe: tmp.map((x) => ({ ...x, residuo: x.meseCompetenza !== meseFattura })), altriCdc, esclusi };
}

export type AggregatoAdit = Record<string, Partial<Record<VoceAdit, { quantita: number; costo: number; teste: number }>>>;

/** Station × voce: quantità, costo, teste (CF distinti). */
export function aggregaAdit(righe: Pick<RigaAdit, "station" | "voce" | "quantita" | "costo" | "cf">[]): AggregatoAdit {
  const out: AggregatoAdit = {};
  const cf = new Map<string, Set<string>>();
  for (const r of righe) {
    const s = (out[r.station] ??= {});
    const v = (s[r.voce] ??= { quantita: 0, costo: 0, teste: 0 });
    v.quantita += r.quantita; v.costo += r.costo;
    const key = `${r.station}|${r.voce}`;
    if (!cf.has(key)) cf.set(key, new Set());
    cf.get(key)!.add(r.cf);
  }
  for (const [key, set] of cf) { const [s, v] = key.split("|"); out[s][v as VoceAdit]!.teste = set.size; }
  return out;
}

export type TariffeStd = { STANDARD: number; MAGG50: number; SUPP18: number; STR30: number; STR65: number; SUPP65: number; FESTIVITA: number; FERIE_PERM_GOD: number; CARENZA_PCT: number; /** CTRB Decr. Dignità €/h = costo CTRB / ore fatturate (null se l'ADIT non ha ore) */ CTRB_H?: number | null };

/** Tariffe STD = costo / quantità dell'ADIT (tutte le station insieme); SUPP65 = STR65; carenza = % sul costo ore; CTRB = € / ore fatturate. */
export function tariffeDaAdit(righe: Pick<RigaAdit, "voce" | "quantita" | "costo">[]): TariffeStd {
  const q: Partial<Record<VoceAdit, number>> = {}, c: Partial<Record<VoceAdit, number>> = {};
  for (const r of righe) { q[r.voce] = (q[r.voce] ?? 0) + r.quantita; c[r.voce] = (c[r.voce] ?? 0) + r.costo; }
  const t = (v: VoceAdit) => (q[v] ? (c[v] ?? 0) / q[v]! : 0);
  const costoOre = VOCI_ORE.reduce((s, v) => s + (c[v] ?? 0), 0);
  const oreFatt = VOCI_ORE.reduce((s, v) => s + (q[v] ?? 0), 0);
  return { STANDARD: t("STANDARD"), MAGG50: t("MAGG50"), SUPP18: t("SUPP18"), STR30: t("STR30"), STR65: t("STR65"), SUPP65: t("STR65"), FESTIVITA: t("FESTIVITA"), FERIE_PERM_GOD: t("FERIE_PERM_GOD"), CARENZA_PCT: costoOre ? (c.CARENZA ?? 0) / costoOre : 0, CTRB_H: oreFatt ? (c.CTRB_DIGNITA ?? 0) / oreFatt : null };
}
