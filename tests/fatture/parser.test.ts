import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { parseInvoice } from "@/domain/fatture/parser";
import { fix } from "./fix";
import { pagine } from "./pdf";

const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const near = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.005 : a === b);

describe("§8.1 parser fatture Amazon (12 PDF reali)", () => {
  const files = fs.readdirSync(fix("pdf")).filter((f) => f.endsWith(".pdf")).sort();
  it("12 PDF nel kit", () => expect(files.length).toBe(12));
  for (const f of files) {
    it(f, async () => {
      const r = parseInvoice(await pagine(fix("pdf", f)), f);
      const exp = JSON.parse(fs.readFileSync(fix("expected", `${r.numero}.json`), "utf8"));
      const err: string[] = [];
      for (const k of ["numero", "template", "tipoDoc", "rifNotaCredito", "ds", "importoDovuto", "sommaTotale", "sommaAvere"] as const) if (!near(r[k], exp[k])) err.push(`${k}: ${r[k]} != ${exp[k]}`);
      for (const k of ["dataFattura", "periodoDa", "periodoA"] as const) if (iso(r[k]) !== exp[k]) err.push(`${k}: ${iso(r[k])} != ${exp[k]}`);
      expect(r.righe.length, f).toBe(exp.righe.length);
      r.righe.forEach((x, i) => {
        for (const k of Object.keys(exp.righe[i])) {
          const v = k === "Data" ? iso(x.Data) : (x as Record<string, unknown>)[k];
          if (!near(v, exp.righe[i][k])) err.push(`riga ${i + 1} ${k}: ${v} != ${exp.righe[i][k]}`);
        }
      });
      expect(err).toEqual([]);
    });
  }
});
