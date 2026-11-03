import "server-only";
import { db } from "@/lib/db";
import { percorsoConsuntivo, percorsoCostiFineMese, percorsoFatture, percorsoPresenze, percorsoTelepass, type Percorso } from "@/domain/percorsi/percorso";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const mesePrec = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, "0")}`; };
const meseSucc = (m: string) => { const [a, b] = m.split("-").map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, "0")}`; };
const etaMesi = (mese: string, oggi: string) => { const [a, m] = mese.split("-").map(Number); const [ao, mo] = oggi.split("-").map(Number); return (ao - a) * 12 + (mo - m); };
const giorniFa = (n: number) => new Date(Date.now() - n * 864e5);
const sicuro = async <T,>(f: () => Promise<T>, d: T): Promise<T> => { try { return await f(); } catch { return d; } };

/** Costi: chiusura del mese scorso e consuntivo del mese prima (l'ADIT arriva ~5 settimane dopo). */
export async function percorsiCosti(oggi = iso(new Date())): Promise<Percorso[]> {
  const M = mesePrec(oggi.slice(0, 7)), C = mesePrec(M);
  return sicuro(async () => {
    const [anag, aditPrec, std, sic, aditC, payC, ric] = await Promise.all([
      db.anagraficaCDL.findFirst({ orderBy: { meseVersione: "desc" }, select: { meseVersione: true } }),
      db.aditRiga.count({ where: { meseFattura: mesePrec(M) } }),
      db.stimaCosti.count({ where: { mese: M, popolazione: "STD" } }),
      db.stimaCosti.count({ where: { mese: M, popolazione: "SIC" } }),
      db.aditRiga.count({ where: { meseFattura: C } }),
      db.payrollRiga.count({ where: { mesePaga: meseSucc(C) } }),
      db.riconciliazione.groupBy({ by: ["popolazione"], where: { mese: C } }),
    ]);
    return [
      percorsoCostiFineMese({ mese: M, anagraficaEtaMesi: anag ? etaMesi(anag.meseVersione, oggi) : null, aditMesePrec: aditPrec > 0, stimaStd: std > 0, stimaSic: sic > 0 }),
      percorsoConsuntivo({ mese: C, aditMese: aditC > 0, payrollMeseSucc: payC > 0, ricStd: ric.some((r) => r.popolazione === "STD"), ricSic: ric.some((r) => r.popolazione === "SIC") }),
    ];
  }, []);
}

/** Fatture: il giro della settimana (ultimi 7 giorni). */
export async function percorsoFattureSettimana(): Promise<Percorso | null> {
  return sicuro(async () => {
    const da = giorniFa(7);
    const [importate, esportate, allineate] = await Promise.all([
      db.amazonInvoice.count({ where: { fonte: "PDF", createdAt: { gte: da } } }),
      db.amazonInvoice.count({ where: { esportataIl: { not: null }, presenteInFatt2026Il: null } }),
      db.amazonInvoice.count({ where: { presenteInFatt2026Il: { gte: da } } }),
    ]);
    return percorsoFatture({ importateSettimana: importate, esportateNonInFatt: esportate, allineateSettimana: allineate });
  }, null);
}

/** Presenze: settimana scorsa (domenica–sabato) e mese scorso. */
export async function percorsoPresenzeOra(oggi = new Date()): Promise<Percorso | null> {
  return sicuro(async () => {
    const dom = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate() - oggi.getUTCDay() - 7));
    const sab = new Date(dom.getTime() + 6 * 864e5);
    const M = mesePrec(iso(oggi).slice(0, 7));
    const [a, m] = M.split("-").map(Number);
    const [sett, fm] = await Promise.all([
      db.presenzeRun.findFirst({ where: { tipo: "SETTIMANALE", periodoDa: { lte: sab }, periodoA: { gte: dom } }, orderBy: { eseguitoIl: "desc" }, select: { id: true } }),
      db.presenzeRun.count({ where: { tipo: "FINE_MESE", periodoDa: { lte: new Date(Date.UTC(a, m - 1, 28)) }, periodoA: { gte: new Date(Date.UTC(a, m - 1, 1)) } } }),
    ]);
    const aperti = sett ? await db.presenzeRisultato.count({ where: { runId: sett.id, esitoOps: "aperto" } }) : 0;
    return percorsoPresenze({ settimana: iso(dom), runSettimana: !!sett, esitiAperti: aperti, mese: M, runFineMese: fm > 0 });
  }, null);
}

/** Telepass e carburante: mese scorso. */
export async function percorsoTelepassOra(oggi = iso(new Date())): Promise<Percorso | null> {
  return sicuro(async () => {
    const M = mesePrec(oggi.slice(0, 7));
    const [a, m] = M.split("-").map(Number);
    const [anag, tp, q8] = await Promise.all([
      db.anagraficaImport.count({ where: { eseguitoIl: { gte: giorniFa(35) } } }),
      db.telepassRun.count({ where: { anno: a, mese: m } }),
      db.q8Run.count({ where: { anno: a, mese: m } }),
    ]);
    return percorsoTelepass({ mese: M, anagraficheAggiornate: anag > 0, telepass: tp > 0, q8: q8 > 0 });
  }, null);
}
