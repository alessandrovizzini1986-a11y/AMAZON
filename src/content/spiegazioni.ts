/**
 * Spiegazioni degli indicatori (i numeri nei riquadri): cosa vuol dire, come si calcola, come leggerlo.
 * Italiano semplice, frasi brevi. Si mostrano con <Spiega k="…" /> accanto al titolo del riquadro.
 */
export type Spiegazione = { cosa: string; come: string; leggi?: string };

export const SPIEGAZIONI: Record<string, Spiegazione> = {
  // Forecast: storico e tendenza
  "forecast.versione": { cosa: "Il forecast più recente caricato, cioè quello che il sito sta usando.", come: "È la settimana in cui Amazon ha emesso il file Next più recente. Sotto vedi i nomi dei file Next (ND) e Same day (SD) in uso.", leggi: "Se la settimana è vecchia, manca il file nuovo: caricalo." },
  "forecast.previsto": { cosa: "Quanto prevede Amazon per la settimana in corso e le due successive.", come: "Somma delle rotte (o degli € che ne derivano) dell'ultima versione del forecast, per la station e la linea scelte.", leggi: "La percentuale sotto dice di quanto è cambiato rispetto alla versione prima: se scende, Amazon sta tagliando rotte." },
  "forecast.errore0": { cosa: "Di quanto sbaglia, in media, il forecast che Amazon manda nella settimana stessa.", come: "Per ogni settimana già fatturata si confrontano gli € previsti da quel forecast con gli € fatturati davvero. Si prende la differenza in percentuale, senza segno, e si fa la media.", leggi: "10 % vuol dire che il fatturato vero si scosta in media del 10 % dal previsto. Più è basso, più ti puoi fidare. Vale sempre sugli € totali, anche se scegli una linea." },
  "forecast.errore2": { cosa: "Di quanto sbaglia, in media, il forecast mandato due settimane prima.", come: "Stesso conto dell'errore della settimana, ma usando il forecast che avevi in mano due settimane prima.", leggi: "Di solito è più alto: più guardi lontano, meno il forecast è preciso. Ti dice quanto margine tenere quando pianifichi furgoni e persone." },
  "forecast.picco": { cosa: "Le rotte del giorno più carico della settimana.", come: "Per ogni giorno si sommano le rotte next e same day delle station scelte; si prende il giorno con il numero più alto.", leggi: "Serve per capire quanti driver e furgoni servono nel giorno peggiore. Passa il mouse su un punto per sapere che giorno è." },
  "forecast.scarto": { cosa: "La percentuale sopra un punto del grafico: quanto abbiamo fatto rispetto al previsto.", come: "Fatturato della settimana diviso l'ultima versione del forecast per quella settimana, meno 1.", leggi: "Verde e positivo = fatto più del previsto. Rosso e negativo = fatto meno. Senza forecast per quella settimana il punto non c'è." },
  // Telefoni e SIM
  "telefoni.simWind": { cosa: "Le SIM che paghiamo a Wind ogni mese.", come: "Sono le righe del file Wind ufficiale. Sotto: quante di queste compaiono anche nei file delle station.", leggi: "È il numero che deve tornare con la fattura Wind." },
  "telefoni.nonCensite": { cosa: "SIM che paghiamo ma che nessuna station ha nel suo file.", come: "SIM del file Wind non trovate in nessun file delle station.", leggi: "Ognuna è un costo senza padrone: va cercata oppure cessata." },
  "telefoni.attivi": { cosa: "I telefoni in uso o pronti all'uso.", come: "Tutti i telefoni tranne quelli segnati come dismessi (rotti, restituiti, smarriti). Se per Wind è attivo, conta come attivo.", leggi: "Sotto vedi quanti sono a noleggio Wind e quanti dismessi." },
  "telefoni.codici": { cosa: "Di quante SIM conosciamo PIN e PUK.", come: "Conta le SIM con il codice salvato. I codici ufficiali arrivano dal file Wind.", leggi: "I codici non si vedono in tabella: si leggono uno alla volta con Mostra." },
  // Carburante Q8
  "q8.tenute": { cosa: "Quanti rifornimenti del file sono nostri (Amazon o GLS).", come: "Righe dell'export Q8 fatte con carte assegnate ad Amazon o GLS, sul totale delle righe del file.", leggi: "Le altre righe sono di altri progetti e restano fuori." },
  "q8.totale": { cosa: "Quanto abbiamo speso di carburante nel mese.", come: "Somma della colonna \"Imp. Scontato no IVA\" dei rifornimenti tenuti.", leggi: "È il costo da confrontare con il carburante che Amazon rimborsa." },
  "q8.nonCensite": { cosa: "Carte usate nel mese che non sono in anagrafica.", come: "Carte che compaiono nel file Q8 ma non nell'elenco delle carte del sito.", leggi: "Se è sopra zero, aggiorna l'anagrafica: quei rifornimenti non hanno una station." },
  "q8.identificativo": { cosa: "Carte riconosciute dalla targa scritta nel file e non dal numero di carta.", come: "Il numero della carta non era in anagrafica, ma l'identificativo (di solito la targa) sì.", leggi: "Funziona, ma conviene sistemare l'anagrafica con il numero giusto." },
  // Telepass
  "telepass.transazioni": { cosa: "Quanti passaggi e addebiti ci sono nel file del mese.", come: "Righe del file Telepass: pedaggi, Area C, parcheggi.", leggi: "Serve a capire se il file è completo rispetto ai mesi scorsi." },
  "telepass.totale": { cosa: "Quanto abbiamo speso con Telepass nel mese.", come: "Somma degli importi del file, IVA esclusa.", leggi: "I pedaggi si confrontano con il rimborso settimanale di Amazon." },
  "telepass.nonMappati": { cosa: "Dispositivi Telepass che non sappiamo a quale station appartengono.", come: "Dispositivi presenti nel file ma non in anagrafica.", leggi: "Se è sopra zero, aggiorna l'anagrafica: quei costi restano senza station." },
  "telepass.ricondotti": { cosa: "Dispositivi senza station spostati su GLS Castel Maggiore.", come: "Dispositivi che l'anagrafica non assegna ad Amazon e che la regola porta su GLS.", leggi: "Controlla che siano davvero di GLS." },
  // Furgoni in arrivo
  "ordini.ordinati": { cosa: "Tutti i furgoni ordinati al noleggiatore.", come: "Numero di righe dell'elenco ordini.", leggi: "È il totale: i tre riquadri a fianco lo dividono per stato." },
  "ordini.daArrivare": { cosa: "Furgoni ordinati che non hanno ancora una data di ritiro.", come: "Ordini senza data di ritiro.", leggi: "Sono quelli da sollecitare al noleggiatore." },
  "ordini.conData": { cosa: "Furgoni con il ritiro già fissato.", come: "Ordini con una data di ritiro da oggi in poi.", leggi: "Servono per organizzare chi va a ritirarli." },
  "ordini.ritirati": { cosa: "Furgoni già ritirati.", come: "Ordini con la data di ritiro passata.", leggi: "Devono comparire anche tra i mezzi della flotta." },
  // Conto economico
  "conto.margine": { cosa: "Quanto resta nel mese dopo aver pagato i costi.", come: "Ricavi meno costi (personale, mezzi, carburante, pedaggi, parcheggi, altri). La percentuale è il margine diviso i ricavi.", leggi: "Se manca il costo del personale il numero è troppo alto: c'è l'avviso sotto." },
  // Situazione per stazione
  "flotta.veicoli": { cosa: "Quanti furgoni abbiamo in flotta.", come: "Mezzi attivi, in officina e a uso ufficio. Non conta i sostitutivi e i dismessi.", leggi: "I sostitutivi non si contano perché prendono il posto di un mezzo fermo." },
  "flotta.canoneMedio": { cosa: "Quanto costa in media un furgone di questa stazione ogni mese.", come: "Canone mensile totale diviso il numero di furgoni in flotta.", leggi: "Se è molto più alto delle altre stazioni, ci sono troppi noleggi a breve termine, che costano di più." },
  "flotta.appalto": { cosa: "I furgoni che lavorano per questo cliente.", come: "Furgoni in flotta delle stazioni di quell'appalto; sotto il numero di stazioni e il canone al mese.", leggi: "Amazon e GLS sono contati a parte perché hanno contratti e costi diversi." },
  "flotta.canone": { cosa: "Quanto paghiamo di noleggio ogni mese.", come: "Somma dei canoni mensili dei furgoni in flotta.", leggi: "È una spesa fissa: c'è anche se il furgone resta fermo." },
};
