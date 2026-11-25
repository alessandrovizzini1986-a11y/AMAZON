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
  ggMalattia: number; ggInfortunio: number; persMalattia: number; persInfortunio: number; persAssenti: number;
};
export type Somma = { teste: number; mesi: number; rotte: number; ggMalattia: number; ggInfortunio: number; persAssenti: number };
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
export const PESI_RISCHIO = { assenti: 0.4, malattia: 0.3, infortunio: 0.3 } as const;
export const PESI_PRIORITA = { rischio: 0.6, peso: 0.4 } as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const zero = (): Somma => ({ teste: 0, mesi: 0, rotte: 0, ggMalattia: 0, ggInfortunio: 0, persAssenti: 0 });

/** Somma le righe (mesi e gruppi) di una station. I mesi senza calendario non entrano: lì le assenze non si conoscono. */
export function somma(righe: RigaMese[]): Somma {
  const s = zero(); const mesi = new Set<string>();
  for (const r of righe) { if (!r.calendario) continue; s.teste += r.teste; s.rotte += r.rotte ?? 0; s.ggMalattia += r.ggMalattia; s.ggInfortunio += r.ggInfortunio; s.persAssenti += r.persAssenti; mesi.add(r.mese); }
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

/**
 * Punteggio di rischio 0–100. Ogni indicatore si confronta con il valore del network nello stesso periodo:
 * uguale al network = 50 punti, il doppio o più = 100, zero = 0. Poi la media pesata (assenti 40%, malattia 30%, infortunio 30%).
 * Con 7 station un confronto con la media è più stabile di una scala min–max, dove una sola station anomala schiaccia tutte le altre.
 */
export function rischio(x: Indicatori, network: Indicatori): { punti: number; parti: { assenti: number; malattia: number; infortunio: number }; traino: "assenti" | "malattia" | "infortunio" } {
  const p = (v: number, n: number) => (n > 0 ? Math.min(100, (v / n) * 50) : 0);
  const parti = { assenti: r1(p(x.assentiPct, network.assentiPct)), malattia: r1(p(x.malattia100, network.malattia100)), infortunio: r1(p(x.infortunio100, network.infortunio100)) };
  const punti = Math.round(parti.assenti * PESI_RISCHIO.assenti + parti.malattia * PESI_RISCHIO.malattia + parti.infortunio * PESI_RISCHIO.infortunio);
  const traino = (Object.entries(parti) as [keyof typeof parti, number][]).sort((a, b) => b[1] - a[1])[0][0];
  return { punti, parti, traino };
}

export type SchedaStation = {
  station: string; somma: Somma; ind: Indicatori; rischio: number; parti: { assenti: number; malattia: number; infortunio: number }; traino: "assenti" | "malattia" | "infortunio";
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

export function analisi(tutte: RigaMese[], vista: Vista, mesi: string[]): { stations: SchedaStation[]; network: Indicatori; sommaNetwork: Somma } {
  const set = new Set(mesi);
  const righe = filtra(tutte, vista).filter((r) => set.has(r.mese) && r.calendario);
  const sommaNetwork = somma(righe), network = indicatori(sommaNetwork);
  const nomi = [...new Set(righe.map((r) => r.station))].sort();
  const base = nomi.map((station) => {
    const mie = righe.filter((r) => r.station === station), s = somma(mie), ind = indicatori(s), ris = rischio(ind, network);
    const giorni = sommaNetwork.ggMalattia + sommaNetwork.ggInfortunio;
    const ordinati = [...set].sort(), ultimi = ordinati.slice(-3), prima = ordinati.slice(-6, -3);
    const persi100 = (mm: string[]) => { const x = somma(mie.filter((r) => mm.includes(r.mese))); return x.teste ? ((x.ggMalattia + x.ggInfortunio) / x.teste) * 100 : 0; };
    let tendenza: SchedaStation["tendenza"] = null;
    if (ordinati.length >= 6) { const ora = r1(persi100(ultimi)), pr = r1(persi100(prima)); const v = pr > 0 ? Math.round(((ora - pr) / pr) * 100) : ora > 0 ? 100 : 0; tendenza = { ora, prima: pr, variazione: v, verso: v >= 15 ? "PEGGIORA" : v <= -15 ? "MIGLIORA" : "STABILE" }; }
    const gruppo = (g: Gruppo) => { const x = tutte.filter((r) => r.station === station && r.gruppo === g && set.has(r.mese) && r.calendario); return x.length ? indicatori(somma(x)) : null; };
    return {
      station, somma: s, ind, rischio: ris.punti, parti: ris.parti, traino: ris.traino,
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
  return { stations, network, sommaNetwork };
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

const NOME_TRAINO = { assenti: "le persone assenti", malattia: "la malattia", infortunio: "gli infortuni" } as const;
const meseBreve = (m: string) => `${["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"][Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

/** Le frasi del riepilogo: al massimo 8, ognuna con una conclusione operativa. */
export function riepilogo(a: ReturnType<typeof analisi>, tutte: RigaMese[], vista: Vista, mesi: string[]): { tono: Livello | "INFO"; testo: string }[] {
  const out: { tono: Livello | "INFO"; testo: string }[] = [], s = a.stations;
  if (!s.length) return out;
  const primo = s[0];
  out.push({ tono: primo.livello, testo: `Dove intervenire per primo: ${primo.station} (priorità ${primo.priorita} su 100). Pesa per il ${primo.quotaGiorni}% dei giorni persi del network con il ${primo.quotaPersone}% delle persone; a trainare sono ${NOME_TRAINO[primo.traino]}.` });
  const rischioso = [...s].sort((x, y) => y.rischio - x.rischio)[0];
  if (rischioso.station !== primo.station) out.push({ tono: rischioso.livelloRischio, testo: `Il rischio più alto è a ${rischioso.station} (${rischioso.rischio} su 100), per ${NOME_TRAINO[rischioso.traino]}, ma pesa meno sul network (${rischioso.quotaGiorni}% dei giorni persi): è un problema locale da correggere.` });
  const migliore = [...s].sort((x, y) => x.rischio - y.rischio)[0];
  out.push({ tono: "OK", testo: `Chi sta meglio: ${migliore.station} (rischio ${migliore.rischio}): ${migliore.ind.assentiPct}% di persone assenti al mese contro il ${a.network.assentiPct}% del network. È la station da cui capire cosa funziona.` });
  const peggiora = s.filter((x) => x.tendenza?.verso === "PEGGIORA").sort((x, y) => y.tendenza!.variazione - x.tendenza!.variazione);
  if (peggiora.length) out.push({ tono: "CRITICA", testo: `In peggioramento negli ultimi 3 mesi: ${peggiora.map((x) => `${x.station} (+${x.tendenza!.variazione}%, da ${x.tendenza!.prima} a ${x.tendenza!.ora} giorni persi ogni 100 lavoratori)`).join(", ")}. Da seguire nelle prossime settimane.` });
  const migliora = s.filter((x) => x.tendenza?.verso === "MIGLIORA").sort((x, y) => x.tendenza!.variazione - y.tendenza!.variazione);
  if (migliora.length) out.push({ tono: "OK", testo: `In miglioramento: ${migliora.map((x) => `${x.station} (${x.tendenza!.variazione}%)`).join(", ")}.` });
  // SIC contro STD sul network: dove sta il problema
  if (vista === "TOTALE") {
    const set = new Set(mesi), g = (k: Gruppo) => indicatori(somma(tutte.filter((r) => r.gruppo === k && set.has(r.mese))));
    const sic = g("SIC"), std = g("STD");
    const piu = sic.malattia100 + sic.infortunio100 >= std.malattia100 + std.infortunio100 ? "SIC" : "STD";
    out.push({ tono: "INFO", testo: `SIC contro STD: i SIC perdono ${Math.round((sic.malattia100 + sic.infortunio100) * 10) / 10} giorni ogni 100 lavoratori al mese, gli STD ${Math.round((std.malattia100 + std.infortunio100) * 10) / 10}. Il rischio del network viene soprattutto dai ${piu}. Infortuni: ${sic.infortunio100} giorni ogni 100 SIC contro ${std.infortunio100} ogni 100 STD.` });
    const divario = s.filter((x) => x.sic && x.std).map((x) => ({ st: x.station, sic: x.sic!.malattia100 + x.sic!.infortunio100, std: x.std!.malattia100 + x.std!.infortunio100 })).filter((x) => Math.min(x.sic, x.std) > 0 && Math.max(x.sic, x.std) / Math.min(x.sic, x.std) >= 2.5).sort((x, y) => Math.abs(y.sic - y.std) - Math.abs(x.sic - x.std));
    if (divario.length) out.push({ tono: "ATTENZIONE", testo: `Divario forte tra i due gruppi a ${divario.slice(0, 3).map((x) => `${x.st} (${x.sic > x.std ? "SIC" : "STD"} ${Math.round(Math.max(x.sic, x.std))} contro ${Math.round(Math.min(x.sic, x.std))})`).join(", ")}: lì il problema è di un gruppo solo, non della station.` });
  }
  const inf = [...s].filter((x) => x.ind.infortunio1000Rotte !== null && x.somma.ggInfortunio >= 10).sort((x, y) => y.ind.infortunio1000Rotte! - x.ind.infortunio1000Rotte!)[0];
  if (inf) out.push({ tono: "ATTENZIONE", testo: `Infortuni rispetto al lavoro fatto: ${inf.station} ha ${inf.ind.infortunio1000Rotte} giorni di infortunio ogni 1.000 rotte, il valore più alto. Vale una verifica con l'RSPP su quella station.` });
  const anomali = s.flatMap((x) => mesiAnomali(serieMensile(tutte, vista, mesi, x.station)).map((m) => `${x.station} a ${meseBreve(m.mese)} (${m.valore} contro una media di ${m.media})`));
  if (anomali.length) out.push({ tono: "INFO", testo: `Mesi fuori dal normale: ${anomali.slice(0, 4).join(", ")} giorni persi ogni 100 lavoratori. Da capire se è stato un evento isolato.` });
  return out.slice(0, 8);
}

// ---------------------------------------------------------------------------------------------------------------------
// Tasso di assenteismo: giorni di malattia e infortunio sui giorni in cui si doveva lavorare
// (lavorati + malattia + infortunio). Ferie, ROL, ex festività e permessi non contano né sopra né sotto.

export type Tasso = { lavorati: number; malattia: number; infortunio: number; /** % con un decimale; null se non ci sono giorni */ pct: number | null; malattiaPct: number | null; infortunioPct: number | null };

export function tasso(righe: RigaMese[]): Tasso {
  let lavorati = 0, malattia = 0, infortunio = 0;
  for (const r of righe) { if (!r.calendario) continue; lavorati += r.ggLavorati; malattia += r.ggMalattia; infortunio += r.ggInfortunio; }
  const dovuti = lavorati + malattia + infortunio, p = (x: number) => (dovuti ? Math.round((x / dovuti) * 1000) / 10 : null);
  return { lavorati, malattia, infortunio, pct: p(malattia + infortunio), malattiaPct: p(malattia), infortunioPct: p(infortunio) };
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

export type RigaPersona = { mese: string; station: string; gruppo: Gruppo; codice: string; nome: string; ggLavorati: number; ggMalattia: number; ggInfortunio: number };
export type Assente = { chiave: string; nome: string; station: string; gruppo: Gruppo; malattia: number; infortunio: number; giorni: number; lavorati: number; /** % sui giorni dovuti */ pct: number | null; /** mesi con almeno un giorno di assenza */ mesi: number };
export type OrdineAssenti = "giorni" | "malattia" | "infortunio";

/** Persone con almeno un giorno di assenza nel periodo, dalla più assente. `mese` vuoto = tutto il periodo. */
export function piuAssenti(righe: RigaPersona[], f: { vista: Vista; station?: string; mese?: string; ordine?: OrdineAssenti }): Assente[] {
  const per = new Map<string, Assente>();
  for (const r of righe) {
    if ((f.vista !== "TOTALE" && r.gruppo !== f.vista) || (f.station && r.station !== f.station) || (f.mese && r.mese !== f.mese)) continue;
    const chiave = `${r.station}|${r.gruppo}|${r.codice}`;
    const a = per.get(chiave) ?? { chiave, nome: r.nome || `matricola ${r.codice}`, station: r.station, gruppo: r.gruppo, malattia: 0, infortunio: 0, giorni: 0, lavorati: 0, pct: null, mesi: 0 };
    a.malattia += r.ggMalattia; a.infortunio += r.ggInfortunio; a.lavorati += r.ggLavorati; if (r.ggMalattia + r.ggInfortunio > 0) a.mesi++;
    per.set(chiave, a);
  }
  const k = f.ordine ?? "giorni", out: Assente[] = [];
  for (const a of per.values()) { a.giorni = a.malattia + a.infortunio; if (a[k] <= 0) continue; const dovuti = a.lavorati + a.giorni; a.pct = dovuti ? Math.round((a.giorni / dovuti) * 1000) / 10 : null; out.push(a); }
  return out.sort((x, y) => y[k] - x[k] || y.giorni - x.giorni || x.nome.localeCompare(y.nome));
}
