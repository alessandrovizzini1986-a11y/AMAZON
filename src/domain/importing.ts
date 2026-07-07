/**
 * Motore di import massivo — logica pura e testabile.
 * Gestisce: mapping colonne flessibile (alias intestazioni), coercizione tipi
 * con date REALI (Date JS, ISO, dd/mm/yyyy, seriali Excel), validazione riga
 * per riga con motivo dell'errore.
 */

export type FieldType = "string" | "int" | "decimal" | "date" | "datetime" | "enum" | "boolean";

export type FieldSpec = {
  key: string;
  label: string; // intestazione colonna nel template
  required: boolean;
  type: FieldType;
  enumValues?: string[];
  aliases?: string[]; // intestazioni alternative accettate in auto-mapping
  note?: string; // istruzioni per il foglio "Istruzioni" del template
};

export type EntitySpec = {
  entity: string;
  label: string;
  description: string;
  fields: FieldSpec[];
};

export const IMPORT_SPECS: Record<string, EntitySpec> = {
  vehicles: {
    entity: "vehicles",
    label: "Veicoli",
    description: "Anagrafica flotta: un veicolo per riga, targa univoca tra i mezzi attivi.",
    fields: [
      { key: "targa", label: "Targa", required: true, type: "string", aliases: ["plate", "targa veicolo"] },
      { key: "modello", label: "Modello", required: true, type: "string", aliases: ["model", "veicolo"] },
      { key: "allestimento", label: "Allestimento", required: false, type: "string" },
      { key: "alimentazione", label: "Alimentazione", required: true, type: "enum", enumValues: ["DIESEL", "DIESEL_HVO", "BENZINA", "ELETTRICO", "METANO", "GPL", "IBRIDO"], aliases: ["fuel", "carburante"], note: "DIESEL_HVO = compatibile EN 15940" },
      { key: "hvoCompatibile", label: "Compatibile HVO", required: false, type: "boolean", aliases: ["hvo"], note: "SI/NO" },
      { key: "immatricolazione", label: "Data immatricolazione", required: true, type: "date", aliases: ["immatricolazione", "first registration"] },
      { key: "stationCode", label: "Codice stazione", required: true, type: "string", aliases: ["stazione", "station", "sede"], note: "Codice stazione esistente (es. DML1)" },
      { key: "stato", label: "Stato", required: false, type: "enum", enumValues: ["ATTIVO", "IN_OFFICINA", "SOSTITUTIVO", "DISMESSO"], note: "Default: ATTIVO" },
      { key: "kmAttuali", label: "Km attuali", required: false, type: "int", aliases: ["km", "chilometri"] },
      { key: "canoneGiorno", label: "Canone €/giorno", required: true, type: "decimal", aliases: ["canone", "canone giornaliero", "daily rate"] },
      { key: "leasingCompany", label: "Società leasing", required: false, type: "string", aliases: ["leasing", "noleggiatore"] },
      { key: "contrattoLeasingNo", label: "N. contratto leasing", required: false, type: "string", aliases: ["contratto"] },
      { key: "prossimoTagliandoData", label: "Prossimo tagliando (data)", required: false, type: "date" },
      { key: "prossimoTagliandoKm", label: "Prossimo tagliando (km)", required: false, type: "int" },
      { key: "prossimaRevisione", label: "Scadenza revisione", required: false, type: "date", aliases: ["revisione"] },
    ],
  },
  drivers: {
    entity: "drivers",
    label: "Driver / Utenti",
    description: "Utenti del gestionale. La password iniziale viene generata e comunicata a parte.",
    fields: [
      { key: "email", label: "Email", required: true, type: "string" },
      { key: "firstName", label: "Nome", required: true, type: "string", aliases: ["name", "nome"] },
      { key: "lastName", label: "Cognome", required: true, type: "string", aliases: ["surname", "cognome"] },
      { key: "role", label: "Ruolo", required: false, type: "enum", enumValues: ["ADMIN", "RESP_MEZZI", "DRIVER"], note: "Default: DRIVER" },
      { key: "stationCode", label: "Codice stazione", required: false, type: "string", aliases: ["stazione", "sede"], note: "Obbligatorio per DRIVER e RESP_MEZZI" },
      { key: "licenseNo", label: "N. patente", required: false, type: "string", aliases: ["patente"] },
      { key: "phone", label: "Telefono", required: false, type: "string", aliases: ["cellulare"] },
    ],
  },
  services: {
    entity: "services",
    label: "Storico tagliandi/interventi",
    description: "Interventi di manutenzione già effettuati. Il veicolo è identificato dalla targa.",
    fields: [
      { key: "targa", label: "Targa", required: true, type: "string" },
      { key: "tipo", label: "Tipo intervento", required: true, type: "enum", enumValues: ["TAGLIANDO", "REVISIONE", "RIPARAZIONE", "GOMME", "CARROZZERIA", "ALTRO"] },
      { key: "officina", label: "Officina", required: true, type: "string" },
      { key: "data", label: "Data intervento", required: true, type: "date" },
      { key: "kmIntervento", label: "Km all'intervento", required: true, type: "int", aliases: ["km"] },
      { key: "costo", label: "Costo €", required: true, type: "decimal", aliases: ["importo"] },
      { key: "descrizione", label: "Descrizione", required: false, type: "string", aliases: ["note"] },
    ],
  },
  fines: {
    entity: "fines",
    label: "Multe pregresse",
    description: "Verbali già ricevuti. Il conducente (se noto) è identificato dall'email.",
    fields: [
      { key: "targa", label: "Targa", required: true, type: "string" },
      { key: "verbaleNo", label: "N. verbale", required: false, type: "string", aliases: ["verbale"] },
      { key: "dataOraInfrazione", label: "Data/ora infrazione", required: true, type: "datetime", aliases: ["data infrazione"] },
      { key: "luogo", label: "Luogo", required: true, type: "string" },
      { key: "tipoViolazione", label: "Tipo violazione", required: true, type: "string", aliases: ["violazione"] },
      { key: "importo", label: "Importo €", required: true, type: "decimal" },
      { key: "puntiPatente", label: "Punti patente", required: false, type: "int", aliases: ["punti"] },
      { key: "stato", label: "Stato", required: false, type: "enum", enumValues: ["DA_NOTIFICARE", "NOTIFICATA", "PAGATA", "RICORSO", "ANNULLATA"], note: "Default: DA_NOTIFICARE" },
      { key: "dataNotifica", label: "Data notifica", required: false, type: "date" },
      { key: "driverEmail", label: "Email conducente", required: false, type: "string", aliases: ["driver", "conducente"], note: "Se vuoto la multa resta 'da assegnare'" },
    ],
  },
  leases: {
    entity: "leases",
    label: "Contratti leasing / canoni",
    description: "Aggiorna canone e società di leasing dei veicoli esistenti (match per targa).",
    fields: [
      { key: "targa", label: "Targa", required: true, type: "string" },
      { key: "canoneGiorno", label: "Canone €/giorno", required: true, type: "decimal", aliases: ["canone"] },
      { key: "leasingCompany", label: "Società leasing", required: true, type: "string", aliases: ["leasing"] },
      { key: "contrattoLeasingNo", label: "N. contratto", required: false, type: "string", aliases: ["contratto"] },
    ],
  },
  movements: {
    entity: "movements",
    label: "Movimentazioni storiche",
    description: "Assegnazioni giornaliere veicolo↔driver↔stazione già avvenute.",
    fields: [
      { key: "date", label: "Data", required: true, type: "date" },
      { key: "targa", label: "Targa", required: true, type: "string" },
      { key: "driverEmail", label: "Email driver", required: true, type: "string", aliases: ["driver"] },
      { key: "stationCode", label: "Codice stazione", required: true, type: "string", aliases: ["stazione"] },
      { key: "checkInKm", label: "Km check-in", required: false, type: "int" },
      { key: "checkOutKm", label: "Km check-out", required: false, type: "int" },
    ],
  },
  replacements: {
    entity: "replacements",
    label: "Pratiche sostitutivo pregresse",
    description: "Pratiche mezzo sostitutivo/storno canone già aperte o chiuse.",
    fields: [
      { key: "targa", label: "Targa veicolo originale", required: true, type: "string" },
      { key: "motivo", label: "Motivo", required: true, type: "enum", enumValues: ["INCIDENTE", "GUASTO", "MANUTENZIONE"] },
      { key: "dataIngressoOfficina", label: "Data ingresso officina", required: true, type: "date" },
      { key: "centroConvenzionato", label: "Centro convenzionato", required: true, type: "string", aliases: ["officina", "centro"] },
      { key: "targaSostitutivo", label: "Targa sostitutivo", required: false, type: "string" },
      { key: "dataRicezioneSostitutivo", label: "Data ricezione sostitutivo", required: false, type: "date" },
      { key: "dataRientroOriginale", label: "Data rientro originale", required: false, type: "date" },
      { key: "stato", label: "Stato pratica", required: false, type: "enum", enumValues: ["APERTA", "INVIATA", "CONFERMATA", "CONTESTATA", "CHIUSA"], note: "Default: APERTA" },
      { key: "note", label: "Note", required: false, type: "string" },
    ],
  },
  fuel: {
    entity: "fuel",
    label: "Transazioni carburante (Q8)",
    description: "Transazioni mensili per PAN carta (NON per targa: la targa in stampa Q8 è inaffidabile).",
    fields: [
      { key: "pan", label: "PAN carta", required: true, type: "string", aliases: ["carta", "card"] },
      { key: "data", label: "Data/ora", required: true, type: "datetime", aliases: ["data transazione"] },
      { key: "litri", label: "Litri", required: true, type: "decimal" },
      { key: "importo", label: "Importo €", required: true, type: "decimal" },
      { key: "puntoVendita", label: "Punto vendita", required: false, type: "string", aliases: ["stazione servizio"] },
      { key: "prodotto", label: "Prodotto", required: false, type: "string" },
    ],
  },
  tolls: {
    entity: "tolls",
    label: "Pedaggi / Telepass",
    description: "Transazioni pedaggio mensili per stazione.",
    fields: [
      { key: "stationCode", label: "Codice stazione", required: true, type: "string", aliases: ["stazione", "sede"] },
      { key: "deviceCode", label: "Codice apparato", required: false, type: "string", aliases: ["telepass", "obu"] },
      { key: "targa", label: "Targa", required: false, type: "string" },
      { key: "data", label: "Data/ora", required: true, type: "datetime" },
      { key: "tratta", label: "Tratta", required: false, type: "string", aliases: ["percorso"] },
      { key: "importo", label: "Importo €", required: true, type: "decimal" },
    ],
  },
};

// ---------- Mapping colonne ----------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Auto-mapping intestazioni file → campi del template.
 * Match per label esatta, alias, o key. Ritorna per ogni campo l'indice
 * colonna o null (da rimappare manualmente in UI).
 */
export function autoMapColumns(
  headers: string[],
  spec: EntitySpec
): Record<string, number | null> {
  const normHeaders = headers.map(norm);
  const mapping: Record<string, number | null> = {};
  for (const field of spec.fields) {
    const candidates = [field.label, field.key, ...(field.aliases ?? [])].map(norm);
    const idx = normHeaders.findIndex((h) => candidates.includes(h));
    mapping[field.key] = idx >= 0 ? idx : null;
  }
  return mapping;
}

// ---------- Coercizione tipi ----------

export type CoerceResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30); // Excel serial date 0

function parseDateLike(raw: unknown): Date | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    // seriale Excel (giorni dal 1899-12-30) — range plausibile 1954..2118
    return new Date(EXCEL_EPOCH_MS + raw * 86_400_000);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    // dd/mm/yyyy o dd-mm-yyyy, con eventuale ora
    const it = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (it) {
      const [, dd, mm, yyyy, hh, min] = it;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh ?? 0), Number(min ?? 0));
      return isNaN(d.getTime()) ? null : d;
    }
    // ISO o altri formati riconosciuti da Date
    const iso = s.match(/^\d{4}-\d{2}-\d{2}/) ? new Date(s) : null;
    if (iso && !isNaN(iso.getTime())) return iso;
  }
  return null;
}

export function coerceValue(raw: unknown, field: FieldSpec): CoerceResult {
  const isEmpty =
    raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "");
  if (isEmpty) {
    if (field.required) return { ok: false, error: `campo obbligatorio "${field.label}" mancante` };
    return { ok: true, value: null };
  }

  switch (field.type) {
    case "string":
      return { ok: true, value: String(raw).trim() };
    case "int": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { ok: false, error: `"${field.label}": "${raw}" non è un numero intero valido` };
      }
      return { ok: true, value: n };
    }
    case "decimal": {
      // gestisce formato it (1.234,56) e formato en (1234.56)
      let n: number;
      if (typeof raw === "number") n = raw;
      else {
        const s = String(raw).trim().replace(/€|\s/g, "");
        n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
      }
      if (!Number.isFinite(n)) {
        return { ok: false, error: `"${field.label}": "${raw}" non è un importo valido` };
      }
      return { ok: true, value: Math.round(n * 100) / 100 };
    }
    case "date":
    case "datetime": {
      const d = parseDateLike(raw);
      if (!d) {
        return {
          ok: false,
          error: `"${field.label}": "${raw}" non è una data valida (usare formato data reale, ISO o gg/mm/aaaa)`,
        };
      }
      return { ok: true, value: d };
    }
    case "enum": {
      const v = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
      if (!field.enumValues?.includes(v)) {
        return {
          ok: false,
          error: `"${field.label}": "${raw}" non ammesso (valori: ${field.enumValues?.join(", ")})`,
        };
      }
      return { ok: true, value: v };
    }
    case "boolean": {
      const v = String(raw).trim().toLowerCase();
      if (["si", "sì", "s", "true", "1", "yes", "y", "x"].includes(v)) return { ok: true, value: true };
      if (["no", "n", "false", "0", ""].includes(v)) return { ok: true, value: false };
      return { ok: false, error: `"${field.label}": "${raw}" non è un valore SI/NO valido` };
    }
  }
}

// ---------- Validazione riga ----------

export type RowResult = {
  rowIndex: number; // indice riga nel file (1-based, esclusa intestazione)
  ok: boolean;
  data: Record<string, unknown>;
  errors: string[];
};

/**
 * Valida tutte le righe di un file rispetto allo spec e al mapping colonne.
 * Non tocca il DB: i controlli FK/duplicati sono fatti nel commit server-side.
 */
export function validateRows(
  rows: unknown[][],
  mapping: Record<string, number | null>,
  spec: EntitySpec
): RowResult[] {
  return rows.map((row, i) => {
    const data: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const field of spec.fields) {
      const colIdx = mapping[field.key];
      const raw = colIdx === null || colIdx === undefined ? null : row[colIdx];
      const res = coerceValue(raw, field);
      if (res.ok) data[field.key] = res.value;
      else errors.push(res.error);
    }
    return { rowIndex: i + 1, ok: errors.length === 0, data, errors };
  });
}
