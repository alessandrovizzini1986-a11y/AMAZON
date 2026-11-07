import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import { GRUPPI, gruppoAttivo, menuAttivo, menuPer, paginaIniziale, voceAttiva, vociBarra, vociPer } from "@/components/navModel";
import { can } from "@/lib/rbac";
import { daFare, stati } from "@/domain/percorsi/percorso";

const RUOLI: Role[] = ["ADMIN", "RESP_MEZZI", "CONTROLLO", "STAGISTA", "DRIVER"];

describe("menu a gruppi", () => {
  it("ogni ruolo vede solo le voci permesse, nei gruppi per tema", () => {
    expect(menuPer("ADMIN").map((g) => g.label)).toEqual(["Home", "Flotta", "Personale", "Amazon", "Spese mezzi", "Aiuto", "Gestione"]);
    expect(menuPer("CONTROLLO").map((g) => g.label)).toEqual(["Home", "Personale", "Amazon", "Spese mezzi", "Aiuto"]);
    expect(menuPer("RESP_MEZZI").map((g) => g.label)).toEqual(["Flotta", "Amazon", "Aiuto"]);
    expect(menuPer("DRIVER").flatMap((g) => g.items.map((v) => v.href))).toEqual(["/vehicles"]);
    expect(menuPer("STAGISTA").flatMap((g) => g.items.map((v) => v.href))).toEqual(["/training", "/vademecum", "/vademecum/18-glossario"]);
    expect(vociPer("ADMIN").map((v) => v.href)).not.toContain("/training"); // l'admin vede il training da tutor
    const hrefs = GRUPPI.flatMap((g) => g.voci.map((v) => v.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("le voci di ogni ruolo rispettano i permessi", () => {
    for (const r of RUOLI) for (const g of GRUPPI) for (const v of g.voci) if (menuPer(r).some((x) => x.items.some((i) => i.href === v.href))) expect(can({ role: r }, v.perm), `${r} ${v.href}`).toBe(true);
  });
  it("voce attiva = percorso più lungo; il gruppo segue la voce", () => {
    const g = menuPer("ADMIN"), voci = g.flatMap((x) => x.items);
    expect(voceAttiva("/vehicles/listini", voci)?.label).toBe("Listini noleggiatori");
    expect(voceAttiva("/vehicles/abc123", voci)?.label).toBe("Mezzi");
    expect(voceAttiva("/costi/gls", voci)?.label).toBe("Costi GLS");
    expect(voceAttiva("/costi/fine-mese", voci)?.label).toBe("Costi del personale");
    expect(gruppoAttivo("/fatture-amazon/rimborsi", g)?.id).toBe("amazon");
    expect(gruppoAttivo("/carburante-telepass/q8", g)?.id).toBe("spese");
    expect(gruppoAttivo("/account", g)).toBeNull();
  });
});

describe("barra del telefono", () => {
  it("al massimo 4 gruppi + Menu; tutte le voci restano raggiungibili dal Menu", () => {
    for (const r of RUOLI) {
      const { barra } = vociBarra(r);
      expect(barra.length, r).toBeLessThanOrEqual(4);
      expect(barra.every((b) => vociPer(r).some((v) => v.href === b.href)), r).toBe(true);
    }
    expect(vociBarra("ADMIN").barra.map((b) => b.label)).toEqual(["Home", "Flotta", "Personale", "Amazon"]);
    expect(vociBarra("CONTROLLO").barra.map((b) => b.label)).toEqual(["Home", "Personale", "Amazon", "Spese mezzi"]);
  });
  it("Menu attivo quando la pagina non è in un gruppo della barra", () => {
    expect(menuAttivo("/costi/fine-mese", "ADMIN")).toBe(false);
    expect(menuAttivo("/carburante-telepass/q8", "ADMIN")).toBe(true);
    expect(menuAttivo("/users", "ADMIN")).toBe(true);
  });
  it("pagina iniziale per ruolo", () => {
    expect(RUOLI.map(paginaIniziale)).toEqual(["/home", "/dashboard", "/home", "/training", "/vehicles"]);
  });
});

describe("Home: da fare", () => {
  it("prima i percorsi aperti, con passi fatti e prossimo passo", () => {
    const p = (id: string, fatti: boolean[]) => ({ id, titolo: id, passi: stati(fatti.map((f, i) => ({ id: `${id}${i}`, titolo: `p${i}`, fatto: f }))) });
    const d = daFare([p("chiuso", [true, true]), p("aperto", [true, false, false])]);
    expect(d.map((x) => [x.id, x.completo, x.fatti, x.obbligatori, x.prossimo?.titolo])).toEqual([["aperto", false, 1, 3, "p1"], ["chiuso", true, 2, 2, undefined]]);
  });
});
