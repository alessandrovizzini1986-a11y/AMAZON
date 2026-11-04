---
title: "Gestione mezzi e noleggiatori"
order: 17
category: "Base"
updated: "2026-11-04"
---

Questa pagina riassume il passaggio di consegne sulla gestione dei mezzi (15/05/2026): cosa si fa e quando, con chi si parla, dove si trovano tariffe e portali. Le **password non sono qui**: i portali hanno account personali da chiedere (vedi *Portali*). Le multe hanno le loro pagine: [flusso](/vademecum/03-multe-flusso), [albero e template](/vademecum/04-multe-albero-template), [foglio 2026](/vademecum/05-multe-foglio-2026).

**Perimetro**

| Sede | Cliente | Località | Codice progetto | CDC |
|---|---|---|---|---|
| DER1 | Amazon DSP | Valsamoggia (BO) | PS00009460 | 5569 |
| DER2 | Amazon DSP | Rimini | PS00009460 | 5569 |
| DLO2 | Amazon DSP | Origgio (VA) | PS00009460 | 5569 |
| DLO4 | Amazon DSP | Buccinasco (MI) | PS00009460 | 5569 |
| DLO5 | Amazon DSP | Castegnato (BS) | PS00009460 | 5569 |
| DLZ2 | Amazon DSP | Pomezia (RM) | PS00009460 | 5569 |
| DVN1 | Amazon DSP | Vigonza (PD) | PS00009460 | 5569 |
| GLS | GLS Castel Maggiore | Castel Maggiore (BO) | PS00022667 | 5565 |

I codici progetto e i CDC servono ogni volta che imputi un costo: nelle fatture dei noleggiatori sono la colonna CDC (5569 Amazon, 5565 GLS; gli altri CDC sono di altri progetti Adecco).

### La Lista Targhe è il riferimento

Il file `Lista_Targhe` (cartella Teste+mezzi) dice **quali targhe sono attive, in quale station e con quale contratto**. Ci si risale anche per le multe e i pedaggi (a quale station appartiene una targa).

1. **Attivi**: una riga per targa in flotta. Distingui sempre **attivo** e **sostitutivo**: cambia il costo. Nelle note scrivi quale targa sostituisce ("sostituisce GD…") o il passaggio tra station ("passata da DLO5 a GLS", "in GLS fino al 25/9").
2. **Cessati**: quando una targa viene riconsegnata o il contratto si chiude, **sposti la riga** in Cessati con la data di fine. Non cancellarla: è lo storico che conferma le uscite.
3. **Sul sito**: la riconciliazione flotta legge Attivi e Cessati più le fatture dei noleggiatori. Crea le targhe nuove, dismette quelle uscite (solo se sono in Cessati), aggiorna stato, contratto e canone. Le regole sono in `docs/flotta-kit/PROMPT_aggiorna_targhe_tariffe.md`.

### Attività e periodicità

| Quando | Attività | Strumento | Note |
|---|---|---|---|
| Ogni giorno | Mail dei noleggiatori → aggiorni la Lista Targhe di ogni station (AMZ e GLS) | Lista Targhe | Attivo / sostitutivo; riconsegne in Cessati |
| Ogni giorno | Analisi Flotta: lavorazioni e danni dei mezzi | Analisi Flotta | Stato mezzi e danni segnalati |
| Quando arrivano | Mail di consegna nuove targhe → tabella consegne programmate | Tabella consegne | Targa, VIN, n° ordine, data consegna |
| Ogni giorno | Mail di cessazione o passaggio tra station → note della Lista Targhe | Lista Targhe | "sostituisce …", "passata da … a …" |
| Ogni giorno | Mail sanzioni e avvisi pedaggio → risali alla station | Lista Targhe | Vedi pagine Multe |
| Ogni giorno | Furgoni sempre operativi, ognuno col suo sostitutivo | — | Se manca il sostitutivo: subito il Forms Ayvens e una mail al referente Ayvens |
| Mercoledì e giovedì | Call con i responsabili mezzi: ti mandano la loro lista, la allinei (formattazione condizionale) e verifichi con il pivot | Lista Targhe + pivot | DER1 e GLS non mandano form né mail: solo telefono |
| Due volte a settimana | Mezzi in manutenzione: problemi aperti, solleciti ad Arval e ALD, reclami sul portale Arval | Analisi Flotta, portale Arval | servizio.clienti@aldautomotive.com |
| Ogni settimana | Rotte massime del forecast contro furgoni disponibili; pianificazione van nei picchi | Prof_Rampa_Peak, [/fatture-amazon/forecast](/fatture-amazon/forecast) | Per settimana, DS e società di noleggio |
| Ogni settimana | Check list del controllo olio | — | — |
| Ogni settimana | Addebiti multe ai driver SIC: righe con metodo pagamento diverso da "no costo aziendale" | File Multe + file addebiti | Controlla che il recupero sia arrivato in busta |
| Ogni settimana | Mezzi in trasferta verso GLS (DLO2 → GLS, DLO5 → GLS) | Tracciamento Master GLS | Driver, RA, date, tariffa |
| Ogni mese | File flotte a Giuseppe Ciuffreda: Lista Targhe, tessere Q8, Telepass (stato attuale e precedente) | FLOTTA_AMAZON-GLS-FUEL_Q8-TELEPASS | Dati vecchi in "before", aggiornati in "actual"; **niente formattazione condizionale** (darebbe falsi positivi sullo storico) |
| Ogni mese | Chiusura del file Multe e pivot dei costi a carico del progetto | File Multe + pivot | Ad Annalisa Pinazzi |
| Ogni mese | **Fatture noleggiatori**: canone atteso contro fatturato, giorni lavorati, voci "spese gestione multe" (10 € a riga) | Fatture Arval, Europcar, Ayvens, Avis | Le manda Annalisa Pinazzi: se non arrivano, sollecita la prima settimana del mese |
| Ogni mese | Associazioni targhe Telepass: le targhe attive devono essere associate, quelle cessate dissociate | Portale Telepass | Evita di pagare dispositivi su targhe uscite |
| Ogni mese | Lista attiva contro FLOTTA AMAZON actual: targhe da aggiungere, da spostare in before, passaggi GLS ↔ Amazon | FLOTTA_AMAZON | — |
| Ogni 3 mesi | Chilometri dei van | Analisi Flotta, foglio Tagliandi | — |
| Un anno prima della scadenza | Proroghe dei contratti lungo termine | Portali Arval e Ayvens | Con Valerio Solito e Simona Negri |
| Ogni anno | Tagliandi assicurativi dei lungo termine | Intranet Adecco | Riferimento Simona Negri |
| Quando serve | Noleggi breve termine (BT) | Forms Ayvens, mail ai noleggiatori | Con l'account Ayvens personale ricevi le conferme |
| Quando serve | Attivazione Area C (richieste da DLO4) | Portale Telepass | Le richieste arrivano da Giovanni Di Carlo |

### Noleggiatori

| Fornitore | Uso | Referente | Contatti | Note |
|---|---|---|---|---|
| Ayvens (ALD) | ★ 1ª scelta per tutti i noleggi | Graziano Sarcone | graziano.sarcone@ayvens.com · 347 5463917 | Niente WhatsApp, solo chiamata o mail. Chiedigli l'account My Ayvens personale |
| Europcar | Standard | Gianluca Burani | gianluca.burani@europcar.com · 335 7198505 | In ferie: Barbara Pedrali, barbara.pedrali@europcar.com · 338 7294398 |
| Avis (Amicoblu) | Flessibile in rampa peak | Mohamed El Seroy | mohamed.seroy@abg.com · 345 6118565 | Permette il **no-show**: utile quando le previsioni cambiano |
| Hertz | Standard | Lorenzo Ranzani | lorenzo.ranzani@hertz.com · 345 0831070 | — |
| Noleggiare | Standard | Dario Catenazzi, Luca Beghin | dario.catenazzi@noleggiare.it · 340 4857712; luca.beghin@noleggiare.it · 345 7458235 | Due referenti |
| Locauto | Standard | Massimiliano Corradini | massimiliano.corradini@locautorent.it · 331 6333000 | Tariffe VAN200: massimo 200 km al giorno, attenzione alle tratte lunghe (es. Origgio → Bologna) |
| Autovia | Standard | Massimo Pietragalla | massimo.pietragalla@autovia.it · 344 1567438 | — |
| Nolo Experience (NoloWay) | ⚠ Solo rampa natale | Marco Esposito | bergamo@noloway.it · 333 6439631 | Tariffe più alte: mai per l'uso normale |
| Torental | Solo motrici GLS | — | — | In uso solo per le motrici di Castel Maggiore |

**Tariffe**: i listini (Ayvens, Europcar, Avis/Amicoblu con il rinnovo 2026 e l'offerta elettrici, Hertz, Noleggiare, Locauto, Autovia, Nolo Experience, Torental) sono sul sito in [/vehicles/listini](/vehicles/listini), con il miglior prezzo per classe e la data di validità. Il confronto si fa sulla classe **LARGE** (Ducato / Movano): Ayvens a 900 €/mese è il più conveniente, da 40 a 180 € al mese in meno a mezzo rispetto agli altri.

### Officine, lavaggi, AdBlue e metano

Alcuni fornitori mandano un riepilogo mensile o bimensile, altri lavorano a ordine. Non tutti quelli in elenco sono ancora attivi: chiedi alla station prima di ordinare.

| Station | Servizio | Fornitore | Mail |
|---|---|---|---|
| DER1 | Lavaggio | Topwash | topwashsnc@gmail.com |
| DER1 | Lavaggio | Totaljob | amministrazione@totaljob.it |
| DER1 | AdBlue | Cacciari | amministrativo.t.sport@gmail.com |
| DER1, DLO2, DLO4 | AdBlue | Bottari | giovanna.vicini@bottari.it, spedizioni@bottari.it |
| DLO2 | Lavaggio | Francesco Colonna | francescocolonnafc@gmail.com |
| DLO4 | Lavaggio | Autolavaggio Pinguino (Nati Srl) | nati@lagrasrl.com |
| DLO5 | Lavaggio | Rokowash | rossana@studiochiaraschi.it |
| DLO5 | AdBlue | Pieffe Filtri e Batterie | plattofabio@gmail.com |
| DLZ2 | Lavaggio | Akram | aliroma786@yahoo.com |
| DLZ2 | AdBlue | Autofficina Pontina | segreteria@autofficinapontina.it |
| DVN1 | Lavaggio | Tecnowash | paolopoletti03@libero.it, tecnowasnsnc@pec.it |
| DVN1 | AdBlue | Zampieron Tiziano | t.zampi@alice.it |
| DVN1 | Metano | Gabogas (unica station a metano) | distributore.vigonza@gabogas2.it, sara@gabogas2.it |

### Portali

Ogni portale ha il suo account: **chiedi il tuo** appena puoi. Gli accessi condivisi (utente e password) sono sul sito in [Portali e credenziali](/portali): le password sono cifrate e le vede solo un ADMIN, dopo aver riscritto la propria password. Ogni visualizzazione resta nel log. Le password condivise durante il passaggio di consegne vanno cambiate e poi aggiornate lì.

| Portale | A cosa serve | Come avere l'accesso |
|---|---|---|
| My Ayvens (passport.aldautomotive.it) | ★ Contratti attivi, libretti e assicurazioni, ordini in arrivo, lungo termine. Per i BT si apre il Forms | Account personale da chiedere a Graziano Sarcone |
| My Arval (my.arval.com) | Contratti Arval, reclami sui mezzi in manutenzione | Oggi è intestato a Valerio Solito: chiedi a lui |
| Telepass Business | Associazione e dissociazione targhe, Area C | Oggi è intestato a Valerio Solito: chiedi a lui |
| Europcar Business (europcar.biz) | Prenotazioni e contratti Europcar | Chiedi ad Alessandro |
| Hertz (programma aziende) | Prenotazioni Hertz | Chiedi ad Alessandro |
| Intranet Adecco | Tagliandi assicurativi dei lungo termine | Simona Negri |

### Note chiave

- DER1 e GLS **non compilano** form né mail: l'allineamento delle targhe è solo telefonico. Non aspettare informazioni scritte che non arriveranno.
- Ayvens è la prima scelta, Avis serve per il no-show nei picchi, Nolo Experience solo a Natale, Locauto ha il limite dei 200 km al giorno.
- Senza un account My Ayvens personale le conferme dei Forms BT non arrivano a te.
- Il file FLOTTA_AMAZON-GLS-FUEL_Q8-TELEPASS è enorme (circa 16.000 colonne nel foglio Q8): aprilo solo da PC.
- Le proroghe dei lungo termine si preparano **un anno prima** della scadenza.
- I verbali arrivati a casa del lavoratore si pagano tramite Tesoreria (Nicola Bellopede) e **poi** si addebitano al driver: è una procedura diversa dalle multe normali (vedi [flusso multe](/vademecum/03-multe-flusso)).
- Controllo fatture: una targa riconsegnata non deve più comparire a canone il mese dopo. La riconciliazione del sito elenca le targhe **fatturate dopo la cessazione**, da contestare al noleggiatore.
