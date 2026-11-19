import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { bollettinoVuoto, compilaBollettino, controlla, importo, nomeFile, type Bollettino } from "@/domain/gls/bollettino";

const parte = (nome: string, cap: string) => ({ nome, via: "Via di Prova 1", citta: "Città di Prova (XX)", cap, telefono: "", email: "" });
const pieno = (): Bollettino => ({ ...bollettinoVuoto("2026-11-19"), mittente: parte("Mittente di prova", "20100"), destinatario: parte("Destinatario di prova – però", "00071") });

describe("bollettino GLS", () => {
  it("controlli: dice cosa manca in parole semplici", () => {
    expect(controlla(pieno())).toEqual([]);
    expect(controlla(bollettinoVuoto()).length).toBe(8);
    expect(controlla({ ...pieno(), fermoDeposito: true })).toEqual(["Con il fermo deposito serve il telefono del destinatario."]);
    expect(controlla({ ...pieno(), contrassegno: "120" })).toEqual(["Con il contrassegno indica la modalità di incasso."]);
    expect(controlla({ ...pieno(), contrassegno: "123456", modalitaIncasso: "contanti" })[0]).toContain("troppe cifre");
    expect(controlla({ ...pieno(), assicurazione: "si" })).toEqual(["Con l'assicurazione indica il valore in €."]);
    expect(controlla({ ...pieno(), porto: "afm" })).toEqual(["Con AFM indica il codice cliente."]);
    expect(controlla({ ...pieno(), colli: "0" })).toEqual(["Indica il numero di colli (almeno 1)."]);
  });
  it("importi all'italiana e nome del file", () => {
    expect(importo("1.234,5")).toEqual({ interi: "1234", decimali: "50" });
    expect(importo("abc")).toBeNull(); expect(importo("")).toBeNull();
    expect(nomeFile(pieno())).toBe("Bollettino_GLS_Destinatario_di_prova_pero_2026-11-19.pdf");
  });
  it("scrive sul modulo originale: due pagine, anche con caratteri che il font non ha", async () => {
    const modulo = fs.readFileSync("public/gls/bollettino.pdf");
    const b = { ...pieno(), note: "Emoji 🚚 e “virgolette” — trattino lungo, testo lunghissimo ".repeat(6), accessori: ["a", "b", "c", "d", "e", "f"], contrassegno: "99,9", modalitaIncasso: "contanti" };
    const out = await compilaBollettino(modulo, b);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toContain("Destinatario di prova");
  });
});
