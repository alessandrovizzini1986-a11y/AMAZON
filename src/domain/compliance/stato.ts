/** Stati del registro, quando una riga è chiusa, chi può fare cosa. */
export type Stato = "DA_RICHIEDERE" | "RICHIESTO" | "RICEVUTO" | "CARICATO" | "VALIDATO" | "RESPINTO" | "NON_APPLICABILE";
export const STATI: Stato[] = ["DA_RICHIEDERE", "RICHIESTO", "RICEVUTO", "CARICATO", "VALIDATO", "RESPINTO", "NON_APPLICABILE"];
export const NOME_STATO: Record<Stato, string> = { DA_RICHIEDERE: "Da richiedere", RICHIESTO: "Richiesto", RICEVUTO: "Ricevuto", CARICATO: "Caricato", VALIDATO: "Validato", RESPINTO: "Respinto", NON_APPLICABILE: "Non applicabile" };
/** Classi di colore (sfondo e testo) per ogni stato: rosso, arancione, giallo chiaro, giallo, verde, rosso scuro, grigio. */
export const COLORE_STATO: Record<Stato, string> = {
  DA_RICHIEDERE: "bg-red-100 text-red-800", RICHIESTO: "bg-orange-100 text-orange-800", RICEVUTO: "bg-yellow-50 text-yellow-800", CARICATO: "bg-yellow-200 text-yellow-900",
  VALIDATO: "bg-green-100 text-green-800", RESPINTO: "bg-red-700 text-white", NON_APPLICABILE: "bg-slate-100 text-slate-500",
};

/** Chiusa = validata o non applicabile; i folder "No workflow" (nessuna validazione) sono chiusi già a CARICATO. */
export const chiusa = (stato: string, workflow: boolean) => stato === "VALIDATO" || stato === "NON_APPLICABILE" || (!workflow && stato === "CARICATO");

/** Scaduta: oggi è oltre la scadenza del portale e la riga non è chiusa. Lo stato vero non cambia. */
export const scaduta = (r: { stato: string; scadenzaPortale: string | null }, workflow: boolean, oggi: string) => !!r.scadenzaPortale && oggi > r.scadenzaPortale && !chiusa(r.stato, workflow);

export type Chi = { id: string; admin: boolean };

/** Tutti quelli che vedono il registro possono mettere la spunta "Caricato" su una riga non ancora caricata o validata. */
export const puoSpuntare = (stato: string) => ["DA_RICHIEDERE", "RICHIESTO", "RICEVUTO", "RESPINTO"].includes(stato);

/** La spunta la toglie chi l'ha messa; l'admin le toglie tutte. */
export const puoTogliereSpunta = (r: { stato: string; caricatoDaId: string | null }, chi: Chi) => r.stato === "CARICATO" && (chi.admin || r.caricatoDaId === chi.id);

/** La riga è "mia" se il mio nome o cognome compare tra gli owner (es. "Rossi / Bianchi" è di entrambi). */
export function mia(owner: string, utente: { nome: string; cognome: string }): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const o = ` ${n(owner)} `, c = n(utente.cognome), p = n(utente.nome);
  return (!!c && o.includes(` ${c} `)) || (!!p && o.includes(` ${p} `));
}

/** Percorsi aperti al ruolo Compliance: il registro, le sue chiamate e il proprio account. */
export const soloCompliance = (percorso: string) => ["/compliance", "/api/compliance", "/account"].some((p) => percorso === p || percorso.startsWith(`${p}/`));
