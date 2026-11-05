/**
 * Piano del training letto da content/training/piano.json e validato contro il vademecum
 * (sezioni e ancore esistenti). Lato server; il build fallisce se il piano è sbagliato
 * (scripts/check-training.mts in prebuild).
 */
import fs from "node:fs";
import path from "node:path";
import { docBlocks, getAllDocs } from "@/lib/vademecum";
import { validaPiano, type IndiceVademecum, type Piano } from "@/domain/training/piano";

export const PIANO_PATH = path.join(process.cwd(), "content", "training", "piano.json");

/** Slug → ancore, e slug#ancora → titolo della sezione (per le etichette dei link). */
export function indiceVademecum(): { indice: IndiceVademecum; titoli: Map<string, string> } {
  const indice: IndiceVademecum = new Map(), titoli = new Map<string, string>();
  for (const d of getAllDocs()) {
    const anc = new Set<string>();
    titoli.set(d.slug, d.title);
    for (const b of docBlocks(d)) { const a = b.href.split("#")[1]; if (a) { anc.add(a); titoli.set(`${d.slug}#${a}`, b.section); } }
    indice.set(d.slug, anc);
  }
  return { indice, titoli };
}

let cache: Piano | null = null;
export function getPiano(): Piano {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const json = JSON.parse(fs.readFileSync(PIANO_PATH, "utf8"));
  cache = validaPiano(json, indiceVademecum().indice);
  return cache;
}

/** Link del vademecum con etichetta: "slug" → pagina, "slug#ancora" → sezione. */
export function linkVademecum(ref: string): { href: string; label: string } {
  const { titoli } = indiceVademecum();
  const [slug, anc] = ref.split("#");
  return { href: `/vademecum/${slug}${anc ? `#${anc}` : ""}`, label: titoli.get(ref) ?? titoli.get(slug) ?? slug };
}
