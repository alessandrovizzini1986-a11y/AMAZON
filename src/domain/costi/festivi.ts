/**
 * Domeniche e festivi per il modulo Costi (regola §3 "Comuni"): festività
 * nazionali, 24/12 e 31/12 (semifestivi, art. 10 Accordo) e patrono della
 * station. Mai il sabato.
 */
export const STATIONS_COSTI = ["DER1", "DER2", "DLO2", "DLO4", "DLO5", "DLZ2", "DVN1"] as const;
export type StationCosti = (typeof STATIONS_COSTI)[number];

export type Festivo = { data: string; descrizione: string; station: string }; // station = "TUTTE" o codice DS

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Pasqua (algoritmo di Gauss / Meeus) → AAAA-MM-GG */
export function pasqua(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, mese, giorno);
}

const piuGiorni = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** n-esima domenica del mese */
export function ennesimaDomenica(y: number, m: number, n: number): string {
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1));
  return d.toISOString().slice(0, 10);
}

/** Patrono della station nell'anno. */
export function patrono(station: string, y: number): string | null {
  switch (station) {
    case "DER1": return iso(y, 10, 11);
    case "DER2": return iso(y, 9, 29);
    case "DLO2": return ennesimaDomenica(y, 9, 2);
    case "DLO4": return ennesimaDomenica(y, 9, 3);
    case "DLO5": return ennesimaDomenica(y, 5, 2);
    case "DLZ2": return iso(y, 7, 11);
    case "DVN1": return iso(y, 7, 20);
    default: return null;
  }
}

/** Festivi dell'anno: nazionali (con Pasquetta), semifestivi 24/12 e 31/12, patroni. */
export function festiviAnno(y: number): Festivo[] {
  const naz: [number, number, string][] = [[1, 1, "Capodanno"], [1, 6, "Epifania"], [4, 25, "Liberazione"], [5, 1, "Festa del lavoro"], [6, 2, "Festa della Repubblica"], [8, 15, "Ferragosto"], [11, 1, "Ognissanti"], [12, 8, "Immacolata"], [12, 25, "Natale"], [12, 26, "Santo Stefano"]];
  const out: Festivo[] = naz.map(([m, d, t]) => ({ data: iso(y, m, d), descrizione: `Nazionale: ${t}`, station: "TUTTE" }));
  out.push({ data: piuGiorni(pasqua(y), 1), descrizione: "Nazionale: Lunedì dell'Angelo", station: "TUTTE" });
  out.push({ data: iso(y, 12, 24), descrizione: "Semifestivo (art. 10 Accordo)", station: "TUTTE" }, { data: iso(y, 12, 31), descrizione: "Semifestivo (art. 10 Accordo)", station: "TUTTE" });
  for (const s of STATIONS_COSTI) out.push({ data: patrono(s, y)!, descrizione: "Patrono", station: s });
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.station.localeCompare(b.station));
}

const domenica = (d: string) => new Date(d + "T00:00:00Z").getUTCDay() === 0;

/** Il giorno è domenica o festivo per la station. Il sabato non vale mai come domenica (un festivo che cade di sabato resta festivo). */
export function domenicaOFestivo(d: string, station: string, festivi: Festivo[]): boolean {
  return domenica(d) || festivi.some((f) => f.data === d && (f.station === "TUTTE" || f.station === station));
}

/** Festivi del mese per la station (per le ore festività STD e le festività non godute SIC). */
export const festiviMese = (anno: number, mese: number, station: string, festivi: Festivo[]) =>
  festivi.filter((f) => f.data.startsWith(`${anno}-${String(mese).padStart(2, "0")}`) && (f.station === "TUTTE" || f.station === station));
