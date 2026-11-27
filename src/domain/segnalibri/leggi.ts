/**
 * Legge una pagina HTML che contiene uno o più segnalibri ("bookmarklet": link che cominciano con javascript:)
 * e ne ricava titolo, pulsanti e istruzioni in testo semplice. La pagina non viene mai mostrata dentro il sito:
 * si prendono solo i pulsanti e il testo.
 */
export type Pulsante = { nome: string; codice: string };
export type Letto = { titolo: string; pulsanti: Pulsante[]; istruzioni: string };

const ENTITA: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", larr: "←", hellip: "…", egrave: "è", eacute: "é", agrave: "à", ograve: "ò", ugrave: "ù", igrave: "ì", laquo: "«", raquo: "»" };
const decodifica = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tutto, e: string) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tutto; }
  return ENTITA[e.toLowerCase()] ?? tutto;
});
const senzaTag = (s: string) => decodifica(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

export const eSegnalibro = (codice: string) => /^javascript:/i.test(codice.trim());

export function leggiPagina(html: string): Letto {
  const titolo = senzaTag(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "") || senzaTag(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "");
  const pulsanti: Pulsante[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi)) {
    const codice = decodifica(m[1] ?? m[2] ?? "").trim();
    if (!eSegnalibro(codice) || pulsanti.some((p) => p.codice === codice)) continue;
    pulsanti.push({ nome: senzaTag(m[3]) || `Segnalibro ${pulsanti.length + 1}`, codice });
  }
  // istruzioni: il testo della pagina, una riga per blocco, senza il codice dei segnalibri scritto per esteso
  const corpo = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<(script|style|textarea|code|pre)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/ol|\/ul|\/summary)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const istruzioni = decodifica(corpo).split("\n").map((r) => r.replace(/javascript:\S+/gi, "").replace(/[ \t ]+/g, " ").trim()).filter((r) => r && r !== "•").join("\n");
  return { titolo, pulsanti, istruzioni };
}
