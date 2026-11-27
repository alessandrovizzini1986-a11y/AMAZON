/**
 * Import dello stato letto sul portale (JSON incollato dall'admin). Calcola soltanto le differenze: chi le applica
 * lo decide dopo averle viste. Non crea righe e non cancella niente.
 */
import { z } from "zod";
import { scadenzaInterna } from "./scadenze";
import type { Stato } from "./stato";

const file = z.object({ nome: z.string(), caricato_il: z.string().optional(), nota: z.string().optional() });
export const schemaImport = z.object({
  letto_il: z.string(),
  righe: z.array(z.object({
    entita: z.string(), area: z.string(), anno: z.number().int(), mese: z.number().int().min(1).max(12), folder: z.string(),
    stato_portale: z.enum(["VALIDATED", "VALIDATION_IN_PROGRESS", "OPEN_NOWORKFLOW_HASFILES", "OPEN"]),
    scadenza_portale: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), file: z.array(file).optional(),
  })),
});
export type RigaPortale = z.infer<typeof schemaImport>["righe"][number];
export type RigaRegistro = { id: string; entita: string; area: string; anno: number; mese: number; folder: string; stato: Stato; scadenzaPortale: string | null };
export type Differenza = { id: string; chi: string; statoPrima: Stato; statoDopo: Stato | null; motivo: string | null; scadenzaPrima: string | null; scadenzaDopo: string | null; scadenzaInterna: string | null; avviso: string | null };

const chiave = (r: { entita: string; area: string; anno: number; mese: number; folder: string }) => `${r.entita}|${r.area}|${r.anno}|${r.mese}|${r.folder}`;

export function differenze(portale: RigaPortale[], registro: RigaRegistro[]): { diff: Differenza[]; nonTrovati: string[] } {
  const per = new Map(registro.map((r) => [chiave(r), r]));
  const diff: Differenza[] = [], nonTrovati: string[] = [];
  for (const p of portale) {
    const r = per.get(chiave(p));
    if (!r) { nonTrovati.push(`${p.entita} ${p.area} ${String(p.mese).padStart(2, "0")}/${p.anno}: ${p.folder}`); continue; }
    const respinto = (p.file ?? []).find((f) => /FileNonConforme/i.test(f.nota ?? ""));
    let dopo: Stato | null = null, motivo: string | null = null, avviso: string | null = null;
    if (p.stato_portale === "VALIDATED") dopo = "VALIDATO";
    else if (p.stato_portale === "VALIDATION_IN_PROGRESS" || p.stato_portale === "OPEN_NOWORKFLOW_HASFILES") dopo = "CARICATO";
    else if (respinto) { dopo = "RESPINTO"; motivo = respinto.nota ?? "FileNonConforme"; }
    else if (!(p.file ?? []).length && r.stato === "CARICATO") avviso = "Incongruenza: qui c'è la spunta \"Caricato\" ma sul portale il folder è vuoto";
    if (dopo === r.stato) dopo = null;
    const scadDopo = p.scadenza_portale && p.scadenza_portale !== r.scadenzaPortale ? p.scadenza_portale : null;
    if (dopo || scadDopo || avviso) diff.push({ id: r.id, chi: `${p.entita} ${p.area} · ${String(p.mese).padStart(2, "0")}/${p.anno} · ${p.folder}`, statoPrima: r.stato, statoDopo: dopo, motivo, scadenzaPrima: r.scadenzaPortale, scadenzaDopo: scadDopo, scadenzaInterna: scadDopo ? scadenzaInterna(scadDopo) : null, avviso });
  }
  return { diff, nonTrovati };
}
