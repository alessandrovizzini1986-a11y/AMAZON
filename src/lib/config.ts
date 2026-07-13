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
  { value: string; type: "number" | "number[]" | "string" | "boolean"; description: string }
> = {
  "maint.alert.giorni": {
    value: "[30,15,7]",
    type: "number[]",
    description: "Soglie alert tagliando/revisione in giorni prima della scadenza",
  },
  "maint.alert.km": {
    value: "[1000,500,100]",
    type: "number[]",
    description: "Soglie alert tagliando in km prima della soglia",
  },
  "fine.ricorso.prefetto.giorni": {
    value: "60",
    type: "number",
    description: "Giorni dalla notifica per ricorso al Prefetto",
  },
  "fine.ricorso.gdp.giorni": {
    value: "30",
    type: "number",
    description: "Giorni dalla notifica per ricorso al Giudice di Pace",
  },
  "replacement.alert.giorniSenzaRisposta": {
    value: "15",
    type: "number",
    description: "Giorni oltre i quali una pratica sostitutivo inviata senza risposta va in alert",
  },
  "replacement.giorniConvenzionaliMese": {
    value: "30",
    type: "number",
    description: "Base giorni convenzionale per il pro-rata del canone mensile nello storno (giorni scoperti × canone/mese ÷ questa base)",
  },
  "fuel.consumo.atteso.l100km": {
    value: "11",
    type: "number",
    description: "Consumo atteso di riferimento (litri/100km) per la riconciliazione carburante",
  },
  "fuel.consumo.tolleranza": {
    value: "0.25",
    type: "number",
    description: "Tolleranza (frazione) oltre il consumo atteso prima di segnalare anomalia",
  },
  "fine.riaddebito.scadenzaGiorni": {
    value: "30",
    type: "number",
    description: "Giorni dalla notifica oltre i quali, se non è stato assegnato un conducente, la multa diventa automaticamente a carico azienda (non più addebitabile)",
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
