import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { riconosci } from "@/lib/presenze/riconosci";
import { hasKit, KIT } from "./kit";

const file = (p: string) => new File([fs.readFileSync(p)], path.basename(p));

describe.skipIf(!hasKit)("riconoscimento dei file del kit", () => {
  it("tracking, Zucchetti e CSV Amazon: tipo, station, popolazione e mesi", async () => {
    const out: string[] = [];
    for (const dir of ["esempi/trk/DLO4", "esempi/trk/DVN1", "esempi/set26", "esempi/flex"]) {
      for (const f of fs.readdirSync(path.join(KIT, dir)).sort()) {
        const r = await riconosci(file(path.join(KIT, dir, f)));
        out.push(`${r.kind} ${r.station ?? "-"} ${r.tipo ?? "-"} ${r.mesi.includes("2026-10") ? "ott" : r.mesi.includes("2026-09") ? "set" : r.mesi.join("|")}`);
      }
    }
    expect(out).toEqual([
      "TRACKING DLO4 STD ott", "TRACKING DLO4 SIC ott",
      "TRACKING DVN1 SIC ott", "TRACKING DVN1 STD ott",
      "TRACKING DLO5 SIC set", "TRACKING DVN1 SIC set", "TRACKING DER1 SIC set", "TRACKING DER2 SIC set", "TRACKING DLZ2 SIC set", "TRACKING DLO2 SIC set", "TRACKING DLO4 SIC set",
      "ZUCCHETTI DLO4 - set", "ZUCCHETTI DLO5 - set", "ZUCCHETTI DLO2 - set", "ZUCCHETTI DLZ2 - set", "ZUCCHETTI DER2 - set", "ZUCCHETTI DER1 - set", "ZUCCHETTI DVN1 - set",
      "FLEX DER1 - ott", "FLEX - - ott",
    ]);
  }, 120_000);

  it("CSV unito: un giorno per station, DVN1 senza il 4/10", async () => {
    const r = await riconosci(file(path.join(KIT, "esempi/flex/FLEX_TUTTI.csv")));
    const dvn1 = r.giorniFlex!.filter((g) => g.station === "DVN1").map((g) => g.data);
    expect(dvn1).toHaveLength(24);
    expect(dvn1).not.toContain("2026-10-04");
    expect(new Set(r.giorniFlex!.map((g) => g.station)).size).toBe(7);
  });

  it("file sconosciuti: motivo esplicito", async () => {
    await expect(riconosci(new File(["a,b\n1,2"], "boh.csv"))).rejects.toThrow(/non è un export Amazon/);
    await expect(riconosci(new File(["x"], "foto.png"))).rejects.toThrow(/formato non gestito/);
  });
});
