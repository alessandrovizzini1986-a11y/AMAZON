/**
 * Storno canone mezzi sostitutivi — logica pura e testabile.
 *
 * Regola di business: la leasing company deve un credito per ogni giorno in cui
 * il veicolo era fermo in officina SENZA mezzo sostitutivo disponibile.
 * giorni scoperti = da (data ingresso officina) a MIN(ricezione sostitutivo,
 * rientro veicolo originale, oggi) — estremi: giorno di ingresso incluso,
 * giorno di ricezione/rientro escluso.
 */

const MS_DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function giorniScoperti(params: {
  dataIngressoOfficina: Date;
  dataRicezioneSostitutivo: Date | null;
  dataRientroOriginale: Date | null;
  oggi: Date;
}): number {
  const { dataIngressoOfficina, dataRicezioneSostitutivo, dataRientroOriginale, oggi } = params;
  const start = startOfDay(dataIngressoOfficina);
  const candidates = [
    dataRicezioneSostitutivo ? startOfDay(dataRicezioneSostitutivo) : null,
    dataRientroOriginale ? startOfDay(dataRientroOriginale) : null,
    startOfDay(oggi),
  ].filter((t): t is number => t !== null);
  const end = Math.min(...candidates);
  return Math.max(0, Math.round((end - start) / MS_DAY));
}

/**
 * importo storno = giorni scoperti × (canone MENSILE ÷ giorni convenzionali del mese),
 * arrotondato al centesimo. I contratti di leasing/noleggio italiani fatturano un
 * canone mensile, non giornaliero: il pro-rata usa una base convenzionale
 * (tipicamente 30) configurabile da Admin, mai hardcoded.
 */
export function importoStorno(giorni: number, canoneMese: number, giorniConvenzionaliMese: number = 30): number {
  if (giorni < 0) throw new Error("giorni scoperti negativi");
  if (canoneMese < 0) throw new Error("canone negativo");
  if (giorniConvenzionaliMese <= 0) throw new Error("giorni convenzionali per mese non valido");
  return Math.round(giorni * (canoneMese / giorniConvenzionaliMese) * 100) / 100;
}

/**
 * Una pratica è "stagnante" se inviata da più di X giorni senza risposta
 * (X configurabile da Admin).
 */
export function isPraticaStagnante(params: {
  stato: string;
  inviataAt: Date | null;
  oggi: Date;
  sogliaGiorni: number;
}): boolean {
  const { stato, inviataAt, oggi, sogliaGiorni } = params;
  if (stato !== "INVIATA" || !inviataAt) return false;
  return (startOfDay(oggi) - startOfDay(inviataAt)) / MS_DAY > sogliaGiorni;
}
