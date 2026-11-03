"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const d = (s: string) => new Date(s + "T00:00:00Z");

const numeroFile = z.object({ numero: z.string().min(3).max(60), ds: z.string().max(10), da: iso.nullable(), a: iso.nullable() });

/**
 * Allineamento con fatt_2026: i numeri presenti nel file vengono segnati
 * "presente in fatt_2026"; quelli che il sito non conosce vengono creati come
 * record minimo (fonte AGGREGATO, importi 0, 0 righe) così il registro li conosce.
 */
export async function allineaNumeri(lotto: z.infer<typeof numeroFile>[]): Promise<{ trovati: number; nuovi: number }> {
  const user = await requireUser();
  assertCan(user, "fatture.allinea");
  const l = z.array(numeroFile).max(2000).parse(lotto);
  const noti = new Set((await db.amazonInvoice.findMany({ where: { numero: { in: l.map((x) => x.numero) } }, select: { numero: true } })).map((x) => x.numero));
  const ora = new Date();
  const trovati = l.filter((x) => noti.has(x.numero)).map((x) => x.numero);
  if (trovati.length) await db.amazonInvoice.updateMany({ where: { numero: { in: trovati } }, data: { presenteInFatt2026Il: ora } });
  const nuovi = l.filter((x) => !noti.has(x.numero));
  if (nuovi.length) {
    const zero = d("1970-01-01");
    await db.amazonInvoice.createMany({
      data: nuovi.map((x) => ({
        numero: x.numero, ds: x.ds || "?", tipo: "Fattura", dataFattura: x.a ? d(x.a) : zero, periodoDa: x.da ? d(x.da) : zero, periodoA: x.a ? d(x.a) : zero,
        importoDovuto: 0, sommaTotale: 0, sommaAvere: 0, nRighe: 0, fonte: "AGGREGATO", presenteInFatt2026Il: ora,
      })),
      skipDuplicates: true,
    });
  }
  return { trovati: trovati.length, nuovi: nuovi.length };
}

/** Fine allineamento: conteggi per il report e riga di audit. */
export async function concludiAllineamento(c: { file: string; righe: number; numeri: number; trovati: number; nuovi: number; righeNumeroVuoto: number }) {
  const user = await requireUser();
  assertCan(user, "fatture.allinea");
  const esportateNonPresenti = await db.amazonInvoice.findMany({ where: { esportataIl: { not: null }, presenteInFatt2026Il: null }, select: { numero: true }, orderBy: { numero: "asc" } });
  await audit({ userId: user.id, action: "fatture.allinea", entity: "AmazonInvoice", meta: { ...c, esportateNonPresenti: esportateNonPresenti.length } });
  revalidatePath("/fatture-amazon", "layout");
  return { esportateNonPresenti: esportateNonPresenti.map((x) => x.numero) };
}

const rigaStorico = z.object({
  numero: z.string().min(3).max(80), ds: z.string().min(1).max(10), data: iso, descrizione: z.string().min(1).max(500), quantita: z.number().int(), prezzo: z.number(),
  tasse: z.string().max(20), rateo: z.number(), importoIva: z.number(), totale: z.number(), avere: z.number(), microarea: z.string().max(100).nullable(),
  macroarea: z.string().max(100).nullable(), week: z.number().int(), mese: z.number().int(), anno: z.number().int(), classe: z.string().max(30), chiave: z.string().max(700),
});

/**
 * Carica storico (righe di fatt_2026 / fatt_2025) a lotti di 500. Le fatture già
 * registrate da PDF non vengono toccate; reimportare lo stesso file non duplica
 * (chiave numero|data|descrizione|quantità|avere|occorrenza).
 */
export async function caricaStorico(input: { foglio: "fatt_2026" | "fatt_2025"; righe: z.infer<typeof rigaStorico>[] }): Promise<{ nuove: number; giaPresenti: number; fontePdf: number }> {
  const user = await requireUser();
  assertCan(user, "fatture.storico");
  const righe = z.array(rigaStorico).max(500).parse(input.righe);
  const foglio = z.enum(["fatt_2026", "fatt_2025"]).parse(input.foglio);
  const numeri = [...new Set(righe.map((r) => r.numero))];
  const esistenti = new Map((await db.amazonInvoice.findMany({ where: { numero: { in: numeri } }, select: { id: true, numero: true, fonte: true } })).map((x) => [x.numero, x]));
  const pdf = new Set([...esistenti.values()].filter((x) => x.fonte === "PDF").map((x) => x.numero));
  const daCreare = numeri.filter((n) => !esistenti.has(n));
  const ora = new Date();
  if (daCreare.length) {
    await db.amazonInvoice.createMany({
      data: daCreare.map((n) => {
        const rs = righe.filter((r) => r.numero === n);
        const date = rs.map((r) => r.data).sort();
        return {
          numero: n, ds: rs[0].ds, tipo: "Fattura", dataFattura: d(date[date.length - 1]), periodoDa: d(date[0]), periodoA: d(date[date.length - 1]),
          importoDovuto: 0, sommaTotale: 0, sommaAvere: 0, nRighe: 0, fonte: "AGGREGATO", presenteInFatt2026Il: foglio === "fatt_2026" ? ora : null,
        };
      }),
      skipDuplicates: true,
    });
  }
  const ids = new Map((await db.amazonInvoice.findMany({ where: { numero: { in: numeri } }, select: { id: true, numero: true } })).map((x) => [x.numero, x.id]));
  const daScrivere = righe.filter((r) => !pdf.has(r.numero));
  const res = daScrivere.length
    ? await db.amazonInvoiceLine.createMany({
      data: daScrivere.map((r) => ({
        invoiceId: ids.get(r.numero)!, ds: r.ds, data: d(r.data), descrizione: r.descrizione, quantita: r.quantita, prezzo: r.prezzo, tasse: r.tasse,
        rateoIva: r.rateo, importoIva: r.importoIva, totale: r.totale, avere: r.avere, microarea: r.microarea, macroarea: r.macroarea,
        week: r.week, mese: r.mese, anno: r.anno, classe: r.classe, chiave: r.chiave,
      })),
      skipDuplicates: true,
    })
    : { count: 0 };
  // totali, date e DS delle fatture AGGREGATO toccate ricalcolati dalle righe
  const toccate = numeri.filter((n) => !pdf.has(n)).map((n) => ids.get(n)!);
  if (toccate.length) {
    const agg = await db.amazonInvoiceLine.groupBy({ by: ["invoiceId"], where: { invoiceId: { in: toccate } }, _sum: { totale: true, avere: true }, _count: { _all: true }, _min: { data: true }, _max: { data: true } });
    for (const a of agg) {
      await db.amazonInvoice.update({
        where: { id: a.invoiceId },
        data: {
          sommaTotale: a._sum.totale ?? 0, importoDovuto: a._sum.totale ?? 0, sommaAvere: a._sum.avere ?? 0, nRighe: a._count._all,
          periodoDa: a._min.data!, periodoA: a._max.data!, dataFattura: a._max.data!, tipo: Number(a._sum.totale ?? 0) < 0 ? "Nota di credito" : "Fattura",
          ...(foglio === "fatt_2026" ? { presenteInFatt2026Il: ora } : {}),
        },
      });
    }
  }
  return { nuove: res.count, giaPresenti: daScrivere.length - res.count, fontePdf: righe.length - daScrivere.length };
}

export async function concludiStorico(c: { file: string; foglio: string; righe: number; nuove: number; giaPresenti: number; fontePdf: number; senzaNumero: number; scartate: number }) {
  const user = await requireUser();
  assertCan(user, "fatture.storico");
  await audit({ userId: user.id, action: "fatture.storico", entity: "AmazonInvoiceLine", meta: c });
  revalidatePath("/fatture-amazon", "layout");
}
