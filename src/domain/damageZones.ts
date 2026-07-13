/**
 * Classificazione zone danno da descrizione libera (italiano), per il
 * diagramma "sagoma furgone" nella scheda veicolo. Pura e testabile: dato
 * lo stesso testo, produce sempre le stesse zone. Una descrizione può
 * colpire più zone contemporaneamente (es. "COFANO, PARABREZZA, TETTO").
 */

export type DamageZoneKey =
  | "paraurti-ant" | "paraurti-post"
  | "cofano" | "tetto" | "parabrezza" | "lunotto" | "portellone-post"
  | "fiancata-sx" | "fiancata-dx"
  | "porta-ant-sx" | "porta-ant-dx" | "porta-post-sx" | "porta-post-dx"
  | "ruota-ant-sx" | "ruota-ant-dx" | "ruota-post-sx" | "ruota-post-dx"
  | "specchio-sx" | "specchio-dx"
  | "fanale-ant" | "fanale-post"
  | "diffuso" | "non-classificato";

const NO_DAMAGE_PATTERNS = [/^non\s+ci\s+sono\s+danni/i, /^non\s+visibil/i, /^nessun/i];

const SX_PATTERN = /\b(sx|sinistr\w*|guida)\b/i;
const DX_PATTERN = /\b(dx|destr\w*|passegger\w*)\b/i;
const ANT_PATTERN = /\b(ant\w*)\b/i;
const POST_PATTERN = /\b(post\w*)\b/i;

function side(text: string): "sx" | "dx" | null {
  if (SX_PATTERN.test(text)) return "sx";
  if (DX_PATTERN.test(text)) return "dx";
  return null;
}

/** Regole in ordine: {parola chiave, come risolvere la zona}. Una descrizione può matchare più regole. */
const RULES: { pattern: RegExp; resolve: (text: string) => DamageZoneKey[] }[] = [
  { pattern: /paraurti/i, resolve: (t) => [POST_PATTERN.test(t) && !ANT_PATTERN.test(t) ? "paraurti-post" : "paraurti-ant"] },
  { pattern: /cofano/i, resolve: () => ["cofano"] },
  { pattern: /tetto/i, resolve: () => ["tetto"] },
  { pattern: /parabrezza/i, resolve: () => ["parabrezza"] },
  { pattern: /lunotto/i, resolve: () => ["lunotto"] },
  { pattern: /portellone/i, resolve: (t) => [side(t) === "sx" ? "porta-post-sx" : side(t) === "dx" ? "porta-post-dx" : "portellone-post"] },
  {
    pattern: /port[ae]|portier[ae]|sportello|cilindrett[oa]|cernier/i,
    resolve: (t) => {
      const s = side(t);
      const isAnt = ANT_PATTERN.test(t) || !POST_PATTERN.test(t);
      if (s === "sx") return [isAnt ? "porta-ant-sx" : "porta-post-sx"];
      if (s === "dx") return [isAnt ? "porta-ant-dx" : "porta-post-dx"];
      return [isAnt ? "porta-ant-sx" : "porta-post-sx", isAnt ? "porta-ant-dx" : "porta-post-dx"];
    },
  },
  {
    pattern: /fiancata|fianco|laterale/i,
    resolve: (t) => { const s = side(t); return [s === "dx" ? "fiancata-dx" : "fiancata-sx"]; },
  },
  {
    pattern: /passaruota|sovraruota|parafango|pneumatic|gomma|cerchi|ruota/i,
    resolve: (t) => {
      const s = side(t);
      const isAnt = ANT_PATTERN.test(t) || !POST_PATTERN.test(t);
      if (s === "dx") return [isAnt ? "ruota-ant-dx" : "ruota-post-dx"];
      if (s === "sx") return [isAnt ? "ruota-ant-sx" : "ruota-post-sx"];
      return [isAnt ? "ruota-ant-sx" : "ruota-post-sx", isAnt ? "ruota-ant-dx" : "ruota-post-dx"];
    },
  },
  {
    pattern: /specchi|retrov\w*/i,
    resolve: (t) => { const s = side(t); return [s === "dx" ? "specchio-dx" : "specchio-sx"]; },
  },
  {
    pattern: /fanale|faro|deflettore|finestrino|cristall|vetro/i,
    resolve: (t) => [POST_PATTERN.test(t) ? "fanale-post" : "fanale-ant"],
  },
  { pattern: /grandine|tutta\s+la\s+carrozzeria/i, resolve: () => ["diffuso"] },
  { pattern: /maniglia/i, resolve: (t) => { const s = side(t); const isAnt = ANT_PATTERN.test(t) || !POST_PATTERN.test(t);
      return [s === "dx" ? (isAnt ? "porta-ant-dx" : "porta-post-dx") : (isAnt ? "porta-ant-sx" : "porta-post-sx")]; } },
];

export function classifyDamageZones(descrizione: string): DamageZoneKey[] {
  const text = descrizione.trim();
  if (!text || NO_DAMAGE_PATTERNS.some((p) => p.test(text))) return [];

  const zones = new Set<DamageZoneKey>();
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      for (const z of rule.resolve(text)) zones.add(z);
    }
  }
  if (zones.size > 0) return [...zones];

  // fallback: solo "anteriore"/"posteriore" generico, senza una parte del corpo riconoscibile
  if (POST_PATTERN.test(text)) return ["paraurti-post"];
  if (ANT_PATTERN.test(text)) return ["paraurti-ant"];
  return ["non-classificato"];
}
