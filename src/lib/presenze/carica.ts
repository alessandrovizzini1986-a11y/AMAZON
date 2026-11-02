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

/** Tracking e Zucchetti che coprono il mese (AAAA-MM), CSV Amazon tutti (deduplicati). */
export async function caricaDatiMese(mese: string, progress?: (msg: string) => void): Promise<DatiMese> {
  const files = await tuttiIFile();
  const avvisi: string[] = [];
  const recenti = (a: FileLocale, b: FileLocale) => b.caricatoIl.localeCompare(a.caricatoIl);
  const tracking: TrackingInput[] = [];
  const visti = new Set<string>();
  const trk = files.filter((f) => f.kind === "TRACKING" && f.mesi.includes(mese)).sort(recenti);
  for (const [i, f] of trk.entries()) {
    const k = `${f.station}|${f.tipo}`;
    if (visti.has(k)) { avvisi.push(`${f.station} ${f.tipo}: più file per lo stesso mese, uso il più recente (ignoro ${f.nome})`); continue; }
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
