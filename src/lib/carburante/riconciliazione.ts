/**
 * Dati della pagina "Carburante: Q8 e telematica": legge il mese dal database e lo passa al motore di abbinamento.
 * Le tappe dei furgoni (pesanti) si leggono solo per le poche giornate che servono.
 */
import { db } from "@/lib/db";
import {
  abbina, ELENCO_FLOTTE, FLOTTE, riconcilia, riepiloga, tappeNecessarie, TOLLERANZE,
  type Copertura, type EventoTarga, type Flotta, type GiornataTappe, type Q8Tx, type Riepilogo, type Riga,
} from "@/domain/carburante/riconciliazione";
import { giorniDelMese, giornoRoma, type Rifornimento } from "@/domain/telematica";
import { targaPulita } from "@/lib/telematica/posizioni";

export type Archiviata = { motivo: string; nota: string | null; da: string; il: string };
export type RigaPagina = Riga & { archiviata: Archiviata | null };
export type CoperturaFlotta = {
  flotta: Flotta;
  /** la telematica di questa flotta misura il gasolio che entra */
  sensore: boolean;
  nota: string;
  /** furgoni della flotta con telematica */
  mezziTelematica: number;
  /** furgoni attivi della flotta */
  mezziFlotta: number;
  q8: { transazioni: number; ultimoGiorno: string | null };
  targa: { rifornimenti: number; conOra: number; conCoordinate: number; giorniScaricati: number; giorniDaScaricare: number };
};
export type MeseQ8 = { mese: string; transazioni: number; ultimoGiorno: string | null; caricatoIl: string | null };
export type DatiRiconciliazione = {
  mese: string;
  righe: RigaPagina[];
  riepilogo: Record<"TUTTE" | Flotta, Riepilogo>;
  copertura: CoperturaFlotta[];
  /** transazioni Q8 in archivio negli ultimi mesi (per le flotte controllate) */
  q8Mesi: MeseQ8[];
  appreso: { carteAbituali: number; distributoriLocalizzati: number };
  tolleranze: typeof TOLLERANZE;
  ms: number;
};

const ultimoDelMese = (mese: string) => giorniDelMese(mese).at(-1)!;

/** furgoni con telematica (Targa) delle flotte controllate: targa → flotta */
async function mezziConTelematica(mese: string): Promise<{ perTarga: Map<string, Flotta>; inFlotta: Record<Flotta, number> }> {
  const [visti, mezzi] = await Promise.all([
    db.telematicaGiorno.findMany({ where: { fonte: "TARGA", giorno: { gte: `${mese}-01`, lte: ultimoDelMese(mese) } }, distinct: ["targa"], select: { targa: true } }),
    db.vehicle.findMany({ where: { stato: { not: "DISMESSO" }, station: { code: { in: ELENCO_FLOTTE } } }, select: { targa: true, station: { select: { code: true } } } }),
  ]);
  const flottaDi = new Map(mezzi.map((m) => [targaPulita(m.targa), m.station.code as Flotta]));
  const perTarga = new Map<string, Flotta>();
  for (const v of visti) { const f = flottaDi.get(v.targa); if (f) perTarga.set(v.targa, f); }
  const inFlotta = Object.fromEntries(ELENCO_FLOTTE.map((f) => [f, mezzi.filter((m) => m.station.code === f).length])) as Record<Flotta, number>;
  return { perTarga, inFlotta };
}

export async function datiRiconciliazione(mese: string): Promise<DatiRiconciliazione> {
  const t0 = Date.now();
  const da = `${mese}-01`, a = ultimoDelMese(mese);
  const { perTarga, inFlotta } = await mezziConTelematica(mese);
  const targhe = [...perTarga.keys()];
  const [q8db, rif, giorniMezzi, giustifiche, q8Mesi] = await Promise.all([
    db.q8Transazione.findMany({ where: { station: { in: ELENCO_FLOTTE }, giorno: { gte: da, lte: a } } }),
    db.telematicaGiorno.findMany({ where: { fonte: "TARGA", targa: { in: targhe }, giorno: { gte: da, lte: a }, rifornimenti: { gt: 0 } }, select: { targa: true, giorno: true, rifornimenti: true, litri: true, rifornimentiDett: true } }),
    db.telematicaGiorno.findMany({ where: { fonte: "TARGA", targa: { in: targhe }, giorno: { gte: da, lte: a } }, select: { targa: true, giorno: true } }),
    db.carburanteGiustifica.findMany({ where: { mese } }),
    db.$queryRaw<{ mese: string; n: bigint; ultimo: string | null; caricato: Date | null }[]>`
      select mese, count(*) as n, max(giorno) as ultimo, max("caricatoIl") as caricato from "Q8Transazione"
      where station = any(${ELENCO_FLOTTE}) group by mese order by mese desc limit 12`,
  ]);

  const q8: Q8Tx[] = q8db.map((r) => ({
    chiave: r.chiave, flotta: r.station as Flotta, giorno: r.giorno, ora: r.ora, identificativo: r.identificativo, litri: r.litri,
    importoNoIva: r.importoNoIva, prodotto: r.prodotto, impianto: r.impianto, indirizzo: r.indirizzo, citta: r.citta, km: r.km,
  }));
  const eventi: EventoTarga[] = [];
  const senzaDettaglio = new Set<string>(); // flotta|giorno con rifornimenti senza ora
  for (const r of rif) {
    const flotta = perTarga.get(r.targa)!;
    const dett = r.rifornimentiDett as (Rifornimento & { lat?: number | null; lng?: number | null })[] | null;
    if (!dett) {
      senzaDettaglio.add(`${flotta}|${r.giorno}`);
      eventi.push({ targa: r.targa, flotta, giorno: r.giorno, ora: "", litri: r.litri, dove: null });
      continue;
    }
    for (const d of dett) {
      eventi.push({ targa: r.targa, flotta, giorno: r.giorno, ora: d.ora, litri: d.litri, dove: d.dove, lat: d.lat ?? null, lng: d.lng ?? null });
    }
  }
  const scaricati = new Set(giorniMezzi.map((g) => `${perTarga.get(g.targa)}|${g.giorno}`));
  const oggi = giornoRoma(new Date());
  const copertura: Copertura[] = ELENCO_FLOTTE.flatMap((flotta) => giorniDelMese(mese).filter((g) => g < oggi).map((giorno) => ({
    flotta, giorno, scaricato: scaricati.has(`${flotta}|${giorno}`), dettaglioCompleto: !senzaDettaglio.has(`${flotta}|${giorno}`),
  })));

  const pre = abbina(q8, eventi);
  const serve = tappeNecessarie(pre);
  const tappeDb = serve.length
    ? await db.telematicaGiorno.findMany({ where: { fonte: "TARGA", OR: serve.map((s) => ({ targa: s.targa, giorno: s.giorno })) }, select: { targa: true, giorno: true, tappe: true } })
    : [];
  const tappe: GiornataTappe[] = tappeDb.map((t) => ({ targa: t.targa, giorno: t.giorno, tappe: ((t.tappe as GiornataTappe["tappe"] | null) ?? []).map((x) => ({ t: x.t, da: x.da, a: x.a, dove: x.dove ?? null })) }));
  const ultimoGiornoQ8 = Object.fromEntries(ELENCO_FLOTTE.map((f) => [f, q8.filter((q) => q.flotta === f).reduce<string | null>((m, q) => (!m || q.giorno > m ? q.giorno : m), null)])) as Record<Flotta, string | null>;
  const esito = riconcilia({ q8, eventi, tappe, copertura, ultimoGiornoQ8 }, pre);

  const arch = new Map(giustifiche.map((g) => [g.chiave, { motivo: g.motivo, nota: g.nota, da: g.creatoDa, il: g.creatoIl.toISOString() }]));
  const righe: RigaPagina[] = esito.righe.map((r) => ({ ...r, archiviata: arch.get(r.chiave) ?? null }));
  const attive = righe.filter((r) => !r.archiviata);
  const riepilogo = { TUTTE: riepiloga(attive), ...Object.fromEntries(ELENCO_FLOTTE.map((f) => [f, riepiloga(attive.filter((r) => r.flotta === f))])) } as Record<"TUTTE" | Flotta, Riepilogo>;
  // i pagamenti archiviati contano comunque tra quelli analizzati
  for (const k of ["TUTTE", ...ELENCO_FLOTTE] as const) riepilogo[k].pagamentiQ8 = righe.filter((r) => k === "TUTTE" || r.flotta === k).reduce((s, r) => s + r.q8.length, 0);

  const coperturaFlotte: CoperturaFlotta[] = ELENCO_FLOTTE.map((flotta) => {
    const ev = eventi.filter((e) => e.flotta === flotta), qf = q8.filter((q) => q.flotta === flotta);
    const giorni = copertura.filter((c) => c.flotta === flotta);
    return {
      flotta, sensore: FLOTTE[flotta].sensore, nota: FLOTTE[flotta].nota,
      mezziTelematica: [...perTarga.values()].filter((f) => f === flotta).length, mezziFlotta: inFlotta[flotta],
      q8: { transazioni: qf.length, ultimoGiorno: ultimoGiornoQ8[flotta] },
      targa: {
        rifornimenti: rif.filter((r) => perTarga.get(r.targa) === flotta).reduce((s, r) => s + r.rifornimenti, 0),
        conOra: ev.filter((e) => e.ora).length, conCoordinate: ev.filter((e) => e.lat != null && e.lng != null).length,
        giorniScaricati: giorni.filter((g) => g.scaricato).length, giorniDaScaricare: giorni.length,
      },
    };
  });

  return {
    mese, righe, riepilogo, copertura: coperturaFlotte,
    q8Mesi: q8Mesi.map((m) => ({ mese: m.mese, transazioni: Number(m.n), ultimoGiorno: m.ultimo, caricatoIl: m.caricato ? m.caricato.toISOString() : null })),
    appreso: esito.appreso, tolleranze: TOLLERANZE, ms: Date.now() - t0,
  };
}

/** Ultimo mese con dati Q8 delle flotte controllate (per aprire la pagina su un mese che ha senso). */
export async function meseIniziale(): Promise<string> {
  const ultimo = await db.q8Transazione.findFirst({ where: { station: { in: ELENCO_FLOTTE } }, orderBy: { giorno: "desc" }, select: { giorno: true } });
  return ultimo?.giorno.slice(0, 7) ?? giornoRoma(new Date()).slice(0, 7);
}
