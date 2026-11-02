/**
 * Controlli domeniche e giorni consecutivi (formato del file check_domenica):
 * sulla matrice delle sole ore di LAVORO del mese.
 * - 6+dom: per ogni domenica dal 7 in poi, nella settimana lun–dom ha lavorato
 *   6 giorni su 7 e la domenica è tra questi;
 * - giorni consecutivi lavorati: ≥ 7 = violazione.
 */
import { isoFromParts, weekday } from "./grid";
import { oreLavoro, type Lavoratore } from "./lavoratori";

export type Settimana = { label: string; dal: number; al: number };

const MESI = ["", "gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function giorniDelMese(anno: number, mese: number): string[] {
  const out: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const iso = isoFromParts(anno, mese, d);
    if (iso) out.push(iso);
  }
  return out;
}

/** Settimane lun–dom del mese (la prima e l'ultima possono essere parziali). */
export function settimaneDelMese(anno: number, mese: number): Settimana[] {
  const giorni = giorniDelMese(anno, mese);
  const out: Settimana[] = [];
  let i = 0;
  while (i < giorni.length) {
    const start = i;
    while (i < giorni.length - 1 && weekday(giorni[i]) !== 6) i++;
    const a = start + 1, b = i + 1;
    out.push({ label: `${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")} ${MESI[mese]}`, dal: a, al: b });
    i++;
  }
  return out;
}

export type ControlloDomenica = {
  ore: number[]; // indice = giorno-1
  settimane: number[]; // ore per settimana
  maxOreSett: number;
  nSett40: number;
  seiPiuDom: Record<number, 0 | 1>; // giorno della domenica → 1 se 6+dom
  nSeiPiuDom: number;
  maxConsecutivi: number;
  consecDal: number; // giorno di inizio della sequenza più lunga
  consecAl: number;
};

export function controlloDomenica(l: Lavoratore, anno: number, mese: number): ControlloDomenica {
  const giorni = giorniDelMese(anno, mese);
  const ore = giorni.map((d) => Math.round(oreLavoro(l, d) * 100) / 100);
  const sett = settimaneDelMese(anno, mese);
  const settimane = sett.map((s) => ore.slice(s.dal - 1, s.al).reduce((a, b) => a + b, 0));
  const seiPiuDom: Record<number, 0 | 1> = {};
  giorni.forEach((d, i) => {
    if (weekday(d) !== 6) return;
    const day = i + 1;
    if (day < 7) { seiPiuDom[day] = 0; return; }
    const finestra = ore.slice(day - 7, day);
    seiPiuDom[day] = finestra.filter((h) => h > 0).length === 6 && ore[day - 1] > 0 ? 1 : 0;
  });
  let best = 0, bestDal = 0, bestAl = 0, run = 0;
  ore.forEach((h, i) => {
    run = h > 0 ? run + 1 : 0;
    if (run > best) { best = run; bestAl = i + 1; bestDal = i + 2 - run; }
  });
  return {
    ore, settimane, maxOreSett: Math.max(0, ...settimane), nSett40: settimane.filter((h) => h >= 40).length,
    seiPiuDom, nSeiPiuDom: Object.values(seiPiuDom).reduce<number>((a, b) => a + b, 0),
    maxConsecutivi: best, consecDal: bestDal, consecAl: bestAl,
  };
}

/** Domeniche del mese (giorno del mese). */
export function domenicheDelMese(anno: number, mese: number): number[] {
  return giorniDelMese(anno, mese).map((d, i) => (weekday(d) === 6 ? i + 1 : 0)).filter(Boolean);
}
