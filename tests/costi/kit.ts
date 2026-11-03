import fs from "node:fs";
import path from "node:path";
import { workbookToGrids } from "@/lib/presenze/excelGrid";

export const KIT = path.join(process.cwd(), "docs", "costi-kit");
export const hasKit = fs.existsSync(path.join(KIT, "esempi")) && fs.existsSync(path.join(KIT, "attesi"));
export const esempio = (...p: string[]) => path.join(KIT, "esempi", ...p);
const cache = new Map<string, ReturnType<typeof workbookToGrids>>();
export const grids = (f: string) => { if (!cache.has(f)) cache.set(f, workbookToGrids(fs.readFileSync(f))); return cache.get(f)!; };
export const files = (dir: string) => fs.readdirSync(esempio(dir)).filter((f) => /\.xls[xm]$/i.test(f)).sort().map((f) => esempio(dir, f));
