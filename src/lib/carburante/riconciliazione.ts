/**
 * Dati della pagina "Carburante: Q8 e telematica": legge il mese dal database e lo passa al motore di abbinamento.
 * Le tappe dei furgoni (pesanti) si leggono solo per le poche giornate che servono.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  abbina, ELENCO_FLOTTE, FLOTTE, ORDINE_STATI, riconcilia, riepiloga, tappeNecessarie, TOLLERANZE,
  type Copertura, type EventoTarga, type Flotta, type GiornataTappe, type Q8Tx, type Riepilogo, type Riga, type Stato,
} from "@/domain/carburante/riconciliazione";
import { GIORNI_TAPPE, giorniDelMese, giornoRoma, piuGiorni, type Rifornimento } from "@/domain/telematica";
import { targaPulita } from "@/lib/telematica/posizioni";

export type Archiviata = { motivo: string; nota: string | null; da: string; il: string; stato: Stato | null };
export type RigaPagina = Riga & {
  archiviata: Archiviata | null;
  /** archiviata quando era in uno stato meno grave: con i dati nuovi è peggiorata, quindi torna visibile */
  statoCambiato?: { prima: Stato; motivo: string; da: string; il: string };
};
export type CoperturaFlotta = {
  flotta: Flotta;
  /** la telematica di questa flotta misura il gasolio che entra */
  sensore: boolean;
  nota: string;
  /** furgoni della flotta con telematica */
  mezziTelematica: number;
  /** furgoni attivi della flotta */
  mezziFlotta: number;
  q8: { transazioni: number; ultimoGiorno: string | null; ultimaOra: string | null };
  targa: {
    rifornimenti: number; conOra: number; conCoordinate: number; giorniScaricati: number; giorniDaScaricare: number;
    /** giornate (furgone-giorno) con rifornimenti da completare: senza dettaglio o senza coordinate (si completano da Furgoni → Il mese) */
    daCompletare: number;
  };
};
export type MeseQ8 = { mese: string; transazioni: number; ultimoGiorno: string | null; caricatoIl: string | null };
/** copertura Targa mese per mese, per flotta */
export type MeseTarga = { mese: string; flotta: Flotta; rifornimenti: number; daCompletare: number };
export type DatiRiconciliazione = {
  mese: string;
  righe: RigaPagina[];
  riepilogo: Record<"TUTTE" | Flotta, Riepilogo>;
  copertura: CoperturaFlotta[];
  /** transazioni Q8 in archivio negli ultimi mesi (per le flotte controllate) */
  q8Mesi: MeseQ8[];
  targaMesi: MeseTarga[];
  /** avvisi del caricamento (percorsi scaduti, carte non censite…), già in italiano */
  avvisi: string[];
  appreso: { carteAbituali: number; distributoriLocalizzati: number };
  tolleranze: typeof TOLLERANZE;
  ms: number;
};

const ultimoDelMese = (mese: string) => giorniDelMese(mese).at(-1)!;
/** condizione del riscarico (stessa di Furgoni → Il mese): dettaglio assente o senza coordinate */
const DA_COMPLETARE = Prisma.sql`("rifornimentiDett" is null or not (("rifornimentiDett")::jsonb -> 0 ? 'lat'))`;

/** furgoni con telematica (Targa) delle flotte controllate: targa → flotta. Anche i dismessi: il mese può essere passato. */
async function mezziConTelematica(mese: string): Promise<{ perTarga: Map<string, Flotta>; inFlotta: Record<Flotta, number> }> {
  const [visti, mezzi] = await Promise.all([
    db.telematicaGiorno.findMany({ where: { fonte: "TARGA", giorno: { gte: `${mese}-01`, lte: ultimoDelMese(mese) } }, distinct: ["targa"], select: { targa: true } }),
    db.vehicle.findMany({ where: { station: { code: { in: ELENCO_FLOTTE } } }, select: { targa: true, stato: true, updatedAt: true, station: { select: { code: true } } }, orderBy: { updatedAt: "asc" } }),
  ]);
  // per targa: vince il mezzo non dismesso, poi il più recente
  const flottaDi = new Map<string, { flotta: Flotta; attivo: boolean }>();
  for (const m of mezzi) {
    const t = targaPulita(m.targa), attivo = m.stato !== "DISMESSO", prima = flottaDi.get(t);
    if (!prima || attivo || !prima.attivo) flottaDi.set(t, { flotta: m.station.code as Flotta, attivo });
  }
  const perTarga = new Map<string, Flotta>();
  for (const v of visti) { const f = flottaDi.get(v.targa); if (f) perTarga.set(v.targa, f.flotta); }
  const inFlotta = Object.fromEntries(ELENCO_FLOTTE.map((f) => [f, mezzi.filter((m) => m.station.code === f && m.stato !== "DISMESSO").length])) as Record<Flotta, number>;
  return { perTarga, inFlotta };
}

export async function datiRiconciliazione(mese: string): Promise<DatiRiconciliazione> {
  const t0 = Date.now();
  const da = `${mese}-01`, a = ultimoDelMese(mese);
  const { perTarga, inFlotta } = await mezziConTelematica(mese);
  const targhe = [...perTarga.keys()];
  const [q8db, rif, giorniMezzi, giustifiche, q8Mesi, nonCensite, daCompletare, targaMesiDb] = await Promise.all([
    db.q8Transazione.findMany({
      where: { station: { in: ELENCO_FLOTTE }, giorno: { gte: da, lte: a } },
      select: { chiave: true, mese: true, station: true, giorno: true, ora: true, identificativo: true, litri: true, importoNoIva: true, prodotto: true, impianto: true, indirizzo: true, citta: true, km: true },
    }),
    db.telematicaGiorno.findMany({ where: { fonte: "TARGA", targa: { in: targhe }, giorno: { gte: da, lte: a }, rifornimenti: { gt: 0 } }, select: { targa: true, giorno: true, rifornimenti: true, litri: true, rifornimentiDett: true } }),
    db.telematicaGiorno.findMany({ where: { fonte: "TARGA", targa: { in: targhe }, giorno: { gte: da, lte: a } }, select: { targa: true, giorno: true } }),
    db.carburanteGiustifica.findMany({ where: { mese } }),
    db.$queryRaw<{ mese: string; n: bigint; ultimo: string | null; caricato: Date | null }[]>`
      select mese, count(*) as n, max(giorno) as ultimo, max("caricatoIl") as caricato from "Q8Transazione"
      where station = any(${ELENCO_FLOTTE}) group by mese order by mese desc limit 12`,
    // carte AMZ/GLS non trovate nel censimento: le loro transazioni non entrano nell'incrocio
    db.q8Transazione.count({ where: { mese, station: "NON CENSITA", OR: [{ identificativo: { startsWith: "AMZ" } }, { identificativo: { startsWith: "GLS" } }] } }),
    targhe.length
      ? db.$queryRaw<{ targa: string; n: bigint }[]>`select targa, count(*) as n from "TelematicaGiorno"
          where fonte = 'TARGA' and giorno >= ${da} and giorno <= ${a} and rifornimenti > 0 and targa = any(${targhe}) and ${DA_COMPLETARE} group by targa`
      : Promise.resolve([]),
    targhe.length
      ? db.$queryRaw<{ mese: string; targa: string; rif: bigint; dac: bigint }[]>`select substr(giorno, 1, 7) as mese, targa, sum(rifornimenti) as rif,
          count(*) filter (where ${DA_COMPLETARE}) as dac from "TelematicaGiorno"
          where fonte = 'TARGA' and rifornimenti > 0 and giorno >= ${piuGiorni(da, -180)} and targa = any(${targhe}) group by 1, 2`
      : Promise.resolve([]),
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
    for (const d of dett) eventi.push({ targa: r.targa, flotta, giorno: r.giorno, ora: d.ora, litri: d.litri, dove: d.dove, lat: d.lat ?? null, lng: d.lng ?? null });
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
  type TappaDb = { t: "G" | "S"; da: string; a: string; km?: number; dove?: string | null };
  const tappe: GiornataTappe[] = tappeDb.map((t) => ({
    targa: t.targa, giorno: t.giorno,
    // tappe null = la giornata c'è ma il percorso è già stato tolto (si tiene GIORNI_TAPPE giorni)
    tappe: t.tappe === null ? null : ((t.tappe as TappaDb[]) ?? []).map((x) => ({ t: x.t, da: x.da, a: x.a, km: x.km, dove: x.dove ?? null })),
  }));
  // copertura del file Q8: l'istante dell'ultima transazione del file di questo mese (non i pagamenti di altri file)
  const ultimoIstante = (f: Flotta) => q8db.filter((q) => q.station === f && q.mese === mese).reduce<string | null>((m, q) => { const x = `${q.giorno} ${q.ora}`; return !m || x > m ? x : m; }, null);
  const ultimoGiornoQ8 = Object.fromEntries(ELENCO_FLOTTE.map((f) => [f, ultimoIstante(f)])) as Record<Flotta, string | null>;
  const esito = riconcilia({ q8, eventi, tappe, copertura, ultimoGiornoQ8 }, pre);

  // archiviazioni: valgono finché la riga non peggiora rispetto a quando è stata archiviata
  const gravita = (s: Stato) => ORDINE_STATI.indexOf(s);
  const arch = new Map(giustifiche.map((g) => [g.chiave, g]));
  const righe: RigaPagina[] = esito.righe.map((r) => {
    const g = arch.get(r.chiave);
    if (!g) return { ...r, archiviata: null };
    const prima = (g.stato as Stato | null) ?? null, il = g.creatoIl.toISOString();
    if (prima && gravita(r.stato) < gravita(prima)) return { ...r, archiviata: null, statoCambiato: { prima, motivo: g.motivo, da: g.creatoDa, il } };
    return { ...r, archiviata: { motivo: g.motivo, nota: g.nota, da: g.creatoDa, il, stato: prima } };
  });
  const attive = righe.filter((r) => !r.archiviata);
  const riepilogo = { TUTTE: riepiloga(attive), ...Object.fromEntries(ELENCO_FLOTTE.map((f) => [f, riepiloga(attive.filter((r) => r.flotta === f))])) } as Record<"TUTTE" | Flotta, Riepilogo>;
  // i pagamenti archiviati contano comunque tra quelli analizzati
  for (const k of ["TUTTE", ...ELENCO_FLOTTE] as const) riepilogo[k].pagamentiQ8 = righe.filter((r) => k === "TUTTE" || r.flotta === k).reduce((s, r) => s + r.q8.length, 0);

  const dacPerTarga = new Map(daCompletare.map((d) => [d.targa, Number(d.n)]));
  const coperturaFlotte: CoperturaFlotta[] = ELENCO_FLOTTE.map((flotta) => {
    const ev = eventi.filter((e) => e.flotta === flotta), qf = q8.filter((q) => q.flotta === flotta);
    const giorni = copertura.filter((c) => c.flotta === flotta), ultimo = ultimoGiornoQ8[flotta];
    return {
      flotta, sensore: FLOTTE[flotta].sensore, nota: FLOTTE[flotta].nota,
      mezziTelematica: [...perTarga.values()].filter((f) => f === flotta).length, mezziFlotta: inFlotta[flotta],
      q8: { transazioni: qf.length, ultimoGiorno: ultimo?.slice(0, 10) ?? null, ultimaOra: ultimo?.slice(11, 16) ?? null },
      targa: {
        rifornimenti: rif.filter((r) => perTarga.get(r.targa) === flotta).reduce((s, r) => s + r.rifornimenti, 0),
        conOra: ev.filter((e) => e.ora).length, conCoordinate: ev.filter((e) => e.lat != null && e.lng != null).length,
        giorniScaricati: giorni.filter((g) => g.scaricato).length, giorniDaScaricare: giorni.length,
        daCompletare: [...dacPerTarga].filter(([t]) => perTarga.get(t) === flotta).reduce((s, [, n]) => s + n, 0),
      },
    };
  });

  const targaMesi: MeseTarga[] = [];
  for (const r of targaMesiDb) {
    const flotta = perTarga.get(r.targa);
    if (!flotta) continue;
    const x = targaMesi.find((m) => m.mese === r.mese && m.flotta === flotta) ?? (targaMesi.push({ mese: r.mese, flotta, rifornimenti: 0, daCompletare: 0 }), targaMesi.at(-1)!);
    x.rifornimenti += Number(r.rif); x.daCompletare += Number(r.dac);
  }
  targaMesi.sort((x, y) => y.mese.localeCompare(x.mese) || x.flotta.localeCompare(y.flotta));

  const avvisi: string[] = [];
  const limiteTappe = piuGiorni(oggi, -GIORNI_TAPPE);
  if (da < limiteTappe) avvisi.push(`I percorsi dei furgoni si tengono ${GIORNI_TAPPE} giorni: prima del ${limiteTappe.slice(8, 10)}/${limiteTappe.slice(5, 7)} non si può più vedere se un furgone è passato dal distributore, quindi «Carta usata, serbatoio fermo» non può comparire per quei giorni.`);
  if (nonCensite > 0) avvisi.push(`${nonCensite} pagamenti del mese sono di carte AMZ o GLS non presenti nel censimento delle fuel card: non entrano nell'incrocio. Aggiorna il censimento e rielabora il file Q8.`);

  return {
    mese, righe, riepilogo, copertura: coperturaFlotte,
    q8Mesi: q8Mesi.map((m) => ({ mese: m.mese, transazioni: Number(m.n), ultimoGiorno: m.ultimo, caricatoIl: m.caricato ? m.caricato.toISOString() : null })),
    targaMesi, avvisi, appreso: esito.appreso, tolleranze: TOLLERANZE, ms: Date.now() - t0,
  };
}

/**
 * Mese con cui aprire la pagina: l'ultimo con dati completi (file Q8 fino ad almeno 2 giorni dalla fine del mese e
 * rifornimenti Targa con l'ora per almeno il 95 %), altrimenti il mese corrente.
 */
export async function meseIniziale(): Promise<string> {
  const corrente = giornoRoma(new Date()).slice(0, 7);
  const mesi = await db.$queryRaw<{ mese: string; ultimo: string }[]>`
    select mese, max(giorno) as ultimo from "Q8Transazione" where station = any(${ELENCO_FLOTTE}) group by mese order by mese desc limit 6`;
  for (const m of mesi) {
    if (m.ultimo < piuGiorni(ultimoDelMese(m.mese), -2)) continue;
    const [c] = await db.$queryRaw<{ tot: bigint; senza: bigint }[]>`select count(*) as tot, count(*) filter (where "rifornimentiDett" is null) as senza
      from "TelematicaGiorno" where fonte = 'TARGA' and rifornimenti > 0 and giorno >= ${`${m.mese}-01`} and giorno <= ${ultimoDelMese(m.mese)}`;
    const tot = Number(c?.tot ?? 0), senza = Number(c?.senza ?? 0);
    if (tot > 0 && senza / tot <= 0.05) return m.mese;
  }
  return corrente;
}
