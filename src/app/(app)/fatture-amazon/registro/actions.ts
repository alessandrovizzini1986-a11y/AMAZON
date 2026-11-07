"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { totaliFattura } from "@/domain/fatture/doppioni";

/** ADMIN: annulla l'esportazione di una fattura (torna "nuova" al prossimo caricamento del PDF). */
export async function annullaEsportazione(numero: string) {
  const user = await requireUser();
  assertCan(user, "fatture.annulla");
  const f = await db.amazonInvoice.findUniqueOrThrow({ where: { numero } });
  await db.amazonInvoice.update({ where: { numero }, data: { esportataIl: null, esportataDaId: null } });
  await audit({ userId: user.id, action: "fatture.annulla", entity: "AmazonInvoice", entityId: f.id, meta: { numero, esportataIl: f.esportataIl?.toISOString() ?? null } });
  revalidatePath("/fatture-amazon", "layout");
}

/**
 * ADMIN: elimina una riga di fattura (es. doppia nello storico) e ricalcola righe, totale e imponibile della fattura.
 * L'audit tiene la riga intera, per poterla rimettere.
 */
export async function eliminaRiga(id: string) {
  const user = await requireUser();
  assertCan(user, "fatture.annulla");
  const r = await db.amazonInvoiceLine.findUniqueOrThrow({ where: { id }, include: { invoice: { select: { id: true, numero: true, nRighe: true, sommaAvere: true, sommaTotale: true } } } });
  const prima = { nRighe: r.invoice.nRighe, sommaAvere: Number(r.invoice.sommaAvere), sommaTotale: Number(r.invoice.sommaTotale) };
  const dopo = await db.$transaction(async (tx) => {
    await tx.amazonInvoiceLine.delete({ where: { id } });
    const resto = await tx.amazonInvoiceLine.findMany({ where: { invoiceId: r.invoiceId }, select: { totale: true, avere: true } });
    const t = totaliFattura(resto.map((x) => ({ totale: Number(x.totale), avere: Number(x.avere) })));
    await tx.amazonInvoice.update({ where: { id: r.invoiceId }, data: t });
    return t;
  });
  const { invoice: _i, ...riga } = r;
  await audit({ userId: user.id, action: "fatture.elimina-riga", entity: "AmazonInvoiceLine", entityId: id, meta: { numero: r.invoice.numero, riga: JSON.parse(JSON.stringify(riga)), prima, dopo } });
  revalidatePath("/fatture-amazon", "layout");
  return dopo;
}
