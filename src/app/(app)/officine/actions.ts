"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseAyvensCentri } from "@/lib/officine/ayvens";

/** Carica il nuovo file Ayvens: sostituisce l'elenco centri intero. */
export async function uploadCentriAction(formData: FormData) {
  const user = await requireUser();
  assertCan(user, "import.run");

  const file = formData.get("file");
  let msg: string;
  try {
    if (!(file instanceof File) || file.size === 0) throw new Error("Seleziona il file Excel di Ayvens");
    if (!/\.(xlsm|xlsx)$/i.test(file.name)) throw new Error("Serve un file .xlsm o .xlsx");
    const centri = await parseAyvensCentri(Buffer.from(await file.arrayBuffer()));
    const prima = await db.serviceCenter.count();
    await db.$transaction([
      db.serviceCenter.deleteMany({}),
      db.serviceCenter.createMany({ data: centri.map((c) => ({ ...c, fonte: file.name })) }),
    ]);
    await audit({
      userId: user.id,
      action: "officine.import",
      entity: "ServiceCenter",
      meta: { fileName: file.name, righe: centri.length, righePrima: prima },
    });
    msg = `ok=${centri.length}`;
  } catch (e) {
    msg = `error=${encodeURIComponent(e instanceof Error ? e.message : "Caricamento non riuscito")}`;
  }
  revalidatePath("/officine");
  redirect(`/officine?${msg}`);
}
