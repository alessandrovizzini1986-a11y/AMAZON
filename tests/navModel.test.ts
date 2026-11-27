import { describe, it, expect } from "vitest";
import type { Role } from "@prisma/client";
import { GRUPPI, GRUPPI_DESTRA, gruppoAttivo, menuAttivo, menuPer, paginaIniziale, voceAttiva, vociBarra, vociPer } from "@/components/navModel";
import { can } from "@/lib/rbac";
import { daFare, stati } from "@/domain/percorsi/percorso";

const RUOLI: Role[] = ["ADMIN", "RESP_MEZZI", "CONTROLLO", "STAGISTA", "DRIVER"];

describe("menu a gruppi", () => {
  it("ogni ruolo vede solo le voci permesse, nei gruppi per tema", () => {
    expect(menuPer("ADMIN").map((g) => g.label)).toEqual(["Home", "Flotta", "Personale", "Telematica", "Amazon", "Spese mezzi", "Strumenti", "Aiuto", "Gestione"]);
    expect(menuPer("CONTROLLO").map((g) => g.label)).toEqual(["Home", "Personale", "Amazon", "Spese mezzi", "Strumenti", "Aiuto"]);
    expect(menuPer("RESP_MEZZI").map((g) => g.label)).toEqual(["Flotta", "Amazon", "Aiuto"]);
    expect(menuPer("DRIVER").flatMap((g) => g.items.map((v) => v.href))).toEqual(["/vehicles"]);
    expect(menuPer("STAGISTA").flatMap((g) => g.items.map((v) => v.href))).toEqual(["/training", "/corsi", "/vademecum", "/vademecum/18-glossario"]);
    expect(vociPer("ADMIN").map((v) => v.href)).not.toContain("/training"); // l'admin vede il training da tutor
    const hrefs = GRUPPI.flatMap((g) => g.voci.map((v) => v.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("menu corto: al massimo 7 gruppi di lavoro e 7 voci per gruppo; Aiuto e Gestione a destra", () => {
    expect(GRUPPI.filter((g) => !GRUPPI_DESTRA.includes(g.id)).length).toBeLessThanOrEqual(7);
    for (const g of GRUPPI) expect(g.voci.length, g.id).toBeLessThanOrEqual(7);
    expect(GRUPPI.slice(-2).map((g) => g.id)).toEqual(GRUPPI_DESTRA);
    // le schede delle sezioni non si ripetono nel menu
    expect(GRUPPI.flatMap((g) => g.voci.map((v) => v.href))).not.toContain("/fatture-amazon/forecast/storico");
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
    expect(gruppoAttivo("/carburante-telepass/anagrafiche", g)?.id).toBe("spese");
    expect(gruppoAttivo("/telematica/giornata", g)?.id).toBe("telematica");
    expect(gruppoAttivo("/portali", g)?.id).toBe("gestione");
    expect(voceAttiva("/fatture-amazon/forecast/storico", voci)?.label).toBe("Forecast");
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
    expect(vociBarra("ADMIN").barra.map((b) => b.label)).toEqual(["Home", "Flotta", "Personale", "Telematica"]);
    // chi non vede la telematica ha Amazon come quarto gruppo
    expect(vociBarra("ADMIN", 4, ["/telematica/mappa", "/telematica/giornata", "/telematica/mese", "/telematica/carburante", "/telematica"]).barra.map((b) => b.label)).toEqual(["Home", "Flotta", "Personale", "Amazon"]);
    expect(vociBarra("CONTROLLO").barra.map((b) => b.label)).toEqual(["Home", "Personale", "Amazon", "Spese mezzi"]);
  });
  it("Menu attivo quando la pagina non è in un gruppo della barra", () => {
    expect(menuAttivo("/costi/fine-mese", "ADMIN")).toBe(false);
    expect(menuAttivo("/carburante-telepass/q8", "ADMIN")).toBe(true);
    expect(menuAttivo("/users", "ADMIN")).toBe(true);
  });
  it("pagina iniziale per ruolo", () => {
    expect(RUOLI.map((r) => paginaIniziale(r))).toEqual(["/home", "/dashboard", "/home", "/training", "/vehicles"]);
  });
});

describe("Home: da fare", () => {
  it("prima i percorsi aperti, con passi fatti e prossimo passo", () => {
    const p = (id: string, fatti: boolean[]) => ({ id, titolo: id, passi: stati(fatti.map((f, i) => ({ id: `${id}${i}`, titolo: `p${i}`, fatto: f }))) });
    const d = daFare([p("chiuso", [true, true]), p("aperto", [true, false, false])]);
    expect(d.map((x) => [x.id, x.completo, x.fatti, x.obbligatori, x.prossimo?.titolo])).toEqual([["aperto", false, 1, 3, "p1"], ["chiuso", true, 2, 2, undefined]]);
  });
});

import { cercaPagine, pagineCercabili, PAGINE_INTERNE, GRUPPI as TUTTI } from "@/components/navModel";
describe("ricerca delle pagine", () => {
  it("trova anche le schede interne, senza badare ad accenti e maiuscole", () => {
    const p = pagineCercabili("ADMIN");
    expect(cercaPagine("meta mese", p)[0].href).toBe("/costi/meta-mese");
    expect(cercaPagine("già elaborati", p)[0].href).toBe("/carburante-telepass/storico");
    expect(cercaPagine("GIA ELABORATI", p)[0].href).toBe("/carburante-telepass/storico");
    expect(cercaPagine("verifica tracking", p)[0].href).toBe("/presenze/verifica");
    expect(cercaPagine("telepass", p)[0].href).toBe("/carburante-telepass/telepass");
    expect(cercaPagine("", p)).toEqual([]);
  });
  it("le schede seguono la voce madre: se è nascosta o non permessa, spariscono", () => {
    const nascosta = pagineCercabili("ADMIN", ["/costi"]).map((x) => x.href);
    expect(nascosta).not.toContain("/costi/meta-mese");
    expect(nascosta).toContain("/costi/gls");
    const driver = pagineCercabili("DRIVER").map((x) => x.href);
    expect(driver.some((h) => PAGINE_INTERNE.some((i) => i.href === h))).toBe(false);
    expect(pagineCercabili("STAGISTA").map((x) => x.href)).not.toContain("/presenze/configurazione");
  });
  it("ogni scheda interna appartiene a una voce di menu esistente e non duplica una voce", () => {
    const voci = TUTTI.flatMap((g) => g.voci.map((v) => v.href));
    for (const i of PAGINE_INTERNE) { expect(voci).toContain(i.voce); expect(voci).not.toContain(i.href); }
  });
});

import { comeVoceMenu } from "@/components/navModel";
describe("telematica come sezione a schede", () => {
  it("nel menu è una voce sola che apre la prima pagina visibile", () => {
    const t = menuPer("ADMIN").find((g) => g.id === "telematica")!;
    const v = comeVoceMenu(t);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ href: "/telematica/mappa", label: "Telematica" });
    const senzaMappa = comeVoceMenu(menuPer("ADMIN", ["/telematica/mappa"]).find((g) => g.id === "telematica")!);
    expect(senzaMappa.items[0].href).toBe("/telematica/giornata");
  });
  it("gli altri gruppi restano tendine", () => {
    const f = menuPer("ADMIN").find((g) => g.id === "flotta")!;
    expect(comeVoceMenu(f)).toBe(f);
  });
});
