import "server-only";
import { db } from "@/lib/db";
import { getConfigStringArray } from "@/lib/config";
import { splitCosti, type Appalto, type RigaCosto } from "@/domain/flotta/costiMese";

/** Mese di oggi a Roma (AAAA-MM). */
export const meseDiOggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }).slice(0, 7);

/** Split di adesso, da tutta la flotta (sostitutivi e dismessi esclusi). */
export async function costiDiAdesso(): Promise<RigaCosto[]> {
  const [veicoli, nonAmazon] = await Promise.all([
    db.vehicle.findMany({ where: { stato: { notIn: ["DISMESSO", "SOSTITUTIVO"] } }, select: { leasingCompany: true, canoneMese: true, note: true, station: { select: { code: true } } } }),
    getConfigStringArray("appalto.nonAmazon.stationCodes"),
  ]);
  return splitCosti(veicoli.map((v) => ({ compagnia: v.leasingCompany, canone: v.canoneMese === null ? null : Number(v.canoneMese), amazon: !nonAmazon.includes(v.station.code), stimato: /^canone stimato/i.test(v.note ?? "") })));
}

/** Righe salvate di un mese (vuoto se non c'è storico). */
export async function costiSalvati(mese: string): Promise<RigaCosto[]> {
  try {
    return (await db.flottaCostoMese.findMany({ where: { mese } })).map((r) => ({ appalto: r.appalto as Appalto, compagnia: r.compagnia, mezzi: r.mezzi, canone: Number(r.canone), stimati: r.stimati }));
  } catch { return []; } // tabella non ancora creata su questo database
}

/**
 * Salva la fotografia del mese in corso: l'ultima scrittura del mese resta come storico.
 * Non tocca i mesi inseriti a mano (fonte MAIL) e non scrive se non è cambiato niente.
 */
export async function fotografaMese(mese: string, righe: RigaCosto[]): Promise<void> {
  try {
    const salvate = await db.flottaCostoMese.findMany({ where: { mese } });
    if (salvate.some((r) => r.fonte !== "SITO")) return;
    const firma = (rs: { appalto: string; compagnia: string; mezzi: number | null; canone: unknown; stimati: number }[]) => rs.map((r) => `${r.appalto}|${r.compagnia}|${r.mezzi}|${Number(r.canone).toFixed(2)}|${r.stimati}`).sort().join("\n");
    if (firma(salvate) === firma(righe)) return;
    await db.$transaction([db.flottaCostoMese.deleteMany({ where: { mese, fonte: "SITO" } }), db.flottaCostoMese.createMany({ data: righe.map((r) => ({ mese, ...r, fonte: "SITO" })) })]);
  } catch { /* lo storico non deve mai bloccare la pagina */ }
}
