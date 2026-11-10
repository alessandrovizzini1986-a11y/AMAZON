/**
 * Telefoni e SIM: il file Wind ufficiale (fogli "Mobile Ricaricabile" = SIM, "terminali" = telefoni, quello che paghiamo)
 * abbinato ai censimenti locali (QUERY_BYOD, GLS_GESTIONE_BYOD: un foglio per station con TAG BYOD, modello, IMEI,
 * ICCID, numero, assegnatario, stato, PIN/PUK). Chiavi: SIM = numero di telefono (Service ID), telefono = IMEI.
 * Puro: lavora su matrici di celle, nel browser e nei test.
 */
type Cella = string | number | boolean | Date | null | undefined;
export type Matrice = Cella[][];

export type SimWind = { numero: string; contratto: string; stato: string; attivazione: string | null; piano: string; cdf: string };
export type TerminaleWind = { imei: string; contratto: string; stato: string; attivazione: string | null; cdf: string };
export type RigaLocale = {
  fonte: string; station: string | null; tag: string | null; modello: string | null; imei: string | null; iccid: string | null; numero: string | null;
  assegnatario: string | null; stato: string | null; pin: string | null; puk: string | null; note: string | null;
};

const t = (v: Cella) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
/** Testo della cella o null; i testi lunghi (note scritte nelle colonne di stato) si accorciano. */
const vuoto = (s: string) => (s === "" || s === "-" || /^#N\/?A$/i.test(s) ? null : s.length > 250 ? `${s.slice(0, 249)}…` : s);
const iso = (v: Cella): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t(v));
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

/** Numero di telefono italiano a 9–10 cifre, senza prefisso internazionale. */
export function normNumero(v: Cella): string | null {
  let s = t(v).replace(/[^\d]/g, "");
  if (s.startsWith("0039")) s = s.slice(4); else if (s.length > 10 && s.startsWith("39")) s = s.slice(2);
  return s.length >= 9 && s.length <= 10 && s.startsWith("3") ? s : null;
}
/** IMEI a 15 cifre (le celle a volte hanno spazi, apici o 16 cifre con il check digit separato). */
export function normImei(v: Cella): string | null {
  if (typeof v === "number" && !Number.isSafeInteger(v)) return null;
  const s = t(v).replace(/[^\d]/g, "");
  return s.length >= 14 && s.length <= 16 ? s.slice(0, 15) : null;
}
/** ICCID a 19–20 cifre; un numero in virgola mobile ha perso le cifre finali e non vale. */
export function normIccid(v: Cella): string | null {
  if (typeof v === "number" && !Number.isSafeInteger(v)) return null;
  const s = t(v).replace(/[^\d]/g, "");
  return s.length >= 18 && s.length <= 20 && s.startsWith("89") ? s : null;
}
/** PIN 4–8 cifre, PUK 8 cifre: "PUK12345678" → 12345678; "0000" resta. */
const codice = (v: Cella, min: number, max: number) => { const s = t(v).replace(/^(PIN|PUK)\s*:?\s*/i, "").replace(/\s/g, ""); return /^\d+$/.test(s) && s.length >= min && s.length <= max ? s : null; };
const stationDa = (v: Cella) => { const s = t(v).toUpperCase(); const m = /\b(DER1|DER2|DLO2|DLO4|DLO5|DLZ2|DVN1|GLS)\b/.exec(s); return m ? m[1] : null; };

/** File Wind ufficiale. */
export function leggiWind(sim: Matrice, terminali: Matrice): { sim: SimWind[]; terminali: TerminaleWind[] } {
  const col = (m: Matrice, nomi: string[]) => { const h = m.findIndex((r) => r.some((v) => t(v) === "Service ID")); const hdr = (m[h] ?? []).map(t); return { h, i: (n: string) => hdr.findIndex((x) => x.toLowerCase() === n.toLowerCase()), ok: nomi.every((n) => hdr.some((x) => x.toLowerCase() === n.toLowerCase())) }; };
  const a = col(sim, ["Contratto", "Stato", "Service ID"]), b = col(terminali, ["Contratto", "Stato", "Service ID"]);
  if (a.h < 0 || !a.ok) throw new Error('nel foglio "Mobile Ricaricabile" non trovo Contratto, Stato e Service ID');
  if (b.h < 0 || !b.ok) throw new Error('nel foglio "terminali" non trovo Contratto, Stato e Service ID');
  const outS: SimWind[] = [], outT: TerminaleWind[] = [];
  for (const r of sim.slice(a.h + 1)) {
    const numero = normNumero(r[a.i("Service ID")]); if (!numero) continue;
    outS.push({ numero, contratto: t(r[a.i("Contratto")]), stato: t(r[a.i("Stato")]), attivazione: iso(r[a.i("Data Attivazione")]), piano: t(r[a.i("Piano Tariffario")]), cdf: t(r[a.i("ID CdF NRC")]) });
  }
  for (const r of terminali.slice(b.h + 1)) {
    const imei = normImei(r[b.i("Service ID")]); if (!imei) continue;
    outT.push({ imei, contratto: t(r[b.i("Contratto")]), stato: t(r[b.i("Stato")]), attivazione: iso(r[b.i("Data Attivazione")]), cdf: t(r[b.i("ID CdF NRC")]) });
  }
  return { sim: outS, terminali: outT };
}

/** Fogli di riepilogo/pivot da non leggere come censimento. */
const SALTA = /^(pvt|pvvt|peak|sim switch|costi|scadenze|pc$|scarpe|modelli|planning|annotazioni|contestazioni|disattivazione)/i;

/**
 * Righe di censimento da un foglio qualsiasi: si cerca l'intestazione con almeno due tra IMEI, ICCID e numero
 * (NUMERO DI TELEFONO, SERVICE ID, NUMERO). Le colonne si riconoscono dal nome; PIN e PUK anche se l'intestazione ha spazi.
 */
export function righeLocali(nomeFile: string, foglio: string, m: Matrice): RigaLocale[] {
  if (SALTA.test(foglio.trim())) return [];
  const isImei = (s: string) => /^imei$|^id dispositivo$/i.test(s), isIccid = (s: string) => /^iccid( sim)?$|^nuova iccid$/i.test(s), isNum = (s: string) => /^numero( di telefono)?$|^service id$|^n telefono$/i.test(s);
  const h = m.slice(0, 15).findIndex((r) => { const x = r.map((v) => t(v)); return [x.some(isImei), x.some(isIccid), x.some(isNum)].filter(Boolean).length >= 2 || (x.some(isImei) && x.some((s) => /^modello$/i.test(s))); });
  if (h < 0) return [];
  const hdr = m[h].map((v) => t(v));
  const primo = (f: (s: string) => boolean) => hdr.findIndex(f);
  const c = {
    station: primo((s) => /^(station|ds)$/i.test(s)), tag: primo((s) => /^tag( byod)?$/i.test(s)), modello: primo((s) => /^modello$/i.test(s)),
    imei: primo(isImei), iccid: primo(isIccid), numero: primo(isNum), assegnatario: primo((s) => /assegnat|nominativo|nome assegnatario/i.test(s) && !/^rotazione\/assegnato$/i.test(s)),
    stato: primo((s) => /^(status|stato|stato telefono|checked|rotazione\/assegnato)$/i.test(s)), pinPuk: primo((s) => /^pin\s*\/\s*puk$/i.test(s)), pin: hdr.map((s, i) => [s, i] as const).filter(([s]) => /^pin( sim)?$/i.test(s)).map(([, i]) => i),
    puk: hdr.map((s, i) => [s, i] as const).filter(([s]) => /^puk$/i.test(s)).map(([, i]) => i), note: primo((s) => /^note$/i.test(s)),
  };
  const out: RigaLocale[] = [];
  for (const r of m.slice(h + 1)) {
    const g = (i: number) => (i >= 0 ? vuoto(t(r[i])) : null);
    const imei = c.imei >= 0 ? normImei(r[c.imei]) : null, iccid = c.iccid >= 0 ? normIccid(r[c.iccid]) : null, numero = c.numero >= 0 ? normNumero(r[c.numero]) : null;
    if (!imei && !iccid && !numero) continue;
    // PIN e PUK a volte finiscono nelle note ("PUK12345678") o in colonne senza nome
    const testo = r.map((v) => t(v)).join(" ");
    // colonna unica "PIN/PUK": "1234/12345678" o "1234 - 12345678"
    const pp = c.pinPuk >= 0 ? /(\d{4,8})\D+(\d{8})/.exec(t(r[c.pinPuk])) : null;
    const pin = c.pin.map((i) => codice(r[i], 4, 8)).find(Boolean) ?? pp?.[1] ?? (/\bPIN\s*:?\s*(\d{4,8})\b/i.exec(testo)?.[1] ?? null);
    const puk = c.puk.map((i) => codice(r[i], 8, 8)).find(Boolean) ?? pp?.[2] ?? (/\bPUK\s*:?\s*(\d{8})\b/i.exec(testo)?.[1] ?? null);
    out.push({
      fonte: `${nomeFile} · ${foglio}`, station: stationDa(g(c.station)) ?? stationDa(foglio), tag: g(c.tag), modello: g(c.modello), imei, iccid, numero,
      assegnatario: g(c.assegnatario), stato: g(c.stato)?.toUpperCase() ?? (/restituit/i.test(foglio) ? "RESTITUITO" : /cessa/i.test(foglio) ? "DA CESSARE" : null), pin, puk, note: g(c.note),
    });
  }
  return out;
}

export type Sim = {
  numero: string; iccid: string | null; inWind: boolean; statoWind: string | null; attivazione: string | null; piano: string | null; contratto: string | null;
  station: string | null; tag: string | null; assegnatario: string | null; stato: string | null; pin: string | null; puk: string | null; imei: string | null; note: string | null; fonti: string[];
};
export type Telefono = {
  imei: string; inWind: boolean; statoWind: string | null; attivazione: string | null; contratto: string | null;
  station: string | null; tag: string | null; modello: string | null; assegnatario: string | null; stato: string | null; numero: string | null; note: string | null; fonti: string[];
};

/**
 * Abbina Wind e censimenti. Più righe locali per la stessa SIM/IMEI si fondono: vale il primo valore non vuoto
 * nell'ordine dei file/fogli passati (prima i fogli per station, poi i riepiloghi). ICCID, PIN e PUK si recuperano
 * anche dalle righe che hanno solo l'ICCID (SIM_PIN_PUK, iccid).
 */
export function abbina(wind: { sim: SimWind[]; terminali: TerminaleWind[] }, locali: RigaLocale[]) {
  const sim = new Map<string, Sim>(), tel = new Map<string, Telefono>();
  for (const w of wind.sim) sim.set(w.numero, { numero: w.numero, iccid: null, inWind: true, statoWind: w.stato, attivazione: w.attivazione, piano: w.piano, contratto: w.contratto, station: null, tag: null, assegnatario: null, stato: null, pin: null, puk: null, imei: null, note: null, fonti: [] });
  for (const w of wind.terminali) tel.set(w.imei, { imei: w.imei, inWind: true, statoWind: w.stato, attivazione: w.attivazione, contratto: w.contratto, station: null, tag: null, modello: null, assegnatario: null, stato: null, numero: null, note: null, fonti: [] });
  const riempi = <T extends Record<string, unknown>>(x: T, campi: Partial<T>) => { for (const [k, v] of Object.entries(campi)) if ((x[k] === null || x[k] === undefined) && v !== null && v !== undefined) (x as Record<string, unknown>)[k] = v; };
  // ICCID → numero, dalle righe che hanno entrambi
  const iccidNumero = new Map<string, string>();
  for (const r of locali) if (r.iccid && r.numero && !iccidNumero.has(r.iccid)) iccidNumero.set(r.iccid, r.numero);
  for (const r of locali) {
    const numero = r.numero ?? (r.iccid ? iccidNumero.get(r.iccid) ?? null : null);
    if (numero) {
      let s = sim.get(numero);
      if (!s) { s = { numero, iccid: null, inWind: false, statoWind: null, attivazione: null, piano: null, contratto: null, station: null, tag: null, assegnatario: null, stato: null, pin: null, puk: null, imei: null, note: null, fonti: [] }; sim.set(numero, s); }
      riempi(s, { iccid: r.iccid, station: r.station, tag: r.tag, assegnatario: r.assegnatario, stato: r.stato, pin: r.pin, puk: r.puk, imei: r.imei, note: r.note });
      if (!s.fonti.includes(r.fonte)) s.fonti.push(r.fonte);
    }
    if (r.imei) {
      let x = tel.get(r.imei);
      if (!x) { x = { imei: r.imei, inWind: false, statoWind: null, attivazione: null, contratto: null, station: null, tag: null, modello: null, assegnatario: null, stato: null, numero: null, note: null, fonti: [] }; tel.set(r.imei, x); }
      riempi(x, { station: r.station, tag: r.tag, modello: r.modello, assegnatario: r.assegnatario, stato: r.stato, numero, note: r.note });
      if (!x.fonti.includes(r.fonte)) x.fonti.push(r.fonte);
    }
  }
  const sims = [...sim.values()].sort((a, b) => Number(b.inWind) - Number(a.inWind) || (a.station ?? "~").localeCompare(b.station ?? "~") || a.numero.localeCompare(b.numero));
  const telefoni = [...tel.values()].sort((a, b) => Number(b.inWind) - Number(a.inWind) || (a.station ?? "~").localeCompare(b.station ?? "~") || a.imei.localeCompare(b.imei));
  const conta = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
  return {
    sim: sims, telefoni,
    riepilogo: {
      simWind: wind.sim.length, simWindTrovate: conta(sims, (s) => s.inWind && s.fonti.length > 0), simWindSenzaCensimento: conta(sims, (s) => s.inWind && !s.fonti.length),
      simSoloCensimento: conta(sims, (s) => !s.inWind), simConPin: conta(sims, (s) => !!s.pin), simConPuk: conta(sims, (s) => !!s.puk),
      telWind: wind.terminali.length, telWindTrovati: conta(telefoni, (x) => x.inWind && x.fonti.length > 0), telWindSenzaCensimento: conta(telefoni, (x) => x.inWind && !x.fonti.length), telSoloCensimento: conta(telefoni, (x) => !x.inWind),
    },
  };
}

/**
 * Ordine di lettura dei fogli (il primo valore non vuoto vince): 0 = file di gestione della station (ARCHIVIO, DEVICE…),
 * 1 = fogli per station dei file riepilogativi, 2 = riepiloghi di tutte le DS, 3 = altri, 4 = restituiti / da cessare.
 */
export function rangoFoglio(nomeFile: string, foglio: string): number {
  const f = foglio.trim();
  if (/restituit|cessa|older|vecch/i.test(f)) return 4;
  if (/_GESTIONE_BYOD/i.test(nomeFile) && !/^GLS_/i.test(nomeFile)) return 0;
  if (/^(DER1|DER2|DLO2|DLO4|DLO5|DLZ2|DVN1|ARCHIVIO)$/i.test(f)) return 1;
  if (/allds|all_ds|database/i.test(f)) return 2;
  return 3;
}

export const SITUAZIONI = ["ASSEGNATO", "ROTAZIONE", "SCORTA", "ATTIVO", "DISMESSO"] as const;
export type Situazione = (typeof SITUAZIONI)[number];
export const ETICHETTA_SITUAZIONE: Record<Situazione, string> = { ASSEGNATO: "Assegnato", ROTAZIONE: "A rotazione", SCORTA: "Scorta", ATTIVO: "Attivo, stato non indicato", DISMESSO: "Dismesso" };

const DISMESSO = /ROTT|SPEDIT|RESTITU|SMARRIT|FURTO|RUBAT|BATTERI|NON SI ACCENDE|NON FUNZION|SCHERMO|LICENZIAT|CESSA|DA BLOCCARE|DA CHIUDERE|DISMESS|NON FA LOGGARE|SISTEMA OPERATIVO|FOTOCAMERA|DENUNCI|DISATTIVAT/i;
const SCORTA = /SCORTA|BACKUP|FUNZIONANTE|IN ATTESA|FERMO|DA ASSEGNARE|SCATOLA/i;

/**
 * Situazione normalizzata dagli stati e dalle note scritti a mano nei file delle station: stati e note "particolari"
 * (rotto, spedito, restituito, smarrito…) = dismesso; ASSEGNATO e ROTAZIONE come sono; scorta/backup/scatola = scorta;
 * il resto (stato vuoto, "ATTIVO") è attivo con stato non indicato. "Vetro rotto ma funzionante" resta attivo.
 */
export function situazione(stato: string | null, note: string | null, assegnatario: string | null = null): Situazione {
  const s = (stato ?? "").trim().toUpperCase(), n = (note ?? "").trim().toUpperCase();
  const funzionante = (x: string) => /MA FUNZIONANTE|NON DISATTIVARE/.test(x);
  if (s === "ASSEGNATO") return n && DISMESSO.test(n) && !funzionante(n) ? "DISMESSO" : "ASSEGNATO";
  if (s === "ROTAZIONE") return n && DISMESSO.test(n) && !funzionante(n) ? "DISMESSO" : "ROTAZIONE";
  if (s && DISMESSO.test(s) && !funzionante(s)) return "DISMESSO";
  if (s && SCORTA.test(s)) return "SCORTA";
  if (n && DISMESSO.test(n) && !funzionante(n)) return "DISMESSO";
  if (n && SCORTA.test(n)) return "SCORTA";
  // stato non scritto (DER2, DLZ2): lo dice l'assegnatario
  const a = (assegnatario ?? "").trim().toUpperCase();
  if (a && /ROTAZION/.test(a)) return "ROTAZIONE";
  if (a && /SCORTA|BACKUP|UFFICIO|MAGAZZINO/.test(a)) return "SCORTA";
  if (a && /[A-Z]{2,}/.test(a)) return "ASSEGNATO";
  return "ATTIVO";
}

export const attiva = (x: Situazione) => x !== "DISMESSO";
