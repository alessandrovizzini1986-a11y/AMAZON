/**
 * Riconciliazione carburante: pagamenti con le carte Q8 contro i rifornimenti visti dalla telematica (Targa).
 * Solo calcoli: niente rete né database.
 *
 * Il punto difficile: in DER2 e GLS le carte sono del driver (AMZxxx, GLSxxx), non del furgone. Il furgone si ricostruisce
 * dall'ora, dai litri e dal luogo: per ogni flotta e gruppo di pagamenti vicini nel tempo si cerca l'abbinamento che
 * costa meno in assoluto (algoritmo ungherese), così due furgoni che fanno gasolio alla stessa pompa negli stessi minuti
 * non si scambiano.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Tolleranze: da tarare dopo le prime prove sui mesi di agosto–ottobre.
export const TOLLERANZE = {
  /** minuti massimi tra il pagamento Q8 e il rifornimento visto da Targa */
  finestraMin: 30,
  /** a volte Targa registra il rifornimento più tardi (alla ripartenza): stesso furgone e stessi litri entro questi minuti */
  ritardoMaxMin: 120,
  /** se il luogo non coincide, la coppia vale solo se ora e pagamento sono così vicini (altrimenti sono due rifornimenti diversi) */
  luogoDiversoMaxMin: 10,
  /** differenza di litri accettata: la più larga tra questa… */
  litriAssoluti: 3,
  /** …e questa percentuale dei litri pagati (il galleggiante del serbatoio non è preciso come la pompa) */
  litriPercento: 0.05,
  /** distanza massima tra il furgone e il distributore, quando si conoscono le coordinate */
  raggioKm: 2,
  /** minuti attorno al pagamento in cui un furgone fermo al distributore conta come "presente" */
  sostaMin: 15,
  /** una sosta al distributore dura al massimo tanto: le soste lunghe sono parcheggi (anche vicino a una pompa) */
  sostaMaxMin: 45,
  /** sotto questi litri il sensore può non accorgersi del rifornimento: il pagamento non si può verificare */
  sensoreMinLitri: 8,
  /** un luogo (via) imparato per un distributore vale se visto almeno tante volte */
  luogoMinVolte: 2,
  /** "furgone abituale" di una carta: almeno tante volte e almeno questa quota dei suoi rifornimenti abbinati */
  abitualeMinVolte: 3,
  abitualeMinQuota: 0.7,
} as const;

/** Flotte controllate. "sensore" = la telematica misura il gasolio che entra nel serbatoio. */
export const FLOTTE = {
  DER2: { sensore: true, nota: "" },
  GLS: { sensore: false, nota: "I furgoni GLS con telematica non misurano il gasolio che entra nel serbatoio: si può solo vedere quale furgone era al distributore." },
} as const;
export type Flotta = keyof typeof FLOTTE;
export const ELENCO_FLOTTE = Object.keys(FLOTTE) as Flotta[];

/** Prodotti che non vanno nel serbatoio del gasolio: non si verificano. */
const NON_SERBATOIO = /AD\s*BLUE|ADBLUE|LUBRIF|LAVAGG/i;

// ---------------------------------------------------------------------------------------------------------------------
export type Q8Tx = {
  chiave: string; flotta: Flotta; giorno: string; /** HH:MM:SS o HH:MM, ora italiana */ ora: string;
  identificativo: string | null; litri: number; importoNoIva: number; prodotto: string | null;
  impianto: string | null; indirizzo: string | null; citta: string | null; km: number | null;
};
export type EventoTarga = {
  targa: string; flotta: Flotta; giorno: string; /** HH:MM, ora italiana ("" se Targa non l'ha data) */ ora: string;
  litri: number; dove: string | null; lat?: number | null; lng?: number | null;
};
/** Copertura della telematica: per flotta e giorno, se i dati ci sono e se i rifornimenti hanno l'ora. */
export type Copertura = { flotta: Flotta; giorno: string; scaricato: boolean; dettaglioCompleto: boolean };

export type Stato = "SERBATOIO_FERMO" | "LITRI" | "LUOGO" | "SENZA_Q8" | "REGOLARE" | "NON_VERIFICABILE";
export const ORDINE_STATI: Stato[] = ["SERBATOIO_FERMO", "LITRI", "LUOGO", "SENZA_Q8", "REGOLARE", "NON_VERIFICABILE"];
export const ETICHETTA_STATO: Record<Stato, string> = {
  SERBATOIO_FERMO: "Carta usata, serbatoio fermo",
  LITRI: "Discrepanza litri",
  LUOGO: "Luogo diverso",
  SENZA_Q8: "Rifornimento senza Q8",
  REGOLARE: "Regolare",
  NON_VERIFICABILE: "Non verificabile",
};
export type EsitoLuogo = "UGUALE" | "VICINO" | "DIVERSO" | "IGNOTO";

export type Riga = {
  /** chiave stabile per "Giustifica / Archivia" */
  chiave: string;
  stato: Stato;
  flotta: Flotta;
  giorno: string;
  q8: Q8Tx[];
  eventi: EventoTarga[];
  /** furgone: dal rifornimento abbinato o, per "serbatoio fermo", dal furgone che era al distributore */
  targa: string | null;
  oraQ8: string | null;
  oraTarga: string | null;
  litriQ8: number | null;
  litriTarga: number | null;
  /** litri Targa − litri Q8: negativo = pagati più litri di quelli entrati */
  deltaLitri: number | null;
  /** valore stimato dell'ammanco, IVA esclusa (solo quando mancano litri) */
  euro: number | null;
  luogoQ8: string | null;
  luogoTarga: string | null;
  luogo: EsitoLuogo;
  distanzaKm: number | null;
  /** spiegazione in una frase */
  motivo: string;
  /** furgone abituale della carta, se c'è */
  abituale: { targa: string; volte: number; su: number } | null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Testo: comuni e vie

const senzaAccenti = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
/** maiuscolo, senza accenti né punteggiatura, spazi singoli */
export function pulisci(s: string | null | undefined): string {
  return senzaAccenti(String(s ?? "")).toUpperCase().replace(/…/g, " ").replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
/** Comune del distributore Q8: "CESENATICO LOC.BAGNAROLA" → "CESENATICO", "S. GIOVANNI IN M." → "SAN GIOVANNI IN M", "FORLI'" → "FORLI". */
export function comuneQ8(citta: string | null | undefined): string {
  let s = senzaAccenti(String(citta ?? "")).toUpperCase();
  s = s.split(/\s+-\s+|\(|,|\bLOC\b\.?|\bLOCALITA\b|\bFRAZ\b\.?|\bFRAZIONE\b/)[0];
  s = s.replace(/\bS\.\s*/g, "SAN ").replace(/\bSS\.\s*/g, "SANTI ").replace(/\bSTA\.?\s+/g, "SANTA ");
  return pulisci(s);
}
const PAROLE_VUOTE = new Set(["VIA", "VIALE", "PIAZZA", "PIAZZALE", "STRADA", "STATALE", "PROVINCIALE", "COMUNALE", "CORSO", "LARGO", "VICOLO", "LOC", "LOCALITA", "FRAZ", "FRAZIONE", "ANGOLO", "SNC", "IMP", "IMPIANTO", "DELLA", "DELLE", "DELLO", "DEGLI", "DEL", "DEI", "NAZIONALE", "VARIANTE", "TANGENZIALE", "USCITA", "ITALIA", "EMILIA ROMAGNA", "AREA", "SERVIZIO", "SERVIZI"]);
/** Parole che identificano la via: almeno 4 lettere, senza numeri, senza parole generiche. */
export function paroleVia(s: string | null | undefined): Set<string> {
  return new Set(pulisci(s).split(" ").filter((w) => w.length >= 4 && !/\d/.test(w) && !PAROLE_VUOTE.has(w)));
}
/** Indirizzo di Targa ("Via Emilia, 12, Santarcangelo Di Romagna, Rn, Emilia-romagna, Italia") → via e pezzi successivi. */
function partiTarga(dove: string | null | undefined): { via: string; pezzi: string[]; troncato: boolean } {
  const grezzo = String(dove ?? "");
  const pezzi = grezzo.split(",").map((x) => pulisci(x)).filter(Boolean);
  return { via: pezzi[0] ?? "", pezzi: pezzi.slice(1), troncato: grezzo.trim().endsWith("…") };
}
/** Il comune del distributore compare nell'indirizzo di Targa? Gestisce gli indirizzi troncati ("…, San Gio…"). */
export function stessoComune(citta: string | null | undefined, dove: string | null | undefined): boolean {
  const c = comuneQ8(citta);
  if (!c) return false;
  const { via, pezzi: dopo, troncato } = partiTarga(dove);
  const pezzi = [via, ...dopo];
  return pezzi.some((p, i) => p === c || (p.length >= 5 && (c.startsWith(p + " ") || p.startsWith(c + " "))) || (troncato && i === pezzi.length - 1 && p.length >= 4 && c.startsWith(p)));
}
/** Chiave di un luogo di Targa: via + comune (senza civico), per imparare dove sta un distributore. */
export function chiaveLuogo(dove: string | null | undefined): string | null {
  const { via, pezzi } = partiTarga(dove);
  if (!via) return null;
  const comune = pezzi.find((p) => !/^\d/.test(p) && p.length > 2) ?? "";
  return `${via}|${comune}`;
}

/** distanza in km tra due coordinate */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------------------------------------------------------------
// Tempo: minuti assoluti, così una coppia a cavallo della mezzanotte resta vicina

const GIORNO0 = Date.UTC(2020, 0, 1);
export function minuti(giorno: string, ora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(ora ?? "");
  if (!m || !/^\d{4}-\d\d-\d\d$/.test(giorno)) return null;
  const g = Math.round((Date.parse(`${giorno}T00:00:00Z`) - GIORNO0) / 86_400_000);
  return g * 1440 + Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0);
}
const hhmm = (ora: string | null | undefined) => (ora ? ora.slice(0, 5) : null);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
export const tolleranzaLitri = (litriPagati: number) => Math.max(TOLLERANZE.litriAssoluti, TOLLERANZE.litriPercento * Math.abs(litriPagati));

// ---------------------------------------------------------------------------------------------------------------------
// Abbinamento a costo minimo (algoritmo ungherese, matrice quadrata)

/** Assegna a ogni riga una colonna minimizzando la somma dei costi. Torna, per ogni riga, l'indice della colonna. */
export function ungherese(costo: number[][]): number[] {
  const n = costo.length;
  if (!n) return [];
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), via = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF), usato = new Array(n + 1).fill(false);
    do {
      usato[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (usato[j]) continue;
        const cur = costo[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; via[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (usato[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = via[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ris = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) ris[p[j] - 1] = j - 1;
  return ris;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cosa si impara dai dati del mese

type Appreso = {
  /** carta → furgone → volte */
  carte: Map<string, Map<string, number>>;
  /** distributore Q8 → luogo Targa (via|comune) → volte */
  luoghi: Map<string, Map<string, number>>;
  /** distributore Q8 → coordinate viste ai rifornimenti sicuri */
  coordinate: Map<string, { lat: number; lng: number }[]>;
  /** distributore Q8 → comune (o frazione) che Targa scrive per quel distributore → volte */
  comuni: Map<string, Map<string, number>>;
  /** carta → pagamenti verificabili del mese (abbinati o no): la quota del furgone abituale si misura su questi */
  pagamenti: Map<string, number>;
};

export type Q8i = Q8Tx & { t: number };
export type Evi = EventoTarga & { t: number; i: number };

const AUTOSTRADA = /AUTOSTRAD|\bADS\b|\bA\s?\d{1,2}\b|RACCORDO/i;
/** la via del distributore e quella di Targa hanno una parola in comune (es. EMILIA, BERLINGUER) */
const viaInComune = (indirizzo: string | null | undefined, dove: string | null | undefined) => { const pq = paroleVia(indirizzo), pt = paroleVia(partiTarga(dove).via); return [...pq].some((w) => pt.has(w)); };
/**
 * Dove sta un distributore secondo i rifornimenti sicuri: il gruppo più numeroso di punti entro il raggio. Servono almeno 3
 * punti e il gruppo deve essere la maggioranza: un abbinamento sbagliato non sposta il centro, punti sparsi non contano.
 */
export function centroDistributore(punti: { lat: number; lng: number }[] | undefined): { lat: number; lng: number } | null {
  if (!punti || punti.length < 3) return null;
  let migliore: { lat: number; lng: number }[] = [];
  for (const p of punti) { const vicini = punti.filter((x) => km(p, x) <= TOLLERANZE.raggioKm); if (vicini.length > migliore.length) migliore = vicini; }
  if (migliore.length < 3 || migliore.length / punti.length < 0.6) return null;
  return { lat: mediana(migliore.map((x) => x.lat)), lng: mediana(migliore.map((x) => x.lng)) };
}
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Dove ha fatto rifornimento il furgone rispetto al distributore Q8: coordinate se le conosciamo, altrimenti comune e via. */
function valutaLuogo(q: Q8Tx, e: EventoTarga, app: Appreso, cache?: Map<string, { esito: EsitoLuogo; distanza: number | null }>): { esito: EsitoLuogo; distanza: number | null } {
  const k0 = `${q.impianto}|${q.indirizzo}|${q.citta}|${e.dove}|${e.lat}|${e.lng}`;
  const giaFatto = cache?.get(k0);
  if (giaFatto) return giaFatto;
  const fatto = ((): { esito: EsitoLuogo; distanza: number | null } => {
    const c = q.impianto ? centroDistributore(app.coordinate.get(q.impianto)) : null;
    if (c && e.lat != null && e.lng != null) {
      const d = r1(km(c, { lat: e.lat, lng: e.lng }));
      return { esito: d <= TOLLERANZE.raggioKm ? "UGUALE" : "DIVERSO", distanza: d };
    }
    if (!e.dove) return { esito: "IGNOTO", distanza: null };
    const k = chiaveLuogo(e.dove), visti = q.impianto ? app.luoghi.get(q.impianto) : undefined;
    if (k && visti && (visti.get(k) ?? 0) >= TOLLERANZE.luogoMinVolte) return { esito: "UGUALE", distanza: null };
    const comune = stessoComune(q.citta, e.dove), stessaVia = viaInComune(q.indirizzo, e.dove);
    if (comune) return { esito: stessaVia ? "UGUALE" : "VICINO", distanza: null };
    // comune (o frazione) che Targa ha già scritto altre volte per questo distributore
    const comuneTarga = k ? k.split("|")[1] || k.split("|")[0] : "", noti = q.impianto ? app.comuni.get(q.impianto) : undefined;
    if (comuneTarga && noti && (noti.get(comuneTarga) ?? 0) >= TOLLERANZE.luogoMinVolte) return { esito: "VICINO", distanza: null };
    // comune diverso ma stessa strada (frazioni, confini comunali) o stessa autostrada: non basta per dire "altrove"
    if (stessaVia || (AUTOSTRADA.test(q.indirizzo ?? "") && AUTOSTRADA.test(partiTarga(e.dove).via))) return { esito: "VICINO", distanza: null };
    return { esito: "DIVERSO", distanza: null };
  })();
  cache?.set(k0, fatto);
  return fatto;
}

/** Un indirizzo di Targa è quello del distributore? Serve la via (non basta il comune: il deposito è nello stesso comune). */
function alDistributore(q: Q8Tx, dove: string | null | undefined, app: Appreso): boolean {
  if (!dove) return false;
  const k = chiaveLuogo(dove), visti = q.impianto ? app.luoghi.get(q.impianto) : undefined;
  if (k && visti && (visti.get(k) ?? 0) >= TOLLERANZE.luogoMinVolte) return true;
  return stessoComune(q.citta, dove) && viaInComune(q.indirizzo, dove);
}

/**
 * Furgone abituale di una carta. "rigoroso" misura la quota su tutti i pagamenti della carta nel mese (anche quelli fatti a
 * furgoni senza telematica): serve per accusare un "serbatoio fermo". Senza "rigoroso" la quota è sui soli pagamenti
 * abbinati: basta come indizio per scegliere tra furgoni che fanno gasolio insieme.
 */
function abitualeDi(carta: string | null, app: Appreso, rigoroso = false): { targa: string; volte: number; su: number } | null {
  const m = carta ? app.carte.get(carta) : undefined;
  if (!m) return null;
  let abbinati = 0, best: [string, number] | null = null;
  for (const [t, n] of m) { abbinati += n; if (!best || n > best[1]) best = [t, n]; }
  const su = rigoroso ? Math.max(abbinati, app.pagamenti.get(carta!) ?? 0) : abbinati;
  if (!best || best[1] < TOLLERANZE.abitualeMinVolte || best[1] / su < TOLLERANZE.abitualeMinQuota) return null;
  return { targa: best[0], volte: best[1], su };
}

/** Coppie "sicure" (una sola candidata da entrambe le parti, ora e litri vicini): insegnano dove stanno i distributori. */
function impara(q8: Q8i[], ev: Evi[]): Appreso {
  const app: Appreso = { carte: new Map(), luoghi: new Map(), coordinate: new Map(), comuni: new Map(), pagamenti: new Map() };
  for (const q of q8) if (q.identificativo && q.litri >= TOLLERANZE.sensoreMinLitri) app.pagamenti.set(q.identificativo, (app.pagamenti.get(q.identificativo) ?? 0) + 1);
  const perFlotta = new Map<string, Evi[]>();
  for (const e of ev) perFlotta.set(e.flotta, [...(perFlotta.get(e.flotta) ?? []), e]);
  const vicini = (q: Q8i) => (perFlotta.get(q.flotta) ?? []).filter((e) => Math.abs(e.t - q.t) <= TOLLERANZE.finestraMin && Math.abs(e.litri - q.litri) <= tolleranzaLitri(q.litri));
  const cand = new Map(q8.map((q) => [q.chiave, vicini(q)]));
  const perEvento = new Map<number, number>();
  for (const c of cand.values()) for (const e of c) perEvento.set(e.i, (perEvento.get(e.i) ?? 0) + 1);
  for (const q of q8) {
    const c = cand.get(q.chiave)!;
    if (c.length !== 1 || perEvento.get(c[0].i) !== 1 || Math.abs(c[0].t - q.t) > 10) continue;
    const e = c[0];
    if (!q.impianto) continue;
    const k = chiaveLuogo(e.dove);
    if (k) {
      const m = app.luoghi.get(q.impianto) ?? new Map(); m.set(k, (m.get(k) ?? 0) + 1); app.luoghi.set(q.impianto, m);
    }
    if (e.lat != null && e.lng != null) { const l = app.coordinate.get(q.impianto) ?? []; l.push({ lat: e.lat, lng: e.lng }); app.coordinate.set(q.impianto, l); }
  }
  return app;
}

/** lasciare da solo un pagamento o un rifornimento costa questo: una coppia molto peggiore resta separata */
const COSTO_SOLO = 2.5;

/** Abbinamento a costo minimo, flotta per flotta, su gruppi di pagamenti e rifornimenti collegati entro la finestra. */
function assegna(q8: Q8i[], ev: Evi[], app: Appreso): [Q8i, Evi][] {
  const cache = new Map<string, { esito: EsitoLuogo; distanza: number | null }>();
  const costo = (q: Q8i, e: Evi) => {
    const dt = Math.abs(q.t - e.t);
    if (dt > TOLLERANZE.finestraMin) return Number.POSITIVE_INFINITY;
    const dl = Math.abs(q.litri - e.litri) / tolleranzaLitri(q.litri);
    const luogo = valutaLuogo(q, e, app, cache).esito;
    if (luogo === "DIVERSO" && dt > TOLLERANZE.luogoDiversoMaxMin) return Number.POSITIVE_INFINITY;
    const pLuogo = luogo === "UGUALE" ? -0.5 : luogo === "VICINO" ? 0 : luogo === "IGNOTO" ? 0.2 : 1.5;
    const abit = abitualeDi(q.identificativo, app);
    return dt / TOLLERANZE.finestraMin + Math.min(dl, 4) + pLuogo + (abit && abit.targa === e.targa ? -0.7 : 0);
  };
  const coppie: [Q8i, Evi][] = [];
  for (const fl of ELENCO_FLOTTE) {
    const qs = q8.filter((q) => q.flotta === fl).sort((a, b) => a.t - b.t);
    const es = ev.filter((e) => e.flotta === fl).sort((a, b) => a.t - b.t);
    // gruppi collegati (a catena): union-find su "pagamento i – rifornimento j entro la finestra"
    const padre = Array.from({ length: qs.length + es.length }, (_, k) => k);
    const trova = (k: number): number => { while (padre[k] !== k) { padre[k] = padre[padre[k]]; k = padre[k]; } return k; };
    let inizio = 0;
    qs.forEach((q, i) => {
      while (inizio < es.length && es[inizio].t < q.t - TOLLERANZE.finestraMin) inizio++;
      for (let j = inizio; j < es.length && es[j].t <= q.t + TOLLERANZE.finestraMin; j++) { const a = trova(i), b = trova(qs.length + j); if (a !== b) padre[a] = b; }
    });
    const gruppi = new Map<number, { q: number[]; e: number[] }>();
    for (let k = 0; k < qs.length + es.length; k++) {
      const r = trova(k), g = gruppi.get(r) ?? { q: [], e: [] };
      if (k < qs.length) g.q.push(k); else g.e.push(k - qs.length);
      gruppi.set(r, g);
    }
    for (const g of gruppi.values()) {
      if (!g.q.length || !g.e.length) continue;
      const n = g.q.length, m = g.e.length, N = n + m, GRANDE = 1e6;
      // righe: pagamenti, poi un "posto vuoto" per ogni rifornimento; colonne: rifornimenti, poi un "posto vuoto" per ogni pagamento
      const c: number[][] = Array.from({ length: N }, () => new Array(N).fill(GRANDE));
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < m; b++) { const x = costo(qs[g.q[a]], es[g.e[b]]); if (Number.isFinite(x)) c[a][b] = x; }
        c[a][m + a] = COSTO_SOLO;
      }
      for (let b = 0; b < m; b++) { c[n + b][b] = COSTO_SOLO; for (let a = 0; a < n; a++) c[n + b][m + a] = 0; }
      const ass = ungherese(c);
      for (let a = 0; a < n; a++) if (ass[a] < m && c[a][ass[a]] < GRANDE) coppie.push([qs[g.q[a]], es[g.e[ass[a]]]]);
    }
  }
  return coppie;
}

export type Preparato = { q8: Q8i[]; ev: Evi[]; app: Appreso; coppie: [Q8i, Evi][] };

/**
 * Prima fase: abbina pagamenti e rifornimenti in due passate. La prima impara da sola quale furgone usa di solito ogni
 * carta; la seconda usa quell'informazione per non scambiare i furgoni che fanno gasolio insieme.
 */
export function abbina(q8in: Q8Tx[], evIn: EventoTarga[]): Preparato {
  const q8: Q8i[] = q8in.map((q) => ({ ...q, t: minuti(q.giorno, q.ora) ?? Number.NaN })).filter((q) => Number.isFinite(q.t));
  const ev: Evi[] = evIn.map((e, i) => ({ ...e, t: minuti(e.giorno, e.ora) ?? Number.NaN, i })).filter((e) => Number.isFinite(e.t));
  // anche i pagamenti delle flotte senza sensore entrano nell'abbinamento: se Targa vede un rifornimento, lo si attribuisce;
  // quelli che restano soli si dichiarano non verificabili (vedi sotto), non "serbatoio fermo"
  const verificabili = q8.filter((q) => !NON_SERBATOIO.test(q.prodotto ?? "") && q.flotta in FLOTTE);
  const app = impara(verificabili, ev);
  const prima = assegna(verificabili, ev, app);
  // dagli abbinamenti buoni della prima passata: il furgone abituale di ogni carta e i comuni (o frazioni) dei distributori
  for (const [q, e] of prima) {
    if (Math.abs(q.t - e.t) > 15 || Math.abs(q.litri - e.litri) > tolleranzaLitri(q.litri)) continue;
    if (q.identificativo) {
      const m = app.carte.get(q.identificativo) ?? new Map<string, number>();
      m.set(e.targa, (m.get(e.targa) ?? 0) + 1);
      app.carte.set(q.identificativo, m);
    }
    const k = chiaveLuogo(e.dove);
    if (q.impianto && k && Math.abs(q.t - e.t) <= TOLLERANZE.luogoDiversoMaxMin) {
      const c = app.comuni.get(q.impianto) ?? new Map<string, number>(), comune = k.split("|")[1] || k.split("|")[0];
      c.set(comune, (c.get(comune) ?? 0) + 1); app.comuni.set(q.impianto, c);
    }
  }
  return { q8, ev, app, coppie: assegna(verificabili, ev, app) };
}

/** Le giornate (furgone, giorno) di cui servono le tappe: i furgoni abituali delle carte rimaste senza rifornimento. */
export function tappeNecessarie(p: Preparato): { targa: string; giorno: string }[] {
  const usati = new Set(p.coppie.map(([q]) => q.chiave)), fuori = new Map<string, { targa: string; giorno: string }>();
  for (const q of p.q8) {
    if (usati.has(q.chiave)) continue;
    const a = abitualeDi(q.identificativo, p.app);
    if (a) fuori.set(`${a.targa}|${q.giorno}`, { targa: a.targa, giorno: q.giorno });
  }
  return [...fuori.values()];
}

/** Tappe di una giornata; null = la giornata c'è ma il percorso non è più conservato (oltre 120 giorni). */
export type GiornataTappe = { targa: string; giorno: string; tappe: { t: "G" | "S"; da: string; a: string; km?: number; dove: string | null }[] | null };
export type Ingresso = {
  q8: Q8Tx[];
  eventi: EventoTarga[];
  /** tappe delle giornate chieste da tappeNecessarie (le altre non servono) */
  tappe: GiornataTappe[];
  copertura: Copertura[];
  /** istante dell'ultima transazione del file Q8 del mese ("AAAA-MM-GG HH:MM[:SS]"), per flotta (null = nessun file del mese) */
  ultimoGiornoQ8: Partial<Record<Flotta, string | null>>;
};
export type Esito = { righe: Riga[]; appreso: { carteAbituali: number; distributoriLocalizzati: number } };

/**
 * Il furgone è passato dal distributore attorno all'ora del pagamento? Vale solo una sosta breve (al massimo sostaMaxMin)
 * in un posto che è il distributore: ci arriva e riparte presto, o ci sta fermo poco. Le soste lunghe (il parcheggio della
 * notte, anche se è nella stessa via della pompa) non contano. Le "guide" di 0 km di Targa sono soste.
 * Torna null se non passa, "SENZA_PERCORSO" se il percorso non è più disponibile.
 */
function passaggio(q: Q8i, g: GiornataTappe | undefined, app: Appreso): string | null {
  if (!g) return null;
  if (!g.tappe) return "SENZA_PERCORSO";
  // soste e guide con i minuti; le guide di 0 km diventano soste; soste consecutive si uniscono
  const pezzi: { t: "G" | "S"; da: number; a: number; daT: string; aT: string; dove: string | null }[] = [];
  for (const s of g.tappe) {
    const da = minuti(g.giorno, s.da), a0 = minuti(g.giorno, s.a);
    if (da === null || a0 === null) continue;
    const t = s.t === "G" && (s.km ?? 1) < 0.05 ? "S" : s.t, a = a0 < da ? a0 + 1440 : a0, ultimo = pezzi.at(-1);
    if (t === "S" && ultimo?.t === "S") { ultimo.a = a; ultimo.aT = s.a; ultimo.dove = ultimo.dove ?? s.dove; continue; }
    pezzi.push({ t, da, a, daT: s.da, aT: s.a, dove: s.dove });
  }
  for (const s of pezzi) {
    if (s.t !== "S" || s.a - s.da > TOLLERANZE.sostaMaxMin || !alDistributore(q, s.dove, app)) continue;
    if (s.da - TOLLERANZE.sostaMin <= q.t && q.t <= s.a + TOLLERANZE.sostaMin) return `fermo al distributore ${s.daT}–${s.aT}`;
  }
  return null;
}

export function riconcilia(input: Ingresso, pre?: Preparato): Esito {
  const { q8, ev, app, coppie } = pre ?? abbina(input.q8, input.eventi);
  const usatiQ = new Set(coppie.map(([q]) => q.chiave)), usatiE = new Set(coppie.map(([, e]) => e.i));
  // gruppi: un rifornimento con più pagamenti (scontrino doppio), un pagamento con più letture (rifornimento spezzato)
  const gruppi = coppie.map(([q, e]) => ({ q: [q], e: [e] }));
  for (const g of gruppi) {
    const q0 = g.q[0], e0 = g.e[0];
    let sq = q0.litri;
    const se = e0.litri;
    if (se - sq > tolleranzaLitri(sq)) {
      // più gasolio entrato che pagato: c'è un altro pagamento della stessa carta (o allo stesso distributore) lì vicino?
      for (const q of q8) {
        if (usatiQ.has(q.chiave) || q.flotta !== q0.flotta || Math.abs(q.t - e0.t) > TOLLERANZE.finestraMin || NON_SERBATOIO.test(q.prodotto ?? "")) continue;
        if (!(q.identificativo && q.identificativo === q0.identificativo) && !(q.impianto && q.impianto === q0.impianto)) continue;
        if (Math.abs(se - (sq + q.litri)) <= tolleranzaLitri(sq + q.litri)) { g.q.push(q); usatiQ.add(q.chiave); sq += q.litri; break; }
      }
    } else if (sq - se > tolleranzaLitri(sq)) {
      // pagato più di quanto letto: il sensore ha spezzato il rifornimento in due letture?
      for (const e of ev) {
        if (usatiE.has(e.i) || e.targa !== e0.targa || Math.abs(e.t - q0.t) > TOLLERANZE.finestraMin) continue;
        if (Math.abs(se + e.litri - sq) <= tolleranzaLitri(sq)) { g.e.push(e); usatiE.add(e.i); break; }
      }
    }
  }

  // rifornimento letto in ritardo: pagamento e rifornimento rimasti soli, stesso furgone abituale (o stesso luogo) e stessi litri
  const ritardi = new Map<string, number>();
  for (const q of [...q8].sort((a, b) => a.t - b.t)) {
    if (usatiQ.has(q.chiave) || NON_SERBATOIO.test(q.prodotto ?? "")) continue;
    const abit = abitualeDi(q.identificativo, app);
    const cand = ev.filter((e) => !usatiE.has(e.i) && e.flotta === q.flotta && e.t > q.t + TOLLERANZE.finestraMin && e.t - q.t <= TOLLERANZE.ritardoMaxMin
      && Math.abs(e.litri - q.litri) <= tolleranzaLitri(q.litri) && ((abit && abit.targa === e.targa) || valutaLuogo(q, e, app).esito === "UGUALE"));
    if (cand.length !== 1) continue;
    const e = cand[0];
    usatiQ.add(q.chiave); usatiE.add(e.i); gruppi.push({ q: [q], e: [e] }); ritardi.set(q.chiave, Math.round(e.t - q.t));
  }

  const righe: Riga[] = [];
  const fmtL = (x: number) => x.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  const cache = new Map<string, { esito: EsitoLuogo; distanza: number | null }>();

  for (const g of gruppi) {
    const q0 = g.q[0], e0 = g.e[0];
    const litriQ8 = r2(g.q.reduce((s, q) => s + q.litri, 0)), litriTarga = r1(g.e.reduce((s, e) => s + e.litri, 0));
    const noIva = g.q.reduce((s, q) => s + q.importoNoIva, 0), prezzo = litriQ8 > 0 ? noIva / litriQ8 : 0;
    const delta = r1(litriTarga - litriQ8), tol = tolleranzaLitri(litriQ8);
    const rit = ritardi.get(q0.chiave);
    // con il ritardo Targa scrive il luogo dove il furgone si è fermato dopo: il luogo non si confronta
    const luogo = rit !== undefined ? { esito: "IGNOTO" as EsitoLuogo, distanza: null } : valutaLuogo(q0, e0, app, cache);
    let stato: Stato = "REGOLARE", motivo = "Pagamento e rifornimento coincidono.", euro: number | null = null;
    const sensore = FLOTTE[q0.flotta]?.sensore ?? true;
    if (delta < -tol && sensore) {
      stato = "LITRI"; euro = r2(-delta * prezzo);
      motivo = `Pagati ${fmtL(litriQ8)} L, nel serbatoio ne sono entrati ${fmtL(litriTarga)}: mancano ${fmtL(-delta)} L.`;
      if (luogo.esito === "DIVERSO") motivo += " Anche il luogo non coincide con il distributore.";
    } else if (luogo.esito === "DIVERSO") {
      stato = "LUOGO";
      motivo = luogo.distanza != null ? `Il furgone era a ${fmtL(luogo.distanza)} km dal distributore Q8.` : "Il furgone ha fatto rifornimento in un altro comune rispetto al distributore Q8.";
    } else if (delta > tol) motivo = `Nel serbatoio ${fmtL(delta)} L in più di quelli pagati con questa carta (forse un secondo pagamento).`;
    else if (!sensore && Math.abs(delta) > tol) motivo = `Furgone riconosciuto; i litri letti (${fmtL(litriTarga)}) non sono affidabili su questa flotta.`;
    if (rit !== undefined) motivo += ` Targa ha registrato il rifornimento ${rit} minuti dopo il pagamento.`;
    if (g.q.length > 1) motivo += ` Scontrini: ${g.q.length}.`;
    if (g.e.length > 1) motivo += ` Rifornimento letto in ${g.e.length} parti.`;
    righe.push({
      flotta: q0.flotta, giorno: q0.giorno, chiave: `Q8:${q0.chiave}`, stato, q8: g.q.map(spoglia), eventi: g.e.map(spogliaE), targa: e0.targa,
      oraQ8: hhmm(q0.ora), oraTarga: hhmm(e0.ora), litriQ8, litriTarga, deltaLitri: delta, euro, luogoQ8: luogoDi(q0), luogoTarga: e0.dove,
      luogo: luogo.esito, distanzaKm: luogo.distanza, motivo, abituale: abitualeDi(q0.identificativo, app),
    });
  }

  // pagamenti rimasti soli
  const cop = new Map(input.copertura.map((c) => [`${c.flotta}|${c.giorno}`, c]));
  const tappe = new Map(input.tappe.map((g) => [`${g.targa}|${g.giorno}`, g]));
  const rifornimentiDi = new Map<string, number[]>(); // furgone → minuti dei suoi rifornimenti
  for (const e of ev) rifornimentiDi.set(e.targa, [...(rifornimentiDi.get(e.targa) ?? []), e.t]);
  for (const q of q8) {
    if (usatiQ.has(q.chiave)) continue;
    const abituale = abitualeDi(q.identificativo, app, true) ?? abitualeDi(q.identificativo, app);
    const abitualeSicuro = abitualeDi(q.identificativo, app, true);
    const riga: Riga = {
      flotta: q.flotta, giorno: q.giorno, chiave: `Q8:${q.chiave}`, stato: "NON_VERIFICABILE", q8: [spoglia(q)], eventi: [], targa: null,
      oraQ8: hhmm(q.ora), oraTarga: null, litriQ8: r2(q.litri), litriTarga: null, deltaLitri: null, euro: null, luogoQ8: luogoDi(q), luogoTarga: null,
      luogo: "IGNOTO", distanzaKm: null, motivo: "", abituale,
    };
    const c = cop.get(`${q.flotta}|${q.giorno}`);
    // il furgone abituale ha un rifornimento vicino (anche registrato in ritardo), magari abbinato a un altro pagamento
    const giaRifornito = abituale ? (rifornimentiDi.get(abituale.targa) ?? []).some((t) => t >= q.t - TOLLERANZE.finestraMin && t <= q.t + TOLLERANZE.ritardoMaxMin) : false;
    const passato = abitualeSicuro && !giaRifornito ? passaggio(q, tappe.get(`${abitualeSicuro.targa}|${q.giorno}`), app) : null;
    if (NON_SERBATOIO.test(q.prodotto ?? "")) riga.motivo = `${q.prodotto}: non passa dal serbatoio del gasolio.`;
    else if (!FLOTTE[q.flotta].sensore) riga.motivo = FLOTTE[q.flotta].nota;
    else if (!c?.scaricato) riga.motivo = "La telematica di quel giorno non è ancora scaricata.";
    else if (!c.dettaglioCompleto) riga.motivo = "Mancano ora e luogo dei rifornimenti di quel giorno: completali da Telematica → Furgoni: il mese.";
    else if (q.litri < TOLLERANZE.sensoreMinLitri) riga.motivo = `Solo ${fmtL(q.litri)} L: il sensore del serbatoio può non accorgersene.`;
    else if (abitualeSicuro && passato === "SENZA_PERCORSO") riga.motivo = `Il percorso del furgone abituale (${abitualeSicuro.targa}) non è più disponibile (si tiene 120 giorni): non si può dire se era al distributore.`;
    else if (abitualeSicuro && passato) {
      const abituale = abitualeSicuro;
      riga.stato = "SERBATOIO_FERMO"; riga.targa = abituale.targa; riga.luogo = "UGUALE";
      riga.deltaLitri = r1(-q.litri); riga.euro = r2(q.importoNoIva);
      riga.motivo = `Furgone abituale di questa carta (${abituale.targa}, ${abituale.volte} rifornimenti su ${abituale.su}): ${passato}, ma il serbatoio non è salito.`;
    } else if (abituale && giaRifornito) riga.motivo = `Il furgone abituale di questa carta (${abituale.targa}) ha un rifornimento vicino a quest'ora, abbinato a un altro pagamento: forse due pagamenti per lo stesso pieno, o un furgone senza telematica.`;
    else riga.motivo = "Nessun furgone con telematica riconducibile a questa carta: probabilmente un furgone senza telematica." + (abituale ? ` Il furgone abituale (${abituale.targa}) in quel momento non era al distributore.` : "");
    righe.push(riga);
  }

  // rifornimenti rimasti soli
  for (const e of ev) {
    if (usatiE.has(e.i)) continue;
    const ultimo = input.ultimoGiornoQ8[e.flotta];
    const riga: Riga = {
      flotta: e.flotta, giorno: e.giorno, chiave: `TG:${e.targa}|${e.giorno}|${e.ora}|${e.litri}`, stato: "SENZA_Q8", q8: [], eventi: [spogliaE(e)], targa: e.targa,
      oraQ8: null, oraTarga: hhmm(e.ora), litriQ8: null, litriTarga: r1(e.litri), deltaLitri: null, euro: null, luogoQ8: null, luogoTarga: e.dove,
      luogo: "IGNOTO", distanzaKm: null, motivo: "Gasolio entrato nel serbatoio senza un pagamento Q8 vicino: altra carta, contanti o file Q8 non ancora caricato.", abituale: null,
    };
    if (!ultimo) { riga.stato = "NON_VERIFICABILE"; riga.motivo = "Il file Q8 di questo mese non è ancora caricato."; }
    else if (`${e.giorno} ${e.ora}` > ultimo) { riga.stato = "NON_VERIFICABILE"; riga.motivo = `Il file Q8 caricato arriva al ${ultimo.slice(8, 10)}/${ultimo.slice(5, 7)}${ultimo.length > 10 ? ` alle ${ultimo.slice(11, 16)}` : ""}.`; }
    righe.push(riga);
  }
  // rifornimenti senza ora (dettaglio non scaricato): non si possono abbinare
  for (const e of input.eventi) {
    if (minuti(e.giorno, e.ora) !== null) continue;
    righe.push({
      flotta: e.flotta, giorno: e.giorno, chiave: `TG:${e.targa}|${e.giorno}||${e.litri}`, stato: "NON_VERIFICABILE", q8: [], eventi: [e], targa: e.targa,
      oraQ8: null, oraTarga: null, litriQ8: null, litriTarga: r1(e.litri), deltaLitri: null, euro: null, luogoQ8: null, luogoTarga: e.dove,
      luogo: "IGNOTO", distanzaKm: null, motivo: "Manca l'ora del rifornimento: completala da Telematica → Furgoni: il mese.", abituale: null,
    });
  }

  righe.sort((a, b) => ORDINE_STATI.indexOf(a.stato) - ORDINE_STATI.indexOf(b.stato) || (b.euro ?? 0) - (a.euro ?? 0) || (a.giorno + (a.oraQ8 ?? a.oraTarga ?? "")).localeCompare(b.giorno + (b.oraQ8 ?? b.oraTarga ?? "")));
  let carteAbituali = 0;
  for (const k of app.carte.keys()) if (abitualeDi(k, app)) carteAbituali++;
  const distributoriLocalizzati = [...app.luoghi.values()].filter((m) => [...m.values()].some((n) => n >= TOLLERANZE.luogoMinVolte)).length;
  return { righe, appreso: { carteAbituali, distributoriLocalizzati } };
}

const luogoDi = (q: Q8Tx) => [q.indirizzo, q.citta].filter(Boolean).join(", ") || null;
const spoglia = ({ t: _t, ...q }: Q8i): Q8Tx => q;
const spogliaE = ({ t: _t, i: _i, ...e }: Evi): EventoTarga => e;

// ---------------------------------------------------------------------------------------------------------------------
// Riepilogo per le schede in alto

export type Riepilogo = {
  pagamentiQ8: number;
  perStato: Record<Stato, number>;
  anomalie: number;
  litriMancanti: number;
  euroMancanti: number;
};
export function riepiloga(righe: Riga[]): Riepilogo {
  const perStato = Object.fromEntries(ORDINE_STATI.map((s) => [s, 0])) as Record<Stato, number>;
  let pagamentiQ8 = 0, litri = 0, euro = 0;
  for (const r of righe) {
    perStato[r.stato]++;
    pagamentiQ8 += r.q8.length;
    if ((r.stato === "LITRI" || r.stato === "SERBATOIO_FERMO") && r.deltaLitri !== null && r.deltaLitri < 0) { litri += -r.deltaLitri; euro += r.euro ?? 0; }
  }
  return { pagamentiQ8, perStato, anomalie: perStato.SERBATOIO_FERMO + perStato.LITRI + perStato.LUOGO + perStato.SENZA_Q8, litriMancanti: r1(litri), euroMancanti: r2(euro) };
}
