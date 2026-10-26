import { describe, it, expect } from "vitest";
import MiniSearch from "minisearch";
import { CATEGORIES, getAllDocs, renderMarkdown, docBlocks, getSearchBlocks, slugify } from "@/lib/vademecum";
import { MINISEARCH_OPTIONS, tokenize, snippet } from "@/domain/vademecumSearch";

const docs = getAllDocs();

describe("contenuti del vademecum", () => {
  it("carica index + 13 pagine", () => {
    expect(docs.length).toBe(14);
    expect(docs.some((d) => d.slug === "index")).toBe(true);
  });

  it("ogni frontmatter ha title, order e category validi", () => {
    for (const d of docs) {
      expect(d.title.length, d.slug).toBeGreaterThan(0);
      expect(Number.isFinite(d.order), d.slug).toBe(true);
      expect(CATEGORIES, d.slug).toContain(d.category);
      expect(d.updated, d.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gli slug sono unici e già in forma URL", () => {
    const slugs = docs.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toBe(slugify(s));
  });

  it("ogni file con una tabella GFM produce almeno una <table> scorrevole", () => {
    for (const d of docs.filter((x) => x.content.includes("|---|"))) {
      const html = renderMarkdown(d.content);
      expect(html, d.slug).toContain("<table>");
      expect(html, d.slug).toContain('<div class="vd-table"><table>');
    }
  });

  it("nessuna riga di tabella finisce dentro un paragrafo (tabella spezzata)", () => {
    for (const d of docs) {
      const paragraphs = renderMarkdown(d.content).match(/<p[^>]*>[\s\S]*?<\/p>/g) ?? [];
      for (const p of paragraphs) expect(p, d.slug).not.toMatch(/\|[^|<]+\|[^|<]+\|/);
    }
  });

  it("le ancore dell'HTML coincidono con quelle dei risultati di ricerca", () => {
    for (const d of docs) {
      const ids = [...renderMarkdown(d.content).matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      const anchors = docBlocks(d).map((b) => b.href.split("#")[1]).filter(Boolean);
      expect(anchors, d.slug).toEqual(ids);
      expect(new Set(ids).size, d.slug).toBe(ids.length);
    }
  });
});

describe("sanificazione", () => {
  it("toglie script e attributi pericolosi", () => {
    const html = renderMarkdown('ciao <script>alert(1)</script> <img src=x onerror="alert(1)"> [x](javascript:alert(1))');
    expect(html).not.toMatch(/<script|onerror|<img|javascript:/);
  });
});

describe("ricerca", () => {
  const ms = new MiniSearch(MINISEARCH_OPTIONS);
  ms.addAll(getSearchBlocks());
  const first = (q: string) => ms.search(q)[0] as unknown as { href: string; section: string } | undefined;

  it("non spezza codici con underscore e punto", () => {
    expect(tokenize("foglio fatt_2026, mail driver.ps.")).toEqual(["foglio", "fatt_2026", "mail", "driver.ps"]);
  });

  it.each(["verbale a casa", "RMPP", "fatt_2026", "Template G", "40639", "Ordini_bis", "driver.ps", "STD"])(
    "trova %s",
    (q) => expect(first(q)).toBeDefined(),
  );

  it("porta alla sezione giusta", () => {
    expect(first("verbale a casa")?.href).toContain("#4b-verbali-arrivati-a-casa");
    expect(first("Template G")?.section).toMatch(/^Template G/);
    expect(first("fatt_2026")?.href).toContain("06-fatture-amazon");
  });

  it("lo snippet evidenzia il termine", () => {
    const parts = snippet("Inserisci le fatture in fatt_2026 ogni lunedì", ["fatt_2026"]);
    expect(parts.filter((p) => p.mark).map((p) => p.text)).toEqual(["fatt_2026"]);
  });
});
