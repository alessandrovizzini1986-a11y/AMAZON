/**
 * Classe di una riga di fattura dalla descrizione (SPEC §5.3): regole in ordine,
 * la prima che combacia con l'inizio della descrizione vince.
 */
export const CLASSI = [
  "SD_A", "SD_B", "SD_C", "SD_ALTRO", "ND_ORDT", "ND_SWA", "ND_CARGOBIKE", "ND_MICRO", "ND_STANDARD",
  "EXTRA_CARBURANTE", "EXTRA_BONUS", "EXTRA_ABORT", "EXTRA_TRAINING", "EXTRA_INCENTIVI", "EXTRA_ALTRO",
] as const;
export type Classe = (typeof CLASSI)[number];

const REGOLE: [Classe, string[]][] = [
  ["SD_A", ["Sameday Parcel - Block of 6"]],
  ["SD_B", ["Multi-Use", "Sameday Parcel - Block of 4"]],
  ["SD_C", ["Sameday Parcel - Block of 3"]],
  ["SD_ALTRO", ["Sameday"]],
  ["ND_ORDT", ["ORDT"]],
  ["ND_SWA", ["MFN Pickup"]],
  ["ND_CARGOBIKE", ["Cargo Electric"]],
  ["ND_MICRO", ["Micro Oversize"]],
  ["ND_STANDARD", ["Standard Parcel", "Nursery Route", "Rescue", "Box Truck"]],
  ["EXTRA_CARBURANTE", ["FuelAllowance", "Fuel Allowance"]],
  ["EXTRA_BONUS", ["DSP Bonus Coverage"]],
  ["EXTRA_ABORT", ["AMZL Late Cancel"]],
  ["EXTRA_TRAINING", ["Training"]],
  ["EXTRA_INCENTIVI", ["OTR", "Incentiv", "Pedaggi", "Parcheggi", "Modifiche - Pedaggi"]],
];

export function classifica(descrizione: string): Classe {
  const d = descrizione.trim();
  for (const [classe, prefissi] of REGOLE) if (prefissi.some((p) => d.startsWith(p))) return classe;
  return "EXTRA_ALTRO";
}

/** Rotta = classe ND_* o SD_* (conta nelle rotte e nella tariffa). */
export const isRotta = (c: string) => c.startsWith("ND_") || c.startsWith("SD_");
