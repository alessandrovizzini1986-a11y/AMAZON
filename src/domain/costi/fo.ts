/**
 * Costi F.O. mensili Amazon (CDC 5569), docs/costi-kit/PROMPT_FO_mensile.md: regole pure per le righe del
 * foglio "AMZ <Mmm> <AAAA>" (noleggi per società e DS pro-rata, ZTL per data di richiesta, voci SIC/STD).
 */
export const DS_FO = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"] as const;

/** Riga del foglio per società di noleggio (17 = altre società, non presente nel modello). */
export function rigaNoleggio(societa: string | null): number {
  const s = (societa ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (s === "ALD MT" || s.startsWith("ALD MT") || s === "AYVENS MT") return 15;
  if (s.startsWith("ALD") || s.startsWith("AYVENS")) return 16;
  if (s.startsWith("ARVAL")) return 6;
  if (s.startsWith("AVIS") || s.includes("AMICOBLU") || s.includes("MAGGIORE")) return 9;
  if (s.startsWith("EUROPCAR")) return 10;
  if (s.startsWith("NOLEGGIARE")) return 11;
  if (s.startsWith("VEM")) return 12;
  if (s.startsWith("HERTZ") || s.startsWith("HERZ")) return 13;
  if (s.startsWith("AUTOVIA")) return 14;
  return 17;
}

const giorniMese = (mese: string) => { const [a, m] = mese.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const g = (iso: string) => Date.parse(iso + "T00:00:00Z") / 864e5;

export type MezzoFO = { station: string; stato: string; leasingCompany: string | null; canoneMese: number | null; inizio: string | null; fine: string | null };

/**
 * Quota del canone del mese: canone × giorni di presenza nel mese / giorni del mese. Presenza = da inizio contratto
 * (o inizio mese) a fine contratto / uscita (o fine mese). I sostitutivi non si pagano; un dismesso senza data
 * di fine non si conta (non si sa fino a quando c'era).
 */
export function quotaCanone(m: MezzoFO, mese: string): number {
  if (!m.canoneMese || m.canoneMese <= 0 || m.stato === "SOSTITUTIVO") return 0;
  const n = giorniMese(mese), primo = `${mese}-01`, ultimo = `${mese}-${String(n).padStart(2, "0")}`;
  if (m.stato === "DISMESSO" && !m.fine) return 0;
  const da = m.inizio && m.inizio > primo ? m.inizio : primo;
  const a = m.fine && m.fine < ultimo ? m.fine : ultimo;
  if (a < da) return 0;
  return (m.canoneMese * (g(a) - g(da) + 1)) / n;
}

export type CellaNoleggio = { riga: number; station: string; importo: number; mezzi: number; societa: string[] };

/** Noleggi del mese per riga (società) e DS. */
export function noleggiFO(mezzi: MezzoFO[], mese: string): CellaNoleggio[] {
  const per = new Map<string, CellaNoleggio>();
  for (const m of mezzi) {
    if (!(DS_FO as readonly string[]).includes(m.station)) continue;
    const q = quotaCanone(m, mese);
    if (!q) continue;
    const riga = rigaNoleggio(m.leasingCompany);
    const k = `${riga}|${m.station}`;
    const c = per.get(k) ?? { riga, station: m.station, importo: 0, mezzi: 0, societa: [] };
    c.importo += q; c.mezzi++;
    if (m.leasingCompany && !c.societa.includes(m.leasingCompany)) c.societa.push(m.leasingCompany);
    per.set(k, c);
  }
  return [...per.values()].map((c) => ({ ...c, importo: Math.round(c.importo * 100) / 100 }));
}

export type PermessoZtl = { ztl: string; targa: string; richiesta: string | null; dal: string | null; al: string | null; importo: number | null };

/** ZTL Rimini/Cesena del mese (su DER2): permessi con data di richiesta nel mese × importo (colonna NOTE). */
export function ztlDelMese(permessi: PermessoZtl[], mese: string) {
  const r = permessi.filter((p) => p.richiesta?.startsWith(mese) && p.importo !== null && p.importo > 0);
  return { permessi: r.length, importo: Math.round(r.reduce((s, p) => s + (p.importo ?? 0), 0) * 100) / 100, senzaImporto: permessi.filter((p) => p.richiesta?.startsWith(mese) && !(p.importo && p.importo > 0)).length };
}

/** Lettura del file TARGHE_ZTL (foglio con intestazione ZTL, TARGA, DATA RICHIESTA, DAL, AL, NOTE). */
export function leggiZtl(righe: unknown[][]): PermessoZtl[] {
  const t = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
  const iso = (v: unknown): string | null => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t(v)) ?? null;
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return /^\d{4}-\d{2}-\d{2}/.test(t(v)) ? t(v).slice(0, 10) : null;
  };
  const hi = righe.findIndex((r) => (r ?? []).some((c) => t(c).toUpperCase() === "ZTL") && (r ?? []).some((c) => t(c).toUpperCase() === "TARGA"));
  if (hi < 0) return [];
  const h = (righe[hi] ?? []).map((c) => t(c).toUpperCase());
  const col = (p: string) => h.findIndex((x) => x.startsWith(p));
  const [cZ, cT, cR, cD, cA, cN] = [col("ZTL"), col("TARGA"), col("DATA RICHIESTA"), col("DAL"), col("AL"), col("NOTE")];
  return righe.slice(hi + 1).filter((r) => r && t(r[cT])).map((r) => {
    const n = r[cN];
    const importo = typeof n === "number" ? n : Number.isFinite(Number(t(n).replace(",", "."))) && t(n) !== "" ? Number(t(n).replace(",", ".")) : null;
    return { ztl: t(r[cZ]), targa: t(r[cT]).toUpperCase(), richiesta: iso(r[cR]), dal: iso(r[cD]), al: iso(r[cA]), importo };
  });
}

/** Nome del foglio come nel file F.O.: "AMZ Ott 2026". */
const MESI_FO = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
export const foglioFO = (mese: string) => `AMZ ${MESI_FO[Number(mese.slice(5, 7)) - 1]} ${mese.slice(0, 4)}`;
export const mesePrima = (mese: string) => { const [a, m] = mese.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };

/** Righe della scomposizione della busta SIC (tabellina del foglio F.O.): etichetta e € per DS. */
export function vociBusta(righe: { station: string; voce: string; importo: number }[], fonte: "stima" | "payroll") {
  const has = (v: string) => righe.some((r) => r.voce === v);
  const mappa: [string, string[]][] = fonte === "payroll"
    ? [["Retribuzione, oneri, ratei 13ª/14ª, TFR, altro", ["BASE", "ONERI", "RATEI_13_14", "TFR", "INDENNITA_FISSE", "UNA_TANTUM", "ALTRO_VOCI", "ALTRO"]], ["+ Trasferte (mese prima)", ["TRASFERTA"]],
      ["+ Straordinari, supplementari, maggiorazioni (lordo)", ["STR_SUPP_MAGG"]], ["+ Festività non godute (lordo)", ["FESTIVITA"]], ["− Assenze e carenza/integrazione (lordo)", ["ASSENZE", "CARENZA_INTEGR"]], ["Ferie/permessi: maturati − goduti (con contributi)", ["RATEI_FERIE"]]]
    : has("STRAORDINARI")
      ? [["CDL (retribuzione, oneri, ratei, TFR, ferie maturate)", ["BASE"]], ["+ Trasferte (mese prima)", ["TRASFERTA"]], ["+ Straordinari, supplementari, ore dom/festive (× oneri)", ["STRAORDINARI"]], ["+ Festività non godute (× oneri)", ["FESTIVITA"]],
        ["− Malattia/infortunio, al netto della carenza (× oneri)", ["MALATTIA"]], ["− Permessi non retribuiti, 104, congedi (× oneri)", ["ALTRE_ASSENZE"]], ["− Ferie/ROL/ExF godute", ["FERIE_GODUTE"]]]
      : [["CDL (retribuzione, oneri, ratei, TFR, ferie maturate)", ["BASE"]], ["+ Trasferte (mese prima)", ["TRASFERTA"]], ["+ Straordinari, supplementari, festività (× oneri)", ["ISTITUTI", "-TRASFERTA"]], ["− Assenze (malattia, permessi)", ["ASSENZE"]], ["− Ferie/ROL/ExF godute", ["FERIE_GODUTE"]]];
  return mappa.map(([etichetta, voci]) => {
    const perDs: Record<string, number> = {};
    for (const v of voci) { const segno = v.startsWith("-") ? -1 : 1, nome = v.replace(/^-/, ""); for (const r of righe.filter((x) => x.voce === nome && x.station !== "TOTALE")) { const k = r.station || "senza DS"; perDs[k] = (perDs[k] ?? 0) + segno * r.importo; } }
    return { etichetta, perDs };
  });
}
