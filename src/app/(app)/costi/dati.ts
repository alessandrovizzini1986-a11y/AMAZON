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
