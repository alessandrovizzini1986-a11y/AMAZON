/**
 * Testi di aiuto dei pulsanti e delle zone di caricamento (italiano semplice, "tu").
 * Per ogni azione: cosa fa, cosa fare prima, dove finisce il dato.
 * Le chiavi si usano con <Aiuto k="…" /> e <Dropzone aiuto="…" />; un test controlla
 * che ogni chiave usata esista qui e che ogni voce sia completa.
 */
export type Dove = "SITO" | "PC" | "TEMP" | "FILE";

export const DOVE: Record<Dove, { etichetta: string; spiega: string; tono: "ok" | "info" | "warn" | "neutral" }> = {
  SITO: { etichetta: "Salvato sul sito", spiega: "Resta sul sito: lo ritrovi la volta dopo, anche da un altro PC, e lo vede chi ha il permesso.", tono: "ok" },
  PC: { etichetta: "Solo su questo PC", spiega: "Resta nell'archivio di questo browser, su questo PC: lo ritrovi la volta dopo qui, ma non da un altro PC o da un altro browser. Sparisce se cancelli i dati del browser.", tono: "info" },
  TEMP: { etichetta: "Temporaneo: salva o scarica", spiega: "Resta solo finché tieni aperta la pagina. Se esci senza salvare o scaricare, la volta dopo non c'è più.", tono: "warn" },
  FILE: { etichetta: "Scarichi un file", spiega: "Il file va nella cartella Download di questo PC. Il sito non ne tiene una copia: per riaverlo, rifai il passo.", tono: "neutral" },
};

export type VoceAiuto = { fa: string; prima: string; dove: Dove; nota?: string };

export const AIUTO: Record<string, VoceAiuto> = {
  // ── Presenze
  "presenze.archivio": { fa: "Legge i file che trascini (CSV Amazon, tracking SIC e STD, export Zucchetti) e li riconosce dal contenuto: tipo, station e mese.", prima: "Scarica i file della settimana o del mese da Amazon, SharePoint e Zucchetti.", dove: "PC", nota: "Al sito non arriva nessun file: i controlli li leggono da qui." },
  "presenze.settimanale.esegui": { fa: "Confronta i tracking con quello che vede Amazon, giorno per giorno, e trova trasferte e giornate da controllare.", prima: "Carica nell'archivio i CSV Amazon della settimana e i tracking SIC e STD.", dove: "TEMP", nota: "Il risultato resta finché non premi Salva esecuzione." },
  "presenze.settimanale.excel": { fa: "Scarica l'Excel con le anomalie per station, da mandare agli Ops.", prima: "Esegui prima il controllo.", dove: "FILE" },
  "presenze.salva": { fa: "Salva il controllo: le anomalie restano e potrai segnare gli esiti quando gli Ops rispondono.", prima: "Esegui il controllo e leggi le anomalie.", dove: "SITO" },
  "presenze.finemese.esegui": { fa: "Confronta le ore dei tracking con Zucchetti per ogni lavoratore e giorno del mese.", prima: "Carica nell'archivio i tracking del mese e gli export Zucchetti delle 7 station.", dove: "TEMP", nota: "Il risultato resta finché non premi Salva esecuzione." },
  "presenze.finemese.excel": { fa: "Scarica l'Excel del controllo di fine mese.", prima: "Esegui prima il controllo.", dove: "FILE" },
  "presenze.mog.salva": { fa: "Salva gli esiti MOG del mese per lavoratore: la riga Integrazione MOG della stima STD prende da qui il costo.", prima: "Controlla i SOTTO MOG e i NON IN FILE (MOG da chiedere a Erika).", dove: "SITO" },
  "presenze.config.referenti": { fa: "Salva il nome del referente Ops di ogni station, usato nei messaggi (\"Ciao …\").", prima: "Scrivi un nome per station.", dove: "SITO" },
  "presenze.config.lista": { fa: "Aggiunge o toglie una voce dall'elenco (dispatcher esclusi dagli alert, codici che giustificano il giorno).", prima: "Controlla nome e station.", dove: "SITO" },

  // ── Telepass e carburante
  "telepass.anagrafiche": { fa: "Legge la mappa Telepass (TBusiness_carica_veicoli.xlsx) o il censimento fuel card e mostra cosa cambia: nuovi, aggiornati, spariti.", prima: "Prendi l'ultima versione del file dalla mail o da SharePoint.", dove: "TEMP", nota: "Finché non premi Conferma import non cambia niente." },
  "telepass.anagrafiche.conferma": { fa: "Salva l'anagrafica: da qui dipende la station di ogni transazione.", prima: "Leggi il riepilogo dei cambi.", dove: "SITO" },
  "telepass.elabora": { fa: "Legge il CSV Telepass del mese, assegna ogni transazione a una station e prepara l'Excel.", prima: "Aggiorna le anagrafiche se è arrivato un dispositivo nuovo o un cambio station.", dove: "TEMP", nota: "Il file non va al sito: restano solo i totali per station." },
  "q8.elabora": { fa: "Legge l'export Q8 del mese, assegna ogni rifornimento alla station della carta e prepara l'Excel.", prima: "Aggiorna il censimento fuel card se è arrivata una carta nuova.", dove: "TEMP", nota: "Il file non va al sito: restano solo i totali per station." },
  "telepass.excel": { fa: "Scarica l'Excel del mese nel formato di Alessandro e salva i totali per station.", prima: "Controlla l'anteprima, soprattutto le righe senza station.", dove: "FILE", nota: "I totali per station restano sul sito, l'Excel no." },

  // ── Fatture Amazon
  "fatture.importa": { fa: "Legge i PDF delle fatture Amazon, controlla i numeri e le somme, e segna nel registro quelle nuove.", prima: "Scarica da Amazon i PDF dal prossimo numero indicato nella pagina Stato.", dove: "SITO", nota: "I PDF non si salvano: restano numero, importi e righe." },
  "fatture.excel": { fa: "Scarica le righe delle fatture importate, nel formato delle colonne di fatt_2026.", prima: "Importa prima i PDF.", dove: "FILE" },
  "fatture.copia": { fa: "Copia le righe negli appunti, pronte da incollare in fondo a fatt_2026.", prima: "Apri fatt_2026 e posizionati sulla prima riga vuota.", dove: "FILE", nota: "Dopo l'incolla fai Allinea, così il registro sa che sono in fatt_2026." },
  "fatture.annulla": { fa: "Toglie il segno \"esportata\" dalle fatture selezionate, per rifare l'Excel.", prima: "Usalo solo se l'Excel non è stato incollato in fatt_2026.", dove: "SITO" },
  "fatture.allinea": { fa: "Legge solo la colonna Numero di fatt_2026 e segna nel registro le fatture già incollate.", prima: "Incolla le righe nuove in fatt_2026 e salva il file AGGREGATO.", dove: "SITO", nota: "Il file AGGREGATO si legge qui nel browser e non va al sito." },
  "fatture.storico": { fa: "Importa tutte le righe di fatt_2026 (e, se vuoi, fatt_2025): servono al Fatturato e alle tariffe del Forecast.", prima: "Usa il file AGGREGATO più recente. Ricaricarlo non crea doppioni.", dove: "SITO" },
  "fatture.allinea.incolla": { fa: "Allinea i numeri incollati a mano, se il file è troppo pesante per questo PC.", prima: "In Excel copia la colonna Numero di fatt_2026 e incollala qui.", dove: "SITO" },
  "forecast.carica": { fa: "Legge i forecast Amazon (PROF_<settimana>_next e _same) e calcola il ricavo previsto.", prima: "Scarica i forecast della settimana. Ogni file resta come versione: vale quella più recente.", dove: "SITO" },
  "forecast.excel": { fa: "Scarica previsione, tariffe e backtest del forecast.", prima: "Carica almeno un forecast.", dove: "FILE" },
  "forecast.mappa": { fa: "Dice a quale classe appartiene un servizio del forecast (es. Standard Parcel → ND_STANDARD).", prima: "Aggiungila quando la pagina segnala righe NON_MAPPATO.", dove: "SITO" },
  "forecast.storico.excel": { fa: "Scarica tutte le versioni del forecast, la precisione per anticipo e i furgoni necessari per station.", prima: "Scegli i filtri: l'Excel contiene comunque tutto.", dove: "FILE" },
  "fatturato.excel": { fa: "Scarica il fatturato nella vista e con i filtri che vedi.", prima: "Scegli anno e vista.", dove: "FILE" },

  // ── Costi del personale
  "costi.anagrafica": { fa: "Legge l'anagrafica CDL di HR (foglio SIC Amazon TR) e mostra teste e CDL per station e le differenze con la versione prima.", prima: "Prendi l'ultimo DB_CDL_base_MMAA_AmazonGLS_BO.xlsx da HR.", dove: "TEMP", nota: "Finché non premi Conferma non cambia niente." },
  "costi.anagrafica.conferma": { fa: "Salva la versione dell'anagrafica: le stime useranno questa.", prima: "Controlla CDL totale e differenze. Lo stesso mese viene sostituito.", dove: "SITO" },
  "costi.tariffa": { fa: "Aggiunge una tariffa trasferta con la sua data di inizio.", prima: "Controlla il valore sull'accordo o sulla circolare.", dove: "SITO", nota: "Il calcolo usa da solo la tariffa valida in ogni giorno." },
  "costi.parametro": { fa: "Aggiunge un nuovo valore di un coefficiente, valido dalla data che scegli.", prima: "Le percentuali si scrivono in decimali (2,5 % = 0,025).", dove: "SITO" },
  "costi.festivo": { fa: "Aggiunge un festivo nazionale (station TUTTE) o un patrono.", prima: "Controlla che non ci sia già nell'elenco.", dove: "SITO" },
  "costi.tracking": { fa: "Aggiunge i tracking del mese all'archivio di questo PC, lo stesso del modulo Presenze.", prima: "Se li hai già caricati in Presenze non serve.", dove: "PC" },
  "costi.calcola": { fa: "Calcola la stima STD (competenza del mese) e SIC (busta del 27 del mese dopo) e i controlli, leggendo i tracking da questo PC.", prima: "Guarda il semaforo: servono i 14 tracking, l'ADIT del mese prima e l'anagrafica CDL.", dove: "TEMP", nota: "Il risultato resta finché non premi Salva stima." },
  "costi.salva.std": { fa: "Salva la stima STD del mese: entra nell'indice e servirà alla riconciliazione con l'ADIT.", prima: "Leggi i controlli rossi.", dove: "SITO" },
  "costi.salva.sic": { fa: "Salva la stima SIC del mese (busta del 27 del mese dopo) e le ore per il ricalcolo dei coefficienti.", prima: "Controlla i lavoratori con CDL stimato.", dove: "SITO" },
  "costi.excel": { fa: "Scarica l'Excel della stima: pagina a formule, Rettifiche, Parametri e i fogli DWH.", prima: "Calcola prima i costi.", dove: "FILE" },
  "costi.excel.fo": { fa: "Scarica il foglio AMZ <Mmm> <AAAA> del file Costi F.O.: carburante, noleggi, Telepass, ZTL, accantonamenti SIC a costo SIC, busta SIC pagata nel mese, STD e fatturato. Costo SIC = busta − accantonamenti del mese prima + quelli del mese.", prima: "Calcola i costi; elabora Q8 e Telepass; salva la stima SIC del mese prima (o carica il payroll del mese).", dove: "FILE" },
  "costi.ztl": { fa: "Legge il file TARGHE_ZTL (Rimini/Cesena): conta i permessi con data di richiesta nel mese e li somma su DER2.", prima: "Usa il file aggiornato con le richieste del mese.", dove: "TEMP" },
  "costi.excel.personale": { fa: "Scarica il foglio AMZ_<mese>_<anno> con la stessa struttura del tuo Stima_Costo_personale.xlsx, già compilato per station: teste e costo SIC per contratto, ore, trasferte, teste STD. Lo sposti nel tuo file con \"Sposta o copia\".", prima: "Calcola prima i costi con tutti i tracking SIC e STD del mese.", dove: "FILE" },
  "costi.teams": { fa: "Prepara la tabella per station con i totali e i 3 avvisi principali e la copia negli appunti.", prima: "Calcola prima i costi.", dove: "FILE", nota: "Incollala nella chat Teams." },
  "costi.consuntivo": { fa: "Legge la fattura ADIT o i Costi del personale PS, li riconosce dal contenuto e tiene solo il CDC 5569.", prima: "ADIT: arriva circa 5 settimane dopo il mese. Costi del personale: dopo il 27.", dove: "TEMP", nota: "Finché non premi Salva non cambia niente." },
  "costi.consuntivo.salva": { fa: "Salva le righe del consuntivo: da qui partono riconciliazione e tariffe.", prima: "Per il payroll controlla il mese di paga. Lo stesso mese viene sostituito.", dove: "SITO" },
  "costi.mog": { fa: "Legge il file MOG di Adecco (ADECCO_PS, foglio PS): per ogni somministrato la % e le ore MOG del mese, il contratto e il rischio consolidamento.", prima: "Chiedi a Erika il file del mese: serve aggiornato (al massimo 40 giorni).", dove: "TEMP", nota: "Finché non premi Salva il file MOG non cambia niente." },
  "costi.mog.salva": { fa: "Salva la versione del file MOG: i controlli MOG di Presenze e la riga Integrazione MOG dei costi useranno questa.", prima: "Controlla teste per station e % cambiate.", dove: "SITO" },
  "costi.mog.variazione": { fa: "Registra un aumento MOG comunicato da Adecco: dalla data indicata il MOG del mese si ricalcola con la nuova % (× 169 h).", prima: "Prendi nome, nuova % e data dal PDF \"Mog_Cambio…\" o dall'Excel \"Aumenti MOG PS\".", dove: "SITO" },
  "costi.mog.aumenti": { fa: "Legge gli aumenti MOG dal PDF \"Mog_Cambio_Lavoratore…\" (data e % prima/dopo) e dall'Excel \"Aumenti MOG PS\" (codice fiscale): trascinali insieme, li unisce per numero di contratto.", prima: "Carica prima il file MOG del mese: serve a riconoscere i lavoratori e controllare la % \"prima\".", dove: "TEMP" },
  "costi.mog.aumenti.salva": { fa: "Salva gli aumenti letti: dalla data di ognuno il controllo MOG usa la nuova % × 169 h.", prima: "Guarda la colonna Avvisi: se c'è qualcosa in giallo controllalo sul PDF.", dove: "SITO" },
  "portali.importa": { fa: "Legge il foglio Portali (Portale, URL, Username, Password, Note) e salva gli accessi: le password vengono cifrate.", prima: "Usa il file del passaggio di consegne o un Excel con quelle colonne.", dove: "SITO" },
  "portali.salva": { fa: "Salva un portale; se il nome esiste già lo aggiorna. La password viene cifrata.", prima: "Lascia la password vuota se non cambia.", dove: "SITO" },
  "costi.riconciliazione": { fa: "Salva il confronto stima/consuntivo del mese.", prima: "Leggi i delta rossi e annota il motivo.", dove: "SITO" },
  "costi.aggiorna": { fa: "Salva i coefficienti SIC ricalcolati dalla paga, validi dal mese successivo.", prima: "Premilo solo se Alessandro ha confermato i valori \"dopo\".", dove: "SITO" },

  // ── Flotta e gestione
  "flotta.nuovo": { fa: "Apre la scheda per inserire un veicolo nuovo.", prima: "Tieni a portata targa, modello, station e contratto.", dove: "SITO" },
  "flotta.filtri": { fa: "Applica i filtri all'elenco.", prima: "Scegli modello, noleggio, station e stato.", dove: "TEMP", nota: "I filtri restano nell'indirizzo della pagina." },
  "import.analizza": { fa: "Legge il file e mostra cosa verrebbe creato o aggiornato, senza salvare.", prima: "Usa il modello (template) della pagina.", dove: "TEMP" },
  "import.conferma": { fa: "Salva i dati del file.", prima: "Controlla l'anteprima e gli errori di riga.", dove: "SITO" },
  "ordini.carica": { fa: "Carica il file degli ordini.", prima: "Usa l'export indicato nella pagina.", dove: "SITO" },
  "utenti.crea": { fa: "Crea un utente con il ruolo scelto e una password temporanea da comunicargli.", prima: "Scegli il ruolo giusto: decide cosa vede.", dove: "SITO" },
  "officine.excel": { fa: "Scarica l'elenco officine con i filtri che vedi.", prima: "Scegli i filtri.", dove: "FILE" },
};
