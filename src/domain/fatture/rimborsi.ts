/**
 * Recap dei rimborsi Amazon da controllare in fattura (docs/fatture/PROMPT_recap_rimborsi.md):
 * parcheggi, pedaggi, carburante e training dei nuovi, contro i nostri costi del mese. Importi IVA esclusa.
 */
import { dsAmazon, DS_FATTURATO } from "./fatturato";
import { parametriAlla, type ParametroStorico } from "@/domain/costi/parametri";

export const VOCI_RIMBORSO = ["PARCHEGGI", "PEDAGGI", "CARBURANTE", "TRAINING"] as const;
export type VoceRimborso = (typeof VOCI_RIMBORSO)[number];
export const ETICHETTA_VOCE: Record<VoceRimborso, string> = { PARCHEGGI: "Parcheggi", PEDAGGI: "Pedaggi (toll)", CARBURANTE: "Carburante", TRAINING: "Training nuovi" };

const RIF_NC = /^credit note for (INV-[A-Z0-9-]+)/i;

/** Voce di una riga di fattura dalla descrizione (null = non è un rimborso da controllare). */
export function voceRimborso(descrizione: string): VoceRimborso | null {
  const d = descrizione.trim();
  if (/parchegg/i.test(d)) return "PARCHEGGI";
  if (/pedagg/i.test(d)) return "PEDAGGI";
  if (/^fuel ?allowance/i.test(d) || /^modifiche - carburante/i.test(d)) return "CARBURANTE";
  if (/^training/i.test(d)) return "TRAINING";
  return null;
}

/** Numero della fattura stornata da una nota credito ("Credit Note for INV-… dated …"). */
export const fatturaStornata = (descrizione: string) => RIF_NC.exec(descrizione.trim())?.[1].toUpperCase() ?? null;

export type RigaRimborso = { numero: string; ds: string; data: string; descrizione: string; quantita: number; avere: number };
export type RigaClassificata = RigaRimborso & { voce: VoceRimborso; mese: string; storno: boolean };

/**
 * Righe da controllare: quelle con una voce, più le note credito che stornano una fattura con righe di quella voce.
 * `voceFattura`: numero fattura → voce delle sue righe (la prima trovata).
 */
export function classificaRighe(righe: RigaRimborso[], voceFattura: Map<string, VoceRimborso>): RigaClassificata[] {
  const out: RigaClassificata[] = [];
  for (const r of righe) {
    const rif = fatturaStornata(r.descrizione);
    const voce = rif ? voceFattura.get(rif) ?? null : voceRimborso(r.descrizione);
    if (voce) out.push({ ...r, ds: dsAmazon(r.ds), voce, mese: r.data.slice(0, 7), storno: !!rif });
  }
  return out;
}

const giorniMese = (mese: string) => { const [a, m] = mese.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

/** Costo parcheggio del mese per DS: Parametro PARCHEGGIO_<DS> valido giorno per giorno, pro-rata (es. gennaio a metà). */
export function costoParcheggio(par: ParametroStorico[], ds: string, mese: string): number {
  const chiave = `PARCHEGGIO_${ds}`;
  const tab = par.filter((p) => p.chiave === chiave);
  if (!tab.length) return 0;
  const n = giorniMese(mese);
  let s = 0;
  for (let g = 1; g <= n; g++) s += parametriAlla(tab, `${mese}-${String(g).padStart(2, "0")}`)[chiave] ?? 0;
  return Math.round((s / n) * 100) / 100;
}

export type CellaRecap = { costo: number | null; rimborsato: number; quantita: number; differenza: number | null; fatture: string[]; storni: number };
export type RecapVoce = { voce: VoceRimborso; mese: string; perDs: Record<string, CellaRecap>; totale: CellaRecap; notaCosto: string };

/**
 * Recap di una voce in un mese: per DS rimborsato in fattura, nostro costo (null = non disponibile) e differenza
 * rimborsato − costo (negativa = rimborsato meno di quanto speso: da contestare).
 */
export function recapVoce(voce: VoceRimborso, mese: string, righe: RigaClassificata[], costo: (ds: string) => number | null, notaCosto: string, dsList: string[] = DS_FATTURATO): RecapVoce {
  const r = righe.filter((x) => x.voce === voce && x.mese === mese);
  const perDs: Record<string, CellaRecap> = {};
  for (const ds of dsList) {
    const q = r.filter((x) => x.ds === ds);
    const rimborsato = Math.round(q.reduce((a, x) => a + x.avere, 0) * 100) / 100;
    const c = costo(ds);
    perDs[ds] = { costo: c, rimborsato, quantita: q.filter((x) => !x.storno).reduce((a, x) => a + x.quantita, 0), differenza: c === null ? null : Math.round((rimborsato - c) * 100) / 100, fatture: [...new Set(q.map((x) => x.numero))].sort(), storni: q.filter((x) => x.storno).length };
  }
  const v = Object.values(perDs);
  const conCosto = v.filter((x) => x.costo !== null);
  const tot: CellaRecap = {
    costo: conCosto.length ? Math.round(conCosto.reduce((a, x) => a + x.costo!, 0) * 100) / 100 : null,
    rimborsato: Math.round(v.reduce((a, x) => a + x.rimborsato, 0) * 100) / 100,
    quantita: v.reduce((a, x) => a + x.quantita, 0), differenza: null, fatture: [...new Set(v.flatMap((x) => x.fatture))], storni: v.reduce((a, x) => a + x.storni, 0),
  };
  tot.differenza = tot.costo === null ? null : Math.round((tot.rimborsato - tot.costo) * 100) / 100;
  return { voce, mese, perDs, totale: tot, notaCosto };
}

/** Nuovi STD del mese per station: contratti MOG con data inizio nel mese (ultima versione del file MOG). */
export function nuoviStd(contratti: { station: string | null; dataInizio: string | null }[], mese: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of contratti) if (c.station && c.dataInizio?.startsWith(mese)) { const s = dsAmazon(c.station); out[s] = (out[s] ?? 0) + 1; }
  return out;
}

/** Somma per station (DS Amazon) dei totali di un'elaborazione Telepass/Q8, in valore assoluto; altre station (SEDE, GLS…) escluse. */
export function totaliRun(j: unknown, dsList: string[] = DS_FATTURATO): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((j ?? {}) as Record<string, unknown>)) {
    const ds = dsAmazon(k.trim().toUpperCase());
    if (!dsList.includes(ds)) continue;
    const tot = typeof v === "number" ? v : Object.values((v ?? {}) as Record<string, unknown>).reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0);
    out[ds] = Math.round(((out[ds] ?? 0) + Math.abs(tot)) * 100) / 100;
  }
  return out;
}
