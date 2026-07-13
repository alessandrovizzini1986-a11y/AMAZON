/**
 * Logica multe/ricorsi — pura e testabile.
 * I termini di ricorso (60gg prefetto, 30gg giudice di pace) arrivano
 * dalla configurazione, mai hardcoded.
 */

const MS_DAY = 86_400_000;

export function scadenzaRicorso(dataNotifica: Date, giorniTermine: number): Date {
  return new Date(dataNotifica.getTime() + giorniTermine * MS_DAY);
}

export function giorniAllaScadenza(scadenza: Date, oggi: Date): number {
  return Math.floor((scadenza.getTime() - oggi.getTime()) / MS_DAY);
}

export type AssignmentWindow = {
  driverId: string;
  driverName: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  date: Date; // giorno di assegnazione
};

/**
 * Determina il conducente al momento dell'infrazione a partire dai log di
 * movimentazione. Regole (in ordine):
 * 1. finestra check-in/check-out che contiene l'istante dell'infrazione → match certo
 * 2. assegnazione giornaliera dello stesso giorno (senza check-out registrato) → match da assegnazione
 * 3. nessun log coerente → null: la multa resta "da assegnare" (fallback esplicito,
 *    mai attribuzione arbitraria)
 */
export function findDriverForFine(
  infrazione: Date,
  assignments: AssignmentWindow[]
): { driverId: string; fonte: string } | null {
  // 1) finestra check-in/out esplicita
  for (const a of assignments) {
    if (a.checkInAt && infrazione >= a.checkInAt && (!a.checkOutAt || infrazione <= a.checkOutAt)) {
      return {
        driverId: a.driverId,
        fonte: `check-in/out del ${a.date.toISOString().slice(0, 10)} (${a.driverName})`,
      };
    }
  }
  // 2) assegnazione giornaliera dello stesso giorno di calendario
  const dayKey = infrazione.toISOString().slice(0, 10);
  for (const a of assignments) {
    if (a.date.toISOString().slice(0, 10) === dayKey) {
      return {
        driverId: a.driverId,
        fonte: `assegnazione giornaliera del ${dayKey} (${a.driverName}) — senza check-in registrato`,
      };
    }
  }
  // 3) da assegnare
  return null;
}

export type ChargebackStato = "NON_PREVISTO" | "DA_ADDEBITARE" | "ADDEBITATO" | "CONTESTATO" | "SALDATO";

/**
 * Una multa "da addebitare" senza conducente assegnato entro la soglia
 * configurata (dalla notifica) diventa automaticamente a carico azienda:
 * non è più possibile risalire a chi guidava per addebitargliela. Calcolato
 * live per la visualizzazione — non muta lo stato salvato finché un admin
 * non lo conferma esplicitamente (coerente con importoStorno/giorniScoperti).
 */
export function riaddebitoEffettivo(params: {
  riaddebito: ChargebackStato;
  driverId: string | null;
  dataNotifica: Date | null;
  oggi: Date;
  sogliaGiorni: number;
}): ChargebackStato {
  if (params.riaddebito !== "DA_ADDEBITARE") return params.riaddebito;
  if (params.driverId) return params.riaddebito;
  if (!params.dataNotifica) return params.riaddebito;
  const giorni = Math.floor((params.oggi.getTime() - params.dataNotifica.getTime()) / MS_DAY);
  return giorni >= params.sogliaGiorni ? "NON_PREVISTO" : params.riaddebito;
}
