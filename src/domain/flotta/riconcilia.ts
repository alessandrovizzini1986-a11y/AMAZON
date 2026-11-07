/**
 * Riconciliazione flotta (docs/flotta-kit/PROMPT_aggiorna_targhe_tariffe.md):
 * Lista Targhe (foglio Attivi = chi è attivo ora, Cessati = storico) + fatture dei noleggiatori
 * → cosa creare, riattivare, aggiornare o dismettere sul sito, quale canone tenere e quali
 * anomalie contestare. Logica pura: niente DB, niente file.
 */
import { normalizeLeasingCompany, normalizeModello } from "@/domain/vehicleNames";

export const normTarga = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export type StatoSito = "ATTIVO" | "IN_OFFICINA" | "SOSTITUTIVO" | "UFFICIO" | "DISMESSO";
export type TipoContratto = "MT" | "LT" | "BT" | "SOST" | "UFFICIO";

export type ListaRiga = {
  targa: string; station: string; marca: string; modello: string; stato: string; societa: string; tipo: string;
  ra: string | null; inizio: string | null; fine: string | null; note: string | null; tariffa: number | null; franchigiaDanni: number | null;
};
export type CessatoRiga = { targa: string; station: string | null; inizio: string | null; fine: string | null; societa: string };
export type FatturaRiga = {
  fornitore: "ALD" | "ARVAL" | "AVIS" | "EUROPCAR"; fattura: string; targa: string; voce: string;
  dal: string | null; al: string | null; mese: string | null; importo: number; mesePieno: boolean; cdc: string | null;
  gruppo?: string; giorni?: number;
};
export type VeicoloSito = {
  id: string; targa: string; station: string; stato: StatoSito; modello: string; leasingCompany: string | null; tipoContratto: TipoContratto | null;
  contrattoLeasingNo: string | null; contrattoDataInizio: string | null; contrattoDataFine: string | null; canoneMese: number | null; note: string | null;
  franchigiaDanni: number | null; updatedAt?: string;
};

/** Stato del sito dalla colonna Stato della Lista ("sost…", "uff…", altro = attivo). */
export function statoDaLista(s: string): StatoSito {
  const x = s.trim().toLowerCase();
  return x.startsWith("sost") ? "SOSTITUTIVO" : x.startsWith("uff") ? "UFFICIO" : "ATTIVO";
}

const TIPI: Record<string, TipoContratto> = {
  MT: "MT", "NOLEGGIO MEDIO TERMINE": "MT", LT: "LT", "NOLEGGIO LUNGO TERMINE": "LT", LEASING: "LT",
  BT: "BT", "B.T": "BT", "NOLEGGIO BREVE TERMINE": "BT", SOST: "SOST", SOSTITUTIVO: "SOST", UFFICIO: "UFFICIO",
};
export const tipoDaLista = (s: string): TipoContratto | null => TIPI[s.trim().toUpperCase()] ?? null;

/** Fornitore di fattura per la società della Lista (ALD MT, Ayvens → ALD; Amicoblu/Maggiore → AVIS). */
export function fornitoreFattura(societa: string | null): FatturaRiga["fornitore"] | null {
  const s = (societa ?? "").toUpperCase();
  if (/\bALD\b|AYVENS/.test(s)) return "ALD";
  if (s.includes("ARVAL")) return "ARVAL";
  if (/AVIS|AMICOBLU|MAGGIORE/.test(s)) return "AVIS";
  if (s.includes("EUROPCAR")) return "EUROPCAR";
  return null;
}

/** CDC dei nostri progetti: 5569 Amazon (PS00009460), 5565 GLS (PS00022667). */
export const CDC_NOSTRI = ["5569", "5565"];

export type CanoneFatturato = { importo: number; mese: string; fornitore: FatturaRiga["fornitore"]; fattura: string; dal?: string | null };

/**
 * Canone dell'ultimo mese pieno fatturato per targa (righe CANONE, periodo dal 1° all'ultimo
 * del mese; Europcar ≥ 28 giorni riportati a 30). Più righe nello stesso mese si sommano
 * (es. canone + servizi a canone nella stessa fattura).
 */
export function canoniFatturati(fatture: FatturaRiga[]): Map<string, CanoneFatturato> {
  const per = new Map<string, Map<string, CanoneFatturato>>();
  for (const f of fatture) {
    // solo righe positive di mese pieno: note di credito, storni e canoni a 0 (sostitutivi) non sono un canone
    if (f.voce !== "CANONE" || !f.mesePieno || !f.mese || f.importo <= 0) continue;
    const k = `${f.fornitore}|${f.targa}`;
    const m = per.get(k) ?? new Map<string, CanoneFatturato>();
    const prima = m.get(f.mese);
    // Europcar: ogni riga è già un periodo di 30 giorni; due periodi che partono nello stesso mese
    // (1–31/10 e 31/10–30/11) non si sommano: vale quello che parte per ultimo
    if (f.fornitore === "EUROPCAR") {
      if (!prima || (f.dal ?? "") >= (prima.dal ?? "")) m.set(f.mese, { importo: Math.round(f.importo * 100) / 100, mese: f.mese, fornitore: f.fornitore, fattura: f.fattura, dal: f.dal });
    } else m.set(f.mese, { importo: Math.round(((prima?.importo ?? 0) + f.importo) * 100) / 100, mese: f.mese, fornitore: f.fornitore, fattura: f.fattura, dal: f.dal });
    per.set(k, m);
  }
  const out = new Map<string, CanoneFatturato>();
  for (const [k, m] of per) {
    const [ultimo, prec] = [...m.values()].sort((a, b) => b.mese.localeCompare(a.mese));
    // un mese "pieno" molto più basso del precedente è un rateo (uscita a metà mese): vale il precedente
    out.set(k, prec && ultimo.importo < prec.importo * 0.5 ? prec : ultimo);
  }
  return out;
}

export type Cambio = { campo: string; prima: string | number | null; dopo: string | number | null };
export type Esito = {
  crea: { lista: ListaRiga; canone: number | null; fonteCanone: string }[];
  riattiva: { veicolo: VeicoloSito; lista: ListaRiga; cambi: Cambio[] }[];
  aggiorna: { veicolo: VeicoloSito; lista: ListaRiga; cambi: Cambio[] }[];
  dismetti: { veicolo: VeicoloSito; cessato: CessatoRiga }[];
  daVerificare: { veicolo: VeicoloSito; motivo: string }[];
  canoni: { targa: string; station: string; societa: string; lista: number | null; fattura: CanoneFatturato | null; sito: number | null; scelto: number | null; fonte: string }[];
  anomalie: { tipo: string; targa: string; fornitore: string; mese: string | null; importo: number; dettaglio: string }[];
};

const r2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

/**
 * Canone da tenere: fattura (mese pieno) > tariffa Lista > canone del sito. Con `preferisciSito` (aggiornamento
 * senza fatture) il canone già sul sito vale più della tariffa della Lista: spesso viene da una fattura di prima.
 */
export function sceltaCanone(lista: ListaRiga, fatt: CanoneFatturato | null, sito: number | null, preferisciSito = false): { scelto: number | null; fonte: string } {
  // i sostitutivi non si pagano: nessun canone, qualunque cosa dicano Lista o fattura
  if (statoDaLista(lista.stato) === "SOSTITUTIVO") return { scelto: null, fonte: "sostitutivo (non a carico)" };
  if (fatt) return { scelto: fatt.importo, fonte: `fattura ${fatt.fornitore} ${fatt.mese}` };
  if (preferisciSito && sito !== null && sito > 0) return { scelto: sito, fonte: "sito (invariato)" };
  if (lista.tariffa !== null && lista.tariffa > 0) return { scelto: r2(lista.tariffa), fonte: "Lista Targhe" };
  return { scelto: sito, fonte: sito === null ? "nessuna" : "sito (invariato)" };
}

export function riconcilia(x: { lista: ListaRiga[]; cessati: CessatoRiga[]; fatture: FatturaRiga[]; sito: VeicoloSito[]; ultimoMese?: Partial<Record<FatturaRiga["fornitore"], string>>; preferisciSito?: boolean }): Esito {
  const lista = new Map<string, ListaRiga>();
  for (const r of x.lista) lista.set(r.targa, r); // in caso di doppioni vale l'ultima riga
  const cessati = new Map<string, CessatoRiga[]>();
  for (const c of x.cessati) cessati.set(c.targa, [...(cessati.get(c.targa) ?? []), c]);
  const ultimoCessato = (t: string) => (cessati.get(t) ?? []).slice().sort((a, b) => (a.fine ?? "").localeCompare(b.fine ?? "")).at(-1) ?? null;
  const vivi = new Map<string, VeicoloSito>();
  const dismessi = new Map<string, VeicoloSito>();
  for (const v of x.sito) {
    const t = normTarga(v.targa);
    if (v.stato === "DISMESSO") {
      const p = dismessi.get(t);
      if (!p || (v.updatedAt ?? "") > (p.updatedAt ?? "")) dismessi.set(t, v);
    } else vivi.set(t, v);
  }
  const canoni = canoniFatturati(x.fatture);
  const fattDi = (r: ListaRiga) => { const f = fornitoreFattura(r.societa); return f ? canoni.get(`${f}|${r.targa}`) ?? null : null; };

  const esito: Esito = { crea: [], riattiva: [], aggiorna: [], dismetti: [], daVerificare: [], canoni: [], anomalie: [] };

  const cambiDa = (v: VeicoloSito, r: ListaRiga, canone: number | null): Cambio[] => {
    const c: Cambio[] = [];
    const set = (campo: string, prima: string | number | null, dopo: string | number | null) => {
      if (dopo === null || dopo === "") return; // un vuoto in Lista non cancella il dato del sito
      if (typeof dopo === "number" && typeof prima === "number" ? Math.abs(dopo - prima) > 0.005 : String(prima ?? "") !== String(dopo)) c.push({ campo, prima, dopo });
    };
    set("station", v.station, r.station);
    // IN_OFFICINA è uno stato operativo del sito: la Lista lo vede "Attivo", non si tocca
    if (!(v.stato === "IN_OFFICINA" && statoDaLista(r.stato) === "ATTIVO")) set("stato", v.stato, statoDaLista(r.stato));
    set("leasingCompany", v.leasingCompany, normalizeLeasingCompany(r.societa));
    set("tipoContratto", v.tipoContratto, tipoDaLista(r.tipo));
    set("contrattoLeasingNo", v.contrattoLeasingNo, r.ra);
    set("contrattoDataInizio", v.contrattoDataInizio, r.inizio);
    set("contrattoDataFine", v.contrattoDataFine, r.fine);
    // note: la Lista le scrive solo se sul sito non ce ne sono (quelle del sito possono essere state scritte a mano)
    if (!v.note) set("note", v.note, r.note);
    if (statoDaLista(r.stato) === "SOSTITUTIVO") { if (v.canoneMese !== null) c.push({ campo: "canoneMese", prima: v.canoneMese, dopo: null }); }
    else set("canoneMese", v.canoneMese, canone);
    set("franchigiaDanni", v.franchigiaDanni, r.franchigiaDanni);
    return c;
  };

  for (const r of lista.values()) {
    const f = fattDi(r);
    const v = vivi.get(r.targa);
    const { scelto, fonte } = sceltaCanone(r, f, v?.canoneMese ?? null, x.preferisciSito ?? false);
    esito.canoni.push({ targa: r.targa, station: r.station, societa: r.societa, lista: r.tariffa, fattura: f, sito: v?.canoneMese ?? null, scelto, fonte });
    if (v) {
      const cambi = cambiDa(v, r, scelto);
      if (cambi.length) esito.aggiorna.push({ veicolo: v, lista: r, cambi });
    } else if (dismessi.has(r.targa)) {
      const d = dismessi.get(r.targa)!;
      esito.riattiva.push({ veicolo: d, lista: r, cambi: cambiDa(d, r, scelto) });
    } else {
      esito.crea.push({ lista: r, canone: scelto, fonteCanone: fonte });
    }
    if (f && statoDaLista(r.stato) !== "SOSTITUTIVO" && r.tariffa !== null && r.tariffa > 0 && Math.abs(f.importo - r.tariffa) > 1) {
      esito.anomalie.push({ tipo: "tariffa Lista diversa dalla fattura", targa: r.targa, fornitore: f.fornitore, mese: f.mese, importo: f.importo, dettaglio: `Lista ${r.tariffa} €, fattura ${f.importo} € (${r.station})` });
    }
    if (f && statoDaLista(r.stato) === "SOSTITUTIVO" && f.importo > 0) {
      esito.anomalie.push({ tipo: "sostitutivo fatturato a canone", targa: r.targa, fornitore: f.fornitore, mese: f.mese, importo: f.importo, dettaglio: `${r.station} · i sostitutivi non si pagano: da contestare` });
    }
    if (scelto === null && statoDaLista(r.stato) === "ATTIVO") {
      esito.anomalie.push({ tipo: "attivo senza tariffa", targa: r.targa, fornitore: r.societa, mese: null, importo: 0, dettaglio: `${r.station} · ${r.tipo}` });
    }
  }

  for (const [t, v] of vivi) {
    if (lista.has(t)) continue;
    const c = ultimoCessato(t);
    if (c) esito.dismetti.push({ veicolo: v, cessato: c });
    else esito.daVerificare.push({ veicolo: v, motivo: "attivo sul sito, non in Attivi e non in Cessati" });
  }

  // fatturate a canone nell'ultimo mese del fornitore ma non (più) in flotta
  const ultimo: Partial<Record<FatturaRiga["fornitore"], string>> = { ...x.ultimoMese };
  for (const f of x.fatture) if (f.voce === "CANONE" && f.mese && (!ultimo[f.fornitore] || f.mese > ultimo[f.fornitore]!)) ultimo[f.fornitore] = f.mese;
  const visti = new Set<string>();
  for (const f of x.fatture) {
    if (f.voce !== "CANONE" || f.importo <= 0 || f.mese !== ultimo[f.fornitore] || lista.has(f.targa)) continue;
    const nostra = (f.cdc !== null && CDC_NOSTRI.includes(f.cdc)) || vivi.has(f.targa) || dismessi.has(f.targa) || cessati.has(f.targa);
    if (!nostra) continue;
    const k = `${f.fornitore}|${f.targa}|${f.mese}`;
    if (visti.has(k)) continue;
    visti.add(k);
    const c = ultimoCessato(f.targa);
    // cessata dopo la fine del mese fatturato: era ancora in flotta, nessuna anomalia
    const fineMese = new Date(Date.UTC(Number(f.mese.slice(0, 4)), Number(f.mese.slice(5, 7)), 0)).toISOString().slice(0, 10);
    if (c?.fine && c.fine >= fineMese) continue;
    const imp = x.fatture.filter((g) => g.fornitore === f.fornitore && g.targa === f.targa && g.voce === "CANONE" && g.mese === f.mese).reduce((s, g) => s + g.importo, 0);
    esito.anomalie.push({
      tipo: c?.fine && c.fine < `${f.mese}-01` ? "fatturata dopo la cessazione" : c ? "fatturata nel mese della cessazione" : "fatturata ma mai in Lista",
      targa: f.targa, fornitore: f.fornitore, mese: f.mese, importo: Math.round(imp * 100) / 100,
      dettaglio: c ? `cessata il ${c.fine ?? "?"} (${c.station ?? "?"})` : `CDC ${f.cdc ?? "?"}`,
    });
  }
  return esito;
}

/** Dati per creare o riattivare un veicolo dalla riga della Lista. */
export function datiDaLista(r: ListaRiga, canone: number | null) {
  return {
    targa: r.targa, modello: normalizeModello(`${r.marca} ${r.modello}`.trim()) || r.modello || "N/D", station: r.station, stato: statoDaLista(r.stato),
    leasingCompany: normalizeLeasingCompany(r.societa), tipoContratto: tipoDaLista(r.tipo), contrattoLeasingNo: r.ra, contrattoDataInizio: r.inizio,
    contrattoDataFine: r.fine, note: r.note, canoneMese: canone, franchigiaDanni: r.franchigiaDanni,
  };
}

/** Riepilogo per station: targhe non dismesse e somma canoni. */
export function perStation(v: { station: string; stato: string; canoneMese: number | null }[]) {
  const out: Record<string, { n: number; attivi: number; sostitutivi: number; canone: number }> = {};
  for (const x of v) {
    if (x.stato === "DISMESSO") continue;
    const o = (out[x.station] ??= { n: 0, attivi: 0, sostitutivi: 0, canone: 0 });
    o.n++; if (x.stato === "SOSTITUTIVO") o.sostitutivi++; else o.attivi++;
    o.canone = Math.round((o.canone + (x.canoneMese ?? 0)) * 100) / 100;
  }
  return out;
}

/** Firma delle modifiche di un esito: l'anteprima e l'applica devono dare la stessa (altrimenti il sito è cambiato nel frattempo). */
export function firmaEsito(e: Esito): string {
  const parti = [
    ...e.crea.map((c) => `C:${c.lista.targa}:${c.lista.station}:${c.canone ?? ""}`),
    ...e.riattiva.map((r) => `R:${r.veicolo.id}:${r.cambi.map((c) => `${c.campo}=${c.dopo ?? ""}`).join(",")}`),
    ...e.aggiorna.map((a) => `A:${a.veicolo.id}:${a.cambi.map((c) => `${c.campo}=${c.dopo ?? ""}`).join(",")}`),
    ...e.dismetti.map((d) => `D:${d.veicolo.id}:${d.cessato.fine ?? ""}`),
  ].sort();
  let h = 0;
  for (const ch of parti.join("|")) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return `${parti.length}-${(h >>> 0).toString(36)}`;
}
