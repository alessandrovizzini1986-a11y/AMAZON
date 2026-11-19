import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SPIEGAZIONI } from "@/content/spiegazioni";

const file = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? file(path.join(d, e.name)) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []));

describe("spiegazioni degli indicatori", () => {
  it("dicono cosa vuol dire e come si calcola, in frasi brevi", () => {
    for (const [k, v] of Object.entries(SPIEGAZIONI)) {
      expect(v.cosa.length, k).toBeGreaterThan(20); expect(v.come.length, k).toBeGreaterThan(20);
      expect(v.cosa.length, k).toBeLessThan(130);
      expect(v.cosa.length + v.come.length + (v.leggi?.length ?? 0), k).toBeLessThan(520);
    }
  });
  it("ogni chiave usata nelle pagine esiste, e ogni spiegazione è usata", () => {
    const usate = new Set<string>();
    for (const f of file("src")) for (const m of fs.readFileSync(f, "utf8").matchAll(/(?:<Spiega k=|<Kpi k=)"([^"]+)"|, "(forecast\.(?:versione|previsto|errore0|errore2))"\)/g)) usate.add(m[1] ?? m[2]);
    for (const k of usate) expect(SPIEGAZIONI[k], k).toBeDefined();
    for (const k of Object.keys(SPIEGAZIONI)) expect(usate.has(k), `non usata: ${k}`).toBe(true);
  });
});
