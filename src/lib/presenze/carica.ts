/**
 * Dati per i controlli, presi dall'archivio locale (IndexedDB) e letti nel
 * browser. Gli Excel già letti restano in memoria per la sessione.
 */
import type { SheetGrid } from "@/domain/presenze/grid";
import type { FlexRow } from "@/domain/presenze/flex";
import type { Station } from "@/domain/presenze/regole";
import type { TrackingInput } from "@/domain/presenze/controlloSettimanale";
import { tuttiIFile } from "./archivioLocale";
import { workbookToGrids } from "./excelGrid";
import type { FileLocale } from "./riconosci";

const cache = new Map<string, Promise<SheetGrid[]>>();
const grids = (f: FileLocale) => {
  if (!cache.has(f.hash)) cache.set(f.hash, workbookToGrids(f.buffer!));
  return cache.get(f.hash)!;
};

export type DatiMese = {
  tracking: TrackingInput[];
  zucchetti: { station: Station; sheets: SheetGrid[]; fileName: string }[];
  flex: FlexRow[];
  avvisi: string[];
};

/** Mese scritto in testa al nome del file ("11_Tracking…" → 11), o null. */
export const prefissoMese = (nome: string): number | null => { const m = /^(\d{2})_/.exec(nome); const n = m ? Number(m[1]) : 0; return n >= 1 && n <= 12 ? n : null; };

/** Tracking e Zucchetti che coprono il mese (AAAA-MM), CSV Amazon tutti (deduplicati). */
export async function caricaDatiMese(mese: string, progress?: (msg: string) => void): Promise<DatiMese> {
  const files = await tuttiIFile();
  const avvisi: string[] = [];
  const recenti = (a: FileLocale, b: FileLocale) => b.caricatoIl.localeCompare(a.caricatoIl);
  const tracking: TrackingInput[] = [];
  const visti = new Set<string>();
  // Tra più file della stessa station e tipo vince quello il cui nome inizia con il mese chiesto ("11_Tracking…" per novembre),
  // poi quello che copre meno mesi, poi il più recente: un tracking di un altro mese non deve mai passare davanti a quello giusto.
  // i file con tutti i mesi dell'anno in fogli diversi (nome mai cambiato, es. "08_Tracking…" con dentro ottobre) non si giudicano dal nome
  const delMese = (f: FileLocale) => { const p = prefissoMese(f.nome); return p === Number(mese.slice(5)) ? 0 : p === null || f.mesi.length >= 3 ? 1 : 2; };
  const trk = files.filter((f) => f.kind === "TRACKING" && f.mesi.includes(mese)).sort((a, b) => delMese(a) - delMese(b) || recenti(a, b));
  for (const [i, f] of trk.entries()) {
    const k = `${f.station}|${f.tipo}`;
    if (visti.has(k)) { avvisi.push(`${f.station} ${f.tipo}: più file per lo stesso mese, uso ${tracking.find((t) => t.station === f.station && t.tipo === f.tipo)?.fileName ?? "il più recente"} (ignoro ${f.nome})`); continue; }
    // un file con il mese sbagliato nel nome, usato perché non ce n'è un altro: va detto
    if (delMese(f) === 2) avvisi.push(`${f.station} ${f.tipo}: per ${mese.slice(5)}/${mese.slice(0, 4)} sto leggendo ${f.nome}, che dal nome è di un altro mese. Carica il tracking giusto.`);
    visti.add(k);
    progress?.(`Lettura tracking ${i + 1}/${trk.length}: ${f.nome}`);
    tracking.push({ station: f.station!, tipo: f.tipo!, fileName: f.nome, sheets: await grids(f) });
  }
  const zucchetti: DatiMese["zucchetti"] = [];
  for (const f of files.filter((x) => x.kind === "ZUCCHETTI" && x.mesi.includes(mese)).sort(recenti)) {
    if (zucchetti.some((z) => z.station === f.station)) continue;
    progress?.(`Lettura Zucchetti ${f.station}`);
    zucchetti.push({ station: f.station!, sheets: await grids(f), fileName: f.nome });
  }
  const flexMap = new Map<string, FlexRow>();
  for (const f of files.filter((x) => x.kind === "FLEX").sort((a, b) => a.caricatoIl.localeCompare(b.caricatoIl))) {
    for (const r of f.flexRows ?? []) flexMap.set(`${r.station}|${r.driverId}|${r.data}`, r);
  }
  return { tracking, zucchetti, flex: [...flexMap.values()], avvisi };
}
