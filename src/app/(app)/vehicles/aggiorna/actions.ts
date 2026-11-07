"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { firmaEsito, perStation, type CessatoRiga, type FatturaRiga, type ListaRiga } from "@/domain/flotta/riconcilia";
import { applicaEsito, applicaStime, calcola, controlli, stimeCanoni } from "@/lib/flotta/aggiorna";

// righe già pulite dai lettori nel browser: qui si controlla solo la forma
const dati = z.object({
  lista: z.array(z.object({ targa: z.string().min(2).max(12), station: z.string().max(10) }).passthrough()).min(1).max(5000),
  cessati: z.array(z.object({ targa: z.string().max(12) }).passthrough()).max(20000),
  fatture: z.array(z.object({ targa: z.string().max(12), fornitore: z.enum(["ALD", "ARVAL", "AVIS", "EUROPCAR"]) }).passthrough()).max(60000),
  preferisciSito: z.boolean(),
  fonte: z.string().max(400),
});
type Dati = z.infer<typeof dati>;
const pulisci = (d: Dati) => ({ lista: d.lista as unknown as ListaRiga[], cessati: d.cessati as unknown as CessatoRiga[], fatture: d.fatture as unknown as FatturaRiga[], preferisciSito: d.preferisciSito });

const MAX = 300;
/** Anteprima: cosa cambierebbe sul sito, senza scrivere niente. */
export async function anteprimaFlotta(input: Dati) {
  const user = await requireUser();
  assertCan(user, "import.run");
  const d = pulisci(dati.parse(input));
  const { esito: e, sito, senzaStation } = await calcola(d);
  const anomalie: Record<string, number> = {};
  for (const a of e.anomalie) anomalie[a.tipo] = (anomalie[a.tipo] ?? 0) + 1;
  return {
    firma: firmaEsito(e), senzaStation, prima: perStation(sito),
    conteggi: { lista: d.lista.length, cessati: d.cessati.length, fatture: d.fatture.length, crea: e.crea.length, riattiva: e.riattiva.length, aggiorna: e.aggiorna.length, dismetti: e.dismetti.length, daVerificare: e.daVerificare.length },
    crea: e.crea.slice(0, MAX).map((c) => ({ targa: c.lista.targa, station: c.lista.station, stato: c.lista.stato, societa: c.lista.societa, modello: `${c.lista.marca} ${c.lista.modello}`.trim(), inizio: c.lista.inizio, canone: c.canone, fonte: c.fonteCanone })),
    riattiva: e.riattiva.slice(0, MAX).map((r) => ({ targa: r.lista.targa, station: r.lista.station, cambi: r.cambi.map((c) => `${c.campo}: ${c.prima ?? "—"} → ${c.dopo ?? "—"}`).join("; ") })),
    aggiorna: e.aggiorna.slice(0, MAX).map((a) => ({ targa: a.veicolo.targa, station: a.veicolo.station, cambi: a.cambi.map((c) => `${c.campo}: ${c.prima ?? "—"} → ${c.dopo ?? "—"}`).join("; ") })),
    dismetti: e.dismetti.map((x) => ({ targa: x.veicolo.targa, station: x.veicolo.station, stato: x.veicolo.stato, societa: x.veicolo.leasingCompany, fine: x.cessato.fine })),
    daVerificare: e.daVerificare.map((x) => ({ targa: x.veicolo.targa, station: x.veicolo.station, stato: x.veicolo.stato, motivo: x.motivo })),
    anomalie, dettaglioAnomalie: e.anomalie.slice(0, 500),
  };
}
export type AnteprimaFlotta = Awaited<ReturnType<typeof anteprimaFlotta>>;

/** Applica: ricalcola sul sito di adesso e scrive solo se coincide con l'anteprima vista. */
export async function applicaFlotta(input: Dati, firma: string) {
  const user = await requireUser();
  assertCan(user, "import.run");
  const parsed = dati.parse(input);
  const d = pulisci(parsed);
  const { esito, senzaStation } = await calcola(d);
  if (senzaStation.length) throw new Error(`station non presenti sul sito: ${senzaStation.join(", ")}`);
  if (firmaEsito(esito) !== firma) throw new Error("Il sito è cambiato dopo l'anteprima: rifai l'anteprima prima di applicare.");
  const { nomi } = await applicaEsito(esito, user.id, parsed.fonte);
  revalidatePath("/vehicles", "layout"); revalidatePath("/dashboard");
  return { nomi, controlli: await controlli(d.lista), stime: await stimeCanoni() };
}

const stime = z.array(z.object({ targa: z.string().max(12), canone: z.number().positive().max(10000), base: z.string().max(200) })).max(2000);
/** Scrive i canoni stimati scelti (solo sugli attivi ancora senza canone). */
export async function salvaCanoniStimati(input: z.infer<typeof stime>) {
  const user = await requireUser();
  assertCan(user, "import.run");
  const s = stime.parse(input);
  await applicaStime(s, user.id);
  revalidatePath("/vehicles", "layout");
  return { salvati: s.length, controlli: null };
}

/** Stime correnti (per rivederle senza rifare l'aggiornamento). */
export async function stimeAttuali(tariffe: Record<string, number>) {
  const user = await requireUser();
  assertCan(user, "import.run");
  return stimeCanoni(z.record(z.string().max(40), z.number().positive().max(10000)).parse(tariffe));
}
