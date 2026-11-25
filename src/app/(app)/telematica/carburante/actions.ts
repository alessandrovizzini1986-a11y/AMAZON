"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CHIAVE_GUIDA } from "./testi";

// un file "use server" esporta solo funzioni async: le costanti stanno in testi.ts
const PAGINA = "/telematica/carburante";

const Giustifica = z.object({
  chiave: z.string().trim().min(3).max(300),
  mese: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  motivo: z.string().trim().min(1).max(80),
  nota: z.string().trim().max(500).optional().nullable(),
});

/** Segna una riga dell'incrocio Q8 / telematica come verificata: sparisce dall'elenco e dai conteggi. Solo ADMIN. */
export async function giustifica(input: { chiave: string; mese: string; motivo: string; nota?: string | null }) {
  const user = await requireRole("ADMIN");
  const x = Giustifica.parse(input);
  const nota = x.nota ? x.nota : null;
  await db.carburanteGiustifica.upsert({
    where: { chiave: x.chiave },
    create: { chiave: x.chiave, mese: x.mese, motivo: x.motivo, nota, creatoDa: user.name },
    update: { mese: x.mese, motivo: x.motivo, nota, creatoDa: user.name, creatoIl: new Date() },
  });
  await audit({ userId: user.id, action: "carburante.giustifica", entity: "CarburanteGiustifica", entityId: x.chiave, meta: { mese: x.mese, motivo: x.motivo, conNota: !!nota } });
  revalidatePath(PAGINA);
}

/** Toglie la giustificazione: la riga torna tra quelle da guardare. Solo ADMIN. */
export async function riapri(chiave: string) {
  const user = await requireRole("ADMIN");
  const k = z.string().trim().min(3).max(300).parse(chiave);
  const tolte = await db.carburanteGiustifica.deleteMany({ where: { chiave: k } });
  await audit({ userId: user.id, action: "carburante.riapri", entity: "CarburanteGiustifica", entityId: k, meta: { tolte: tolte.count } });
  revalidatePath(PAGINA);
}

/** Guida della pagina vista fino in fondo o saltata: non riparte più da sola per questo utente. */
export async function segnaGuida(esito: "completato" | "saltato") {
  const user = await requireRole("ADMIN");
  const e = esito === "completato" ? "completato" : "saltato";
  await db.tourVisto.upsert({
    where: { userId_chiave: { userId: user.id, chiave: CHIAVE_GUIDA } },
    create: { userId: user.id, chiave: CHIAVE_GUIDA, esito: e },
    update: { esito: e, il: new Date() },
  });
}
