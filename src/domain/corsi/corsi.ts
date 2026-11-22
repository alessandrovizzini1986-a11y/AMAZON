/**
 * Corsi: lezioni brevi con esercizi a correzione automatica (docs/corsi/PROMPT_corsi.md).
 * La lezione dopo si apre solo quando quella prima è superata. Modulo condiviso: nessuna dipendenza da server.
 */
export type Scelta = { tipo: "scelta"; domanda: string; opzioni: string[]; giusta: number; perche: string };
export type Numeri = { tipo: "numeri"; domanda: string; campi: { nome: string; valore: number }[]; perche: string };
export type Esercizio = Scelta | Numeri;
/** Stessa abilità, numeri diversi: a ogni tentativo si passa all'alternativa dopo. */
export type Gruppo = { id: string; alternative: Esercizio[] };
export type Lezione = {
  slug: string; titolo: string; minuti: number; obiettivo: string;
  /** Markdown, come il vademecum */
  testo: string; esercizi: Gruppo[]; approfondisci?: { href: string; label: string }[];
};
export type Corso = { id: string; titolo: string; descrizione: string; perChi: string; lezioni: Lezione[] };

export const TOLLERANZA_NUMERI = 0.05;

/** L'esercizio da mostrare al tentativo n (0, 1, 2…). */
export const alternativa = (g: Gruppo, tentativo: number): Esercizio => g.alternative[((tentativo % g.alternative.length) + g.alternative.length) % g.alternative.length];

/** Esercizio senza soluzione, da mandare al browser. */
export type EsercizioVista = { id: string; tipo: "scelta"; domanda: string; opzioni: string[] } | { id: string; tipo: "numeri"; domanda: string; campi: string[] };
export function vista(g: Gruppo, tentativo: number): EsercizioVista {
  const e = alternativa(g, tentativo);
  return e.tipo === "scelta" ? { id: g.id, tipo: "scelta", domanda: e.domanda, opzioni: e.opzioni } : { id: g.id, tipo: "numeri", domanda: e.domanda, campi: e.campi.map((c) => c.nome) };
}

export type Risposta = number | (number | null)[] | null;
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
        } else if (!e.campi.length || e.campi.some((x) => !Number.isFinite(x.valore))) err.push(`${dove}/${g.id}: campi non validi`);
      }
    }
  }
  return err;
}
