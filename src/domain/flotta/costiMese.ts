/**
 * Costo mensile dei furgoni per compagnia di noleggio, diviso tra appalto Amazon e GLS: è la tabella della mail
 * "Stima costi" di ogni mese. Regole (decise da Alessandro il 23/11/2026): canone intero per chi è in flotta,
 * sostitutivi e dismessi esclusi, ALD e ALD MT in una riga sola, i canoni stimati dal sito si contano a parte.
 */
export type Appalto = "AMAZON" | "GLS";
export type RigaCosto = { appalto: Appalto; compagnia: string; mezzi: number | null; canone: number; stimati: number };
export type VeicoloCosto = { compagnia: string | null; canone: number | null; amazon: boolean; stimato: boolean };

/** Nome della compagnia come nella mail: ALD MT sta con ALD. */
export function compagniaMail(c: string | null | undefined): string {
  const t = (c ?? "").trim();
  if (!t) return "Senza compagnia";
  return /^ALD(\s|$)/i.test(t) ? "ALD" : t;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function splitCosti(veicoli: VeicoloCosto[]): RigaCosto[] {
  const m = new Map<string, RigaCosto>();
  for (const v of veicoli) {
    const appalto: Appalto = v.amazon ? "AMAZON" : "GLS", compagnia = compagniaMail(v.compagnia), k = `${appalto}|${compagnia}`;
    const r = m.get(k) ?? { appalto, compagnia, mezzi: 0, canone: 0, stimati: 0 };
    r.mezzi = (r.mezzi ?? 0) + 1; r.canone += v.canone ?? 0; if (v.stimato) r.stimati++;
    m.set(k, r);
  }
  return [...m.values()].map((r) => ({ ...r, canone: r2(r.canone) })).sort((a, b) => a.appalto.localeCompare(b.appalto) || b.canone - a.canone || a.compagnia.localeCompare(b.compagnia));
}

export type RigaConfronto = { compagnia: string; mezzi: number | null; canone: number; stimati: number; prec: number | null; anno: number | null; dPrec: number | null; dAnno: number | null };
export type Confronto = { righe: RigaConfronto[]; totale: RigaConfronto };

/**
 * Tabella di un appalto con le differenze sul mese prima e sullo stesso mese dell'anno prima.
 * `prec` / `anno` = null se per quel mese non c'è nessun dato (la differenza resta vuota, non zero).
 * Una compagnia presente solo nel mese di confronto compare con canone 0.
 */
export function confronto(appalto: Appalto, mese: RigaCosto[], prec: RigaCosto[] | null, anno: RigaCosto[] | null): Confronto {
  const di = (rs: RigaCosto[] | null) => (rs ? new Map(rs.filter((r) => r.appalto === appalto).map((r) => [r.compagnia, r])) : null);
  const m = di(mese)!, p = di(prec), a = di(anno);
  const haDati = (x: Map<string, RigaCosto> | null) => !!x && x.size > 0;
  const nomi = [...new Set([...m.keys(), ...(p?.keys() ?? []), ...(a?.keys() ?? [])])];
  const righe = nomi.map((compagnia): RigaConfronto => {
    const c = m.get(compagnia), vp = haDati(p) ? p!.get(compagnia)?.canone ?? 0 : null, va = haDati(a) ? a!.get(compagnia)?.canone ?? 0 : null, canone = c?.canone ?? 0;
    return { compagnia, mezzi: c ? c.mezzi : 0, canone, stimati: c?.stimati ?? 0, prec: vp, anno: va, dPrec: vp === null ? null : r2(canone - vp), dAnno: va === null ? null : r2(canone - va) };
  }).filter((r) => r.canone !== 0 || (r.prec ?? 0) !== 0 || (r.anno ?? 0) !== 0).sort((x, y) => y.canone - x.canone || x.compagnia.localeCompare(y.compagnia));
  const somma = (f: (r: RigaConfronto) => number | null) => (righe.some((r) => f(r) === null) ? null : r2(righe.reduce((s, r) => s + (f(r) ?? 0), 0)));
  const canone = r2(righe.reduce((s, r) => s + r.canone, 0)), tp = haDati(p) ? somma((r) => r.prec) : null, ta = haDati(a) ? somma((r) => r.anno) : null;
  const mezzi = righe.some((r) => r.mezzi === null) ? null : righe.reduce((s, r) => s + (r.mezzi ?? 0), 0);
  return { righe, totale: { compagnia: "Totale", mezzi, canone, stimati: righe.reduce((s, r) => s + r.stimati, 0), prec: tp, anno: ta, dPrec: tp === null ? null : r2(canone - tp), dAnno: ta === null ? null : r2(canone - ta) } };
}

export const mesePrima = (mese: string) => { const [y, m] = mese.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
export const annoPrima = (mese: string) => `${Number(mese.slice(0, 4)) - 1}${mese.slice(4)}`;
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
export const nomeMese = (mese: string) => `${MESI[Number(mese.slice(5)) - 1]} ${mese.slice(0, 4)}`;
