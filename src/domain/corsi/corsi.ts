/**
 * Corsi: lezioni brevi con esercizi a correzione automatica (docs/corsi/PROMPT_corsi.md).
 * La lezione dopo si apre solo quando quella prima è superata. Modulo condiviso: nessuna dipendenza da server.
 */
/** Righe di un tracking, nell'ordine e con i nomi del file vero. */
export const RIGHE_TRACKING = [
  ["Standard", "Standard"], ["Straordinario", "Straordinario"], ["Supplementare", "Supplementare"], ["Accordo", "Accordo (dalla ora 39 a 44)"], ["Totali", "Totali"],
  ["RIPOSO", "RIPOSO"], ["FERIE", "FERIE"], ["ROL", "ROL"], ["ExF", "ExF"], ["L104", "104"], ["AssIng", "ASSENZA INGIUST."], ["PermSind", "PERMESSO SINDACALE"],
  ["AltriPerm", "ALTRI PERMESSI (104, cong. Par)"], ["PermNR", "permesso non RETRIBUITO"], ["MALATTIA", "MALATTIA"], ["INFORTUNIO", "INFORTUNIO"], ["Trasferta", "Indennità Trasferta"],
] as const;
export type RigaTracking = (typeof RIGHE_TRACKING)[number][0];
export const RIGHE_LAVORO: RigaTracking[] = ["Standard", "Straordinario", "Supplementare", "Accordo"];
export type Cella = number | string | null;

/**
 * Un driver in una settimana (lunedì–domenica), disegnato come nel file Excel. I nomi sono inventati.
 * `amazon` = pacchi consegnati secondo Amazon (non è una riga del tracking: arriva dai CSV).
 */
export type TrackingDemo = {
  nome: string; contratto: string; driverId?: string; giorni?: string[];
  righe: Partial<Record<Exclude<RigaTracking, "Totali">, Cella[]>>; amazon?: Cella[];
  /** mostra tutte le 17 righe, anche vuote (per la lezione sulle righe) */
  tutte?: boolean; titolo?: string;
};
export const GIORNI_DEMO = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
/** Totali = somma delle quattro righe del lavoro (i testi e i valori impossibili non si sommano). */
export const totaliDemo = (t: TrackingDemo): number[] => GIORNI_DEMO.map((_, i) => RIGHE_LAVORO.reduce((s, r) => { const v = t.righe[r as Exclude<RigaTracking, "Totali">]?.[i]; return s + (typeof v === "number" && v <= 24 ? v : 0); }, 0));

export type Scelta = { tipo: "scelta"; domanda: string; opzioni: string[]; giusta: number; perche: string; tracking?: TrackingDemo };
export type Numeri = { tipo: "numeri"; domanda: string; campi: { nome: string; valore: number }[]; perche: string; tracking?: TrackingDemo };
/**
 * "Clicca la cella sbagliata": `giuste` = celle accettate, scritte "Riga|giorno" (giorno 0 = lunedì);
 * "*|2" = qualsiasi cella di mercoledì; "OK" = non c'è nessun errore.
 */
export type CellaSbagliata = { tipo: "cella"; domanda: string; tracking: TrackingDemo; giuste: string[]; perche: string };
export const NESSUN_ERRORE = "OK";
export type Esercizio = Scelta | Numeri | CellaSbagliata;
/** Stessa abilità, numeri diversi: a ogni tentativo si passa all'alternativa dopo. */
export type Gruppo = { id: string; alternative: Esercizio[] };
export type Lezione = {
  slug: string; titolo: string; minuti: number; obiettivo: string;
  /** Markdown, come il vademecum */
  testo: string; esercizi: Gruppo[]; approfondisci?: { href: string; label: string }[];
  /** tracking di esempio mostrati sotto il testo */
  figure?: { tracking: TrackingDemo; didascalia: string }[];
  /** in fondo alla lezione: "guarda un driver vero dal tuo archivio" (i file restano sul PC di chi studia) */
  trackingVero?: boolean;
};
export type Corso = { id: string; titolo: string; descrizione: string; perChi: string; lezioni: Lezione[] };

export const TOLLERANZA_NUMERI = 0.05;

/** L'esercizio da mostrare al tentativo n (0, 1, 2…). */
export const alternativa = (g: Gruppo, tentativo: number): Esercizio => g.alternative[((tentativo % g.alternative.length) + g.alternative.length) % g.alternative.length];

/** Esercizio senza soluzione, da mandare al browser. */
export type EsercizioVista =
  | { id: string; tipo: "scelta"; domanda: string; opzioni: string[]; tracking?: TrackingDemo }
  | { id: string; tipo: "numeri"; domanda: string; campi: string[]; tracking?: TrackingDemo }
  | { id: string; tipo: "cella"; domanda: string; tracking: TrackingDemo };
export function vista(g: Gruppo, tentativo: number): EsercizioVista {
  const e = alternativa(g, tentativo);
  const fig = e.tracking ? { tracking: e.tracking } : {};
  return e.tipo === "scelta" ? { id: g.id, tipo: "scelta", domanda: e.domanda, opzioni: e.opzioni, ...fig }
    : e.tipo === "numeri" ? { id: g.id, tipo: "numeri", domanda: e.domanda, campi: e.campi.map((c) => c.nome), ...fig }
    : { id: g.id, tipo: "cella", domanda: e.domanda, tracking: e.tracking };
}

export type Risposta = number | (number | null)[] | string | null;
/** La cella scelta è tra quelle accettate? */
export function cellaGiusta(giuste: string[], r: string): boolean {
  if (giuste.includes(r)) return true;
  const giorno = r.split("|")[1];
  return r !== NESSUN_ERRORE && giorno !== undefined && giuste.includes(`*|${giorno}`);
}
export type Esito = { id: string; ok: boolean; perche: string };

/** "8,5" → 8.5; vuoto o testo → null. */
export function numero(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** Corregge un invio: superata solo se tutti gli esercizi sono giusti. */
export function correggi(l: Lezione, tentativo: number, risposte: Record<string, Risposta>): { esiti: Esito[]; superata: boolean } {
  const esiti = l.esercizi.map((g): Esito => {
    const e = alternativa(g, tentativo), r = risposte[g.id];
    const ok = e.tipo === "scelta"
      ? typeof r === "number" && r === e.giusta
      : e.tipo === "cella" ? typeof r === "string" && cellaGiusta(e.giuste, r)
      : Array.isArray(r) && r.length === e.campi.length && e.campi.every((c, i) => r[i] !== null && Math.abs((r[i] as number) - c.valore) <= TOLLERANZA_NUMERI);
    return { id: g.id, ok, perche: e.perche };
  });
  return { esiti, superata: esiti.every((x) => x.ok) };
}

export type StatoLezione = "superata" | "aperta" | "chiusa";
/** Superate quelle fatte; aperta la prima non fatta; chiuse le altre. */
export function statoLezioni(c: Corso, superate: Set<string>): StatoLezione[] {
  let aperta = false;
  return c.lezioni.map((l) => {
    if (superate.has(l.slug)) return "superata";
    if (!aperta) { aperta = true; return "aperta"; }
    return "chiusa";
  });
}

export const chiaveLezione = (corso: string, slug: string) => `${corso}/${slug}`;

/** Controlli sul contenuto di un corso (usati dai test): restituisce l'elenco dei problemi. */
export function problemiCorso(c: Corso): string[] {
  const err: string[] = [], slug = new Set<string>();
  if (!c.lezioni.length) err.push("nessuna lezione");
  for (const l of c.lezioni) {
    const dove = `${c.id}/${l.slug}`;
    if (!/^[a-z0-9-]+$/.test(l.slug)) err.push(`${dove}: slug non valido`);
    if (slug.has(l.slug)) err.push(`${dove}: slug ripetuto`);
    slug.add(l.slug);
    if (!l.esercizi.length) err.push(`${dove}: senza esercizi`);
    const ids = new Set<string>();
    for (const g of l.esercizi) {
      if (ids.has(g.id)) err.push(`${dove}: esercizio ${g.id} ripetuto`);
      ids.add(g.id);
      if (!g.alternative.length) err.push(`${dove}/${g.id}: nessuna alternativa`);
      for (const e of g.alternative) {
        if (e.perche.length < 15) err.push(`${dove}/${g.id}: manca la spiegazione`);
        if (e.tipo === "scelta") {
          if (e.opzioni.length < 2 || e.giusta < 0 || e.giusta >= e.opzioni.length) err.push(`${dove}/${g.id}: risposta giusta fuori dalle opzioni`);
          if (new Set(e.opzioni).size !== e.opzioni.length) err.push(`${dove}/${g.id}: opzioni doppie`);
        } else if (e.tipo === "numeri") {
          if (!e.campi.length || e.campi.some((x) => !Number.isFinite(x.valore))) err.push(`${dove}/${g.id}: campi non validi`);
        } else {
          const righe = new Set<string>([...RIGHE_TRACKING.map((x) => x[0]), "Amazon", "*"]);
          if (!e.giuste.length) err.push(`${dove}/${g.id}: nessuna cella giusta`);
          for (const c of e.giuste) { const [r, d] = c.split("|"); if (c !== NESSUN_ERRORE && (!righe.has(r) || !(Number(d) >= 0 && Number(d) <= 6))) err.push(`${dove}/${g.id}: cella "${c}" non valida`); }
        }
        const t = e.tracking;
        if (t) for (const [r, v] of Object.entries({ ...t.righe, ...(t.amazon ? { Amazon: t.amazon } : {}) })) if (v.length !== 7) err.push(`${dove}/${g.id}: la riga ${r} non ha 7 giorni`);
      }
    }
  }
  return err;
}
