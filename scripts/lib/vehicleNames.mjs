/**
 * Porting JS puro di src/domain/vehicleNames.ts, per gli script Neon (.mjs)
 * che non possono importare TypeScript direttamente. Stessa fonte di verità
 * concettuale — se si aggiorna un dizionario qui, aggiornarlo anche là.
 */

export const BRAND_ALIASES = {
  CITROEN: "Citroen",
  FIAT: "Fiat",
  FORD: "Ford",
  IVECO: "Iveco",
  MAXUS: "Maxus",
  MERCEDES: "Mercedes-Benz",
  "MERCEDES-BENZ": "Mercedes-Benz",
  MERCEDESBENZ: "Mercedes-Benz",
  NISSAN: "Nissan",
  OPEL: "Opel",
  PEUGEOT: "Peugeot",
  PEUGEUT: "Peugeot",
  PEUGET: "Peugeot",
  PEOUGET: "Peugeot",
  RAP: "Rap",
  RENAULT: "Renault",
  REANULT: "Renault",
  TOYOTA: "Toyota",
  VOLKSWAGEN: "Volkswagen",
  VW: "Volkswagen",
  WOLSVAGEN: "Volkswagen",
  VOLSWAGEN: "Volkswagen",
};

export const MODEL_ALIASES = {
  Citroen: {
    BERLINGO: "Berlingo", JUMPER: "Jumper", JUMPY: "Jumpy", TRAFFIC: "Trafic", TRAFIC: "Trafic",
  },
  Fiat: {
    DUCATO: "Ducato", DOBLO: "Doblò", "DOBLO'": "Doblò", DOBLÒ: "Doblò",
    SCUDO: "Scudo", TALENTO: "Talento", FIORINO: "Fiorino", TRANSIT: "Transit",
  },
  Ford: {
    TRANSIT: "Transit", TRANIST: "Transit", TRANISIT: "Transit", TRANST: "Transit",
    "TRANSIT CUSTOM": "Transit Custom", "TRANSIT CUSTUM": "Transit Custom", "TRANST CUSTOM": "Transit Custom",
    CUSTOM: "Custom", COSTUM: "Custom", CUSTUM: "Custom",
    TOURNEO: "Tourneo", CURIER: "Courier", COURIER: "Courier",
    "E-TRANSIT": "E-Transit", VIVARO: "Vivaro",
  },
  Iveco: { DAILY: "Daily" },
  Maxus: {
    DELIVER: "Deliver 9", DELIVER9: "Deliver 9", "DELIVER 9": "Deliver 9",
    "E-DELIVER": "e-Deliver", "SAIC MOTOR": "Saic Motor",
  },
  "Mercedes-Benz": { SPRINTER: "Sprinter", VITO: "Vito" },
  Nissan: {
    INTERSTAR: "Interstar", NV400: "NV400", PRIMASTAR: "Primastar", TOWNSTAR: "Townstar",
  },
  Opel: {
    MOVANO: "Movano", VIVARO: "Vivaro", "COMBO CARGO": "Combo Cargo", COMBO: "Combo",
  },
  Peugeot: {
    BOXER: "Boxer", BOXSTER: "Boxer", EXPERT: "Expert", EXSPORT: "Expert", EXPRESS: "Express",
  },
  Renault: {
    MASTER: "Master", TRAFFIC: "Trafic", TRAFIC: "Trafic", TRIFFIC: "Trafic", KANGOO: "Kangoo",
  },
  Toyota: { PROACE: "Proace", PROCACE: "Proace", PORACE: "Proace" },
  Volkswagen: {
    CRAFTER: "Crafter", TRANSPORTER: "Transporter", TRASNPORTER: "Transporter",
  },
};

const DESCRIPTIVE_WORD_FIX = { MAXI: "Maxi", METANO: "Metano", CASSONATO: "Cassonato" };
const PLACEHOLDER_PREFIXES = ["N/D", "Veicolo storico"];

function titleCaseWord(w) {
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function normalizeTrailingToken(tok) {
  const paren = tok.match(/^\(([a-zA-Z0-9]+)\)$/);
  if (paren) return paren[1].length === 1 ? `(${paren[1].toUpperCase()})` : tok;
  return DESCRIPTIVE_WORD_FIX[tok.toUpperCase()] ?? tok;
}

export function hasKnownBrand(raw) {
  const first = raw.trim().split(/\s+/)[0] ?? "";
  return first.toUpperCase() in BRAND_ALIASES;
}

export function normalizeModello(raw) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed || PLACEHOLDER_PREFIXES.some((p) => trimmed.startsWith(p))) return trimmed;

  const spaced = trimmed.replace(/(\S)\(/g, "$1 (");
  const tokens = spaced.split(" ");
  const brand = BRAND_ALIASES[tokens[0].toUpperCase()];
  if (!brand) return trimmed;

  const modelDict = MODEL_ALIASES[brand] ?? {};
  const twoWordKey = tokens.slice(1, 3).join(" ").toUpperCase();
  const oneWordKey = (tokens[1] ?? "").toUpperCase();

  let modelPart, restStart;
  if (modelDict[twoWordKey]) {
    modelPart = modelDict[twoWordKey];
    restStart = 3;
  } else if (modelDict[oneWordKey]) {
    modelPart = modelDict[oneWordKey];
    restStart = 2;
  } else {
    modelPart = tokens[1] ? titleCaseWord(tokens[1]) : "";
    restStart = 2;
  }

  const rest = tokens.slice(restStart).map(normalizeTrailingToken).join(" ");
  return [brand, modelPart, rest].filter(Boolean).join(" ").trim();
}

const COMPANY_ALIASES = {
  ALD: "ALD",
  "ALD MT": "ALD MT",
  "ALD MID TERM": "ALD MT",
  ARVAL: "Arval",
  "ARVAL MIDTERM": "Arval",
  "ARVAL BT": "Arval",
  "ARVAL FINE NOLEGGIO": "Arval",
  AUTOVIA: "Autovia",
  AVIS: "Avis",
  AYVENES: "Ayvens",
  AYVENS: "Ayvens",
  DRIVALIA: "Drivalia",
  EUROPCAR: "Europcar",
  HERTZ: "Hertz",
  HERZ: "Hertz",
  LEASEPLAN: "LeasePlan",
  LEASYS: "Leasys",
  LOCAUTO: "Locauto",
  MAGGIORE: "Maggiore",
  NOLEGGIARE: "Noleggiare",
  SIXT: "Sixt",
  TORENTAL: "Torental",
  TRIVELLATO: "Trivellato",
  VEM: "Vem",
};

export function normalizeLeasingCompany(raw) {
  const trimmed = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return COMPANY_ALIASES[trimmed.toUpperCase()] ?? trimmed;
}
