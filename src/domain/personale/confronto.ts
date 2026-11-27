/**
 * Tracking (quello che la station ha scritto) contro busta (quello che l'ufficio paghe ha imputato), persona per persona,
 * sullo stesso mese di lavoro. Trova le ore diverse e le ore uguali messe sotto un'altra voce (ROL al posto di ferie,
 * supplementare al posto di straordinario). Più la stima dei saldi a fine mese finché la busta nuova non arriva.
 */
import type { Lavoratore } from "@/domain/presenze/lavoratori";
import { chiaveNome } from "./organico";

export type OreTracking = { mese: string; station: string; gruppo: string; chiave: string; cf: string; matricola: string; nome: string; contratto: string; oreLavoro: number; oreStraord: number; oreSuppl: number; oreFerie: number; ggFerie: number; oreRol: number; oreExf: number; oreMalattia: number; oreInfortunio: number; oreAltro: number };
export type OreBusta = { meseLavoro: string; station: string; gruppo: string; cf: string; codice: string; nome: string; oreStraord: number; oreSuppl: number; oreFerie: number; ggFerie: number; oreRol: number; oreExf: number; oreMalattia: number; oreInfortunio: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Una riga per lavoratore dal tracking del mese: ore per voce e giorni di ferie (un giorno con ore di ferie = un giorno). */
export function oreDalTracking(lavoratori: Lavoratore[], mese: string, station: string, gruppo: string): OreTracking[] {
  const out = new Map<string, OreTracking>();
  for (const l of lavoratori) {
    const cf = l.cf.trim().toUpperCase(), chiave = cf || l.matricola || l.nome.trim().toUpperCase();
    if (!chiave) continue;
    const x = out.get(chiave) ?? { mese, station, gruppo, chiave, cf, matricola: l.matricola, nome: l.nome.trim(), contratto: l.contratto, oreLavoro: 0, oreStraord: 0, oreSuppl: 0, oreFerie: 0, ggFerie: 0, oreRol: 0, oreExf: 0, oreMalattia: 0, oreInfortunio: 0, oreAltro: 0 };
    for (const [giorno, g] of Object.entries(l.giorni)) {
      if (!giorno.startsWith(mese)) continue;
      x.oreLavoro += (g.Standard ?? 0) + (g.Accordo ?? 0);
      x.oreStraord += g.Straordinario ?? 0; x.oreSuppl += g.Supplementare ?? 0;
      x.oreFerie += g.FERIE ?? 0; if ((g.FERIE ?? 0) > 0) x.ggFerie += 1;
      x.oreRol += g.ROL ?? 0; x.oreExf += g.ExF ?? 0; x.oreMalattia += g.MALATTIA ?? 0; x.oreInfortunio += g.INFORTUNIO ?? 0;
      x.oreAltro += (g["104"] ?? 0) + (g.PERM_SIND ?? 0) + (g.ALTRI_PERM ?? 0) + (g.PERM_NR ?? 0) + (g.ASS_INGIUST ?? 0);
    }
    out.set(chiave, x);
  }
  return [...out.values()].map((x) => ({ ...x, oreLavoro: r2(x.oreLavoro), oreStraord: r2(x.oreStraord), oreSuppl: r2(x.oreSuppl), oreFerie: r2(x.oreFerie), oreRol: r2(x.oreRol), oreExf: r2(x.oreExf), oreMalattia: r2(x.oreMalattia), oreInfortunio: r2(x.oreInfortunio), oreAltro: r2(x.oreAltro) }));
}

export const VOCI = ["ferie", "rol", "exf", "straord", "suppl", "malattia"] as const;
export type VoceConfronto = (typeof VOCI)[number];
export const NOME_VOCE: Record<VoceConfronto, string> = { ferie: "Ferie", rol: "ROL", exf: "Ex festività", straord: "Straordinario", suppl: "Supplementare", malattia: "Malattia" };
export type Esito = "UGUALE" | "VOCE_DIVERSA" | "ORE_DIVERSE" | "SOLO_TRACKING" | "SOLO_BUSTA";
export type RigaConfronto = { station: string; nome: string; contratto: string; esito: Esito; tracking: Record<VoceConfronto, number>; busta: Record<VoceConfronto, number>; delta: Record<VoceConfronto, number>; cosa: string };

const TOLL = 0.26; // un quarto d'ora: sotto è arrotondamento
const oreT = (t: OreTracking): Record<VoceConfronto, number> => ({ ferie: t.oreFerie, rol: t.oreRol, exf: t.oreExf, straord: t.oreStraord, suppl: t.oreSuppl, malattia: t.oreMalattia });
const oreB = (b: OreBusta): Record<VoceConfronto, number> => ({ ferie: b.oreFerie, rol: b.oreRol, exf: b.oreExf, straord: b.oreStraord, suppl: b.oreSuppl, malattia: b.oreMalattia });
const zero = (): Record<VoceConfronto, number> => ({ ferie: 0, rol: 0, exf: 0, straord: 0, suppl: 0, malattia: 0 });
const h = (x: number) => `${r2(Math.abs(x)).toLocaleString("it-IT")} h`;

/** Gruppi di voci che si possono scambiare tra loro: se il totale del gruppo torna, le ore ci sono ma sotto un'altra voce. */
const GRUPPI: VoceConfronto[][] = [["ferie", "rol", "exf", "malattia"], ["straord", "suppl"]];

function descrivi(d: Record<VoceConfronto, number>): { esito: Esito; cosa: string } {
  const diverse = VOCI.filter((v) => Math.abs(d[v]) > TOLL);
  if (!diverse.length) return { esito: "UGUALE", cosa: "" };
  const frasi: string[] = []; let soloScambi = true;
  for (const g of GRUPPI) {
    const q = g.filter((v) => Math.abs(d[v]) > TOLL);
    if (!q.length) continue;
    const somma = g.reduce((s, v) => s + d[v], 0);
    if (q.length >= 2 && Math.abs(somma) <= TOLL) {
      const piu = q.filter((v) => d[v] > 0), meno = q.filter((v) => d[v] < 0);
      frasi.push(`${piu.map((v) => `${h(d[v])} di ${NOME_VOCE[v]}`).join(" e ")} nel tracking, in busta ${meno.map((v) => NOME_VOCE[v]).join(" e ")}`);
    } else {
      soloScambi = false;
      frasi.push(...q.map((v) => `${NOME_VOCE[v]}: tracking ${h(d[v])} ${d[v] > 0 ? "in più" : "in meno"} della busta`));
    }
  }
  return { esito: soloScambi ? "VOCE_DIVERSA" : "ORE_DIVERSE", cosa: frasi.join("; ") };
}

/** Confronto di un mese di lavoro. Le persone si abbinano per codice fiscale, poi per nome nella stessa station. */
export function confronta(tracking: OreTracking[], tutteLeBuste: OreBusta[]): RigaConfronto[] {
  // chi nel mese ha due cedolini (cambio di contratto) è una persona sola: le ore si sommano
  const unite = new Map<string, OreBusta>();
  for (const x of tutteLeBuste) {
    const k = `${x.station}|${chiaveNome(x.nome) || x.cf}`, y = unite.get(k);
    unite.set(k, y ? { ...y, oreStraord: y.oreStraord + x.oreStraord, oreSuppl: y.oreSuppl + x.oreSuppl, oreFerie: y.oreFerie + x.oreFerie, ggFerie: y.ggFerie + x.ggFerie, oreRol: y.oreRol + x.oreRol, oreExf: y.oreExf + x.oreExf, oreMalattia: y.oreMalattia + x.oreMalattia, oreInfortunio: y.oreInfortunio + x.oreInfortunio } : x);
  }
  const altriCf = new Map(tutteLeBuste.map((x) => [x.cf, unite.get(`${x.station}|${chiaveNome(x.nome) || x.cf}`)!]));
  const busta = [...unite.values()];
  const b = altriCf, visti = new Set<string>();
  const cfTracking = new Set(tracking.map((t) => t.cf).filter(Boolean));
  const perNome = new Map(busta.filter((x) => !cfTracking.has(x.cf)).map((x) => [`${x.station}|${chiaveNome(x.nome)}`, x]));
  const righe: RigaConfronto[] = [];
  for (const t of tracking) {
    // codice fiscale; se nel tracking è scritto male, lo stesso nome nella stessa station
    const x = (t.cf ? b.get(t.cf) : undefined) ?? perNome.get(`${t.station}|${chiaveNome(t.nome)}`);
    if (!x) { righe.push({ station: t.station, nome: t.nome, contratto: t.contratto, esito: "SOLO_TRACKING", tracking: oreT(t), busta: zero(), delta: oreT(t), cosa: "nel tracking ma non in busta" }); continue; }
    visti.add(x.cf);
    const a = oreT(t), c = oreB(x), d = zero();
    for (const v of VOCI) d[v] = r2(a[v] - c[v]);
    righe.push({ station: t.station, nome: t.nome || x.nome, contratto: t.contratto, tracking: a, busta: c, delta: d, ...descrivi(d) });
  }
  for (const x of busta) if (!visti.has(x.cf)) righe.push({ station: x.station, nome: x.nome, contratto: "", esito: "SOLO_BUSTA", tracking: zero(), busta: oreB(x), delta: zero(), cosa: "in busta ma non nel tracking" });
  return righe;
}

/** Saldo stimato a fine mese: quello della busta meno il goduto del mese scritto nel tracking. */
export function stimaSaldo(busta: { ferieUnita: "GG" | "ORE"; ferieSaldo: number | null; rolSaldo: number | null; exfestSaldo: number | null }, t: Pick<OreTracking, "ggFerie" | "oreFerie" | "oreRol" | "oreExf">) {
  const meno = (s: number | null, x: number) => (s === null ? null : Math.round((s - x) * 1000) / 1000);
  return { ferie: meno(busta.ferieSaldo, busta.ferieUnita === "GG" ? t.ggFerie : t.oreFerie), rol: meno(busta.rolSaldo, t.oreRol), exfest: meno(busta.exfestSaldo, t.oreExf) };
}
