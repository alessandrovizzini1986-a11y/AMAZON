/**
 * Ricerca full-text del Vademecum (MiniSearch nel browser): opzioni condivise
 * tra indice e query, più snippet con i termini evidenziati. Logica pura.
 */

/** Parole vuote italiane: non si indicizzano, così "verbale a casa" non cerca "a". */
const STOP_WORDS = new Set([
  "a", "ad", "al", "alla", "alle", "agli", "ai", "allo", "il", "lo", "la", "le", "i", "gli", "l",
  "un", "una", "uno", "di", "da", "del", "della", "delle", "dei", "degli", "dello", "dal", "dalla",
  "in", "nel", "nella", "nelle", "nei", "con", "su", "sul", "sulla", "per", "tra", "fra",
  "e", "ed", "o", "od", "che", "non", "se", "si", "è", "come",
]);

/**
 * Separa su spazi e punteggiatura ma NON su underscore e punto interni, così
 * codici e sigle restano interi: fatt_2026, Ordini_bis, driver.ps, 40639, RMPP_OTT_26.
 * Punti, trattini e underscore a inizio/fine parola (fine frase) vengono tolti.
 */
export function tokenize(text: string): string[] {
  return text
    .split(/[\s,;:!?()[\]{}"'«»“”‘’|/\\*`<>=+→•·…–—]+/u)
    .map((t) => t.replace(/^[.\-_]+|[.\-_]+$/g, ""))
    .filter(Boolean);
}

/** Minuscole e senza accenti (attività = attivita); nessuno stemming. */
export function processTerm(term: string): string | null {
  const t = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return t && !STOP_WORDS.has(t) ? t : null;
}

export const MINISEARCH_OPTIONS = {
  idField: "id",
  fields: ["page", "section", "text"],
  storeFields: ["href", "page", "section", "text"],
  tokenize,
  processTerm,
  searchOptions: {
    boost: { section: 3, page: 2 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: "AND" as const,
  },
};

export type SnippetPart = { text: string; mark: boolean };

/**
 * Estratto di ~maxLen caratteri attorno al primo termine trovato, spezzato
 * in parti evidenziate / normali (per costruire <mark> senza innerHTML).
 */
export function snippet(text: string, terms: string[], maxLen = 180): SnippetPart[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // la normalizzazione degli accenti non cambia la lunghezza delle lettere base:
  // le posizioni trovate su "norm" valgono anche per il testo originale
  const hay = norm(flat);
  const needles = [...new Set(terms.map(norm))].filter((t) => t.length > 0).sort((a, b) => b.length - a.length);

  const first = needles.reduce((min, t) => {
    const i = hay.indexOf(t);
    return i >= 0 && (min < 0 || i < min) ? i : min;
  }, -1);
  let start = Math.max(0, (first < 0 ? 0 : first) - Math.floor(maxLen / 3));
  if (start > 0) {
    const space = flat.indexOf(" ", start);
    if (space >= 0 && space - start < 20) start = space + 1;
  }
  const end = Math.min(flat.length, start + maxLen);
  const piece = flat.slice(start, end);
  const pieceHay = hay.slice(start, end);

  const parts: SnippetPart[] = [];
  if (start > 0) parts.push({ text: "…", mark: false });
  let i = 0;
  while (i < piece.length) {
    const hit = needles.find((t) => pieceHay.startsWith(t, i));
    if (hit) {
      parts.push({ text: piece.slice(i, i + hit.length), mark: true });
      i += hit.length;
    } else {
      const last = parts[parts.length - 1];
      if (last && !last.mark && last.text !== "…") last.text += piece[i];
      else parts.push({ text: piece[i], mark: false });
      i++;
    }
  }
  if (end < flat.length) parts.push({ text: "…", mark: false });
  return parts;
}
