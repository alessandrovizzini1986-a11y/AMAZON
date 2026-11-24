/**
 * Scarico di un giorno: per ogni mezzo dei due portali legge il percorso di quel giorno e salva una riga (km, orari, tempi, soste,
 * rifornimenti, tappe). I portali danno un mezzo alla volta: qui si fanno le letture in parallelo a piccoli gruppi.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fusoRoma, giornoDaFlottaweb, giornoDaTarga, giornoRoma, piuGiorni, type GiornoMezzo } from "@/domain/telematica";
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
    const f = fusoRoma(giorno);
    return giornoDaTarga(await leggiTarga(token, `/route/${m.id}`, { begin: `${giorno}T00:00:00.000${f}`, end: `${giorno}T23:59:59.999${f}`, timezone: "Europe/Rome", showIdlingSegments: "true", showDriverName: "true" }));
  }
  return giornoDaFlottaweb(await leggiFlottaweb(token, "/gps/getpositions", { unitid: m.id, da: `${giorno} 00:00:00`, a: `${giorno} 23:59:59` }), giorno);
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
        const dati = {
          idMezzo: m.id, km: g.km, inizio: g.inizio ? new Date(g.inizio) : null, fine: g.fine ? new Date(g.fine) : null, guidaSec: g.guidaSec, motoreSec: g.motoreSec, fermoMotoreAccSec: g.fermoMotoreAccSec,
          velMax: g.velMax, punteggioSicurezza: g.punteggioSicurezza, soste: g.soste, rifornimenti: g.rifornimenti, litri: g.litri, kmContatore: g.kmContatore, autista: g.autista,
          tappe: g.tappe.length ? (g.tappe as unknown as Prisma.InputJsonValue) : Prisma.DbNull, scaricatoIl: new Date(),
        };
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
  const giorni = [3, 2, 1].map((k) => piuGiorni(oggi, -k));
  const fatti = new Set((await db.telematicaScarico.findMany({ where: { giorno: { in: giorni }, definitivo: true }, select: { giorno: true } })).map((s) => s.giorno));
  const manca = giorni.find((g) => !fatti.has(g));
  return manca ? scaricaGiorno(manca) : { fatto: false };
}
