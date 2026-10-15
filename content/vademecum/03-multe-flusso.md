---
title: "Multe: il flusso"
order: 3
category: "Multe"
updated: "2026-10-15"
---

Ogni verbale arriva da ADE IT SANZIONI CDS DL alla casella operationsamazonPS con oggetto `(N. progressivo) TARGA XXXXXX - VERBALE N. YYYY - AMAZON`. Il numero progressivo tra parentesi è la chiave della pratica: lo usi nel foglio e in ogni mail.

| Scheda | |
|---|---|
| Trigger | Mail da Sanzioni CDS con verbale allegato (PDF VBPEC + REPEC, oppure VERB + RELATA) |
| Input | Lista Targhe (targa → station), foglio `2026` di Multe.xlsx, foglio `MACROAREE_VERBALI` |
| Passi | 1. Apri il PDF del verbale: leggi targa, data e ora infrazione, data notifica, importo, motivo, città, via, punti. 2. Cerca la targa in Lista Targhe → station. Se la targa non c'è: rispondi a Sanzioni "il veicolo non è nostro" (caso 40683) e chiudi. 3. Inoltra la mail ai capi della station chiedendo nominativo e contratto del driver (caso 40689), cc Thomas + Valerio + responsabile station. 4. Inserisci subito la riga nel foglio `2026` con quello che sai; Driver e Tipo Contratto restano vuoti finché la station non risponde. 5. Alla risposta: completa Driver, Tipo Contratto, Metodo di pagamento. 6. In base al contratto invia la richiesta di addebito (sezione 4). 7. Se il verbale prevede decurtazione punti: chiedi al driver il modulo dichiarazione conducente, invia la richiesta PEC a Servizi Generali (Template G, sezione 4b) e segna `PEC PUNTI = SI`. 8. Fine mese: aggiorna le pivot e la `TABELLA_ADDEBITI_SIC` per Annalisa. |
| Output | Riga completa nel foglio `2026`; mail di addebito inviata; pratica chiusa |
| Check finale | Nessuna riga del mese con Driver o Tipo Contratto vuoti; ogni riga con Metodo "SI - TRATTENUTA" ha una mail di addebito inviata; totale importi del mese = pivot |

**Regola di pagamento e addebito.** Tutti i verbali intestati all'azienda vengono pagati dall'Ufficio Tesoreria entro 5 giorni dalla notifica, di default. Per questo al driver si addebita sempre **l'importo scontato** (quello "entro 5 giorni" del verbale), mai l'importo pieno. Eccezione GLS: per i driver GLS vale il verbale di accordo sindacale "Franchigie" del 02/10/2024 (punto 5): **non si addebitano** le sanzioni per doppia fila e intersezione, e per divieto di sosta e fermata (restano addebitabili sosta su posti disabili, fermata autobus e strisce pedonali, e tutte le infrazioni imputabili a negligenza: velocità, ZTL, semaforo, cellulare). In dubbio, chiedi ad Alessandro prima di addebitare.

Se un driver chiede di fare ricorso, non decidere tu: inoltra subito ad Alessandro il giorno stesso.
