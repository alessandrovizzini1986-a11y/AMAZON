import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FESTIVITA, festivitaDelGiorno, finestreAnno, giorno, giornoPasqua, leggiAnteprima, msAllaMezzanotte,
  risolviFestivita, scegli, type FestivitaId, type Finestra,
} from "@/domain/festivita";

/** data LOCALE (come new Date() nel browser) */
const d = (a: number, m: number, g: number, h = 12, min = 0, s = 0) => new Date(a, m - 1, g, h, min, s);
const id = (dt: Date) => festivitaDelGiorno(dt)?.id ?? null;
const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Oracolo indipendente: algoritmo di Oudin (1940), diverso da Meeus/Jones/Butcher usato dal modulo. */
function pasquaOudin(y: number): string {
  const G = y % 19, C = Math.floor(y / 100);
  const H = (C - Math.floor(C / 4) - Math.floor((8 * C + 13) / 25) + 19 * G + 15) % 30;
  const I = H - Math.floor(H / 28) * (1 - Math.floor(29 / (H + 1)) * Math.floor((21 - G) / 11));
  const J = (y + Math.floor(y / 4) + I + 2 - C + Math.floor(C / 4)) % 7;
  const L = I - J, mese = 3 + Math.floor((L + 40) / 44), g = L + 28 - 31 * Math.floor(mese / 4);
  return `${y}-${String(mese).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
}

describe("Pasqua (Meeus/Jones/Butcher) e Lunedì dell'Angelo", () => {
  it.each([
    [2025, "2025-04-20"], [2026, "2026-04-05"], [2027, "2027-03-28"], [2028, "2028-04-16"],
    // casi limite noti: la più bassa (22/3) e la più alta (25/4) possibili, fine secolo
    [2285, "2285-03-22"], [2038, "2038-04-25"], [1943, "1943-04-25"], [2011, "2011-04-24"], [2000, "2000-04-23"], [2100, "2100-03-28"],
  ])("Pasqua %i = %s", (anno, atteso) => {
    expect(iso(giornoPasqua(anno))).toBe(atteso);
  });

  it("coincide con l'algoritmo di Oudin, cade di domenica tra il 22/3 e il 25/4 (1900–2200)", () => {
    for (let y = 1900; y <= 2200; y++) {
      const p = giornoPasqua(y), data = new Date(p * 86_400_000);
      expect(iso(p), `anno ${y}`).toBe(pasquaOudin(y));
      expect(data.getUTCDay(), `anno ${y}`).toBe(0);
      expect(p).toBeGreaterThanOrEqual(giorno(y, 3, 22));
      expect(p).toBeLessThanOrEqual(giorno(y, 4, 25));
    }
  });

  it.each([
    // [anno, Sabato Santo, Pasqua, Lunedì dell'Angelo]
    [2025, [4, 19], [4, 20], [4, 21]],
    [2026, [4, 4], [4, 5], [4, 6]],
    [2027, [3, 27], [3, 28], [3, 29]],
    [2028, [4, 15], [4, 16], [4, 17]],
    [2024, [3, 30], [3, 31], [4, 1]], // Pasquetta in un altro mese
  ] as const)("%i: Sabato Santo, Pasqua e Pasquetta accese; Venerdì Santo e martedì no", (anno, sab, dom, lun) => {
    expect(id(d(anno, sab[0], sab[1]))).toBe("pasqua");
    expect(id(d(anno, dom[0], dom[1]))).toBe("pasqua");
    expect(id(d(anno, lun[0], lun[1]))).toBe("pasqua");
    const p = giornoPasqua(anno);
    expect(iso(p + 1)).toBe(`${anno}-${String(lun[0]).padStart(2, "0")}-${String(lun[1]).padStart(2, "0")}`);
    const venerdi = new Date((p - 2) * 86_400_000), martedi = new Date((p + 2) * 86_400_000);
    expect(id(d(anno, venerdi.getUTCMonth() + 1, venerdi.getUTCDate()))).toBeNull();
    expect(id(d(anno, martedi.getUTCMonth() + 1, martedi.getUTCDate()))).toBeNull();
  });
});

describe("precedenza tra finestre sovrapposte: vince la più corta", () => {
  it("2011: Pasquetta il 25 aprile → vince la Liberazione (1 giorno contro 3)", () => {
    expect(id(d(2011, 4, 25))).toBe("liberazione");
    expect(id(d(2011, 4, 23))).toBe("pasqua"); // Sabato Santo
    expect(id(d(2011, 4, 24))).toBe("pasqua");
    expect(id(d(2011, 4, 26))).toBeNull();
  });

  it("2038: Pasqua il 25 aprile → vince la Liberazione, il resto della finestra resta Pasqua", () => {
    expect(id(d(2038, 4, 24))).toBe("pasqua");
    expect(id(d(2038, 4, 25))).toBe("liberazione");
    expect(id(d(2038, 4, 26))).toBe("pasqua");
  });

  it("il 25 aprile è sempre Liberazione, anche negli anni in cui Pasqua lo copre (1900–2200)", () => {
    for (let y = 1900; y <= 2200; y++) expect(id(d(y, 4, 25)), `anno ${y}`).toBe("liberazione");
  });

  it("regola generica: più corta vince, a parità di durata la prima dell'elenco", () => {
    const lunga: Finestra = { id: "natale", dal: 10, al: 20 };
    const corta: Finestra = { id: "immacolata", dal: 15, al: 16 };
    expect(scegli([lunga, corta], 15)).toBe("immacolata");
    expect(scegli([corta, lunga], 16)).toBe("immacolata");
    expect(scegli([lunga, corta], 12)).toBe("natale");
    expect(scegli([lunga, corta], 17)).toBe("natale");
    expect(scegli([lunga, corta], 21)).toBeNull();
    const a: Finestra = { id: "capodanno", dal: 10, al: 12 }, b: Finestra = { id: "ferragosto", dal: 11, al: 13 };
    expect(scegli([a, b], 11)).toBe("capodanno");
    expect(scegli([b, a], 11)).toBe("ferragosto");
  });

  it("al massimo una festività: i giorni accesi in un anno sono la somma esatta delle finestre", () => {
    for (let y = 2020; y <= 2040; y++) {
      let accesi = 0;
      for (let n = giorno(y, 1, 1); n <= giorno(y, 12, 31); n++) {
        const t = new Date(n * 86_400_000);
        if (id(d(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()))) accesi++;
      }
      // Capodanno 3 (1–2/1 + 31/12), Epifania 2, Pasqua 3, 25/4, 1/5, 2/6, Ferragosto 3, 1/11, 8/12, Natale 12 = 28
      const p = iso(giornoPasqua(y)).slice(5);
      const sovrapposta = p === "04-24" || p === "04-25"; // il 25/4 passa dalla Pasqua alla Liberazione: un giorno in meno
      expect(accesi, `anno ${y}`).toBe(28 + (y >= 2026 ? 1 : 0) - (sovrapposta ? 1 : 0));
    }
  });
});

describe("giorni feriali ordinari: nessuna festività", () => {
  it.each([
    [2026, 11, 25], [2026, 3, 10], [2026, 7, 15], [2026, 9, 21], [2026, 2, 14],
    [2026, 12, 7], [2026, 12, 9], [2026, 12, 14], [2026, 12, 27], [2026, 12, 30],
    [2027, 1, 3], [2027, 1, 4], [2027, 1, 7], [2026, 8, 13], [2026, 8, 17],
    [2026, 4, 24], [2026, 4, 26], [2026, 5, 2], [2026, 6, 1], [2026, 6, 3], [2026, 10, 31], [2026, 11, 2],
  ])("%i-%i-%i", (a, m, g) => {
    expect(festivitaDelGiorno(d(a, m, g))).toBeNull();
    expect(risolviFestivita(d(a, m, g), "")).toBeNull();
  });

  it("data non valida → nessuna festività", () => {
    expect(festivitaDelGiorno(new Date(NaN))).toBeNull();
  });
});

describe("San Francesco d'Assisi, 4 ottobre (L. 151/2025)", () => {
  it("festa dal 2026, con foglie e micro-foglia; non prima", () => {
    expect(festivitaDelGiorno(d(2026, 10, 4))).toEqual({ id: "sanfrancesco", effetto: "foglie", accento: "foglia" });
    expect(id(d(2027, 10, 4))).toBe("sanfrancesco");
    expect(id(d(2030, 10, 4, 0, 0))).toBe("sanfrancesco");
    expect(id(d(2025, 10, 4))).toBeNull();
    expect(id(d(2026, 10, 3, 23, 59, 59))).toBeNull();
    expect(id(d(2026, 10, 5, 0, 0))).toBeNull();
  });
});

describe("passaggio 31 dicembre / 1 gennaio", () => {
  it("Capodanno dal 31/12 al 2/1, a cavallo dell'anno; Natale finisce il 26/12", () => {
    expect(id(d(2026, 12, 26, 23, 59, 59))).toBe("natale");
    expect(id(d(2026, 12, 27, 0, 0))).toBeNull();
    expect(id(d(2026, 12, 30, 23, 59, 59))).toBeNull();
    expect(id(d(2026, 12, 31, 0, 0))).toBe("capodanno");
    expect(id(d(2026, 12, 31, 23, 59, 59))).toBe("capodanno");
    expect(id(d(2027, 1, 1, 0, 0))).toBe("capodanno");
    expect(id(d(2027, 1, 2, 23, 59, 59))).toBe("capodanno");
    expect(id(d(2027, 1, 3, 0, 0))).toBeNull();
    expect(id(d(2027, 1, 5))).toBe("epifania");
    expect(id(d(2027, 1, 6))).toBe("epifania");
    expect(id(d(2027, 1, 7))).toBeNull();
  });

  it("anche negli anni bisestili e a fine secolo", () => {
    for (const y of [2024, 2028, 2099, 2100]) {
      expect(id(d(y, 12, 31)), `31/12/${y}`).toBe("capodanno");
      expect(id(d(y + 1, 1, 1)), `1/1/${y + 1}`).toBe("capodanno");
      expect(id(d(y + 1, 1, 3)), `3/1/${y + 1}`).toBeNull();
    }
    expect(id(d(2028, 2, 29))).toBeNull();
  });

  it("Immacolata e Natale (15–26/12) restano due finestre distinte", () => {
    expect(id(d(2026, 12, 8))).toBe("immacolata");
    expect(id(d(2026, 12, 15, 0, 0))).toBe("natale");
    expect(id(d(2026, 12, 14, 23, 59))).toBeNull();
  });
});

describe("data locale, non UTC (Europe/Rome)", () => {
  const tzPrima = process.env.TZ;
  beforeAll(() => { process.env.TZ = "Europe/Rome"; });
  afterAll(() => { if (tzPrima === undefined) delete process.env.TZ; else process.env.TZ = tzPrima; });

  it("alle 00:30 del 15/12 a Roma è già Natale anche se in UTC è ancora il 14", () => {
    const t = new Date(Date.UTC(2026, 11, 14, 23, 30));
    expect(t.getDate()).toBe(15);
    expect(id(t)).toBe("natale");
  });

  it("Capodanno parte alla mezzanotte locale, non a quella UTC", () => {
    expect(id(new Date(Date.UTC(2026, 11, 30, 22, 30)))).toBeNull(); // 23:30 del 30/12 a Roma
    expect(id(new Date(Date.UTC(2026, 11, 30, 23, 30)))).toBe("capodanno"); // 00:30 del 31/12 a Roma
  });

  it("prossima mezzanotte giusta anche nel giorno del cambio d'ora", () => {
    // 29/3/2026 alle 01:00: alle 02:00 le lancette saltano alle 03:00, fino a mezzanotte mancano 22 h reali
    expect(msAllaMezzanotte(new Date(2026, 2, 29, 1, 0, 0))).toBe(22 * 3_600_000 + 1_000);
    // 25/10/2026 alle 01:00: alle 03:00 si torna alle 02:00, mancano 24 h reali
    expect(msAllaMezzanotte(new Date(2026, 9, 25, 1, 0, 0))).toBe(24 * 3_600_000 + 1_000);
  });
});

describe("prossima mezzanotte", () => {
  it("un secondo dopo la mezzanotte locale, mai meno di un secondo", () => {
    expect(msAllaMezzanotte(d(2026, 12, 31, 23, 59, 0))).toBe(61_000);
    expect(msAllaMezzanotte(d(2026, 12, 14, 12, 0, 0))).toBe(12 * 3_600_000 + 1_000);
    expect(msAllaMezzanotte(new Date(2026, 11, 31, 23, 59, 59, 900))).toBe(1_100);
    expect(msAllaMezzanotte(new Date(2026, 11, 31, 0, 0, 0, 500))).toBe(86_400_500); // appena passata: la prossima è domani
  });
});

describe("anteprima ?holiday=", () => {
  it.each([
    ["?holiday=natale", "natale"], ["?holiday=pasqua", "pasqua"], ["?holiday=2giugno", "repubblica"],
    ["?holiday=4ottobre", "sanfrancesco"], ["?holiday=NATALE", "natale"], ["?holiday=25%20Aprile", "liberazione"],
    ["?holiday=1%C2%B0%20maggio", "lavoro"], ["?holiday=Pasquetta", "pasqua"], ["?holiday=San%20Francesco", "sanfrancesco"],
    ["?holiday=Ognissanti", "ognissanti"], ["?holiday=8-dicembre", "immacolata"], ["?holiday=15%20agosto", "ferragosto"],
    ["?foo=1&holiday=ferragosto&bar=2", "ferragosto"], ["holiday=epifania", "epifania"], ["?holiday=santo-stefano", "natale"],
    ["?holiday=none", "none"], ["?holiday=NESSUNA", "none"], ["?holiday=off", "none"],
  ])("%s → %s", (search, atteso) => {
    expect(leggiAnteprima(search)).toBe(atteso);
  });

  it.each(["", "?", "?holiday=", "?holiday=xyz", "?holiday=constructor", "?holiday=__proto__", "?holiday=toString", "?altro=natale"])(
    "%s → ignorata", (search) => { expect(leggiAnteprima(search)).toBeNull(); },
  );

  it("ogni id del catalogo si può forzare con il suo nome", () => {
    for (const k of Object.keys(FESTIVITA) as FestivitaId[]) expect(leggiAnteprima(`?holiday=${k}`)).toBe(k);
  });

  it("forza qualsiasi festività, o nessuna anche a Natale; un valore sconosciuto torna alla data", () => {
    expect(risolviFestivita(d(2026, 11, 25), "?holiday=natale")?.id).toBe("natale");
    expect(risolviFestivita(d(2026, 11, 25), "?holiday=2giugno")?.accento).toBe("tricolore");
    expect(risolviFestivita(d(2026, 12, 25), "?holiday=none")).toBeNull();
    expect(risolviFestivita(d(2026, 12, 25), "?holiday=xyz")?.id).toBe("natale");
    expect(risolviFestivita(d(2026, 12, 25))?.id).toBe("natale");
  });
});

describe("catalogo: festività → animazione e accento", () => {
  it("abbinamenti richiesti", () => {
    expect(FESTIVITA).toEqual({
      capodanno: { effetto: "scintille" },
      epifania: { effetto: "stelle", accento: "stella" },
      pasqua: { effetto: "primavera" },
      liberazione: { effetto: "tricolore", accento: "tricolore" },
      lavoro: { effetto: "morbide" },
      repubblica: { effetto: "tricolore", accento: "tricolore" },
      ferragosto: { effetto: "bokeh" },
      sanfrancesco: { effetto: "foglie", accento: "foglia" },
      ognissanti: { effetto: "lumi" },
      immacolata: { effetto: "neve", accento: "fiocco" },
      natale: { effetto: "neve", accento: "fiocco" },
    });
  });

  it("durate delle finestre in giorni", () => {
    const durate = Object.fromEntries(finestreAnno(2026).map((w) => [w.id, w.al - w.dal + 1]));
    expect(durate).toEqual({
      capodanno: 3, epifania: 2, pasqua: 3, liberazione: 1, lavoro: 1, repubblica: 1,
      ferragosto: 3, sanfrancesco: 1, ognissanti: 1, immacolata: 1, natale: 12,
    });
  });
});
