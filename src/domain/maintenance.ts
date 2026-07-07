/**
 * Logica scadenzario manutenzione — pura e testabile.
 * Doppia soglia (km E data): l'alert scatta sulla prima che matura.
 * Le soglie arrivano dalla configurazione (mai hardcoded qui).
 */

export type Urgency = "ok" | "warn" | "danger";

export type MaintenanceCheck = {
  urgency: Urgency;
  /** motivo leggibile, es. "tagliando scaduto da 12 giorni" */
  reason: string;
  giorniMancanti: number | null;
  kmMancanti: number | null;
};

const MS_DAY = 86_400_000;

export function giorniTra(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_DAY);
}

/**
 * Valuta lo stato del tagliando rispetto a doppia soglia.
 * sogliaGiorni/sogliaKm: array decrescenti (es. [30,15,7] / [1000,500,100]);
 * - oltre la prima soglia → ok
 * - dentro la prima soglia → warn
 * - dentro l'ultima soglia o scaduto → danger
 */
export function checkTagliando(params: {
  oggi: Date;
  kmAttuali: number;
  prossimoTagliandoData: Date | null;
  prossimoTagliandoKm: number | null;
  sogliaGiorni: number[];
  sogliaKm: number[];
}): MaintenanceCheck {
  const { oggi, kmAttuali, prossimoTagliandoData, prossimoTagliandoKm, sogliaGiorni, sogliaKm } = params;

  const giorniMancanti = prossimoTagliandoData ? giorniTra(oggi, prossimoTagliandoData) : null;
  const kmMancanti = prossimoTagliandoKm !== null && prossimoTagliandoKm !== undefined
    ? prossimoTagliandoKm - kmAttuali
    : null;

  if (giorniMancanti === null && kmMancanti === null) {
    return { urgency: "warn", reason: "scadenza tagliando non pianificata", giorniMancanti, kmMancanti };
  }

  const evals: { urgency: Urgency; reason: string }[] = [];

  if (giorniMancanti !== null) {
    if (giorniMancanti < 0) {
      evals.push({ urgency: "danger", reason: `tagliando scaduto da ${-giorniMancanti} giorni` });
    } else if (giorniMancanti <= Math.min(...sogliaGiorni)) {
      evals.push({ urgency: "danger", reason: `tagliando tra ${giorniMancanti} giorni` });
    } else if (giorniMancanti <= Math.max(...sogliaGiorni)) {
      evals.push({ urgency: "warn", reason: `tagliando tra ${giorniMancanti} giorni` });
    } else {
      evals.push({ urgency: "ok", reason: `tagliando tra ${giorniMancanti} giorni` });
    }
  }

  if (kmMancanti !== null) {
    if (kmMancanti < 0) {
      evals.push({ urgency: "danger", reason: `tagliando superato di ${-kmMancanti} km` });
    } else if (kmMancanti <= Math.min(...sogliaKm)) {
      evals.push({ urgency: "danger", reason: `tagliando tra ${kmMancanti} km` });
    } else if (kmMancanti <= Math.max(...sogliaKm)) {
      evals.push({ urgency: "warn", reason: `tagliando tra ${kmMancanti} km` });
    } else {
      evals.push({ urgency: "ok", reason: `tagliando tra ${kmMancanti} km` });
    }
  }

  // vince la condizione peggiore (prima soglia che matura)
  const order: Urgency[] = ["danger", "warn", "ok"];
  evals.sort((a, b) => order.indexOf(a.urgency) - order.indexOf(b.urgency));
  const worst = evals[0];
  return { urgency: worst.urgency, reason: worst.reason, giorniMancanti, kmMancanti };
}

/** Revisione legale: solo scadenza per data. */
export function checkRevisione(params: {
  oggi: Date;
  prossimaRevisione: Date | null;
  sogliaGiorni: number[];
}): MaintenanceCheck {
  const { oggi, prossimaRevisione, sogliaGiorni } = params;
  if (!prossimaRevisione) {
    return { urgency: "warn", reason: "scadenza revisione non registrata", giorniMancanti: null, kmMancanti: null };
  }
  const giorni = giorniTra(oggi, prossimaRevisione);
  if (giorni < 0) {
    return { urgency: "danger", reason: `revisione scaduta da ${-giorni} giorni — veicolo non circolabile`, giorniMancanti: giorni, kmMancanti: null };
  }
  if (giorni <= Math.min(...sogliaGiorni)) {
    return { urgency: "danger", reason: `revisione tra ${giorni} giorni`, giorniMancanti: giorni, kmMancanti: null };
  }
  if (giorni <= Math.max(...sogliaGiorni)) {
    return { urgency: "warn", reason: `revisione tra ${giorni} giorni`, giorniMancanti: giorni, kmMancanti: null };
  }
  return { urgency: "ok", reason: `revisione tra ${giorni} giorni`, giorniMancanti: giorni, kmMancanti: null };
}
