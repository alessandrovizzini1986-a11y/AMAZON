"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const s = (n: number) => z.string().max(n).nullable();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const sim = z.object({
  numero: z.string().regex(/^\d{9,10}$/), iccid: s(25), inWind: z.boolean(), statoWind: s(40), attivazione: data, piano: s(80), contratto: s(40),
  station: s(10), tag: s(60), assegnatario: s(200), stato: s(300), pin: s(10), puk: s(10), imei: s(20), note: s(1000), fonti: z.array(z.string().max(200)).max(40),
});
const tel = z.object({
  imei: z.string().regex(/^\d{14,16}$/), inWind: z.boolean(), statoWind: s(40), attivazione: data, contratto: s(40),
  station: s(10), tag: s(60), modello: s(120), assegnatario: s(200), stato: s(300), numero: s(12), note: s(1000), fonti: z.array(z.string().max(200)).max(40),
});
const d = (x: string | null) => (x ? new Date(`${x}T00:00:00Z`) : null);

/** Sostituisce il censimento con quello calcolato dai file (Wind + file delle station). */
export async function salvaCensimento(input: { sim: z.infer<typeof sim>[]; telefoni: z.infer<typeof tel>[]; file: string[] }) {
  const user = await requireUser();
  assertCan(user, "telefoni.manage");
  const v = z.object({ sim: z.array(sim).max(5000), telefoni: z.array(tel).max(5000), file: z.array(z.string().max(300)).max(40) }).parse(input);
  const ora = new Date();
  await db.$transaction(async (tx) => {
    await tx.sim.deleteMany({});
    await tx.telefono.deleteMany({});
    for (let i = 0; i < v.sim.length; i += 1000) await tx.sim.createMany({ data: v.sim.slice(i, i + 1000).map((x) => ({ ...x, attivazione: d(x.attivazione), fonti: x.fonti.join(" | "), aggiornatoIl: ora })) });
    for (let i = 0; i < v.telefoni.length; i += 1000) await tx.telefono.createMany({ data: v.telefoni.slice(i, i + 1000).map((x) => ({ ...x, attivazione: d(x.attivazione), fonti: x.fonti.join(" | "), aggiornatoIl: ora })) });
  }, { timeout: 120_000 });
  await audit({ userId: user.id, action: "telefoni.censimento", entity: "Sim", meta: { file: v.file, sim: v.sim.length, simWind: v.sim.filter((x) => x.inWind).length, telefoni: v.telefoni.length, telefoniWind: v.telefoni.filter((x) => x.inWind).length } });
  revalidatePath("/telefoni");
  return { sim: v.sim.length, telefoni: v.telefoni.length };
}

/** PIN e PUK di una SIM: solo ADMIN, ogni lettura nel log di audit. */
export async function mostraCodici(numero: string) {
  const user = await requireUser();
  assertCan(user, "telefoni.codici");
  const n = z.string().regex(/^\d{9,10}$/).parse(numero);
  const x = await db.sim.findUnique({ where: { numero: n }, select: { pin: true, puk: true } });
  await audit({ userId: user.id, action: "telefoni.codici", entity: "Sim", meta: { numero: n } });
  return { pin: x?.pin ?? null, puk: x?.puk ?? null };
}
