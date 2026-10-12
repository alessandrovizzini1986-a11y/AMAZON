"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseAyvensOrders } from "@/lib/orders/ayvens";

const FORNITORE = "AYVENS";
const APPALTO = "GLS";

/**
 * Carica l'export "Lista Ordini" di Ayvens: aggiorna gli ordini già presenti
 * (per numero ordine) e aggiunge i nuovi. Gli ordini non più nel file restano.
 */
export async function uploadAyvensOrdersAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "import.run");

  const file = formData.get("file");
  let msg: string;
  try {
    if (!(file instanceof File) || file.size === 0) throw new Error("Seleziona il file Excel degli ordini");
    if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Serve un file .xlsx");
    const orders = await parseAyvensOrders(Buffer.from(await file.arrayBuffer()));
    if (orders.length === 0) throw new Error("Nessun ordine trovato nel file");

    const existing = new Set(
      (await db.fleetOrder.findMany({ where: { fornitore: FORNITORE }, select: { refOrdine: true } })).map((o) => o.refOrdine),
    );
    await db.$transaction(
      orders.map((o) =>
        db.fleetOrder.upsert({
          where: { fornitore_refOrdine: { fornitore: FORNITORE, refOrdine: o.refOrdine } },
          create: { ...o, fornitore: FORNITORE, appalto: APPALTO },
          update: { ...o, appalto: APPALTO },
        }),
      ),
    );
    const nuovi = orders.filter((o) => !existing.has(o.refOrdine)).length;
    await audit({
      userId: user.id,
      action: "orders.import",
      entity: "FleetOrder",
      meta: { fileName: file.name, ordini: orders.length, nuovi },
    });
    msg = `ok=${orders.length}&nuovi=${nuovi}`;
  } catch (e) {
    msg = `error=${encodeURIComponent(e instanceof Error ? e.message : "Caricamento non riuscito")}`;
  }
  revalidatePath("/orders");
  redirect(`/orders?${msg}`);
}
