import { db } from "@/lib/db";
import { attivoNelMese, scadenzaInterna, scadenzaPortale } from "@/domain/compliance/scadenze";
import { ARRETRATI, STATO_INIZIALE, TEMPLATE } from "@/domain/compliance/seed";
import type { Stato } from "@/domain/compliance/stato";

const giorno = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
export const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
export const oggiRoma = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());

/**
 * Crea le righe di un mese di competenza dai template attivi in quel mese. Idempotente: chi c'è già non si tocca.
 * I folder che non usiamo nascono NON_APPLICABILE. `soloFolder` serve agli arretrati (solo alcune righe del mese).
 */
export async function generaMese(anno: number, mese: number, utente: string, origine = "manuale", soloFolder?: { entita: string; area: string; folder: string }[]): Promise<number> {
  const tutti = await db.complianceTemplate.findMany();
  const template = tutti.filter((t) => attivoNelMese(t.mesiAttivi, mese) && (!soloFolder || soloFolder.some((f) => f.entita === t.entita && f.area === t.area && f.folder === t.folder)));
  const gia = new Set((await db.complianceRiga.findMany({ where: { anno, mese }, select: { templateId: true } })).map((r) => r.templateId));
  let n = 0;
  for (const t of template.filter((x) => !gia.has(x.id))) {
    const portale = scadenzaPortale(t.regolaScadenza, anno, mese), stato: Stato = t.usato ? "DA_RICHIEDERE" : "NON_APPLICABILE";
    await db.complianceRiga.create({ data: { templateId: t.id, anno, mese, scadenzaPortale: giorno(portale), scadenzaInterna: giorno(scadenzaInterna(portale)), stato, aggiornatoDa: utente, storico: { create: { statoPrecedente: "", statoNuovo: stato, utente, origine } } } });
    n++;
  }
  return n;
}

/** Anagrafica dei folder dal seed: crea quelli che mancano, non tocca quelli che l'admin ha già modificato. */
export async function seedTemplate(): Promise<number> {
  const gia = new Set((await db.complianceTemplate.findMany({ select: { entita: true, area: true, folder: true } })).map((t) => `${t.entita}|${t.area}|${t.folder}`));
  const nuovi = TEMPLATE.filter((t) => !gia.has(`${t.entita}|${t.area}|${t.folder}`));
  if (nuovi.length) await db.complianceTemplate.createMany({ data: nuovi });
  return nuovi.length;
}

/** Primo caricamento: anagrafica, ottobre–dicembre 2026, stato letto dal portale il 27/11/2026 e arretrati. Si può rilanciare: non duplica. */
export async function seedIniziale(utente = "seed") {
  const template = await seedTemplate();
  let righe = 0;
  for (const m of [10, 11, 12]) righe += await generaMese(2026, m, utente, "seed");
  for (const m of [...new Set(ARRETRATI.map((a) => a.mese))]) righe += await generaMese(2026, m, utente, "seed", ARRETRATI.filter((a) => a.mese === m).map((a) => ({ entita: a.entita, area: a.area ?? "Giuslavoro", folder: a.folder })));
  let stati = 0;
  for (const x of [...STATO_INIZIALE, ...ARRETRATI]) {
    const r = await db.complianceRiga.findFirst({ where: { anno: x.anno, mese: x.mese, template: { entita: x.entita, area: x.area ?? "Giuslavoro", folder: x.folder } }, include: { storico: { select: { origine: true } } } });
    // solo sulle righe che nessuno ha ancora toccato a mano
    if (!r || r.storico.some((s) => s.origine !== "seed")) continue;
    const cambia = r.stato !== x.stato, scad = x.scadenzaPortale ?? null;
    if (!cambia && (!scad || iso(r.scadenzaPortale) === scad)) continue;
    await db.complianceRiga.update({ where: { id: r.id }, data: {
      stato: x.stato, motivoRifiuto: x.motivo ?? null, aggiornatoDa: utente,
      ...(scad ? { scadenzaPortale: giorno(scad), scadenzaInterna: giorno(scadenzaInterna(scad)) } : {}),
      ...(cambia ? { storico: { create: { statoPrecedente: r.stato, statoNuovo: x.stato, utente, origine: "seed", nota: "letto dal portale il 27/11/2026" } } } : {}),
    } });
    stati++;
  }
  return { template, righe, stati };
}

export type RigaVista = {
  id: string; entita: string; area: string; ordine: number; folder: string; documento: string; formato: string; nomeFileStandard: string; facSimile: string | null; workflow: boolean; owner: string; ownerEmail: string; usato: boolean;
  anno: number; mese: number; scadenzaPortale: string | null; scadenzaInterna: string | null; stato: Stato; caricatoDaId: string | null; caricatoDa: string | null; caricatoIl: string | null; nomeFileCaricato: string | null;
  dataRichiesta: string | null; motivoRifiuto: string | null; note: string | null;
};

export async function righe(dove: { anno?: number; mese?: number; entita?: string } = {}): Promise<RigaVista[]> {
  const r = await db.complianceRiga.findMany({ where: { anno: dove.anno, mese: dove.mese, template: dove.entita ? { entita: dove.entita } : undefined }, include: { template: true } });
  return r.map((x) => ({
    id: x.id, entita: x.template.entita, area: x.template.area, ordine: x.template.ordine, folder: x.template.folder, documento: x.template.documento, formato: x.template.formato, nomeFileStandard: x.template.nomeFileStandard, facSimile: x.template.facSimile, workflow: x.template.workflow, owner: x.template.owner, ownerEmail: x.template.ownerEmail, usato: x.template.usato,
    anno: x.anno, mese: x.mese, scadenzaPortale: iso(x.scadenzaPortale), scadenzaInterna: iso(x.scadenzaInterna), stato: x.stato as Stato, caricatoDaId: x.caricatoDaId, caricatoDa: x.caricatoDa, caricatoIl: x.caricatoIl?.toISOString() ?? null, nomeFileCaricato: x.nomeFileCaricato,
    dataRichiesta: iso(x.dataRichiesta), motivoRifiuto: x.motivoRifiuto, note: x.note,
  })).sort((a, b) => a.anno - b.anno || a.mese - b.mese || a.entita.localeCompare(b.entita) * -1 || a.area.localeCompare(b.area) * -1 || a.ordine - b.ordine);
}
