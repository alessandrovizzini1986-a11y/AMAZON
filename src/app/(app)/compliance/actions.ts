"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan, can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { REGOLE, scadenzaInterna } from "@/domain/compliance/scadenze";
import { puoSpuntare, puoTogliereSpunta, STATI, type Stato } from "@/domain/compliance/stato";
import { differenze, mancanti, schemaImport, type DaCreare, type Differenza } from "@/domain/compliance/importa";
import { generaMese, iso, righe } from "@/lib/compliance/dati";

const giorno = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
const fatto = () => revalidatePath("/compliance", "layout");

async function cambia(id: string, dati: Record<string, unknown>, nuovo: Stato, utente: { id: string; name: string }, origine = "manuale", nota?: string) {
  const r = await db.complianceRiga.findUniqueOrThrow({ where: { id }, select: { stato: true } });
  await db.complianceRiga.update({ where: { id }, data: { ...dati, stato: nuovo, aggiornatoDa: utente.name, ...(r.stato !== nuovo ? { storico: { create: { statoPrecedente: r.stato, statoNuovo: nuovo, utente: utente.name, origine, nota: nota ?? null } } } : {}) } });
}

/** "Caricato sul portale": la può mettere chiunque veda il registro. Registra chi e quando. */
export async function spunta(id: string, nomeFile: string) {
  const user = await requireUser();
  assertCan(user, "compliance.view");
  const r = await db.complianceRiga.findUniqueOrThrow({ where: { id }, select: { stato: true } });
  if (!puoSpuntare(r.stato)) throw new Error("Questa riga è già caricata o chiusa");
  await cambia(id, { caricatoDaId: user.id, caricatoDa: user.name, caricatoIl: new Date(), nomeFileCaricato: z.string().max(200).parse(nomeFile).trim() || null, motivoRifiuto: null }, "CARICATO", user);
  fatto();
}

/** Toglie la spunta: chi l'ha messa, oppure l'admin. La riga torna a "Ricevuto" (il documento c'è, va ricaricato). */
export async function togliSpunta(id: string) {
  const user = await requireUser();
  assertCan(user, "compliance.view");
  const r = await db.complianceRiga.findUniqueOrThrow({ where: { id }, select: { stato: true, caricatoDaId: true } });
  if (!puoTogliereSpunta(r, { id: user.id, admin: can(user, "compliance.manage") })) throw new Error("Puoi togliere solo la spunta che hai messo tu");
  await cambia(id, { caricatoDaId: null, caricatoDa: null, caricatoIl: null, nomeFileCaricato: null }, "RICEVUTO", user, "manuale", "spunta tolta");
  fatto();
}

export async function cambiaStato(id: string, stato: string, motivo: string, nota: string) {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  const s = z.enum(STATI as [Stato, ...Stato[]]).parse(stato), oggi = new Date();
  if (s === "RESPINTO" && !motivo.trim()) throw new Error("Per segnare Respinto serve il motivo");
  await cambia(id, {
    motivoRifiuto: s === "RESPINTO" ? motivo.trim().slice(0, 300) : null, note: nota.trim().slice(0, 500) || null,
    ...(s === "RICHIESTO" ? { dataRichiesta: oggi } : {}), ...(s === "RICEVUTO" ? { dataRicezione: oggi } : {}), ...(s === "VALIDATO" ? { dataValidazione: oggi } : {}),
    ...(s === "CARICATO" ? { caricatoDaId: user.id, caricatoDa: user.name, caricatoIl: oggi } : {}),
  }, s, user);
  fatto();
}

export async function salvaScadenza(id: string, data: string) {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  const d = data ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(data) : null;
  await db.complianceRiga.update({ where: { id }, data: { scadenzaPortale: giorno(d), scadenzaInterna: giorno(scadenzaInterna(d)), aggiornatoDa: user.name } });
  fatto();
}

export async function generaMeseAzione(anno: number, mese: number): Promise<{ create: number }> {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  const create = await generaMese(z.number().int().min(2025).max(2100).parse(anno), z.number().int().min(1).max(12).parse(mese), user.name);
  await audit({ userId: user.id, action: "compliance.generaMese", entity: "ComplianceRiga", meta: { anno, mese, create } });
  fatto();
  return { create };
}

/** Dopo aver aperto la mail di richiesta: le righe passano a "Richiesto" con la data di oggi. */
export async function segnaRichiesti(ids: string[]) {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  for (const id of z.array(z.string()).max(60).parse(ids)) {
    const r = await db.complianceRiga.findUnique({ where: { id }, select: { stato: true } });
    if (r?.stato === "DA_RICHIEDERE") await cambia(id, { dataRichiesta: new Date() }, "RICHIESTO", user, "manuale", "mail di richiesta");
  }
  fatto();
}

/** Anteprima dell'import: le differenze tra il JSON letto sul portale e il registro. Non scrive nulla. */
export async function anteprimaImport(testo: string): Promise<{ diff: Differenza[]; nonTrovati: string[]; daCreare: DaCreare[]; ignorati: string[]; sconosciuti: string[]; lettoIl: string } | { errore: string }> {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  let json: unknown;
  try { json = JSON.parse(testo); } catch { return { errore: "Il testo incollato non è un JSON valido" }; }
  const p = schemaImport.safeParse(json);
  if (!p.success) return { errore: `Formato non riconosciuto: ${p.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  const reg = (await righe()).map((r) => ({ id: r.id, entita: r.entita, area: r.area, anno: r.anno, mese: r.mese, folder: r.folder, stato: r.stato, scadenzaPortale: r.scadenzaPortale }));
  const template = await db.complianceTemplate.findMany({ select: { id: true, entita: true, area: true, folder: true, regolaScadenza: true, usato: true } });
  return { ...differenze(p.data.righe, reg), ...mancanti(p.data.righe, reg, template), lettoIl: p.data.letto_il };
}

/** Applica l'import dopo la conferma: ricalcola le differenze sul registro di adesso. Non tocca chi ha caricato e quando. */
export async function applicaImport(testo: string, creaMancanti = false): Promise<{ applicate: number; create: number }> {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  const a = await anteprimaImport(testo);
  if ("errore" in a) throw new Error(a.errore);
  let n = 0;
  for (const d of a.diff) {
    if (!d.statoDopo && !d.scadenzaDopo) continue;
    const scad = d.scadenzaDopo ? { scadenzaPortale: giorno(d.scadenzaDopo), scadenzaInterna: giorno(d.scadenzaInterna) } : {};
    if (d.statoDopo) await cambia(d.id, { ...scad, ...(d.statoDopo === "RESPINTO" ? { motivoRifiuto: d.motivo } : {}), ...(d.statoDopo === "VALIDATO" ? { dataValidazione: new Date() } : {}) }, d.statoDopo, user, "import", `portale letto il ${a.lettoIl}`);
    else await db.complianceRiga.update({ where: { id: d.id }, data: { ...scad, aggiornatoDa: user.name } });
    n++;
  }
  // righe che mancano: solo se l'admin lo ha chiesto, e solo per i folder che usiamo. Nascono con lo stato letto sul portale
  let create = 0;
  if (creaMancanti) for (const c of a.daCreare) {
    if (await db.complianceRiga.findFirst({ where: { templateId: c.templateId, anno: c.anno, mese: c.mese }, select: { id: true } })) continue;
    await db.complianceRiga.create({ data: { templateId: c.templateId, anno: c.anno, mese: c.mese, scadenzaPortale: giorno(c.scadenzaPortale), scadenzaInterna: giorno(c.scadenzaInterna), stato: c.stato, motivoRifiuto: c.motivo, ...(c.stato === "VALIDATO" ? { dataValidazione: new Date() } : {}), aggiornatoDa: user.name, storico: { create: { statoPrecedente: "", statoNuovo: c.stato, utente: user.name, origine: "import", nota: `portale letto il ${a.lettoIl}` } } } });
    create++;
  }
  await audit({ userId: user.id, action: "compliance.import", entity: "ComplianceRiga", meta: { lettoIl: a.lettoIl, applicate: n, create, ignorati: a.ignorati.length, sconosciuti: a.sconosciuti.length } });
  fatto();
  return { applicate: n, create };
}

const tpl = z.object({ id: z.string(), documento: z.string().max(300), formato: z.string().max(30), nomeFileStandard: z.string().max(200), regolaScadenza: z.enum(REGOLE as [string, ...string[]]), mesiAttivi: z.string().regex(/^(\d{1,2}(,\d{1,2})*)?$/), owner: z.string().min(1).max(80), ownerEmail: z.string().max(200), usato: z.boolean() });

/** Anagrafica: l'admin corregge documento, formato, regola, mesi, owner ed email. Il nome del folder non si cambia (serve all'import). */
export async function salvaTemplate(input: z.infer<typeof tpl>) {
  const user = await requireUser();
  assertCan(user, "compliance.manage");
  const { id, ...d } = tpl.parse(input);
  await db.complianceTemplate.update({ where: { id }, data: { ...d, ownerEmail: d.ownerEmail.trim() } });
  await audit({ userId: user.id, action: "compliance.template", entity: "ComplianceTemplate", entityId: id });
  fatto();
}

