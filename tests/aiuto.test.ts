import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AIUTO, DOVE } from "@/content/aiuto";

const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []));
const sorgenti = files(path.join(process.cwd(), "src")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const usate = new Set<string>();
for (const m of sorgenti.matchAll(/<Aiuto k="([^"]+)"/g)) usate.add(m[1]);
for (const m of sorgenti.matchAll(/aiuto=(?:"([^"]+)"|\{([^}]+)\})/g)) {
  if (m[1]) usate.add(m[1]);
  else for (const x of m[2].matchAll(/"([a-z]+\.[a-z.]+)"/g)) usate.add(x[1]);
}

describe("aiuto sui pulsanti", () => {
  it("ogni chiave usata nelle pagine esiste, ogni testo è usato", () => {
    expect([...usate].filter((k) => !AIUTO[k])).toEqual([]);
    expect(Object.keys(AIUTO).filter((k) => !usate.has(k))).toEqual([]);
  });
  it("ogni voce dice cosa fa, cosa fare prima e dove finisce il dato, in frasi brevi", () => {
    for (const [k, v] of Object.entries(AIUTO)) {
      expect(v.fa.length, k).toBeGreaterThan(15);
      expect(v.prima.length, k).toBeGreaterThan(10);
      expect(Object.keys(DOVE), k).toContain(v.dove);
      expect(v.fa.length + v.prima.length + (v.nota?.length ?? 0), k).toBeLessThan(420);
      expect(/IndexedDB|localStorage|server action|endpoint/i.test(v.fa + v.prima + (v.nota ?? "")), k).toBe(false);
    }
  });
});
