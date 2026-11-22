import { describe, it, expect } from "vitest";
import { CORSI } from "@/content/corsi";
import { alternativa, correggi, numero, problemiCorso, statoLezioni, vista, type Risposta } from "@/domain/corsi/corsi";

const giuste = (l: (typeof CORSI)[number]["lezioni"][number], t: number): Record<string, Risposta> =>
  Object.fromEntries(l.esercizi.map((g) => { const e = alternativa(g, t); return [g.id, e.tipo === "scelta" ? e.giusta : e.tipo === "cella" ? e.giuste[0].replace("*", "Standard") : e.campi.map((c) => c.valore)]; }));

describe("corsi: contenuti", () => {
  it("ogni corso è ben fatto: esercizi in ogni lezione, risposte giuste esistenti, spiegazioni presenti", () => {
    for (const c of CORSI) expect(problemiCorso(c), c.id).toEqual([]);
  });
  it("lezioni brevi e leggibili", () => {
    for (const c of CORSI) for (const l of c.lezioni) {
      expect(l.testo.length, `${c.id}/${l.slug}`).toBeLessThan(3500);
      for (const f of l.figure ?? []) for (const v of Object.values(f.tracking.righe)) expect(v.length, l.slug).toBe(7);
      expect(l.minuti, l.slug).toBeLessThanOrEqual(12);
      expect(l.esercizi.length, l.slug).toBeGreaterThanOrEqual(3);
      for (const g of l.esercizi) for (const e of g.alternative) expect(e.domanda.length, `${l.slug}/${g.id}`).toBeLessThan(260);
    }
  });
  it("gli esercizi sulle ore danno sempre un totale uguale alle ore lavorate", () => {
    for (const c of CORSI) for (const l of c.lezioni) for (const g of l.esercizi) for (const e of g.alternative) {
      const m = /lavora ([\d,]+) ore nella settimana/.exec(e.domanda);
      if (e.tipo === "numeri" && m) expect(e.campi.reduce((s, x) => s + x.valore, 0), `${l.slug}/${g.id}`).toBeCloseTo(Number(m[1].replace(",", ".")), 5);
    }
  });
  it("al browser non arrivano le soluzioni", () => {
    for (const c of CORSI) for (const l of c.lezioni) for (const g of l.esercizi) {
      const v = JSON.stringify(vista(g, 0));
      expect(v).not.toContain("giusta"); expect(v).not.toContain("valore"); expect(v).not.toContain("perche");
    }
  });
});

describe("corsi: correzione e sblocco", () => {
  const c = CORSI[0], l = c.lezioni.find((x) => x.slug === "ore-full-time")!;
  it("superata solo con tutte le risposte giuste; ogni variante ha le sue soluzioni", () => {
    for (const t of [0, 1, 2, 3]) expect(correggi(l, t, giuste(l, t)).superata, `tentativo ${t}`).toBe(true);
    const quasi = { ...giuste(l, 0), e: 0 };
    const r = correggi(l, 0, quasi);
    expect(r.superata).toBe(false);
    expect(r.esiti.filter((x) => !x.ok).map((x) => x.id)).toEqual(["e"]);
    expect(correggi(l, 0, {}).superata).toBe(false);
    // le soluzioni del primo tentativo non valgono per il secondo (i numeri cambiano)
    expect(correggi(l, 1, giuste(l, 0)).superata).toBe(false);
  });
  it("numeri con la virgola e tolleranza piccola", () => {
    expect([numero("8,5"), numero(" 39 "), numero("abc"), numero("")]).toEqual([8.5, 39, null, null]);
    const pt = c.lezioni.find((x) => x.slug === "i-contratti")!;
    expect(correggi(pt, 0, { ...giuste(pt, 0), c: [23.42] }).superata).toBe(true);
    expect(correggi(pt, 0, { ...giuste(pt, 0), c: [23] }).superata).toBe(false);
  });
  it("si apre una lezione alla volta", () => {
    expect(statoLezioni(c, new Set()).slice(0, 3)).toEqual(["aperta", "chiusa", "chiusa"]);
    expect(statoLezioni(c, new Set([c.lezioni[0].slug])).slice(0, 3)).toEqual(["superata", "aperta", "chiusa"]);
    expect(statoLezioni(c, new Set(c.lezioni.map((x) => x.slug))).every((s) => s === "superata")).toBe(true);
  });
  it("il primo esempio della lezione sulle ore: 48 ore = 39 + 3 + 6", () => {
    const e = alternativa(l.esercizi.find((g) => g.id === "b")!, 0);
    expect(e.tipo === "numeri" && e.campi.map((x) => x.valore)).toEqual([39, 3, 6]);
  });
});

describe("corsi: tracking sbagliati da trovare", () => {
  const c = CORSI[0];
  it("le ore dei tracking di esempio rispettano la regola del sito, quando la lezione dice che sono giusti", async () => {
    const { leggiContratto, ripartoAtteso } = await import("@/domain/presenze/verifica");
    const somma = (v?: (number | string | null)[]) => (v ?? []).reduce<number>((s, x) => s + (typeof x === "number" ? x : 0), 0);
    let giusti = 0;
    for (const l of c.lezioni) for (const g of l.esercizi) for (const e of g.alternative) {
      if (e.tipo !== "cella" || e.giuste[0] !== "OK" || e.tracking.amazon) continue;
      const r = e.tracking.righe, tot = somma(r.Standard) + somma(r.Supplementare) + somma(r.Accordo) + somma(r.Straordinario);
      const a = ripartoAtteso(tot, 0, leggiContratto(e.tracking.contratto), 42);
      expect([somma(r.Standard) + somma(r.Supplementare), somma(r.Accordo), somma(r.Straordinario)], `${l.slug}/${g.id}`).toEqual([a.std + a.sup, a.acc, a.str]);
      giusti++;
    }
    expect(giusti).toBeGreaterThanOrEqual(3);
  });
  it("una cella qualsiasi del giorno giusto vale; un altro giorno no; «nessun errore» solo quando è vero", async () => {
    const { cellaGiusta } = await import("@/domain/corsi/corsi");
    expect(cellaGiusta(["*|1"], "Standard|1")).toBe(true);
    expect(cellaGiusta(["*|1"], "Amazon|1")).toBe(true);
    expect(cellaGiusta(["*|1"], "Standard|2")).toBe(false);
    expect(cellaGiusta(["*|1"], "OK")).toBe(false);
    expect(cellaGiusta(["OK"], "OK")).toBe(true);
    expect(cellaGiusta(["Straordinario|5"], "Accordo|5")).toBe(false);
  });
});
