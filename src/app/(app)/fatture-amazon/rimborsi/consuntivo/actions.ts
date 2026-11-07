"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { totaliMeseVoce } from "@/domain/fatture/consuntivo";

const riga = z.object({ anno: z.number().int().min(2020).max(2100), mese: z.number().int().min(1).max(12), ds: z.string().regex(/^D[A-Z]{2}\d$/), voce: z.enum(["CARBURANTE", "PEDAGGI", "PARCHEGGI"]), importo: z.number() });

/** Totali per mese e voce già sul sito per l'anno. */
export async function consuntivoEsistente(anno: number) {
  const user = await requireUser();
  assertCan(user, "import.run");
  const r = await db.costoConsuntivo.findMany({ where: { anno: z.number().int().parse(anno) } });
  return { totali: totaliMeseVoce(r.map((x) => ({ mese: x.mese, voce: x.voce as "PEDAGGI", importo: Number(x.importo) }))), fonte: [...new Set(r.map((x) => x.fonte))] };
}

/** Sostituisce, per i mesi presenti nel file, i costi dell'anno con quelli del file. */
export async function salvaConsuntivo(input: { anno: number; nomeFile: string; righe: z.infer<typeof riga>[] }) {
  const user = await requireUser();
  assertCan(user, "import.run");
  const v = z.object({ anno: z.number().int(), nomeFile: z.string().min(1).max(300), righe: z.array(riga).min(1).max(5000) }).parse(input);
  if (v.righe.some((r) => r.anno !== v.anno)) throw new Error("righe di un anno diverso");
  if (v.anno < 2020 || v.anno > new Date().getFullYear() + 1) throw new Error(`anno ${v.anno} non plausibile: correggilo nell'anteprima`);
  const mesi = [...new Set(v.righe.map((r) => r.mese))];
  await db.$transaction([
    db.costoConsuntivo.deleteMany({ where: { anno: v.anno, mese: { in: mesi } } }),
    db.costoConsuntivo.createMany({ data: v.righe.map((r) => ({ ...r, fonte: v.nomeFile })) }),
  ]);
  await audit({ userId: user.id, action: "consuntivo.carica", entity: "CostoConsuntivo", meta: { anno: v.anno, file: v.nomeFile, mesi, righe: v.righe.length } });
  revalidatePath("/fatture-amazon/rimborsi");
  return { righe: v.righe.length, mesi: mesi.length };
}
