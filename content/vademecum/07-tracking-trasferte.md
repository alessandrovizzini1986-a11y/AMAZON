---
title: "Controllo tracking e trasferte"
order: 7
category: "Personale"
updated: "2026-10-15"
---

I file di tracking sono la base di tutto il costo del personale: le ore che ci sono lì finiscono in busta paga e nella stima costi. Un errore nel tracking è un errore in busta.

**I file**

| File | Uno per | Chi lo compila | Cosa contiene |
|---|---|---|---|
| `Tracking_Amazon_Driver_26_Sic_Prof_Sol_<STATION>.xlsx` | station | Station (dispatcher) | Ore giornaliere dei driver SIC/CTI: un foglio per mese, un blocco di righe per driver |
| `Tracking_Amazon_Driver_26_std_Adecco_<STATION>.xlsx` | station | Station | Stesso formato per STD e MOG |
| `NEW.Format_controllo_trasferte_<STATION>.xlsx` | station | Stagista | Confronto trasferte dichiarate nel tracking vs rotte reali da Amazon Harmony |

**Struttura del tracking** (foglio del mese, es. `Settembre2026`): per ogni driver un blocco di righe con `Tipo` = Standard, Straordinario, Supplementare, Accordo, Totali, RIPOSO, FERIE, ROL, EXF, e una colonna per giorno. In fondo: `Ore Totali`, `ore del mese` (da contratto), `delta`, `gg delta`. La colonna `Tipo contratto` riporta il contratto e la percentuale part time (es. `MOG 48,37%`, `STD PT`).

| Scheda: controllo settimanale tracking | |
|---|---|
| Trigger | Ogni lunedì per la settimana precedente; chiusura finale entro il 1° del mese successivo (invio presenze a payroll) |
| Input | File tracking SIC e STD della station, Report ore lavorate / Doc. Harmony, Report ferie di Erika |
| Passi | 1. Apri il foglio del mese. 2. Per ogni driver verifica che la riga `Totali` sia coerente con `GIORNI DA CONTRATTO` (es. MART-VEN-SAB: ore solo in quei giorni). 3. Controlla lo split: ore oltre l'orario contrattuale devono stare in Supplementare (part time) o Straordinario (full time), non in Standard. 4. Confronta ferie/ROL/malattie con il Report ferie. 5. Segnala alla station le anomalie con una mail per station, elenco puntato: driver, giorno, cosa non torna. 6. Dopo la correzione, ricontrolla solo le righe segnalate. |
| Output | Tracking corretto; mail anomalie inviata e archiviata |
| Check finale | Per ogni driver `delta` spiegato (ferie, malattia, ingresso/cessazione a metà mese) oppure segnalato; nessuna cella con testo dove servono numeri; nessun giorno con ore su un driver in RIPOSO |

| Scheda: controllo trasferte | |
|---|---|
| Trigger | Settimanale, dopo il controllo tracking |
| Input | Format controllo trasferte della station; export Harmony (rotte e pacchi per driver e giorno); tracking |
| Passi | 1. Nel foglio `AMAZON harmony` incolla l'export della settimana (una colonna per giorno: nome, ID addetto, pacchi consegnati). 2. Nel foglio `TRASFERTE da tracking` inserisci 1/0 per driver e giorno in base alla trasferta dichiarata nel tracking. 3. Il foglio `VERIFICA` confronta: trasferta dichiarata (1) senza rotta Harmony (0 pacchi) = anomalia; rotta fatta senza trasferta = trasferta mancante. 4. Segnala le differenze alla station nella stessa mail delle anomalie tracking. |
| Output | `VERIFICA` senza anomalie aperte |
| Check finale | Numero trasferte da tracking = numero giorni con rotta in Harmony, per ogni driver; le differenze residue hanno una nota con il motivo |

Il foglio `inserire il day by day` (data, driver, targa, rotta, partiti, rientri, km, km Harmony, diff km, fuel card) è il dettaglio giornaliero che alimenta anche i controlli carburante: compilalo prima del controllo trasferte.
