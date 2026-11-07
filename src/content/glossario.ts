/**
 * Glossario: sigle e parole del lavoro che chi arriva da fuori non conosce.
 * Fonte unica per la pagina del Vademecum (content/vademecum/18-glossario.md, tenuta allineata da un test)
 * e per le spiegazioni al passaggio del mouse (src/components/Sigle.tsx).
 */
export type VoceGlossario = { sigla: string; nome: string; spiega: string; tema: "Persone e costi" | "Amazon" | "Mezzi e spese" | "Sito" };

export const GLOSSARIO: VoceGlossario[] = [
  { sigla: "DSP", nome: "Delivery Service Partner", spiega: "L'azienda che fa le consegne per Amazon: noi (Professional Solutions) su 7 station.", tema: "Amazon" },
  { sigla: "DS", nome: "Delivery Station", spiega: "Il magazzino Amazon da cui partono i furgoni, con un codice: DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1. GLS è la sede di Castel Maggiore.", tema: "Amazon" },
  { sigla: "CDC", nome: "Centro di costo", spiega: "Il codice contabile a cui va ogni costo e ricavo: 5569 per Amazon, 5565 per GLS. Gli altri CDC sono di altri progetti.", tema: "Persone e costi" },
  { sigla: "SIC", nome: "Dipendenti interni", spiega: "Autisti assunti da Professional Solutions (contratti CTI FT, CTI PT, Dispatcher). La busta del mese M si paga il 27 del mese dopo.", tema: "Persone e costi" },
  { sigla: "CTI", nome: "Contratto dei dipendenti SIC", spiega: "Il contratto dei SIC: FT a tempo pieno, PT part-time (anche 32 ore a settimana).", tema: "Persone e costi" },
  { sigla: "STD", nome: "Somministrati", spiega: "Autisti in somministrazione tramite Adecco: il costo arriva nella fattura ADIT del mese di competenza.", tema: "Persone e costi" },
  { sigla: "MOG", nome: "Monte ore garantito", spiega: "STD con un minimo di ore pagate al mese anche se ne lavorano meno (file ADECCO_PS). Per le multe si trattano come STD.", tema: "Persone e costi" },
  { sigla: "ADIT", nome: "Fattura Adecco degli STD", spiega: "La fattura mensile della somministrazione: arriva circa 5 settimane dopo il mese ed è il consuntivo del costo STD.", tema: "Persone e costi" },
  { sigla: "CDL", nome: "Costo del lavoro base", spiega: "Il costo mensile di base di ogni dipendente SIC, dal file HR DB_CDL_base. Senza CDL il sito usa la media del contratto nella station.", tema: "Persone e costi" },
  { sigla: "Payroll", nome: "Costi del personale PS", spiega: "Il file con la busta vera dei SIC per CDC: quando arriva sostituisce la stima.", tema: "Persone e costi" },
  { sigla: "F.O.", nome: "Foglio mensile dei costi per cliente", spiega: "I file Costi F.O. (uno Amazon, uno GLS) con tutti i costi del mese per voce: il sito prepara i fogli da spostarci dentro.", tema: "Persone e costi" },
  { sigla: "Open book", nome: "Fatturazione a costi documentati", spiega: "Il contratto GLS: ogni mese si fatturano a GLS i costi del mese prima (pedaggi di due mesi prima) più costi accessori, 7 % di struttura e 6,5 % di margine.", tema: "Persone e costi" },
  { sigla: "Accantonamenti", nome: "Costi maturati non ancora pagati", spiega: "Straordinari, ferie e permessi del mese che verranno pagati dopo: nel F.O. si tolgono quelli del mese prima e si aggiungono quelli del mese.", tema: "Persone e costi" },
  { sigla: "Competenza", nome: "Mese di competenza", spiega: "Il mese in cui il lavoro è stato fatto, diverso dal mese in cui arriva la fattura o si paga la busta (registrazione).", tema: "Persone e costi" },
  { sigla: "Tracking", nome: "Fogli presenze delle station", spiega: "I file con ore e giornate di ogni autista, SIC e STD separati: base delle stime dei costi.", tema: "Persone e costi" },
  { sigla: "Badgebox", nome: "Timbrature GLS", spiega: "L'app con cui il personale GLS timbra: il sito la confronta con le presenze per trovare chi non timbra.", tema: "Persone e costi" },
  { sigla: "Teste", nome: "Persone", spiega: "Numero di persone (per contratto o station), da non confondere con le ore o le giornate.", tema: "Persone e costi" },
  { sigla: "fatt_2026", nome: "Foglio delle righe di fattura Amazon", spiega: "Nel file AGGREGATO: una riga per ogni riga delle fatture Amazon, con DS, data, descrizione, imponibile (AVERE) e macroarea.", tema: "Amazon" },
  { sigla: "AVERE", nome: "Imponibile", spiega: "L'importo senza IVA di una riga di fattura.", tema: "Amazon" },
  { sigla: "Week", nome: "Settimana Amazon", spiega: "Le settimane Amazon vanno da domenica a sabato: la numerazione può differire da quella del calendario.", tema: "Amazon" },
  { sigla: "Block", nome: "Rotta", spiega: "\"Block of 8 Hours 24 Minutes\": una rotta di un furgone per un giorno, pagata a tariffa fissa per tipo di rotta.", tema: "Amazon" },
  { sigla: "Forecast", nome: "Previsione delle rotte", spiega: "Le rotte che Amazon prevede per ogni DS e giorno: servono a stimare il fatturato del mese e i furgoni necessari.", tema: "Amazon" },
  { sigla: "FuelAllowance", nome: "Rimborso carburante", spiega: "La riga di fattura con cui Amazon rimborsa il carburante: si confronta con la spesa Q8 della stessa settimana.", tema: "Amazon" },
  { sigla: "OTR Services", nome: "Rimborso pedaggi", spiega: "Da aprile 2025 la riga dei pedaggi in fattura Amazon si chiama così.", tema: "Amazon" },
  { sigla: "Q8", nome: "Carte carburante", spiega: "Le fuel card Q8 dei furgoni: l'export mensile delle transazioni dà la spesa carburante per station.", tema: "Mezzi e spese" },
  { sigla: "Telepass", nome: "Pedaggi", spiega: "I dispositivi sui furgoni: il file mensile dà i pedaggi per station e settimana.", tema: "Mezzi e spese" },
  { sigla: "RMPP", nome: "Mancato pagamento pedaggio", spiega: "Lettera dell'autostrada per un pedaggio non pagato: non è una multa, si paga e si aggiunge ai pedaggi del mese.", tema: "Mezzi e spese" },
  { sigla: "ZTL", nome: "Zona a traffico limitato", spiega: "Accessi alle ZTL (per esempio Rimini) pagati come pedaggi, aggiunti al Telepass del mese.", tema: "Mezzi e spese" },
  { sigla: "Lista Targhe", nome: "Elenco dei mezzi", spiega: "Il file di riferimento della flotta: foglio Attivi (targa, station, contratto) e Cessati (mezzi riconsegnati).", tema: "Mezzi e spese" },
  { sigla: "Sostitutivo", nome: "Mezzo sostitutivo", spiega: "Il furgone dato dal noleggiatore mentre il nostro è in officina: non si paga.", tema: "Mezzi e spese" },
  { sigla: "Canone", nome: "Costo mensile del noleggio", spiega: "Quanto si paga al mese per un furgone a noleggio; dalla fattura del noleggiatore, altrimenti stimato.", tema: "Mezzi e spese" },
  { sigla: "Audit", nome: "Registro delle modifiche", spiega: "Chi ha fatto cosa e quando sul sito: ogni salvataggio importante lascia una riga.", tema: "Sito" },
  { sigla: "Anteprima", nome: "Prova prima di salvare", spiega: "Il sito mostra cosa cambierebbe: nulla si scrive finché non premi Applica o Salva.", tema: "Sito" },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Sigle riconosciute nei testi (solo quelle in maiuscolo o con il punto: le parole comuni no, per non sottolineare tutto). */
export const SIGLE_TESTO = GLOSSARIO.filter((g) => /^[A-Z][A-Z0-9.]+$/.test(g.sigla) || g.sigla === "fatt_2026" || g.sigla === "FuelAllowance");
export const REGEX_SIGLE = new RegExp(`(?<![\\w.])(${SIGLE_TESTO.map((g) => escape(g.sigla)).sort((a, b) => b.length - a.length).join("|")})(?![\\w])`, "g");
export const voceDi = (sigla: string) => GLOSSARIO.find((g) => g.sigla === sigla) ?? null;

/** Divide un testo in pezzi: stringhe e sigle (ogni sigla spiegata solo alla prima comparsa). */
export function pezziConSigle(testo: string): (string | VoceGlossario)[] {
  const out: (string | VoceGlossario)[] = [];
  const viste = new Set<string>();
  let da = 0;
  for (const m of testo.matchAll(REGEX_SIGLE)) {
    const v = voceDi(m[1]);
    if (!v || viste.has(v.sigla)) continue;
    viste.add(v.sigla);
    if (m.index! > da) out.push(testo.slice(da, m.index));
    out.push(v);
    da = m.index! + m[1].length;
  }
  if (da < testo.length) out.push(testo.slice(da));
  return out;
}
