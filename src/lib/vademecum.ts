import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { Marked, type Tokens, type Token } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Vademecum: pagine markdown in content/vademecum/*.md con frontmatter
 * (title, order, category, updated). Letto solo lato server; niente database.
 * index.md è la pagina introduttiva (/vademecum), gli altri file sono /vademecum/<slug>.
 */

export const CATEGORIES = ["Base", "Acquisti", "Multe", "Fatture", "Personale", "Riferimenti"] as const;
export type Category = (typeof CATEGORIES)[number];

export type VademecumDoc = {
  slug: string; // nome file senza .md ("index" per l'introduzione)
  title: string;
  order: number;
  category: Category;
  updated: string; // AAAA-MM-GG
  content: string; // markdown senza frontmatter
};

export type SearchBlock = {
  id: string; // univoco: slug#ancora
  slug: string;
  href: string;
  page: string;
  section: string;
  text: string;
};

const CONTENT_DIR = path.join(process.cwd(), "content", "vademecum");

/** Slug stabile per URL e ancore: minuscole, senza accenti, solo [a-z0-9-]. */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDoc(file: string, raw: string): VademecumDoc {
  const { data, content } = matter(raw);
  const slug = file.replace(/\.md$/, "");
  const category = data.category as Category;
  const order = Number(data.order);
  if (typeof data.title !== "string" || !data.title.trim()) throw new Error(`${file}: title mancante`);
  if (!Number.isFinite(order)) throw new Error(`${file}: order non numerico`);
  if (!CATEGORIES.includes(category)) throw new Error(`${file}: category "${data.category}" non valida`);
  // gray-matter può restituire Date per valori data non quotati
  const updated = data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated ?? "");
  return { slug, title: data.title.trim(), order, category, updated, content };
}

let cache: VademecumDoc[] | null = null;

/** Tutti i documenti (index compreso), ordinati per categoria e order. */
export function getAllDocs(): VademecumDoc[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const docs = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseDoc(f, fs.readFileSync(path.join(CONTENT_DIR, f), "utf-8")))
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.order - b.order);
  cache = docs;
  return docs;
}

/** Le pagine del menu (tutto tranne l'introduzione). */
export function getPages(): VademecumDoc[] {
  return getAllDocs().filter((d) => d.slug !== "index");
}

export function getDoc(slug: string): VademecumDoc | null {
  return getAllDocs().find((d) => d.slug === slug) ?? null;
}

export function docHref(slug: string): string {
  return slug === "index" ? "/vademecum" : `/vademecum/${slug}`;
}

/** Testo semplice di una riga markdown inline (per ancore e ricerca). */
function plain(md: string): string {
  return md
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^#+\s*/gm, "")
    .trim();
}

/** Paragrafo fatto solo di grassetto ("**Colonne di `Ordini_bis`**"): nel testo fa da titolo di sezione. */
function boldLabel(token: Token): string | null {
  if (token.type !== "paragraph") return null;
  const m = token.raw.trim().match(/^\*\*([^*]+)\*\*(.*)$/s);
  if (!m) return null;
  // ammesso un breve inciso dopo il grassetto, es. "**Esempio reale** (riga esistente)"
  return m[2].trim().length <= 120 && !m[2].includes("\n\n") ? plain(m[1]) : null;
}

type Anchored = { vdAnchor?: string; vdLabel?: string };

/**
 * Assegna ancore uniche ai titoli di primo livello del documento (h2/h3 e
 * titoletti in grassetto), nell'ordine in cui compaiono: le stesse ancore
 * servono all'HTML e ai link della ricerca. I paragrafi annidati (liste,
 * citazioni) non ricevono ancore.
 */
function lexWithAnchors(md: string): Token[] {
  const tokens = new Marked({ gfm: true, breaks: false }).lexer(md);
  const seen = new Map<string, number>();
  for (const token of tokens) {
    const isHeading = token.type === "heading" && (token as Tokens.Heading).depth >= 2 && (token as Tokens.Heading).depth <= 3;
    const label = isHeading ? plain((token as Tokens.Heading).text) : boldLabel(token);
    if (!label) continue;
    const base = slugify(label) || "sezione";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    Object.assign(token, { vdAnchor: n === 0 ? base : `${base}-${n + 1}`, vdLabel: label } satisfies Anchored);
  }
  return tokens;
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "p", "br", "hr", "strong", "em", "del", "code", "pre", "blockquote",
    "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a", "div", "span",
  ],
  allowedAttributes: {
    "*": ["id", "class"],
    a: ["href", "title"],
    th: ["align", "style"],
    td: ["align", "style"],
    ol: ["start"],
  },
  allowedStyles: { "*": { "text-align": [/^(left|right|center)$/] } },
  allowedSchemes: ["http", "https", "mailto"],
};

/** Markdown → HTML sanificato, con ancore su h2/h3 e sui titoletti in grassetto e tabelle scorrevoli. */
export function renderMarkdown(md: string): string {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(token: Tokens.Heading) {
        const inner = this.parser.parseInline(token.tokens);
        const id = (token as Tokens.Heading & Anchored).vdAnchor;
        return `<h${token.depth}${id ? ` id="${id}"` : ""}>${inner}</h${token.depth}>\n`;
      },
      paragraph(token: Tokens.Paragraph) {
        const inner = this.parser.parseInline(token.tokens);
        const id = (token as Tokens.Paragraph & Anchored).vdAnchor;
        return id ? `<p id="${id}" class="vd-label">${inner}</p>\n` : `<p>${inner}</p>\n`;
      },
    },
  });
  const html = marked
    .parser(lexWithAnchors(md))
    .replace(/<table>/g, '<div class="vd-table"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return sanitizeHtml(html, SANITIZE);
}

/** Testo semplice di un blocco markdown (tabelle comprese, celle separate da " · "). */
function tokenText(token: Token): string {
  if (token.type === "table") {
    const t = token as Tokens.Table;
    const row = (cells: Tokens.TableCell[]) => cells.map((c) => plain(c.text)).filter(Boolean).join(" · ");
    return [row(t.header), ...t.rows.map(row)].join("\n");
  }
  if (token.type === "list") return (token as Tokens.List).items.map((i) => plain(i.text)).join("\n");
  if (token.type === "space" || token.type === "hr") return "";
  return plain(token.raw);
}

/**
 * Blocchi per la ricerca: il testo prima del primo titolo (sezione = titolo pagina),
 * poi un blocco per ogni h2/h3 o titoletto in grassetto con il testo che lo segue.
 */
export function docBlocks(doc: VademecumDoc): SearchBlock[] {
  const href = docHref(doc.slug);
  const blocks: SearchBlock[] = [];
  let current = { anchor: "", section: doc.title, parts: [] as string[] };
  const flush = () => {
    const text = current.parts.join("\n").trim();
    if (text || current.anchor) {
      blocks.push({
        id: `${doc.slug}#${current.anchor || "top"}`,
        slug: doc.slug,
        href: current.anchor ? `${href}#${current.anchor}` : href,
        page: doc.title,
        section: current.section,
        text,
      });
    }
  };
  for (const token of lexWithAnchors(doc.content)) {
    const { vdAnchor, vdLabel } = token as Token & Anchored;
    if (vdAnchor && vdLabel) {
      flush();
      current = { anchor: vdAnchor, section: vdLabel, parts: [] };
    } else {
      const t = tokenText(token);
      if (t) current.parts.push(t);
    }
  }
  flush();
  return blocks;
}

let indexCache: SearchBlock[] | null = null;

export function getSearchBlocks(): SearchBlock[] {
  if (indexCache && process.env.NODE_ENV === "production") return indexCache;
  indexCache = getAllDocs().flatMap(docBlocks);
  return indexCache;
}
