/**
 * Scarico di un giorno: per ogni mezzo dei due portali legge il percorso di quel giorno e salva una riga (km, orari, tempi, soste,
 * rifornimenti, tappe). I portali danno un mezzo alla volta: qui si fanno le letture in parallelo a piccoli gruppi.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { GIORNI_TAPPE, giornoDaFlottaweb, giornoDaTarga, giornoRoma, intervalloRoma, piuGiorni, primoRifornimentoGrezzo, type GiornoMezzo } from "@/domain/telematica";
import { campione } from "./prova";
import type { Fonte } from "./comune";
import { accediFlottaweb, leggiFlottaweb } from "./flottaweb";
import { targaPulita } from "./posizioni";
import { accediTarga, leggiTarga } from "./targa";

const IN_PARALLELO = 8;
async function aGruppi<T>(elenco: T[], fai: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(IN_PARALLELO, elenco.length) }, async () => { while (i < elenco.length) await fai(elenco[i++]); }));
}

type Mezzo = { fonte: Fonte; id: string; targa: string };
async function mezzi(fonte: Fonte, token: string): Promise<Mezzo[]> {
  if (fonte === "TARGA") {
    const r = (await leggiTarga(token, "/units/lean")) as { idUnit?: number; plate?: string; name?: string }[];
    return (Array.isArray(r) ? r : []).filter((u) => u.idUnit).map((u) => ({ fonte, id: String(u.idUnit), targa: targaPulita(u.plate || u.name) }));
  }
  const r = (await leggiFlottaweb(token, "/unit/list")) as { units?: { unitid?: number; vrn?: string; name?: string }[] };
  return (r.units ?? []).filter((u) => u.unitid).map((u) => ({ fonte, id: String(u.unitid), targa: targaPulita(u.vrn || u.name) }));
}

async function giornoDi(m: Mezzo, token: string, giorno: string): Promise<GiornoMezzo> {
  if (m.fonte === "TARGA") {
    // inizio e fine con il loro scarto: nei giorni del cambio dell'ora la giornata dura 23 o 25 ore
    const { begin, end } = intervalloRoma(giorno);
    const risposta = await leggiTarga(token, `/route/${m.id}`, { begin, end, timezone: "Europe/Rome", showIdlingSegments: "true", showDriverName: "true" });
    await ricordaRifornimento(risposta);
    return giornoDaTarga(risposta, giorno);
  }
  return giornoDaFlottaweb(await leggiFlottaweb(token, "/gps/getpositions", { unitid: m.id, da: `${giorno} 00:00:00`, a: `${giorno} 23:59:59` }), giorno);
}

/** tiene da parte (una volta sola) un rifornimento così come arriva da Targa, per vedere quali altri dati porta */
let esempioSalvato = false;
async function ricordaRifornimento(risposta: unknown) {
  if (esempioSalvato) return;
  const grezzo = primoRifornimentoGrezzo(risposta);
  if (!grezzo) return;
  esempioSalvato = true;
  const dati = { cosa: "Esempio di rifornimento", ok: true, stato: 200, elementi: 1, errore: null, risposta: campione(grezzo) as Prisma.InputJsonValue, eseguitaIl: new Date() };
  await db.telematicaProva.upsert({ where: { fonte_chiamata: { fonte: "TARGA", chiamata: "rifornimento-esempio" } }, create: { fonte: "TARGA", chiamata: "rifornimento-esempio", ...dati }, update: dati }).catch(() => undefined);
}

const datiRiga = (m: { id: string }, g: GiornoMezzo) => ({
  idMezzo: m.id, km: g.km, inizio: g.inizio ? new Date(g.inizio) : null, fine: g.fine ? new Date(g.fine) : null, guidaSec: g.guidaSec, motoreSec: g.motoreSec, fermoMotoreAccSec: g.fermoMotoreAccSec,
  velMax: g.velMax, punteggioSicurezza: g.punteggioSicurezza, soste: g.soste, rifornimenti: g.rifornimenti, litri: g.litri, kmContatore: g.kmContatore, autista: g.autista,
  tappe: g.tappe.length ? (g.tappe as unknown as Prisma.InputJsonValue) : Prisma.DbNull, rifornimentiDett: g.rifDett.length ? (g.rifDett as unknown as Prisma.InputJsonValue) : Prisma.DbNull, scaricatoIl: new Date(),
});

/**
 * Righe Targa del mese con rifornimenti ma senza dettaglio completo: senza dettaglio (scaricate prima che il sito lo salvasse)
 * o con il dettaglio vecchio, senza coordinate (il primo elemento non ha la chiave "lat"). Un elenco vuoto vale come fatto.
 */
const dettaglioDaRifare = (mese: string) => Prisma.sql`fonte = 'TARGA' and giorno like ${`${mese}%`} and rifornimenti > 0
  and ("rifornimentiDett" is null or not (("rifornimentiDett")::jsonb -> 0 ? 'lat'))`;

/** quante righe del mese aspettano ora, luogo e coordinate dei rifornimenti */
export async function rifornimentiDaRiscaricare(mese: string): Promise<number> {
  const [r] = await db.$queryRaw<{ n: number }[]>`select count(*)::int as n from "TelematicaGiorno" where ${dettaglioDaRifare(mese)}`;
  return Number(r?.n ?? 0);
}

/**
 * Come rifornimentiDaRiscaricare, ma solo per le targhe date (per esempio i furgoni di una flotta): quante giornate del mese
 * aspettano ancora ora, luogo e coordinate dei rifornimenti. Stessa condizione del riscarico. Nessuna targa → 0.
 */
export async function rifornimentiDaRiscaricarePerTarghe(mese: string, targhe: string[]): Promise<number> {
  const elenco = [...new Set(targhe.map(targaPulita).filter(Boolean))];
  if (!elenco.length) return 0;
  const [r] = await db.$queryRaw<{ n: number }[]>`select count(*)::int as n from "TelematicaGiorno" where ${dettaglioDaRifare(mese)} and targa in (${Prisma.join(elenco)})`;
  return Number(r?.n ?? 0);
}

/**
 * Dettaglio dei rifornimenti (ora, luogo, coordinate) per i giorni scaricati prima che il sito lo salvasse: rilegge dal portale
 * solo le righe con un rifornimento e senza dettaglio completo, poche per volta. Torna quante ne restano.
 */
export async function riscaricaRifornimenti(mese: string, quante = 60): Promise<{ fatte: number; restano: number; errori: number }> {
  const ids = await db.$queryRaw<{ id: string }[]>`select id from "TelematicaGiorno" where ${dettaglioDaRifare(mese)} order by giorno asc limit ${quante}`;
  if (!ids.length) return { fatte: 0, restano: 0, errori: 0 };
  const righe = await db.telematicaGiorno.findMany({ where: { id: { in: ids.map((x) => x.id) } }, select: { id: true, idMezzo: true, targa: true, giorno: true }, orderBy: { giorno: "asc" } });
  const token = await accediTarga();
  let fatte = 0, errori = 0;
  await aGruppi(righe, async (r) => {
    try {
      const g = await giornoDi({ fonte: "TARGA", id: r.idMezzo, targa: r.targa }, token, r.giorno);
      // se il portale non lo dà più, segno un elenco vuoto: così la riga non viene richiesta all'infinito
      await db.telematicaGiorno.update({ where: { id: r.id }, data: { rifornimentiDett: g.rifDett as unknown as Prisma.InputJsonValue, rifornimenti: g.rifornimenti, litri: g.litri } });
      fatte++;
    } catch { errori++; }
  });
  return { fatte, restano: await rifornimentiDaRiscaricare(mese), errori };
}

export type EsitoScarico = { giorno: string; mezzi: number; errori: number; messaggi: string[] };

export async function scaricaGiorno(giorno: string): Promise<EsitoScarico> {
  if (!/^\d{4}-\d\d-\d\d$/.test(giorno) || giorno > giornoRoma(new Date())) throw new Error("Giorno non valido");
  const esito: EsitoScarico = { giorno, mezzi: 0, errori: 0, messaggi: [] };
  for (const fonte of ["TARGA", "FLOTTAWEB"] as Fonte[]) {
    let token: string, elenco: Mezzo[];
    try { token = fonte === "TARGA" ? await accediTarga() : await accediFlottaweb(); elenco = await mezzi(fonte, token); }
    catch (e) { esito.errori++; esito.messaggi.push(`${fonte}: ${(e as Error).message}`); continue; }
    await aGruppi(elenco.filter((m) => m.targa), async (m) => {
      try {
        const g = await giornoDi(m, token, giorno);
        const dati = datiRiga(m, g);
        await db.telematicaGiorno.upsert({ where: { fonte_targa_giorno: { fonte, targa: m.targa, giorno } }, create: { fonte, targa: m.targa, giorno, ...dati }, update: dati });
        esito.mezzi++;
      } catch (e) { esito.errori++; if (esito.messaggi.length < 5) esito.messaggi.push(`${m.targa}: ${(e as Error).message}`); }
    });
  }
  // definitivo = scaricato dopo che il giorno è finito (dopo l'una di notte del giorno dopo): non serve rifarlo
  const definitivo = esito.errori === 0 && giorno < giornoRoma(new Date(Date.now() - 3600 * 1000));
  await db.telematicaScarico.upsert({ where: { giorno }, create: { giorno, mezzi: esito.mezzi, errori: esito.errori, definitivo }, update: { mezzi: esito.mezzi, errori: esito.errori, definitivo, finitoIl: new Date() } });
  return esito;
}

/** Scarico automatico della notte: il primo degli ultimi 3 giorni non ancora definitivo. Se sono tutti a posto non fa niente. */
export async function scaricoNotturno(): Promise<EsitoScarico | { fatto: false }> {
  const oggi = giornoRoma(new Date());
  // per non far crescere il database: delle giornate vecchie restano i numeri, le tappe si cancellano
  await db.telematicaGiorno.updateMany({ where: { giorno: { lt: piuGiorni(oggi, -GIORNI_TAPPE) }, tappe: { not: Prisma.DbNull } }, data: { tappe: Prisma.DbNull } });
  const giorni = [3, 2, 1].map((k) => piuGiorni(oggi, -k));
  const fatti = new Set((await db.telematicaScarico.findMany({ where: { giorno: { in: giorni }, definitivo: true }, select: { giorno: true } })).map((s) => s.giorno));
  const manca = giorni.find((g) => !fatti.has(g));
  return manca ? scaricaGiorno(manca) : { fatto: false };
}
