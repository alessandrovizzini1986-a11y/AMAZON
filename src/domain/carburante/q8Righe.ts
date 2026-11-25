/**
 * Transazioni Q8 riga per riga, dall'elaborazione mensile (EsitoQ8) alla tabella Q8Transazione: servono all'incrocio
 * con i rifornimenti visti dalla telematica. Solo calcoli: niente rete né database.
 *
 * Le celle data/ora di Excel non hanno fuso: le Date JS lette dal file hanno i componenti UTC uguali all'ora italiana
 * scritta nel file. Per questo qui si leggono sempre i componenti UTC.
 */
import type { Cell } from "@/domain/presenze/grid";

export type Q8TransazioneIn = {
  /**
   * Chiave client: pan intero|giorno|ora|litri|importo (+ "#2", "#3"… per righe uguali nello stesso file).
   * Non si salva così: il server la sostituisce con una chiave non reversibile (src/lib/carburante/chiave.ts).
   */
  chiave: string;
  /** AAAA-MM del file */
  mese: string;
  /** AAAA-MM-GG */
  giorno: string;
  /** HH:MM:SS, ora italiana */
  ora: string;
  station: string | null;
  /** PAN intero letto dal file: serve solo nel browser (storni) e al server per la chiave; si salva solo "…" + ultime 4 cifre */
  pan: string;
  identificativo: string | null;
  targaQ8: string | null;
  prodotto: string | null;
  litri: number;
  importo: number;
  importoNoIva: number;
  impianto: string | null;
  indirizzo: string | null;
  citta: string | null;
  km: number | null;
};

/** Lunghezze massime dei testi (le stesse controllate dal server al salvataggio). */
export const LUNGHEZZE_Q8 = { chiave: 200, station: 80, pan: 40, identificativo: 40, targaQ8: 40, prodotto: 80, impianto: 40, indirizzo: 200, citta: 120 } as const;
/**
 * Invio al server a parti (stessi limiti controllati dal server): righe al massimo per parte e transazioni al massimo per
 * file. L'ultima parte porta l'elenco di tutte le chiavi del file (~55 byte l'una con un PAN di 19 cifre): 12.000 chiavi
 * sono ~650 KB, sotto 1 MB di corpo della chiamata. Un mese vero ne ha qualche migliaio.
 */
export const LIMITI_INVIO_Q8 = { righePerParte: 1500, transazioniFile: 12_000 } as const;
/** km oltre questo valore sono un errore di battitura alla pompa (e non entrano in una colonna intera del database) */
const KM_MAX = 10_000_000;

const due = (n: number) => String(n).padStart(2, "0");
const r2 = (x: number) => Math.round(x * 100) / 100;
const MS_GIORNO = 86_400_000;
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

function giornoValido(a: number, m: number, g: number): string | null {
  if (a < 2000 || a > 2100) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g ? `${a}-${due(m)}-${due(g)}` : null;
}
function oraValida(h: number, m: number, s: number): string | null {
  return h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60 ? `${due(h)}:${due(m)}:${due(s)}` : null;
}
/** secondi dall'inizio del giorno → "HH:MM:SS" */
const oraDaSecondi = (sec: number) => oraValida(Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60);

type DataOra = { giorno: string | null; ora: string | null };

/** Una cella Date, numero seriale Excel o testo → giorno e ora (ognuno null se non c'è o non è valido). */
function leggiDataOra(v: Cell): DataOra {
  if (v instanceof Date) {
    const t = v.getTime();
    if (!Number.isFinite(t)) return { giorno: null, ora: null };
    const d = new Date(Math.round(t / 1000) * 1000); // Excel salva a volte 19:33:31.999
    return {
      giorno: giornoValido(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      ora: oraValida(d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()),
    };
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return { giorno: null, ora: null };
    const sec = Math.round(v * 86400);
    const giorni = Math.floor(sec / 86400);
    const d = new Date(EPOCA_EXCEL + giorni * MS_GIORNO);
    return { giorno: giorni >= 1 ? giornoValido(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) : null, ora: oraDaSecondi(sec % 86400) };
  }
  if (typeof v === "string") {
    const s = v.trim();
    const ora = (h?: string, m?: string, x?: string) => (h !== undefined && m !== undefined ? oraValida(Number(h), Number(m), Number(x ?? 0)) : null);
    // gg/mm/aaaa [hh:mm[:ss]]
    let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[\sT,]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/.exec(s);
    if (m) return { giorno: giornoValido(Number(m[3]), Number(m[2]), Number(m[1])), ora: ora(m[4], m[5], m[6]) };
    // aaaa-mm-gg [hh:mm[:ss]]
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(s);
    if (m) return { giorno: giornoValido(Number(m[1]), Number(m[2]), Number(m[3])), ora: ora(m[4], m[5], m[6]) };
    // hh:mm[:ss]
    m = /^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(s);
    if (m) return { giorno: null, ora: ora(m[1], m[2], m[3]) };
  }
  return { giorno: null, ora: null };
}

/** Giorno ("AAAA-MM-GG") di una cella Data dell'export Q8, o null. */
export const giornoQ8 = (v: Cell): string | null => leggiDataOra(v).giorno;

/** Numero da una cella: numeri, testi con virgola o punto decimale ("1.234,56", "36,76", "36.76"). */
export function numeroQ8(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[\s€]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // all'italiana: il punto separa le migliaia
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Testo senza spazi esterni (i numeri diventano testo), troncato alla lunghezza massima; vuoto → null. */
function testo(v: Cell, max: number): string | null {
  if (v === null || v === undefined) return null;
  let s: string;
  if (typeof v === "number") s = Number.isFinite(v) ? String(v) : "";
  else if (v instanceof Date) s = leggiDataOra(v).giorno ?? "";
  else s = String(v);
  s = s.trim();
  return s ? s.slice(0, max) : null;
}

const norm = (s: string) => s.normalize("NFC").trim();

/** Chiave client di una transazione, senza il "#n" delle righe uguali: pan|giorno|ora|litri|importo (2 decimali). */
export const chiaveClientBase = (t: { pan: string; giorno: string; ora: string; litri: number; importo: number }) =>
  `${t.pan}|${t.giorno}|${t.ora}|${t.litri.toFixed(2)}|${t.importo.toFixed(2)}`;

/**
 * Righe dell'elaborazione Q8 → transazioni da salvare. Colonne cercate per nome nell'intestazione.
 * Scarta le righe senza una data valida o senza litri. Uno storno (litri negativi) toglie il pagamento che annulla: stessa carta,
 * stessi litri e stesso importo, il più vicino prima dello storno. Righe identiche nello stesso file restano tutte, con "#2", "#3"…
 * La chiave client è: PAN intero | giorno | ora | litri | importo. Il server la sostituisce prima di salvare (chiaveQ8Da).
 */
export function transazioniDaEsito(e: { anno: number; mese: number; intestazione: string[]; righe: Cell[][] }): Q8TransazioneIn[] {
  const hdr = e.intestazione.map((h) => norm(String(h ?? "")));
  const col = (nome: string) => hdr.indexOf(norm(nome));
  const obbligatoria = (nome: string) => {
    const i = col(nome);
    if (i < 0) throw new Error(`nell'export Q8 manca la colonna "${nome}"`);
    return i;
  };
  const iPan = obbligatoria("PAN Carta"), iData = obbligatoria("Data"), iVolume = obbligatoria("Volume");
  const iOra = col("Ora"), iStation = col("STATION") >= 0 ? col("STATION") : col("Veicolo");
  const iTarga = col("Targa"), iIdent = col("Identificativo"), iProd = col("Prod."), iImp = col("Imp. Scontato"), iImpNoIva = col("Imp. Scontato no IVA");
  const iImpianto = col("Impianto"), iIndirizzo = col("Indirizzo"), iCitta = col("Città"), iKm = col("Km");
  const mese = `${e.anno}-${due(e.mese)}`;
  const cella = (r: Cell[], i: number): Cell => (i >= 0 ? r[i] ?? null : null);

  const visti = new Map<string, number>();
  const out: Q8TransazioneIn[] = [];
  const storni: { pan: string; litri: number; importo: number; quando: string }[] = [];
  for (const r of e.righe) {
    if (!r) continue;
    const data = leggiDataOra(cella(r, iData));
    if (!data.giorno) continue;
    const litriGrezzi = numeroQ8(cella(r, iVolume));
    if (litriGrezzi !== null && litriGrezzi < 0) {
      const oraS = leggiDataOra(cella(r, iOra)).ora ?? data.ora ?? "00:00:00";
      storni.push({ pan: testo(cella(r, iPan), LUNGHEZZE_Q8.pan) ?? "", litri: r2(-litriGrezzi), importo: r2(Math.abs(numeroQ8(cella(r, iImp)) ?? 0)), quando: `${data.giorno} ${oraS}` });
      continue;
    }
    if (litriGrezzi === null || !(litriGrezzi > 0)) continue;
    const litri = r2(litriGrezzi);
    if (!(litri > 0)) continue;
    const ora = leggiDataOra(cella(r, iOra)).ora ?? data.ora ?? "00:00:00";
    const importo = r2(numeroQ8(cella(r, iImp)) ?? 0);
    const importoNoIva = r2(numeroQ8(cella(r, iImpNoIva)) ?? 0);
    const pan = testo(cella(r, iPan), LUNGHEZZE_Q8.pan) ?? "";
    const kmGrezzi = numeroQ8(cella(r, iKm));
    const km = kmGrezzi !== null && Math.round(kmGrezzi) > 0 && Math.round(kmGrezzi) < KM_MAX ? Math.round(kmGrezzi) : null;
    const targa = testo(cella(r, iTarga), 200)?.toUpperCase().replace(/\s+/g, "").slice(0, LUNGHEZZE_Q8.targaQ8) || null;

    const base = chiaveClientBase({ pan, giorno: data.giorno, ora, litri, importo });
    const n = (visti.get(base) ?? 0) + 1;
    visti.set(base, n);
    out.push({
      chiave: n > 1 ? `${base}#${n}` : base, mese, giorno: data.giorno, ora,
      station: testo(cella(r, iStation), LUNGHEZZE_Q8.station), pan,
      identificativo: testo(cella(r, iIdent), LUNGHEZZE_Q8.identificativo), targaQ8: targa,
      prodotto: testo(cella(r, iProd), LUNGHEZZE_Q8.prodotto), litri, importo, importoNoIva,
      impianto: testo(cella(r, iImpianto), LUNGHEZZE_Q8.impianto), indirizzo: testo(cella(r, iIndirizzo), LUNGHEZZE_Q8.indirizzo),
      citta: testo(cella(r, iCitta), LUNGHEZZE_Q8.citta), km,
    });
  }
  // ogni storno annulla un pagamento uguale (stessa carta, litri e importo), il più vicino prima dello storno
  for (const s of storni) {
    const candidati = out.map((t, i) => ({ t, i })).filter(({ t }) => t.pan === s.pan && t.litri === s.litri && (s.importo === 0 || t.importo === s.importo) && `${t.giorno} ${t.ora}` <= s.quando);
    const scelto = candidati.sort((x, y) => `${y.t.giorno} ${y.t.ora}`.localeCompare(`${x.t.giorno} ${x.t.ora}`))[0];
    if (scelto) out.splice(scelto.i, 1);
  }
  return out;
}

/** byte di un valore scritto come JSON (UTF-8): quanto pesa nel corpo di una chiamata al server */
const pesoJson = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

/**
 * Divide le transazioni nelle parti da mandare al server, in ordine: al massimo `maxRighe` righe e `maxByte` byte per parte.
 * L'ultima parte porta anche le chiavi di tutto il file (il server toglie le righe del mese che non ci sono): se con le sue
 * righe supera `maxByte`, le chiavi vanno da sole in una parte in più, senza righe. Nessuna transazione → nessuna parte.
 */
export function partiDaInviare(righe: Q8TransazioneIn[], maxRighe = 1000, maxByte = 800_000): { parti: Q8TransazioneIn[][]; chiavi: string[] } {
  const chiavi = righe.map((r) => r.chiave);
  if (!righe.length) return { parti: [], chiavi };
  const quante = righe.length.toLocaleString("it-IT");
  if (righe.length > LIMITI_INVIO_Q8.transazioniFile) {
    throw new Error(`il file ha troppe transazioni per salvarle in una volta (${quante}, al massimo ${LIMITI_INVIO_Q8.transazioniFile.toLocaleString("it-IT")})`);
  }
  const pesoChiavi = pesoJson(chiavi);
  if (pesoChiavi > maxByte) throw new Error(`il file ha troppe transazioni per salvarle in una volta (${quante}): l'elenco è troppo pesante`);
  const max = Math.max(1, Math.min(maxRighe, LIMITI_INVIO_Q8.righePerParte));
  const parti: Q8TransazioneIn[][] = [];
  let pezzo: Q8TransazioneIn[] = [], byte = 0;
  for (const r of righe) {
    const b = pesoJson(r) + 1;
    if (pezzo.length && (pezzo.length >= max || byte + b > maxByte)) { parti.push(pezzo); pezzo = []; byte = 0; }
    pezzo.push(r); byte += b;
  }
  parti.push(pezzo);
  if (byte + pesoChiavi > maxByte) parti.push([]);
  return { parti, chiavi };
}
