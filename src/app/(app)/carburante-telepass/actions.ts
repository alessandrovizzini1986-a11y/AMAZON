"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { confrontaImport, type EsitoImport } from "@/domain/telepass/anagrafiche";
import { chiaveClientBase, LIMITI_INVIO_Q8, LUNGHEZZE_Q8 } from "@/domain/carburante/q8Righe";
import { chiaveClientValida, chiaveQ8Da, MAX_CHIAVE_CLIENT, panMascherato, segretoQ8, SegretoMancante } from "@/lib/carburante/chiave";
import { bloccato } from "@/components/navModel";

const BASE = "/carburante-telepass";
const PAGINA_Q8 = `${BASE}/q8`;
const NON_DISPONIBILE = "Pagina non disponibile per il tuo utente";
const s = (max = 200) => z.string().max(max).nullable();
const file = z.object({ nomeFile: z.string().min(1).max(300), hash: z.string().regex(/^[0-9a-f]{64}$/) });

const dispositivo = z.object({ codice: z.string().min(1).max(40), station: z.string().max(80), targa: s(40), progetto: s(80), check: s(40) });
const carta = z.object({
  pan: z.string().min(1).max(40), numeroCarta: s(40), identificativo: s(40), targa: s(40), bloccata: s(20),
  dataBlocco: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), centroCosto: s(40), appalto: s(20), ds: s(40), ordine: z.number().int(),
  pin: z.string().regex(/^\d{4,6}$/).nullable().optional(),
});

export type RisultatoImport = EsitoImport & { esempi: { chiave: string; esito: string; cambi: string[] }[] };

/** Import della mappa Telepass: upsert per codice, i dispositivi assenti dal file restano segnati "non più nel file". */
export async function importaDispositivi(input: { nomeFile: string; hash: string; righe: z.infer<typeof dispositivo>[] }): Promise<RisultatoImport> {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const f = file.parse(input);
  const righe = z.array(dispositivo).max(20000).parse(input.righe);
  const attuali = await db.telepassDispositivo.findMany();
  const campi = ["station", "targa", "progetto", "check"] as const;
  const esito = confrontaImport(attuali, righe, "codice", [...campi]);
  const per = new Map(righe.map((r) => [r.codice, r]));
  await db.$transaction(async (tx) => {
    const nuovi = esito.dettaglio.filter((d) => d.esito === "nuovo").map((d) => ({ ...per.get(d.chiave)!, aggiornatoDa: user.name }));
    if (nuovi.length) await tx.telepassDispositivo.createMany({ data: nuovi });
    for (const d of esito.dettaglio.filter((x) => x.esito === "aggiornato")) {
      const { codice, ...dati } = per.get(d.chiave)!;
      await tx.telepassDispositivo.update({ where: { codice }, data: { ...dati, nonPiuInFile: false, aggiornatoDa: user.name } });
    }
    const spariti = esito.dettaglio.filter((x) => x.esito === "sparito").map((x) => x.chiave);
    if (spariti.length) await tx.telepassDispositivo.updateMany({ where: { codice: { in: spariti } }, data: { nonPiuInFile: true } });
    await tx.anagraficaImport.create({ data: { tipo: "TELEPASS", nomeFile: f.nomeFile, hashSha256: f.hash, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, invariati: esito.invariati, spariti: esito.spariti, eseguitoDa: user.name } });
  }, { timeout: 60_000 });
  await audit({ userId: user.id, action: "telepass.import", entity: "TelepassDispositivo", meta: { file: f.nomeFile, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, spariti: esito.spariti } });
  revalidatePath(BASE, "layout");
  const { dettaglio, ...conteggi } = esito;
  return { ...conteggi, esempi: dettaglio.filter((d) => d.esito !== "invariato").slice(0, 200) };
}

/** Import del censimento fuel card: upsert per PAN, stesse regole. */
export async function importaCarte(input: { nomeFile: string; hash: string; righe: z.infer<typeof carta>[] }): Promise<RisultatoImport> {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const f = file.parse(input);
  const righe = z.array(carta).max(20000).parse(input.righe);
  const attuali = (await db.cartaCarburante.findMany()).map((c) => ({ ...c, dataBlocco: c.dataBlocco ? c.dataBlocco.toISOString().slice(0, 10) : null }));
  const campi = ["numeroCarta", "identificativo", "targa", "bloccata", "dataBlocco", "centroCosto", "appalto", "ds"] as const;
  const esito = confrontaImport(attuali, righe, "pan", [...campi]);
  const per = new Map(righe.map((r) => [r.pan, r]));
  // il PIN si scrive solo se il file lo riporta: un censimento senza PIN non cancella quelli già salvati
  const aDb = ({ pin, ...r }: z.infer<typeof carta>) => ({ ...r, ...(pin ? { pin } : {}), dataBlocco: r.dataBlocco ? new Date(r.dataBlocco + "T00:00:00Z") : null });
  const pinPrima = new Map(attuali.map((a) => [a.pan, a.pin]));
  const pinCambiati = righe.filter((r) => r.pin && pinPrima.has(r.pan) && pinPrima.get(r.pan) !== r.pin);
  await db.$transaction(async (tx) => {
    const nuovi = esito.dettaglio.filter((d) => d.esito === "nuovo").map((d) => ({ ...aDb(per.get(d.chiave)!), aggiornatoDa: user.name }));
    if (nuovi.length) await tx.cartaCarburante.createMany({ data: nuovi });
    for (const d of esito.dettaglio.filter((x) => x.esito === "aggiornato")) {
      const { pan, ...dati } = aDb(per.get(d.chiave)!);
      await tx.cartaCarburante.update({ where: { pan }, data: { ...dati, nonPiuInFile: false, aggiornatoDa: user.name } });
    }
    // l'ordine nel file serve all'abbinamento per Identificativo: va aggiornato anche sulle carte invariate
    const ordini = esito.dettaglio.filter((x) => x.esito === "invariato").map((x) => per.get(x.chiave)!);
    const att = new Map(attuali.map((a) => [a.pan, a.ordine]));
    for (const r of ordini) if (att.get(r.pan) !== r.ordine) await tx.cartaCarburante.update({ where: { pan: r.pan }, data: { ordine: r.ordine } });
    const spariti = esito.dettaglio.filter((x) => x.esito === "sparito").map((x) => x.chiave);
    if (spariti.length) await tx.cartaCarburante.updateMany({ where: { pan: { in: spariti } }, data: { nonPiuInFile: true } });
    for (const r of pinCambiati) await tx.cartaCarburante.update({ where: { pan: r.pan }, data: { pin: r.pin } });
    await tx.anagraficaImport.create({ data: { tipo: "FUELCARD", nomeFile: f.nomeFile, hashSha256: f.hash, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, invariati: esito.invariati, spariti: esito.spariti, eseguitoDa: user.name } });
  }, { timeout: 60_000 });
  await audit({ userId: user.id, action: "telepass.import", entity: "CartaCarburante", meta: { file: f.nomeFile, righe: righe.length, nuovi: esito.nuovi, aggiornati: esito.aggiornati, spariti: esito.spariti, pinNelFile: righe.filter((r) => r.pin).length, pinCambiati: pinCambiati.length } });
  revalidatePath(BASE, "layout");
  const { dettaglio, ...conteggi } = esito;
  return { ...conteggi, esempi: dettaglio.filter((d) => d.esito !== "invariato").slice(0, 200) };
}

/** Modifica a mano di station e note di un dispositivo. */
export async function aggiornaDispositivo(codice: string, dati: { station: string; note: string }) {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const d = z.object({ station: z.string().trim().min(1).max(80), note: z.string().max(500) }).parse(dati);
  const prima = await db.telepassDispositivo.findUniqueOrThrow({ where: { codice } });
  await db.telepassDispositivo.update({ where: { codice }, data: { station: d.station, note: d.note || null, aggiornatoDa: user.name } });
  await audit({ userId: user.id, action: "telepass.dispositivo.update", entity: "TelepassDispositivo", entityId: codice, meta: { before: { station: prima.station, note: prima.note }, after: d } });
  revalidatePath(BASE, "layout");
}

/** PIN di una fuel card: solo ADMIN, ogni lettura nel log di audit (senza il PIN). */
export async function mostraPinCarta(pan: string) {
  const user = await requireUser();
  assertCan(user, "carte.pin");
  const p = z.string().min(1).max(40).parse(pan);
  const x = await db.cartaCarburante.findUnique({ where: { pan: p }, select: { pin: true } });
  await audit({ userId: user.id, action: "carte.pin", entity: "CartaCarburante", entityId: p });
  return x?.pin ?? null;
}

/** Modifica a mano di DS, appalto e note di una carta. */
export async function aggiornaCarta(pan: string, dati: { ds: string; appalto: string; note: string }) {
  const user = await requireUser();
  assertCan(user, "telepass.anagrafiche");
  const d = z.object({ ds: z.string().trim().max(40), appalto: z.string().trim().max(20), note: z.string().max(500) }).parse(dati);
  const prima = await db.cartaCarburante.findUniqueOrThrow({ where: { pan } });
  await db.cartaCarburante.update({ where: { pan }, data: { ds: d.ds || null, appalto: d.appalto || null, note: d.note || null, aggiornatoDa: user.name } });
  await audit({ userId: user.id, action: "telepass.carta.update", entity: "CartaCarburante", entityId: pan, meta: { before: { ds: prima.ds, appalto: prima.appalto, note: prima.note }, after: d } });
  revalidatePath(BASE, "layout");
}

const totali = z.record(z.string(), z.record(z.string(), z.number()));
const runBase = { ...file.shape, anno: z.number().int().min(2020).max(2100), mese: z.number().int().min(1).max(12), totale: z.number(), totali, anomalie: z.array(z.record(z.string(), z.unknown())).max(2000) };

export async function salvaTelepassRun(input: unknown): Promise<{ id: string }> {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  const r = z.object({ ...runBase, righe: z.number().int(), fuoriMese: z.number().int(), nonMappati: z.number().int(), ricondotti: z.number().int() }).parse(input);
  const run = await db.telepassRun.create({
    data: { anno: r.anno, mese: r.mese, nomeFile: r.nomeFile, hashSha256: r.hash, righe: r.righe, fuoriMese: r.fuoriMese, nonMappati: r.nonMappati, ricondotti: r.ricondotti, totale: r.totale, totaliJson: r.totali, anomalieJson: r.anomalie as object[], eseguitoDa: user.name },
  });
  await audit({ userId: user.id, action: "telepass.run", entity: "TelepassRun", entityId: run.id, meta: { mese: `${r.anno}-${r.mese}`, righe: r.righe, totale: r.totale } });
  revalidatePath(BASE, "layout");
  return { id: run.id };
}

export async function salvaQ8Run(input: unknown): Promise<{ id: string } | { errore: string }> {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  // voce di menu nascosta dal super admin: l'azione non si usa nemmeno chiamandola da un'altra pagina
  if (bloccato(PAGINA_Q8, user.nascosti ?? [])) return { errore: NON_DISPONIBILE };
  const p = z.object({ ...runBase, righeExport: z.number().int(), tenute: z.number().int(), scartate: z.number().int(), nonCensite: z.number().int(), perIdentificativo: z.number().int() }).safeParse(input);
  if (!p.success) return { errore: "Dati dell'elaborazione non validi: ricarica il file e riprova." };
  const r = p.data;
  const run = await db.q8Run.create({
    data: { anno: r.anno, mese: r.mese, nomeFile: r.nomeFile, hashSha256: r.hash, righeExport: r.righeExport, tenute: r.tenute, scartate: r.scartate, nonCensite: r.nonCensite, perIdentificativo: r.perIdentificativo, totale: r.totale, totaliJson: r.totali, anomalieJson: r.anomalie as object[], eseguitoDa: user.name },
  });
  await audit({ userId: user.id, action: "q8.run", entity: "Q8Run", entityId: run.id, meta: { mese: `${r.anno}-${r.mese}`, tenute: r.tenute, totale: r.totale } });
  revalidatePath(BASE, "layout");
  return { id: run.id };
}

const L = LUNGHEZZE_Q8;
const importoQ8 = z.number().finite().min(-1_000_000).max(1_000_000);
/** chiave client (PAN intero): non si salva, il server la sostituisce con chiaveQ8Da */
const chiaveClient = z.string().min(1).max(MAX_CHIAVE_CLIENT).refine(chiaveClientValida, "chiave della transazione non valida");
const transazioneQ8 = z.object({
  chiave: chiaveClient, mese: z.string().regex(/^\d{4}-\d{2}$/), giorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ora: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  station: s(L.station), pan: z.string().max(L.pan), identificativo: s(L.identificativo), targaQ8: s(L.targaQ8), prodotto: s(L.prodotto),
  litri: z.number().finite().positive().max(100_000), importo: importoQ8, importoNoIva: importoQ8,
  impianto: s(L.impianto), indirizzo: s(L.indirizzo), citta: s(L.citta), km: z.number().int().positive().max(2_000_000_000).nullable(),
}).refine((t) => {
  // la chiave deve essere quella della transazione (con l'eventuale "#n" delle righe uguali)
  const base = chiaveClientBase(t);
  return t.chiave === base || (t.chiave.startsWith(`${base}#`) && /^#[1-9]\d*$/.test(t.chiave.slice(base.length)));
}, "la chiave non corrisponde alla transazione");

const { righePerParte: MAX_RIGHE_PARTE, transazioniFile: MAX_TRANSAZIONI_FILE } = LIMITI_INVIO_Q8;
const parteQ8 = z.object({
  ...file.shape,
  /** id del caricamento, scelto dalla pagina (crypto.randomUUID): lo stesso per tutte le parti, anche dopo un Riprova */
  caricamento: z.string().uuid(),
  anno: z.number().int().min(2020).max(2100), mese: z.number().int().min(1).max(12),
  parte: z.number().int().min(0), totaleParti: z.number().int().min(1).max(1000),
  righe: z.array(transazioneQ8).max(MAX_RIGHE_PARTE),
  /** righe nuove aggiunte dalle parti precedenti (per l'audit) */
  inseriteFinora: z.number().int().min(0).max(MAX_TRANSAZIONI_FILE).default(0),
  /** solo nell'ultima parte: le chiavi client di tutte le transazioni del file */
  chiaviFile: z.array(chiaveClient).min(1).max(MAX_TRANSAZIONI_FILE).optional(),
}).superRefine((x, ctx) => {
  if (x.parte >= x.totaleParti) ctx.addIssue({ code: "custom", message: "parte fuori dal totale delle parti" });
  else if ((x.parte === x.totaleParti - 1) !== !!x.chiaviFile) {
    ctx.addIssue({ code: "custom", message: x.chiaviFile ? "l'elenco delle chiavi va solo nell'ultima parte" : "manca l'elenco delle transazioni del file" });
  }
});

/** Il primo problema trovato da zod, in parole semplici. */
function spiegaZod(e: z.ZodError): string {
  const i = e.issues[0];
  if (!i) return "formato";
  if (i.code === "custom") return i.message;
  const campo = i.path.filter((x) => typeof x === "string").at(-1);
  return campo ? `campo "${campo}"` : "formato";
}

export type EsitoParteQ8 = { inserite: number; tolte: number | null } | { errore: string };

/**
 * Transazioni Q8 riga per riga (per l'incrocio con la telematica), mandate a parti dalla pagina Q8 dopo salvaQ8Run.
 * Le parti 0…n-2 aggiungono le righe (quelle già presenti, stessa chiave, si saltano) senza togliere nulla: se il caricamento
 * si ferma, nel mese restano le righe di prima più quelle nuove già arrivate. L'ultima parte, in una sola transazione del
 * database, aggiunge le sue righe, toglie le righe del mese che non sono nel file (chiaviFile = le chiavi di tutto il file)
 * e scrive l'audit. Il server sostituisce ogni chiave con quella non reversibile e del PAN salva solo le ultime 4 cifre.
 * Gli errori previsti tornano come { errore } da mostrare così come sono.
 */
export async function salvaTransazioniQ8(input: unknown): Promise<EsitoParteQ8> {
  const user = await requireUser();
  assertCan(user, "telepass.run");
  if (bloccato(PAGINA_Q8, user.nascosti ?? [])) return { errore: NON_DISPONIBILE };
  const p = parteQ8.safeParse(input);
  if (!p.success) return { errore: `Dati delle transazioni non validi (${spiegaZod(p.error)}): ricarica il file e riprova.` };
  const r = p.data;
  const meseFile = `${r.anno}-${String(r.mese).padStart(2, "0")}`;
  if (r.righe.some((x) => x.mese !== meseFile)) return { errore: `Le transazioni devono essere tutte del mese del file (${meseFile}).` };

  let segreto: string;
  try { segreto = await segretoQ8(); } catch (e) {
    if (e instanceof SegretoMancante) return { errore: "Nel database manca la chiave segreta delle transazioni Q8: va applicato l'ultimo aggiornamento del database. Avvisa l'amministratore." };
    throw e;
  }
  const dati = r.righe.map((t) => ({ ...t, chiave: chiaveQ8Da(t.chiave, segreto), pan: panMascherato(t.pan) }));

  if (!r.chiaviFile) {
    const { count } = await db.q8Transazione.createMany({ data: dati, skipDuplicates: true });
    return { inserite: count, tolte: null };
  }

  const nelFile = new Set(r.chiaviFile.map((k) => chiaveQ8Da(k, segreto)));
  if (dati.some((d) => !nelFile.has(d.chiave))) return { errore: "L'elenco delle transazioni del file è incompleto: ricarica il file e riprova." };
  const tieni = [...nelFile];
  const esito = await db.$transaction(async (tx) => {
    const { count: inserite } = await tx.q8Transazione.createMany({ data: dati, skipDuplicates: true });
    const { count: tolte } = await tx.q8Transazione.deleteMany({ where: { mese: meseFile, chiave: { notIn: tieni } } });
    // audit nella stessa transazione: o tutto o niente
    await tx.auditLog.create({
      data: {
        userId: user.id, action: "q8.transazioni", entity: "Q8Transazione",
        meta: { mese: meseFile, nomeFile: r.nomeFile, hash: r.hash, caricamento: r.caricamento, parti: r.totaleParti, transazioni: tieni.length, inserite: r.inseriteFinora + inserite, tolte },
      },
    });
    return { inserite, tolte };
  }, { timeout: 60_000 });
  revalidatePath(PAGINA_Q8);
  revalidatePath("/telematica/carburante");
  return esito;
}
