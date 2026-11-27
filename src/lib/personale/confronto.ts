import { db } from "@/lib/db";
import { confronta, stimaSaldo, type OreBusta, type OreTracking, type RigaConfronto } from "@/domain/personale/confronto";

export type Stima = { mese: string; ferie: number | null; rol: number | null; exfest: number | null };

/**
 * Stima dei saldi a fine mese per chi ha il tracking dello stesso mese dell'ultima busta: la busta di novembre ha il
 * maturato a fine novembre ma il goduto solo fino a ottobre; il goduto di novembre lo dà il tracking.
 * Quando arriva la busta dopo, il suo saldo prende il posto della stima (comandano le buste).
 * Chiave: station|gruppo|codice della busta.
 */
export async function stimeSaldi(ultime: { mese: string; station: string; gruppo: string; codice: string; ferieUnita: "GG" | "ORE"; ferieSaldo: number | null; rolSaldo: number | null; exfestSaldo: number | null }[]): Promise<Record<string, Stima>> {
  const mesi = [...new Set(ultime.map((x) => x.mese))];
  if (!mesi.length) return {};
  const [tracking, legami] = await Promise.all([
    db.trackingPersonaMese.findMany({ where: { mese: { in: mesi } } }),
    db.bustaLavoroPersona.findMany({ select: { station: true, gruppo: true, codice: true, cf: true }, distinct: ["station", "gruppo", "codice"] }),
  ]);
  if (!tracking.length) return {};
  const cfDi = new Map(legami.map((l) => [`${l.station}|${l.gruppo}|${l.codice}`, l.cf]));
  const t = new Map(tracking.map((x) => [`${x.mese}|${x.gruppo}|${x.cf || x.matricola}`, x]));
  const out: Record<string, Stima> = {};
  for (const u of ultime) {
    const k = `${u.station}|${u.gruppo}|${u.codice}`, x = t.get(`${u.mese}|${u.gruppo}|${cfDi.get(k) ?? ""}`) ?? t.get(`${u.mese}|${u.gruppo}|${u.codice}`);
    if (x) out[k] = { mese: u.mese, ...stimaSaldo(u, x) };
  }
  return out;
}

/** Confronto tracking–busta di un mese di lavoro (l'ultimo che ha entrambi, se non indicato). */
export async function datiConfronto(chiesto?: string): Promise<{ mesi: string[]; mese: string | null; righe: RigaConfronto[]; soloTracking: string[] }> {
  const [mt, mb] = await Promise.all([
    db.trackingPersonaMese.findMany({ where: { gruppo: "SIC" }, select: { mese: true }, distinct: ["mese"] }),
    db.bustaLavoroPersona.findMany({ where: { gruppo: "SIC", station: { not: "GLS" } }, select: { meseLavoro: true }, distinct: ["meseLavoro"] }),
  ]);
  const conBusta = new Set(mb.map((x) => x.meseLavoro));
  const mesi = mt.map((x) => x.mese).filter((m) => conBusta.has(m)).sort();
  const soloTracking = mt.map((x) => x.mese).filter((m) => !conBusta.has(m)).sort();
  const mese = chiesto && mesi.includes(chiesto) ? chiesto : mesi[mesi.length - 1] ?? null;
  if (!mese) return { mesi, mese, righe: [], soloTracking };
  const [tracking, busta] = await Promise.all([
    db.trackingPersonaMese.findMany({ where: { mese, gruppo: "SIC" } }),
    db.bustaLavoroPersona.findMany({ where: { meseLavoro: mese, gruppo: "SIC", station: { not: "GLS" } } }),
  ]);
  // si confrontano solo le station che hanno il tracking salvato
  const st = new Set(tracking.map((x) => x.station));
  return { mesi, mese, righe: confronta(tracking as OreTracking[], (busta as OreBusta[]).filter((b) => st.has(b.station))), soloTracking };
}
