"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { classifica } from "@/domain/fatture/classifica";
import type { InfoRegistro } from "@/domain/fatture/importa";

const numero = z.string().regex(/^INV-[A-Z0-9]+-\d+$/);

/** Stato nel registro dei numeri letti dai PDF (esportata / presente in fatt_2026). */
export async function verificaNumeri(numeri: string[]): Promise<Record<string, InfoRegistro>> {
  const user = await requireUser();
  assertCan(user, "fatture.import");
  const n = z.array(numero).max(2000).parse(numeri);
  const r = await db.amazonInvoice.findMany({ where: { numero: { in: n } }, select: { numero: true, esportataIl: true, presenteInFatt2026Il: true } });
  return Object.fromEntries(r.map((x) => [x.numero, { esportataIl: x.esportataIl?.toISOString() ?? null, presenteInFatt2026Il: x.presenteInFatt2026Il?.toISOString() ?? null }]));
}

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const riga = z.object({
  ds: z.string().max(10), data: iso, descrizione: z.string().min(1).max(500), quantita: z.number().int(), prezzo: z.number(), tasse: z.string().max(20),
  rateo: z.number(), importoIva: z.number(), totale: z.number(), avere: z.number(), microarea: z.string().max(100).nullable(), macroarea: z.string().max(100).nullable(),
  week: z.number().int(), mese: z.number().int(), anno: z.number().int(), numero,
});
const fattura = z.object({
  numero, ds: z.string().min(1).max(10), tipo: z.enum(["Fattura", "Nota di credito"]), dataFattura: iso, periodoDa: iso, periodoA: iso,
  importoDovuto: z.number(), sommaTotale: z.number(), sommaAvere: z.number(), rifNotaCredito: z.string().max(40).nullable(),
  pdfNome: z.string().max(300), pdfSha256: z.string().regex(/^[0-9a-f]{64}$/), righe: z.array(riga).min(1).max(500),
});
export type FatturaDaRegistrare = z.infer<typeof fattura>;

const d = (s: string) => new Date(s + "T00:00:00Z");

/**
 * Salva fatture e righe esportate (fonte PDF) e segna "esportata". Upsert su
 * numero: un secondo scarico della stessa anteprima non duplica nulla. Il client
 * invia lotti di al massimo 500 righe.
 */
export async function registraEsportazione(input: { fatture: FatturaDaRegistrare[] }): Promise<{ registrate: number; giaPresenti: number }> {
  const user = await requireUser();
  assertCan(user, "fatture.import");
  const fatture = z.array(fattura).max(200).parse(input.fatture);
  if (fatture.reduce((s, f) => s + f.righe.length, 0) > 500) throw new Error("massimo 500 righe per chiamata");
  const esistenti = new Map((await db.amazonInvoice.findMany({ where: { numero: { in: fatture.map((f) => f.numero) } } })).map((x) => [x.numero, x]));
  let registrate = 0, giaPresenti = 0;
  const ora = new Date();
  for (const f of fatture) {
    const e = esistenti.get(f.numero);
    if (e && (e.esportataIl || e.presenteInFatt2026Il)) { giaPresenti++; continue; }
    const occ = new Map<string, number>();
    const righe = f.righe.map((r) => {
      const base = `${f.numero}|${r.data}|${r.descrizione}|${r.quantita}|${r.avere.toFixed(2)}`;
      const k = (occ.get(base) ?? 0) + 1;
      occ.set(base, k);
      return {
        ds: r.ds, data: d(r.data), descrizione: r.descrizione, quantita: r.quantita, prezzo: r.prezzo, tasse: r.tasse, rateoIva: r.rateo, importoIva: r.importoIva,
        totale: r.totale, avere: r.avere, microarea: r.microarea, macroarea: r.macroarea, week: r.week, mese: r.mese, anno: r.anno, classe: classifica(r.descrizione), chiave: `${base}|${k}`,
      };
    });
    const dati = {
      ds: f.ds, tipo: f.tipo, dataFattura: d(f.dataFattura), periodoDa: d(f.periodoDa), periodoA: d(f.periodoA), importoDovuto: f.importoDovuto, sommaTotale: f.sommaTotale,
      sommaAvere: f.sommaAvere, nRighe: righe.length, rifNotaCredito: f.rifNotaCredito, pdfNome: f.pdfNome, pdfSha256: f.pdfSha256, fonte: "PDF", esportataIl: ora, esportataDaId: user.id,
    };
    await db.$transaction(async (tx) => {
      const inv = await tx.amazonInvoice.upsert({ where: { numero: f.numero }, create: { numero: f.numero, ...dati }, update: dati });
      await tx.amazonInvoiceLine.deleteMany({ where: { invoiceId: inv.id } });
      // le righe dello storico con le stesse chiavi (es. importate prima da AGGREGATO) appartengono già a questa fattura e sono state appena cancellate
      await tx.amazonInvoiceLine.createMany({ data: righe.map((r) => ({ ...r, invoiceId: inv.id })), skipDuplicates: true });
    });
    registrate++;
  }
  await audit({ userId: user.id, action: "fatture.esporta", entity: "AmazonInvoice", meta: { fatture: fatture.map((f) => f.numero), registrate, giaPresenti, righe: fatture.reduce((s, f) => s + f.righe.length, 0) } });
  revalidatePath("/fatture-amazon", "layout");
  return { registrate, giaPresenti };
}
