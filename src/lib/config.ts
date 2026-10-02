import "server-only";
import { db } from "./db";

/**
 * Configurazione applicativa — ZERO valori hardcoded nel codice.
 * Tutte le soglie/coefficienti vivono in AppConfig, modificabili da Admin.
 * I DEFAULTS servono solo per il primo bootstrap del DB (seed) e come
 * fallback se una chiave viene cancellata per errore.
 */
export const CONFIG_DEFAULTS: Record<
  string,
  { value: string; type: "number" | "number[]" | "string" | "string[]" | "boolean"; description: string }
> = {
  "appalto.nonAmazon.stationCodes": {
    value: "[\"GLS\"]",
    type: "string[]",
    description: "Codici stazione che appartengono ad appalti diversi da Amazon (es. GLS) — usato per separare i subtotali per appalto in dashboard",
  },
};

export async function getConfigRaw(key: string): Promise<string> {
  const row = await db.appConfig.findUnique({ where: { key } });
  if (row) return row.value;
  const def = CONFIG_DEFAULTS[key];
  if (!def) throw new Error(`Chiave di configurazione sconosciuta: ${key}`);
  return def.value;
}

export async function getConfigNumber(key: string): Promise<number> {
  const v = Number(await getConfigRaw(key));
  if (Number.isNaN(v)) throw new Error(`Config ${key} non è un numero valido`);
  return v;
}

export async function getConfigNumberArray(key: string): Promise<number[]> {
  const parsed = JSON.parse(await getConfigRaw(key));
  if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== "number")) {
    throw new Error(`Config ${key} non è un array di numeri valido`);
  }
  return parsed;
}

export async function getConfigStringArray(key: string): Promise<string[]> {
  const parsed = JSON.parse(await getConfigRaw(key));
  if (!Array.isArray(parsed) || parsed.some((s) => typeof s !== "string")) {
    throw new Error(`Config ${key} non è un array di stringhe valido`);
  }
  return parsed;
}

/** Inserisce le chiavi mancanti con i default (bootstrap/seed). */
export async function ensureConfigDefaults() {
  for (const [key, def] of Object.entries(CONFIG_DEFAULTS)) {
    await db.appConfig.upsert({
      where: { key },
      update: {},
      create: { key, value: def.value, type: def.type, description: def.description },
    });
  }
}
