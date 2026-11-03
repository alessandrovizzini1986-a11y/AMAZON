import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { parseInvoice } from "@/domain/fatture/parser";
import { COLONNE_FATT_2026, daRigaPdf, rigaTsv, type RigaFatt } from "@/domain/fatture/righe";
import { excelImport } from "@/lib/fatture/excelImport";
import { fix } from "./fix";
import { pagine } from "./pdf";

describe("§8.7 excel e TSV", () => {
  let righe: RigaFatt[];
  beforeAll(async () => {
    const f = parseInvoice(await pagine(fix("pdf", "DER1-INV-IT3JDBF-0002543.pdf")), "x.pdf");
    righe = f.righe.map((r) => daRigaPdf(r, f.numero!, f.ds!));
  });
  it("TSV della riga FuelAllowance del 04/10/2026", () => {
    const r = righe.find((x) => x.descrizione === "FuelAllowance" && x.data === "2026-10-04")!;
    expect(rigaTsv(r)).toBe("DER1\t04/10/2026\tFuelAllowance\t2915\t0,23\tVAT 22\t22%\t145,82\t808,69\t662,87\t\t\t41\t10\t2026\tINV-IT3JDBF-0002543");
  });
  it("foglio righe: le 16 intestazioni di colonne_fatt_2026.txt, tabella nativa, fogli fatture/scartate/descrizioni", async () => {
    const attese = fs.readFileSync(fix("colonne_fatt_2026.txt"), "utf8").replace(/^﻿/, "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    expect([...COLONNE_FATT_2026]).toEqual(attese);
    const buf = await excelImport(righe, [], [], []).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["righe", "fatture", "scartate", "descrizioni"]);
    const ws = wb.getWorksheet("righe")!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(attese);
    expect(Object.keys((ws as unknown as { tables: Record<string, unknown> }).tables)).toEqual(["righe"]);
    expect(ws.rowCount).toBe(righe.length + 1);
    expect(ws.getCell("B2").value).toBeInstanceOf(Date);
    expect(ws.getCell("G2").numFmt).toBe("0%");
  });
});
