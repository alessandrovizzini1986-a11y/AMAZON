/**
 * Training: piano (content/training/piano.json) e regole pure — validazione, giorno di oggi,
 * avanzamento, moduli. Il testo vive solo nel JSON; qui nessuna stringa di contenuto.
 */
import { z } from "zod";
import { TIPI, type Tipo } from "./tipi";

export { TIPI, type Tipo };

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data AAAA-MM-GG").refine((d) => { const t = Date.parse(d + "T00:00:00Z"); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d; }, "data non valida");
const attivita = z.object({
  id: z.string().min(1),
  tipo: z.enum(TIPI),
  chi: z.string().min(1),
  durata: z.number().int().positive(),
  testo: z.string().min(1),
  /** link precisi "slug#ancora" (facoltativi) */
  ancore: z.array(z.string()).optional(),
});
const giorno = z.object({
  day: z.number().int().positive(),
  date: data,
  title: z.string().min(1),
  modulo: z.string().min(1),
  sezioni: z.array(z.string()),
  obiettivo: z.string().min(1),
  attivita: z.array(attivita).min(1),
  sera: z.object({ leggi: z.array(z.string()), nota: z.string() }),
});
export const schemaPiano = z.object({
  titolo: z.string().min(1),
  inizio: data,
  fine: data,
  orario: z.string().optional(),
  versione: z.string().optional(),
  moduli: z.array(z.object({ id: z.string().min(1), titolo: z.string().min(1), esame: z.string().min(1), valida: z.string().min(1) })).min(1),
  giorni: z.array(giorno).min(1),
});
export type Piano = z.infer<typeof schemaPiano>;
export type Giorno = Piano["giorni"][number];
export type Attivita = Giorno["attivita"][number] & { extra?: boolean };

/** Sezioni e ancore del vademecum esistenti: slug → insieme delle ancore. */
export type IndiceVademecum = Map<string, Set<string>>;

/**
 * Valida il piano: schema, id attività unici, giorni consecutivi con date in ordine, moduli esistenti,
 * attività "valida" dei moduli esistente e di tipo check, sezioni / letture / ancore esistenti nel vademecum.
 * Lancia un errore con l'elenco dei problemi (messaggio leggibile da Alessandro).
 */
export function validaPiano(json: unknown, vd: IndiceVademecum): Piano {
  const r = schemaPiano.safeParse(json);
  if (!r.success) throw new Error("piano.json non valido:\n" + r.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n"));
  const p = r.data, err: string[] = [];
  const ids = new Map<string, number>();
  const tutte = new Map<string, Attivita>();
  p.giorni.forEach((g, i) => {
    if (g.day !== i + 1) err.push(`giorno in posizione ${i + 1} ha day ${g.day} (i giorni vanno numerati 1, 2, 3… in ordine)`);
    if (i > 0 && g.date <= p.giorni[i - 1].date) err.push(`giorno ${g.day}: data ${g.date} non successiva a quella del giorno prima`);
    if (g.date < p.inizio || g.date > p.fine) err.push(`giorno ${g.day}: data ${g.date} fuori dal periodo ${p.inizio} – ${p.fine}`);
    if (!p.moduli.some((m) => m.id === g.modulo)) err.push(`giorno ${g.day}: modulo "${g.modulo}" non esiste (moduli: ${p.moduli.map((m) => m.id).join(", ")})`);
    for (const s of [...g.sezioni, ...g.sera.leggi]) if (!vd.has(s)) err.push(`giorno ${g.day}: sezione "${s}" non esiste in content/vademecum/`);
    for (const a of g.attivita) {
      if (ids.has(a.id)) err.push(`attività "${a.id}" ripetuta (giorni ${ids.get(a.id)} e ${g.day}): gli id devono essere unici`);
      ids.set(a.id, g.day); tutte.set(a.id, a);
      for (const an of a.ancore ?? []) {
        const [slug, anc] = an.split("#");
        if (!vd.has(slug)) err.push(`attività ${a.id}: sezione "${slug}" non esiste in content/vademecum/`);
        else if (anc && !vd.get(slug)!.has(anc)) err.push(`attività ${a.id}: ancora "#${anc}" non esiste in ${slug} (ancore: ${[...vd.get(slug)!].join(", ")})`);
      }
    }
  });
  for (const m of p.moduli) {
    const a = tutte.get(m.valida);
    if (!a) err.push(`modulo "${m.id}": attività valida "${m.valida}" non esiste`);
    else if (a.tipo !== "check") err.push(`modulo "${m.id}": l'attività valida "${m.valida}" deve essere di tipo check`);
  }
  if (err.length) throw new Error("piano.json non valido:\n" + err.map((e) => `- ${e}`).join("\n"));
  return p;
}

/** Giorno da mostrare come "oggi": il giorno con quella data; tra due giorni (weekend) il prossimo; prima dell'inizio il primo; dopo la fine l'ultimo. */
export function giornoDiOggi(p: Pick<Piano, "giorni">, oggiIso: string): { day: number; stato: "prima" | "oggi" | "prossimo" | "finito" } {
  const g = p.giorni;
  if (oggiIso < g[0].date) return { day: g[0].day, stato: "prima" };
  const esatto = g.find((x) => x.date === oggiIso);
  if (esatto) return { day: esatto.day, stato: "oggi" };
  const dopo = g.find((x) => x.date > oggiIso);
  return dopo ? { day: dopo.day, stato: "prossimo" } : { day: g[g.length - 1].day, stato: "finito" };
}

export type StatoAttivita = { done: boolean; validated: boolean };
export type StatoGiorno = "da fare" | "in corso" | "fatto" | "validato";

/** id della lettura serale di un giorno (conta come attività "Letto"). */
export const idSera = (day: number) => `d${day}-sera`;

/** Attività di un giorno: quelle del piano più le extra in coda. */
export function attivitaGiorno(g: Giorno, extra: Attivita[] = []): Attivita[] {
  return [...g.attivita, ...extra.map((x) => ({ ...x, extra: true }))];
}

/** Avanzamento di un giorno: fatte / totali (attività + lettura serale se c'è), stato. Un giorno è "validato" se tutti i check sono validati. */
export function avanzamentoGiorno(g: Giorno, stato: Map<string, StatoAttivita>, extra: Attivita[] = []) {
  const att = attivitaGiorno(g, extra);
  const ids = [...att.map((a) => a.id), ...(g.sera.leggi.length ? [idSera(g.day)] : [])];
  const fatte = ids.filter((id) => stato.get(id)?.done).length;
  const check = att.filter((a) => a.tipo === "check");
  const validati = check.filter((a) => stato.get(a.id)?.validated).length;
  const s: StatoGiorno = fatte === 0 ? "da fare" : fatte < ids.length ? "in corso" : check.length && validati === check.length ? "validato" : "fatto";
  return { fatte, totali: ids.length, check: check.length, validati, stato: s, completo: fatte === ids.length };
}

/** Avanzamento del percorso: attività fatte / totali e giorni completati. */
export function avanzamentoPercorso(p: Pick<Piano, "giorni">, stato: Map<string, StatoAttivita>, extraPerGiorno: Map<number, Attivita[]> = new Map()) {
  const giorni = p.giorni.map((g) => ({ day: g.day, ...avanzamentoGiorno(g, stato, extraPerGiorno.get(g.day)) }));
  return { giorni, fatte: giorni.reduce((a, g) => a + g.fatte, 0), totali: giorni.reduce((a, g) => a + g.totali, 0), giorniCompleti: giorni.filter((g) => g.completo).length, nGiorni: giorni.length };
}

/** Modulo superato: la sua attività "valida" è fatta e validata dall'admin. */
export function moduloSuperato(m: Piano["moduli"][number], stato: Map<string, StatoAttivita>): boolean {
  const s = stato.get(m.valida);
  return !!s?.done && !!s.validated;
}

/** "Lunedì 9 novembre" dalla data ISO. */
export function dataLunga(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const s = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
