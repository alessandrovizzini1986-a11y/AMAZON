"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { perStationRun, type TotaliRun } from "@/domain/telepass/storico";

const mese = z.object({ tipo: z.enum(["Q8", "TELEPASS"]), anno: z.number().int().min(2020).max(2100), mese: z.number().int().min(1).max(12) });

/** Elaborazioni già sul sito per i mesi indicati (l'ultima del mese è quella che vale). */
export async function runEsistenti(input: z.infer<typeof mese>[]) {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  const m = z.array(mese).max(60).parse(input);
  const out: Record<string, { il: string; da: string; file: string; totale: number; perStation: Record<string, number> } | null> = {};
  for (const x of m) {
    const where = { anno: x.anno, mese: x.mese };
    const sel = { eseguitoIl: true, eseguitoDa: true, nomeFile: true, totaliJson: true } as const;
    const r = x.tipo === "Q8" ? await db.q8Run.findFirst({ where, orderBy: { eseguitoIl: "desc" }, select: sel }) : await db.telepassRun.findFirst({ where, orderBy: { eseguitoIl: "desc" }, select: sel });
    const ps = r ? perStationRun(r.totaliJson as TotaliRun) : {};
    out[`${x.tipo}|${x.anno}-${x.mese}`] = r ? { il: r.eseguitoIl.toISOString(), da: r.eseguitoDa, file: r.nomeFile, totale: Math.round(Object.values(ps).reduce((a, v) => a + v, 0) * 100) / 100, perStation: ps } : null;
  }
  return out;
}

const voce = mese.extend({
  nomeFile: z.string().min(1).max(300), hash: z.string().regex(/^[0-9a-f]{64}$/), righe: z.number().int().min(0),
  totale: z.number(), totali: z.record(z.string().max(60), z.record(z.string().max(10), z.number())),
});

/** Salva i file elaborati come elaborazioni del mese (si aggiungono: vale sempre l'ultima). */
export async function salvaStorico(input: z.infer<typeof voce>[]) {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  const v = z.array(voce).min(1).max(60).parse(input);
  const nota = [{ tipo: "storico", nota: `totali dal file già elaborato, caricato da ${user.name}` }];
  for (const x of v) {
    if (x.tipo === "Q8") await db.q8Run.create({ data: { anno: x.anno, mese: x.mese, nomeFile: x.nomeFile, hashSha256: x.hash, righeExport: x.righe, tenute: x.righe, scartate: 0, nonCensite: 0, perIdentificativo: 0, totale: x.totale, totaliJson: x.totali, anomalieJson: nota, eseguitoDa: `${user.name} (file elaborato)` } });
    else await db.telepassRun.create({ data: { anno: x.anno, mese: x.mese, nomeFile: x.nomeFile, hashSha256: x.hash, righe: x.righe, fuoriMese: 0, nonMappati: 0, ricondotti: 0, totale: x.totale, totaliJson: x.totali, anomalieJson: nota, eseguitoDa: `${user.name} (file elaborato)` } });
  }
  await audit({ userId: user.id, action: "telepass.storico", entity: "Run", meta: { file: v.map((x) => `${x.tipo} ${x.anno}-${x.mese} ${x.nomeFile}`) } });
  revalidatePath("/carburante-telepass", "layout"); revalidatePath("/fatture-amazon/rimborsi");
  return { salvati: v.length };
}
