import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, type Action } from "@/lib/rbac";
import { prossimoCambio, type ValorePerData } from "@/domain/costi/tariffe";

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const oggiIso = () => new Date().toISOString().slice(0, 10);

export async function utenteCosti(perm: Action = "costi.view"): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, perm)) redirect(can(user, "costi.view") ? "/costi" : "/");
  return user;
}

export async function tariffe(): Promise<ValorePerData[]> {
  const r = await db.tariffa.findMany({ orderBy: [{ voce: "asc" }, { validaDal: "asc" }] }).catch(() => []);
  return r.map((x) => ({ voce: x.voce, validaDal: iso(x.validaDal), valore: Number(x.valore), fonte: x.fonte }));
}

export async function parametri() {
  const r = await db.parametro.findMany({ orderBy: [{ chiave: "asc" }, { validaDal: "asc" }] }).catch(() => []);
  return r.map((x) => ({ id: x.id, chiave: x.chiave, validaDal: iso(x.validaDal), valore: Number(x.valore), fonte: x.fonte, note: x.note }));
}

export async function festivi(anno?: number) {
  const where = anno ? { data: { gte: new Date(`${anno}-01-01`), lte: new Date(`${anno}-12-31`) } } : {};
  const r = await db.festivo.findMany({ where, orderBy: [{ data: "asc" }, { station: "asc" }] }).catch(() => []);
  return r.map((x) => ({ id: x.id, data: iso(x.data), descrizione: x.descrizione, station: x.station }));
}

/** Versioni dell'anagrafica CDL con teste e CDL totale. */
export async function versioniCDL() {
  const r = await db.anagraficaCDL.groupBy({ by: ["meseVersione"], _count: { _all: true }, _sum: { cdl: true }, _max: { caricatoIl: true } }).catch(() => []);
  return r.map((x) => ({ mese: x.meseVersione, teste: x._count._all, cdl: Number(x._sum.cdl ?? 0), caricatoIl: x._max.caricatoIl?.toISOString() ?? null })).sort((a, b) => b.mese.localeCompare(a.mese));
}

/** Allerta cambio tariffa trasferta (60/30/7 giorni), mostrata in testa al modulo. */
export async function allerteTariffe(oggi = oggiIso()) {
  const t = await tariffe();
  return [...new Set(t.map((x) => x.voce))].map((v) => ({ voce: v, ...prossimoCambio(t, v, oggi) })).filter((x) => x.allerta !== null && x.allerta !== undefined && x.validaDal);
}

/** Mesi di età dell'anagrafica più recente rispetto a oggi (alert se > 3). */
export function etaMesi(mese: string, oggi = oggiIso()) {
  const [a, m] = mese.split("-").map(Number);
  const [ao, mo] = oggi.split("-").map(Number);
  return (ao - a) * 12 + (mo - m);
}

export const mesePrec = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, "0")}`; };

/** Righe ADIT del mese (per le tariffe e i controlli): per station × voce, con CF distinti. */
export async function aditMese(mese: string) {
  const r = await db.aditRiga.groupBy({ by: ["station", "voce", "cf"], where: { meseFattura: mese }, _sum: { quantita: true, costo: true } }).catch(() => []);
  return r.map((x) => ({ station: x.station, voce: x.voce, cf: x.cf, quantita: Number(x._sum.quantita ?? 0), costo: Number(x._sum.costo ?? 0) }));
}

/** Ultimo mese ADIT caricato ≤ mese. */
export async function ultimoAdit(finoA: string): Promise<string | null> {
  const r = await db.aditRiga.findFirst({ where: { meseFattura: { lte: finoA } }, orderBy: { meseFattura: "desc" }, select: { meseFattura: true } }).catch(() => null);
  return r?.meseFattura ?? null;
}

export async function mesiAdit() {
  const r = await db.aditRiga.groupBy({ by: ["meseFattura"], _sum: { costo: true }, _count: { _all: true } }).catch(() => []);
  return r.map((x) => ({ mese: x.meseFattura, costo: Number(x._sum.costo ?? 0), righe: x._count._all })).sort((a, b) => b.mese.localeCompare(a.mese));
}

/** Controllo di fine mese presenze (tracking vs Zucchetti) eseguito per il mese? */
export async function zucchettiControllato(mese: string) {
  const [a, m] = mese.split("-").map(Number);
  const r = await db.presenzeRun.findFirst({ where: { tipo: "FINE_MESE", periodoDa: { lte: new Date(Date.UTC(a, m - 1, 28)) }, periodoA: { gte: new Date(Date.UTC(a, m - 1, 1)) } }, orderBy: { eseguitoIl: "desc" }, select: { eseguitoIl: true, eseguitoDa: true } }).catch(() => null);
  return r ? { il: r.eseguitoIl.toISOString(), da: r.eseguitoDa } : null;
}

/** Stima salvata più recente del mese per popolazione: righe station × voce. */
export async function stimaSalvata(mese: string, popolazione: "STD" | "SIC") {
  const ultima = await db.stimaCosti.findFirst({ where: { mese, popolazione }, orderBy: { creataIl: "desc" }, select: { creataIl: true } }).catch(() => null);
  if (!ultima) return null;
  const r = await db.stimaCosti.findMany({ where: { mese, popolazione, creataIl: ultima.creataIl } });
  return { creataIl: ultima.creataIl.toISOString(), righe: r.map((x) => ({ station: x.station, voce: x.voce, quantita: x.quantita === null ? null : Number(x.quantita), importo: Number(x.importo) })), versioneAnagrafica: r[0]?.versioneAnagrafica ?? null, versioneParametri: r[0]?.versioneParametri ?? null };
}

/** Righe dell'anagrafica CDL (versione più recente, o quella indicata). */
export async function anagraficaRighe(versione: string) {
  const r = await db.anagraficaCDL.findMany({ where: { meseVersione: versione } }).catch(() => []);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return r.map((x) => ({
    cf: x.cf, cognome: x.cognome, nome: x.nome, station: x.station, contratto: x.contratto, pctPt: n(x.pctPt), hSettim: n(x.hSettim), ggLavorativi: n(x.ggLavorativi), tipologiaPt: x.tipologiaPt,
    rlm: n(x.rlm), edr: n(x.edr), cdl: Number(x.cdl), savingFeGg: n(x.savingFeGg), savingRolH: n(x.savingRolH), savingExfH: n(x.savingExfH), costoFestNonGodutaGg: n(x.costoFestNonGodutaGg), straoForfait: n(x.straoForfait),
  }));
}

export async function mesiPayroll() {
  const r = await db.payrollRiga.groupBy({ by: ["mesePaga"], where: { componente: { notIn: ["RECLASS", "GLS"] } }, _sum: { importo: true }, _count: { _all: true } }).catch(() => []);
  return r.map((x) => ({ mese: x.mesePaga, importo: Number(x._sum.importo ?? 0), righe: x._count._all })).sort((a, b) => b.mese.localeCompare(a.mese));
}

/** Componenti payroll per station (RECLASS e GLS esclusi) e dipendenti. */
export async function payrollPerStation(mesePaga: string) {
  const where = { mesePaga, componente: { notIn: ["RECLASS", "GLS"] } };
  const [c, d] = await Promise.all([
    db.payrollRiga.groupBy({ by: ["station", "componente"], where, _sum: { importo: true } }).catch(() => []),
    db.payrollRiga.groupBy({ by: ["station", "matr"], where }).catch(() => []),
  ]);
  const out: Record<string, Record<string, number> & { TOTALE: number; dipendenti: number }> = {};
  for (const x of c) { const s = x.station ?? "(non in anagrafica)"; const o = (out[s] ??= { TOTALE: 0, dipendenti: 0 } as never); o[x.componente] = (o[x.componente] ?? 0) + Number(x._sum.importo ?? 0); o.TOTALE += Number(x._sum.importo ?? 0); }
  for (const x of d) { const s = x.station ?? "(non in anagrafica)"; if (out[s]) out[s].dipendenti++; }
  return out;
}

/** € payroll per istituto (STR_FT, STR_PT, SUPP, MAGG, MALATTIA, CARENZA_INTEGR) e per componente, tutti i dipendenti. */
export async function payrollEuro(mesePaga: string) {
  const [i, c] = await Promise.all([
    db.payrollRiga.groupBy({ by: ["istituto"], where: { mesePaga, istituto: { not: null } }, _sum: { importo: true } }).catch(() => []),
    db.payrollRiga.groupBy({ by: ["componente"], where: { mesePaga }, _sum: { importo: true } }).catch(() => []),
  ]);
  return { istituti: Object.fromEntries(i.map((x) => [x.istituto!, Number(x._sum.importo ?? 0)])), componenti: Object.fromEntries(c.map((x) => [x.componente, Number(x._sum.importo ?? 0)])) as Record<string, number> };
}

/** ADIT del mese per station × voce, competenza del mese separata dai residui. */
export async function aditConfronto(mese: string) {
  const r = await db.aditRiga.groupBy({ by: ["station", "voce", "residuo"], where: { meseFattura: mese }, _sum: { quantita: true, costo: true } }).catch(() => []);
  return r.map((x) => ({ station: x.station, voce: x.voce, residuo: x.residuo, quantita: Number(x._sum.quantita ?? 0), costo: Number(x._sum.costo ?? 0) }));
}

export const meseSucc = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, "0")}`; };

/** Versioni del file MOG (data chiusura payroll) con teste per station. */
export async function versioniMog() {
  const r = await db.mogContratto.groupBy({ by: ["versione", "station"], _count: { _all: true }, _max: { caricatoIl: true } }).catch(() => []);
  const per = new Map<string, { versione: string; teste: number; perStation: Record<string, number>; caricatoIl: string | null }>();
  for (const x of r) {
    const v = per.get(x.versione) ?? { versione: x.versione, teste: 0, perStation: {}, caricatoIl: null };
    v.teste += x._count._all; v.perStation[x.station ?? "?"] = x._count._all; v.caricatoIl = x._max.caricatoIl?.toISOString() ?? v.caricatoIl;
    per.set(x.versione, v);
  }
  return [...per.values()].sort((a, b) => b.versione.localeCompare(a.versione));
}

/** Contratti MOG dell'ultima versione (o di quella indicata), nel formato del dominio. */
export async function contrattiMog(versione?: string) {
  const v = versione ?? (await db.mogContratto.findFirst({ orderBy: { versione: "desc" }, select: { versione: true } }).catch(() => null))?.versione;
  if (!v) return { versione: null as string | null, contratti: [] };
  const r = await db.mogContratto.findMany({ where: { versione: v } });
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
  const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  return {
    versione: v,
    contratti: r.map((x) => ({ cf: x.cf, nome: x.nome, cognome: x.cognome, station: x.station, sito: x.sito, dataInizio: d(x.dataInizio), dataFine: d(x.dataFine), pctMog: n(x.pctMog), oreMogMese: n(x.oreMogMese), oreMogSett: n(x.oreMogSett), giaConsolidato: x.giaConsolidato, rischioConsolidamento: x.rischioConsolidamento, mediaOreSemestre: n(x.mediaOreSemestre), ventiPctMog: n(x.ventiPctMog), meseProssimoConsolidamento: d(x.meseProssimoConsolidamento), proroghe: x.proroghe, oreRetribuite6m: n(x.oreRetribuite6m), oreEccedenti6m: n(x.oreEccedenti6m), mediaOreAnzianita: n(x.mediaOreAnzianita), mesePrimoConsolidamento: d(x.mesePrimoConsolidamento), meseConsolidato: d(x.meseConsolidato), supera20: x.supera20, pctDaConsolidare: n(x.pctDaConsolidare), nuovoMonteOre: n(x.nuovoMonteOre), nuovaPct: n(x.nuovaPct), orarioSettConsolidato: n(x.orarioSettConsolidato) })),
  };
}

export async function variazioniMog() {
  const r = await db.mogVariazione.findMany({ orderBy: { validaDal: "desc" } }).catch(() => []);
  return r.map((x) => ({ id: x.id, cf: x.cf, nome: x.nome, pctNuova: Number(x.pctNuova), validaDal: x.validaDal.toISOString().slice(0, 10), fonte: x.fonte }));
}

/** Tariffa Standard STD dell'ultimo ADIT caricato (costo/ore Stipendio), per il costo dell'integrazione MOG. */
export async function tariffaStandardAttuale(): Promise<{ tariffa: number; mese: string | null }> {
  const u = await db.aditRiga.findFirst({ orderBy: { meseFattura: "desc" }, select: { meseFattura: true } }).catch(() => null);
  if (!u) return { tariffa: 20.86, mese: null };
  const a = await db.aditRiga.aggregate({ where: { meseFattura: u.meseFattura, voce: "STANDARD" }, _sum: { quantita: true, costo: true } });
  const q = Number(a._sum.quantita ?? 0), c = Number(a._sum.costo ?? 0);
  return { tariffa: q ? Math.round((c / q) * 100) / 100 : 20.86, mese: u.meseFattura };
}

/** Tutto quello che serve ai controlli MOG nel browser. */
export async function datiMog() {
  const [{ versione, contratti }, variazioni, t] = await Promise.all([contrattiMog(), variazioniMog(), tariffaStandardAttuale()]);
  return { versione, contratti, variazioni: variazioni.map((v) => ({ cf: v.cf, pctNuova: v.pctNuova, validaDal: v.validaDal })), tariffa: t.tariffa, meseTariffa: t.mese };
}
export type DatiMog = Awaited<ReturnType<typeof datiMog>>;
