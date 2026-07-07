export const FINE_TONE: Record<string, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  DA_NOTIFICARE: "warn",
  NOTIFICATA: "info",
  PAGATA: "ok",
  RICORSO: "info",
  ANNULLATA: "neutral",
};

export const RICORSO_LABELS: Record<string, string> = {
  NESSUNO: "Nessun ricorso",
  IN_PREPARAZIONE: "In preparazione",
  PRESENTATO: "Presentato",
  ACCOLTO: "Accolto",
  RESPINTO: "Respinto",
};

export const RIADDEBITO_LABELS: Record<string, string> = {
  NON_PREVISTO: "Non previsto",
  DA_ADDEBITARE: "Da addebitare",
  ADDEBITATO: "Addebitato",
  CONTESTATO: "Contestato",
  SALDATO: "Saldato",
};
