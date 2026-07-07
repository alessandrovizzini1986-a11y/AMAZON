import { describe, it, expect } from "vitest";
import { checkTagliando, checkRevisione, giorniTra } from "@/domain/maintenance";

const SOGLIE_GIORNI = [30, 15, 7];
const SOGLIE_KM = [1000, 500, 100];
const oggi = new Date(2026, 6, 7);

describe("checkTagliando — doppia soglia km/data", () => {
  it("ok quando entrambe le soglie sono lontane", () => {
    const r = checkTagliando({
      oggi,
      kmAttuali: 50_000,
      prossimoTagliandoData: new Date(2026, 9, 1),
      prossimoTagliandoKm: 60_000,
      sogliaGiorni: SOGLIE_GIORNI,
      sogliaKm: SOGLIE_KM,
    });
    expect(r.urgency).toBe("ok");
  });

  it("warn quando la data entra nella prima soglia (30gg)", () => {
    const r = checkTagliando({
      oggi,
      kmAttuali: 50_000,
      prossimoTagliandoData: new Date(2026, 6, 27), // 20 giorni
      prossimoTagliandoKm: 60_000,
      sogliaGiorni: SOGLIE_GIORNI,
      sogliaKm: SOGLIE_KM,
    });
    expect(r.urgency).toBe("warn");
    expect(r.giorniMancanti).toBe(20);
  });

  it("alert sulla soglia che scatta PRIMA: km in danger vince su data ok", () => {
    const r = checkTagliando({
      oggi,
      kmAttuali: 59_950, // mancano 50 km < soglia minima 100
      prossimoTagliandoData: new Date(2026, 11, 1),
      prossimoTagliandoKm: 60_000,
      sogliaGiorni: SOGLIE_GIORNI,
      sogliaKm: SOGLIE_KM,
    });
    expect(r.urgency).toBe("danger");
    expect(r.kmMancanti).toBe(50);
  });

  it("danger quando il tagliando è scaduto per data", () => {
    const r = checkTagliando({
      oggi,
      kmAttuali: 10_000,
      prossimoTagliandoData: new Date(2026, 5, 25),
      prossimoTagliandoKm: 20_000,
      sogliaGiorni: SOGLIE_GIORNI,
      sogliaKm: SOGLIE_KM,
    });
    expect(r.urgency).toBe("danger");
    expect(r.reason).toContain("scaduto");
  });

  it("warn se la scadenza non è pianificata (dato mancante ≠ dato ok)", () => {
    const r = checkTagliando({
      oggi,
      kmAttuali: 10_000,
      prossimoTagliandoData: null,
      prossimoTagliandoKm: null,
      sogliaGiorni: SOGLIE_GIORNI,
      sogliaKm: SOGLIE_KM,
    });
    expect(r.urgency).toBe("warn");
  });
});

describe("checkRevisione — scadenza legale", () => {
  it("danger e non circolabile se scaduta", () => {
    const r = checkRevisione({ oggi, prossimaRevisione: new Date(2026, 5, 1), sogliaGiorni: SOGLIE_GIORNI });
    expect(r.urgency).toBe("danger");
    expect(r.reason).toContain("non circolabile");
  });

  it("ok se lontana", () => {
    const r = checkRevisione({ oggi, prossimaRevisione: new Date(2027, 5, 1), sogliaGiorni: SOGLIE_GIORNI });
    expect(r.urgency).toBe("ok");
  });
});

describe("giorniTra", () => {
  it("conta i giorni interi", () => {
    expect(giorniTra(new Date(2026, 0, 1), new Date(2026, 0, 31))).toBe(30);
  });
});
