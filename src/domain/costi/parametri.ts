/** Chiavi dei coefficienti in `Parametro`, con etichetta e unità. */
export const PARAMETRI: Record<string, { etichetta: string; unita: string; gruppo: "SIC" | "STD" | "CCNL" | "RIMBORSI" }> = {
  SIC_MOLT_ONERI: { etichetta: "Moltiplicatore oneri + TFR sui lordi", unita: "×", gruppo: "SIC" },
  SIC_STR_FT: { etichetta: "Straordinario FT", unita: "€/h", gruppo: "SIC" },
  SIC_STR_PT: { etichetta: "Straordinario PT", unita: "€/h", gruppo: "SIC" },
  SIC_SUPP: { etichetta: "Supplementare", unita: "€/h", gruppo: "SIC" },
  SIC_DOMFEST: { etichetta: "Lavoro domenica/festivo", unita: "€/h", gruppo: "SIC" },
  SIC_MALATTIA_H: { etichetta: "Ora di malattia/infortunio", unita: "€/h", gruppo: "SIC" },
  SIC_CARENZA_PCT: { etichetta: "Carenza/integrazione sul totale malattia", unita: "%", gruppo: "SIC" },
  STD_CTRB_H: { etichetta: "CTRB Decr. Dignità", unita: "€/h", gruppo: "STD" },
  STD_ALTRO_PCT: { etichetta: "Altro sul costo", unita: "%", gruppo: "STD" },
  STD_GG_MESE: { etichetta: "Giorni convenzionali (festività = ore Standard / gg × festivi)", unita: "gg", gruppo: "STD" },
  STD_MOG: { etichetta: "Integrazione MOG", unita: "€", gruppo: "STD" },
  PARCHEGGIO_DER1: { etichetta: "Parcheggio DER1 (IVA esclusa, controllo rimborsi Amazon)", unita: "€/mese", gruppo: "RIMBORSI" },
  PARCHEGGIO_DER2: { etichetta: "Parcheggio DER2", unita: "€/mese", gruppo: "RIMBORSI" },
  PARCHEGGIO_DLO2: { etichetta: "Parcheggio DLO2", unita: "€/mese", gruppo: "RIMBORSI" },
  PARCHEGGIO_DLO4: { etichetta: "Parcheggio DLO4", unita: "€/mese", gruppo: "RIMBORSI" },
  PARCHEGGIO_DLO5: { etichetta: "Parcheggio DLO5", unita: "€/mese", gruppo: "RIMBORSI" },
  PARCHEGGIO_DLZ2: { etichetta: "Parcheggio DLZ2", unita: "€/mese", gruppo: "RIMBORSI" },
  PARCHEGGIO_DVN1: { etichetta: "Parcheggio DVN1", unita: "€/mese", gruppo: "RIMBORSI" },
  TRAINING_EURO: { etichetta: "Training di un lavoratore nuovo (rimborso Amazon atteso)", unita: "€", gruppo: "RIMBORSI" },
  TETTO_SETT_H: { etichetta: "Tetto ore settimanali ordinarie + Accordo (CCNL 11 quinquies)", unita: "h", gruppo: "CCNL" },
};

export type ParametroStorico = { chiave: string; validaDal: string; valore: number };

/** Valore di ogni chiave valido alla data (ultimo con validaDal ≤ data). */
export function parametriAlla(tab: ParametroStorico[], data: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of [...tab].sort((a, b) => a.validaDal.localeCompare(b.validaDal))) if (p.validaDal <= data) out[p.chiave] = p.valore;
  return out;
}

/** Versione dei parametri alla data: la validaDal più recente fra quelle in uso. */
export function versioneParametri(tab: ParametroStorico[], data: string): string | null {
  const v = tab.filter((p) => p.validaDal <= data).map((p) => p.validaDal).sort();
  return v.length ? v[v.length - 1] : null;
}
