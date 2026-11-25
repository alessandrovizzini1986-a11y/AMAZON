/**
 * Assenze del personale per station: indicatori, punteggio di rischio, peso sul network e priorità.
 * Solo calcoli (niente rete né database). Unità: GIORNI di assenza, non ore: le ore in busta non sono confrontabili tra
 * SIC e STD (un somministrato part time ha giornate di 3–4 ore, un SIC di quasi 8).
 */
export type Gruppo = "SIC" | "STD";
export type Vista = Gruppo | "TOTALE";
export type RigaMese = {
  mese: string; station: string; gruppo: Gruppo; teste: number; calendario: boolean; rotte: number | null; rotteTd: number;
  /** giorni lavorati dal calendario della busta (0 se la busta non ha il calendario) */
  ggLavorati: number;
  /** altre assenze: non retribuite, ingiustificate, malattia figlio */
  ggAltre: number;
  ggMalattia: number; ggInfortunio: number; persMalattia: number; persInfortunio: number; persAssenti: number;
};
export type Somma = { teste: number; mesi: number; rotte: number; ggLavorati: number; ggAltre: number; ggMalattia: number; ggInfortunio: number; persAssenti: number };
export type Indicatori = {
  /** persone in media al mese */
  headcount: number;
  /** persone con almeno un giorno di malattia o infortunio, in % delle persone (media dei mesi) */
  assentiPct: number;
  /** giorni di malattia ogni 100 lavoratori al mese */
  malattia100: number;
  /** giorni di infortunio ogni 100 lavoratori al mese */
  infortunio100: number;
  /** giorni di infortunio ogni 1.000 rotte */
  infortunio1000Rotte: number | null;
  giorniPersi: number;
};
export type Livello = "OK" | "ATTENZIONE" | "CRITICA" | "PRIORITARIA";
export const ETICHETTA_LIVELLO: Record<Livello, string> = { OK: "Sotto controllo", ATTENZIONE: "Attenzione", CRITICA: "Criticità", PRIORITARIA: "Intervento prioritario" };
export const livelloDi = (punti: number): Livello => (punti <= 30 ? "OK" : punti <= 60 ? "ATTENZIONE" : punti <= 80 ? "CRITICA" : "PRIORITARIA");
export const PESI_RISCHIO = { malattia: 0.5, frequenza: 0.25, gravita: 0.25 } as const;
export const PESI_PRIORITA = { rischio: 0.6, peso: 0.4 } as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const zero = (): Somma => ({ teste: 0, mesi: 0, rotte: 0, ggLavorati: 0, ggAltre: 0, ggMalattia: 0, ggInfortunio: 0, persAssenti: 0 });

/** Somma le righe (mesi e gruppi) di una station. I mesi senza calendario non entrano: lì le assenze non si conoscono. */
export function somma(righe: RigaMese[]): Somma {
  const s = zero(); const mesi = new Set<string>();
  for (const r of righe) { if (!r.calendario) continue; s.teste += r.teste; s.rotte += r.rotte ?? 0; s.ggLavorati += r.ggLavorati; s.ggAltre += r.ggAltre; s.ggMalattia += r.ggMalattia; s.ggInfortunio += r.ggInfortunio; s.persAssenti += r.persAssenti; mesi.add(r.mese); }
  s.mesi = mesi.size;
  return s;
}

export function indicatori(s: Somma): Indicatori {
  const t = s.teste || 1;
  return {
    headcount: s.mesi ? Math.round(s.teste / s.mesi) : 0, assentiPct: r1((s.persAssenti / t) * 100), malattia100: r1((s.ggMalattia / t) * 100), infortunio100: r1((s.ggInfortunio / t) * 100),
    infortunio1000Rotte: s.rotte ? r1((s.ggInfortunio / s.rotte) * 1000) : null, giorniPersi: s.ggMalattia + s.ggInfortunio,
  };
}

/** Le tre misure del rischio: quanta malattia, quante persone si infortunano, quanto durano gli infortuni. */
export type MisureRischio = {
  /** giorni di malattia in % dei giorni dovuti */
  malattiaPct: number;
  /** persone diverse con almeno un giorno di infortunio */
  infortunati: number;
  /** persone infortunate ogni 1.000 rotte */
  frequenza: number;
  /** giorni di infortunio per persona infortunata */
  gravita: number;
};
export function misure(s: Somma, infortunati: number): MisureRischio {
  const dovuti = s.ggLavorati + s.ggMalattia + s.ggInfortunio + s.ggAltre;
  return { malattiaPct: dovuti ? r1((s.ggMalattia / dovuti) * 100) : 0, infortunati, frequenza: s.rotte ? Math.round((infortunati / s.rotte) * 100000) / 100 : 0, gravita: infortunati ? r1(s.ggInfortunio / infortunati) : 0 };
}
type Parti = { malattia: number; frequenza: number; gravita: number };
/**
 * Punteggio di rischio 0–100. Ogni misura si confronta con il valore del network nello stesso periodo:
 * uguale al network = 50 punti, il doppio o più = 100, zero = 0. Poi la media pesata: malattia 50%, frequenza degli
 * infortuni 25%, durata degli infortuni 25%. Frequenza e durata sono separate perché un solo infortunio lungo non
 * deve pesare come tanti infortuni brevi.
 */
export function rischio(x: MisureRischio, network: MisureRischio): { punti: number; parti: Parti; traino: keyof Parti } {
  const p = (v: number, n: number) => (n > 0 ? Math.min(100, (v / n) * 50) : 0);
  const parti = { malattia: r1(p(x.malattiaPct, network.malattiaPct)), frequenza: r1(p(x.frequenza, network.frequenza)), gravita: r1(p(x.gravita, network.gravita)) };
  const punti = Math.round(parti.malattia * PESI_RISCHIO.malattia + parti.frequenza * PESI_RISCHIO.frequenza + parti.gravita * PESI_RISCHIO.gravita);
  // chi traina: la misura che, con il suo peso, porta più punti sopra la media
  const traino = (Object.entries(parti) as [keyof Parti, number][]).sort((a, b) => (b[1] - 50) * PESI_RISCHIO[b[0]] - (a[1] - 50) * PESI_RISCHIO[a[0]])[0][0];
  return { punti, parti, traino };
}

export type SchedaStation = {
  station: string; somma: Somma; ind: Indicatori; mis: MisureRischio; tasso: Tasso; rischio: number; parti: Parti; traino: keyof Parti;
  /** quota dei giorni persi del network (%) e quota delle persone (%) */
  quotaGiorni: number; quotaPersone: number; quotaMalattia: number; quotaInfortunio: number;
  /** peso sul network 0–100: la station che pesa di più vale 100 */
  peso: number; priorita: number; livello: Livello; livelloRischio: Livello;
  /** giorni persi ogni 100 lavoratori: ultimi 3 mesi contro i 3 prima; null se non ci sono 6 mesi */
  tendenza: { ora: number; prima: number; variazione: number; verso: "MIGLIORA" | "PEGGIORA" | "STABILE" } | null;
  sic: Indicatori | null; std: Indicatori | null;
  quadrante: "PRIORITA_ASSOLUTA" | "PROBLEMA_LOCALE" | "MONITORARE" | "STABILE";
};

const filtra = (righe: RigaMese[], vista: Vista) => (vista === "TOTALE" ? righe : righe.filter((r) => r.gruppo === vista));
/** per la vista Totale valgono solo i mesi in cui ci sono tutti e due i gruppi, altrimenti si confrontano mele e pere */
export function mesiValidi(righe: RigaMese[], vista: Vista): string[] {
  const per = new Map<string, Set<Gruppo>>();
  for (const r of righe) if (r.calendario) per.set(r.mese, (per.get(r.mese) ?? new Set()).add(r.gruppo));
  return [...per.entries()].filter(([, g]) => (vista === "TOTALE" ? g.size === 2 : g.has(vista))).map(([m]) => m).sort();
}

export function analisi(tutte: RigaMese[], vista: Vista, mesi: string[], persone: RigaPersona[] = []): { stations: SchedaStation[]; network: Indicatori; misNetwork: MisureRischio; tassoNetwork: Tasso; sommaNetwork: Somma } {
  const set = new Set(mesi);
  const righe = filtra(tutte, vista).filter((r) => set.has(r.mese) && r.calendario);
  const sommaNetwork = somma(righe), network = indicatori(sommaNetwork);
  // persone diverse con almeno un giorno di infortunio, per station
  const inf = new Map<string, Set<string>>();
  for (const p of persone) if (p.ggInfortunio > 0 && set.has(p.mese) && (vista === "TOTALE" || p.gruppo === vista)) inf.set(p.station, (inf.get(p.station) ?? new Set()).add(`${p.gruppo}|${p.codice}`));
  const misNetwork = misure(sommaNetwork, [...inf.values()].reduce((a, x) => a + x.size, 0));
  const nomi = [...new Set(righe.map((r) => r.station))].sort();
  const base = nomi.map((station) => {
    const mie = righe.filter((r) => r.station === station), s = somma(mie), ind = indicatori(s), mis = misure(s, inf.get(station)?.size ?? 0), ris = rischio(mis, misNetwork);
    const giorni = sommaNetwork.ggMalattia + sommaNetwork.ggInfortunio;
    const ordinati = [...set].sort(), ultimi = ordinati.slice(-3), prima = ordinati.slice(-6, -3);
    const persi100 = (mm: string[]) => { const x = somma(mie.filter((r) => mm.includes(r.mese))); return x.teste ? ((x.ggMalattia + x.ggInfortunio) / x.teste) * 100 : 0; };
    let tendenza: SchedaStation["tendenza"] = null;
    if (ordinati.length >= 6) { const ora = r1(persi100(ultimi)), pr = r1(persi100(prima)); const v = pr > 0 ? Math.round(((ora - pr) / pr) * 100) : ora > 0 ? 100 : 0; tendenza = { ora, prima: pr, variazione: v, verso: v >= 15 ? "PEGGIORA" : v <= -15 ? "MIGLIORA" : "STABILE" }; }
    const gruppo = (g: Gruppo) => { const x = tutte.filter((r) => r.station === station && r.gruppo === g && set.has(r.mese) && r.calendario); return x.length ? indicatori(somma(x)) : null; };
    return {
      station, somma: s, ind, mis, tasso: tasso(mie), rischio: ris.punti, parti: ris.parti, traino: ris.traino,
      quotaGiorni: giorni ? r1((ind.giorniPersi / giorni) * 100) : 0, quotaPersone: sommaNetwork.teste ? r1((s.teste / sommaNetwork.teste) * 100) : 0,
      quotaMalattia: sommaNetwork.ggMalattia ? r1((s.ggMalattia / sommaNetwork.ggMalattia) * 100) : 0, quotaInfortunio: sommaNetwork.ggInfortunio ? r1((s.ggInfortunio / sommaNetwork.ggInfortunio) * 100) : 0,
      tendenza, sic: gruppo("SIC"), std: gruppo("STD"),
    };
  });
  const maxQuota = Math.max(1, ...base.map((b) => b.quotaGiorni));
  const stations: SchedaStation[] = base.map((b) => {
    const peso = Math.round((b.quotaGiorni / maxQuota) * 100), priorita = Math.round(b.rischio * PESI_PRIORITA.rischio + peso * PESI_PRIORITA.peso);
    const alto = b.rischio > 50, pesa = peso > 50;
    return { ...b, peso, priorita, livello: livelloDi(priorita), livelloRischio: livelloDi(b.rischio), quadrante: (alto && pesa ? "PRIORITA_ASSOLUTA" : alto ? "PROBLEMA_LOCALE" : pesa ? "MONITORARE" : "STABILE") as SchedaStation["quadrante"] };
  }).sort((a, b) => b.priorita - a.priorita || b.rischio - a.rischio);
  return { stations, network, misNetwork, tassoNetwork: tasso(righe), sommaNetwork };
}

/** Giorni persi ogni 100 lavoratori, mese per mese, per una station o per il network: serve ai grafici e a trovare i mesi anomali. */
export function serieMensile(tutte: RigaMese[], vista: Vista, mesi: string[], station?: string): { mese: string; assentiPct: number; malattia100: number; infortunio100: number; persi100: number }[] {
  return mesi.map((mese) => { const i = indicatori(somma(filtra(tutte, vista).filter((r) => r.mese === mese && (!station || r.station === station)))); return { mese, assentiPct: i.assentiPct, malattia100: i.malattia100, infortunio100: i.infortunio100, persi100: r1(i.malattia100 + i.infortunio100) }; });
}

/** Mesi anomali di una station: giorni persi ogni 100 lavoratori oltre la sua media + 2 scarti tipo (servono almeno 6 mesi). */
export function mesiAnomali(serie: { mese: string; persi100: number }[]): { mese: string; valore: number; media: number }[] {
  if (serie.length < 6) return [];
  const v = serie.map((s) => s.persi100), media = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - media) ** 2, 0) / v.length);
  return sd > 0 ? serie.filter((s) => s.persi100 > media + 2 * sd && s.persi100 - media >= 5).map((s) => ({ mese: s.mese, valore: s.persi100, media: r1(media) })) : [];
}

const NOME_TRAINO = { malattia: "la malattia", frequenza: "il numero di infortuni", gravita: "la durata degli infortuni" } as const;
const v = (x: number | null) => (x === null ? "—" : String(x));
const meseBreve = (m: string) => `${["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

/** Le frasi del riepilogo: al massimo 8, ognuna con una conclusione operativa. */
export function riepilogo(a: ReturnType<typeof analisi>, tutte: RigaMese[], vista: Vista, mesi: string[]): { tono: Livello | "INFO"; testo: string }[] {
  const out: { tono: Livello | "INFO"; testo: string }[] = [], s = a.stations;
  if (!s.length) return out;
  const primo = s[0];
  out.push({ tono: primo.livello, testo: `Dove intervenire per primo: ${primo.station} (priorità ${primo.priorita} su 100). Pesa per il ${primo.quotaGiorni}% dei giorni persi del network con il ${primo.quotaPersone}% delle persone; a trainare è ${NOME_TRAINO[primo.traino]}.` });
  const rischioso = [...s].sort((x, y) => y.rischio - x.rischio)[0];
  if (rischioso.station !== primo.station) out.push({ tono: rischioso.livelloRischio, testo: `Il rischio più alto è a ${rischioso.station} (${rischioso.rischio} su 100), per ${NOME_TRAINO[rischioso.traino]}, ma pesa meno sul network (${rischioso.quotaGiorni}% dei giorni persi): è un problema locale da correggere.` });
  const migliore = [...s].sort((x, y) => x.rischio - y.rischio)[0];
  out.push({ tono: "OK", testo: `Chi sta meglio: ${migliore.station} (rischio ${migliore.rischio}): ${v(migliore.tasso.pct)}% di assenteismo contro il ${v(a.tassoNetwork.pct)}% del network. È la station da cui capire cosa funziona.` });
  const peggiora = s.filter((x) => x.tendenza?.verso === "PEGGIORA").sort((x, y) => y.tendenza!.variazione - x.tendenza!.variazione);
  if (peggiora.length) out.push({ tono: "CRITICA", testo: `In peggioramento negli ultimi 3 mesi: ${peggiora.map((x) => `${x.station} (+${x.tendenza!.variazione}%, da ${x.tendenza!.prima} a ${x.tendenza!.ora} giorni persi ogni 100 lavoratori)`).join(", ")}. Da seguire nelle prossime settimane.` });
  const migliora = s.filter((x) => x.tendenza?.verso === "MIGLIORA").sort((x, y) => x.tendenza!.variazione - y.tendenza!.variazione);
  if (migliora.length) out.push({ tono: "OK", testo: `In miglioramento: ${migliora.map((x) => `${x.station} (${x.tendenza!.variazione}%)`).join(", ")}.` });
  // SIC contro STD sul network: dove sta il problema
  if (vista === "TOTALE") {
    const set = new Set(mesi), g = (k: Gruppo) => indicatori(somma(tutte.filter((r) => r.gruppo === k && set.has(r.mese))));
    const sic = g("SIC"), std = g("STD"), ts = tasso(tutte.filter((r) => r.gruppo === "SIC" && set.has(r.mese))), td = tasso(tutte.filter((r) => r.gruppo === "STD" && set.has(r.mese)));
    out.push({ tono: "INFO", testo: `SIC contro STD: assenteismo ${v(ts.pct)}% i SIC e ${v(td.pct)}% gli STD. Malattia ${v(ts.malattiaPct)}% contro ${v(td.malattiaPct)}%, infortunio ${v(ts.infortunioPct)}% contro ${v(td.infortunioPct)}%, altre assenze ${v(ts.altrePct)}% contro ${v(td.altrePct)}%.` });
    const divario = s.filter((x) => x.sic && x.std).map((x) => ({ st: x.station, sic: x.sic!.malattia100 + x.sic!.infortunio100, std: x.std!.malattia100 + x.std!.infortunio100 })).filter((x) => Math.min(x.sic, x.std) > 0 && Math.max(x.sic, x.std) / Math.min(x.sic, x.std) >= 2.5).sort((x, y) => Math.abs(y.sic - y.std) - Math.abs(x.sic - x.std));
    if (divario.length) out.push({ tono: "ATTENZIONE", testo: `Divario forte tra i due gruppi a ${divario.slice(0, 3).map((x) => `${x.st} (${x.sic > x.std ? "SIC" : "STD"} ${Math.round(Math.max(x.sic, x.std))} contro ${Math.round(Math.min(x.sic, x.std))})`).join(", ")}: lì il problema è di un gruppo solo, non della station.` });
  }
  const conInf = s.filter((x) => x.mis.infortunati >= 3);
  if (conInf.length) {
    const freq = [...conInf].sort((x, y) => y.mis.frequenza - x.mis.frequenza)[0], grav = [...conInf].sort((x, y) => y.mis.gravita - x.mis.gravita)[0];
    out.push({ tono: "ATTENZIONE", testo: `Infortuni: succedono più spesso a ${freq.station} (${freq.mis.infortunati} persone, ${freq.mis.frequenza} ogni 1.000 rotte contro ${a.misNetwork.frequenza} del network); durano di più a ${grav.station} (${grav.mis.gravita} giorni per infortunato contro ${a.misNetwork.gravita}). Vale una verifica con l'RSPP.` });
  }
  const anomali = s.flatMap((x) => mesiAnomali(serieMensile(tutte, vista, mesi, x.station)).map((m) => `${x.station} a ${meseBreve(m.mese)} (${m.valore} contro una media di ${m.media})`));
  if (anomali.length) out.push({ tono: "INFO", testo: `Mesi fuori dal normale: ${anomali.slice(0, 4).join(", ")} giorni persi ogni 100 lavoratori. Da capire se è stato un evento isolato.` });
  return out.slice(0, 8);
}

// ---------------------------------------------------------------------------------------------------------------------
// Tasso di assenteismo: giorni di malattia e infortunio sui giorni in cui si doveva lavorare
// (lavorati + malattia + infortunio + altre assenze). Altre assenze = non retribuite, ingiustificate, malattia figlio.
// Ferie, ROL, ex festività e permessi retribuiti non contano né sopra né sotto.

export type Tasso = { lavorati: number; malattia: number; infortunio: number; altre: number; /** % con un decimale; null se non ci sono giorni */ pct: number | null; malattiaPct: number | null; infortunioPct: number | null; altrePct: number | null };

export function tasso(righe: RigaMese[]): Tasso {
  let lavorati = 0, malattia = 0, infortunio = 0, altre = 0;
  for (const r of righe) { if (!r.calendario) continue; lavorati += r.ggLavorati; malattia += r.ggMalattia; infortunio += r.ggInfortunio; altre += r.ggAltre; }
  const dovuti = lavorati + malattia + infortunio + altre, p = (x: number) => (dovuti ? Math.round((x / dovuti) * 1000) / 10 : null);
  return { lavorati, malattia, infortunio, altre, pct: p(malattia + infortunio + altre), malattiaPct: p(malattia), infortunioPct: p(infortunio), altrePct: p(altre) };
}

export type RigaTasso = { station: string; perMese: Tasso[]; ytd: Tasso };
/** Station per mese e da inizio anno, più la riga del network. In vista Totale solo i mesi con tutti e due i gruppi. */
export function tabellaTassi(tutte: RigaMese[], vista: Vista): { mesi: string[]; stations: RigaTasso[]; network: RigaTasso } {
  const mesi = mesiValidi(tutte, vista), dentro = new Set(mesi);
  const righe = (vista === "TOTALE" ? tutte : tutte.filter((r) => r.gruppo === vista)).filter((r) => dentro.has(r.mese));
  const riga = (station: string, rr: RigaMese[]): RigaTasso => ({ station, perMese: mesi.map((m) => tasso(rr.filter((r) => r.mese === m))), ytd: tasso(rr) });
  return { mesi, stations: [...new Set(righe.map((r) => r.station))].sort().map((st) => riga(st, righe.filter((r) => r.station === st))), network: riga("Network", righe) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Chi è stato più assente: per persona, in un mese o da inizio anno.

export type RigaPersona = { mese: string; station: string; gruppo: Gruppo; codice: string; nome: string; ggLavorati: number; ggMalattia: number; ggInfortunio: number; ggAltre: number };
export type Assente = { chiave: string; nome: string; station: string; gruppo: Gruppo; malattia: number; infortunio: number; altre: number; giorni: number; lavorati: number; /** % sui giorni dovuti */ pct: number | null; /** mesi con almeno un giorno di assenza */ mesi: number };
export type OrdineAssenti = "giorni" | "malattia" | "infortunio" | "altre";

/** Persone con almeno un giorno di assenza nel periodo, dalla più assente. `mese` vuoto = tutto il periodo. */
export function piuAssenti(righe: RigaPersona[], f: { vista: Vista; station?: string; mese?: string; ordine?: OrdineAssenti }): Assente[] {
  const per = new Map<string, Assente>();
  for (const r of righe) {
    if ((f.vista !== "TOTALE" && r.gruppo !== f.vista) || (f.station && r.station !== f.station) || (f.mese && r.mese !== f.mese)) continue;
    const chiave = `${r.station}|${r.gruppo}|${r.codice}`;
    const a = per.get(chiave) ?? { chiave, nome: r.nome || `matricola ${r.codice}`, station: r.station, gruppo: r.gruppo, malattia: 0, infortunio: 0, altre: 0, giorni: 0, lavorati: 0, pct: null, mesi: 0 };
    a.malattia += r.ggMalattia; a.infortunio += r.ggInfortunio; a.altre += r.ggAltre; a.lavorati += r.ggLavorati; if (r.ggMalattia + r.ggInfortunio + r.ggAltre > 0) a.mesi++;
    per.set(chiave, a);
  }
  const k = f.ordine ?? "giorni", out: Assente[] = [];
  for (const a of per.values()) { a.giorni = a.malattia + a.infortunio + a.altre; if (a[k] <= 0) continue; const dovuti = a.lavorati + a.giorni; a.pct = dovuti ? Math.round((a.giorni / dovuti) * 1000) / 10 : null; out.push(a); }
  return out.sort((x, y) => y[k] - x[k] || y.giorni - x.giorni || x.nome.localeCompare(y.nome));
}
