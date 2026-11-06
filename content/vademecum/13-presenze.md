---
title: "Controlli presenze Amazon"
order: 13
category: "Personale"
updated: "2026-11-03"
---

Il **controllo presenze** confronta i tracking delle station con quello che vede Amazon (e, a fine mese, con Zucchetti). Serve a intercettare **prima della chiusura payroll** trasferte pagate non dovute, giornate lavorate non registrate nel tracking e driver nel tracking che Amazon non ha visto lavorare. Si fa tutto dal sito, nella sezione **Presenze**: trascini i file, il sito fa i conti e prepara i messaggi per gli Ops.

I file restano **sul tuo PC**: il sito li legge nel browser e li tiene in un archivio locale; sul server vanno solo i nomi dei file e i risultati dei controlli. Usa quindi sempre lo stesso PC e lo stesso browser.

**Frequenza**: ogni lunedì sui giorni fino alla domenica precedente; entro il 25 del mese sul periodo 1–25 per i parziali; a inizio mese il controllo di fine mese sul mese chiuso.

### Passo 1 — Archivio file ([/presenze/archivio](/presenze/archivio))

1. Scarica i CSV Amazon: portale logistics.amazon.it → Performance → Addetti alla consegna → station e giorno (o intervallo di date) → Download. Il nome va bene così com'è (es. `DER2_5.csv`); va bene anche un CSV unico con la colonna Station.
2. Prendi i tracking del mese: uno **SIC** e uno **STD** per station. Non serve aprirli né copiarli.
3. A fine mese prendi anche i 7 export **Zucchetti** (`Amazon_<AAAA>_<MM>_<Città>_….xlsm`).
4. Trascina tutto insieme nella zona grigia. Il sito riconosce da solo tipo, station e mese di ogni file; se un file non va, lo dice subito con il motivo (foglio del mese non trovato, riga "Tipo" assente, station non nel nome) e carica gli altri. Guarda la griglia del mese: **verde** = c'è il CSV di quel giorno, **rosso** = giorno passato senza CSV; a lato i badge Tracking SIC, Tracking STD e Zucchetti dicono cosa manca.

### Passo 2 — Controllo settimanale ([/presenze/settimanale](/presenze/settimanale))

1. Scegli **Dal** e **Al** (stesso mese) e la station, oppure "Tutte".
2. Premi **Esegui controllo**. In alto quattro riquadri sempre visibili: driver con più di 6 giorni consecutivi nel mese (rosso se ce ne sono), casi 6 giorni + domenica nel periodo, **ORE** (giornate oltre 10 h o valori anomali) e **ACC** (Accordo di domenica dei somministrati). Cliccando ORE o ACC la tabella mostra solo quei driver.
3. Leggi il riepilogo per station e la tabella driver (di base mostra solo quelli da verificare). La colonna **Giorni da verificare** è già pronta, es. `5(-1), 6(H)`.
4. Copia il **messaggio Teams** di ogni station (bottone "Copia" per il testo, "Copia tabella" per incollarlo come tabella) e mandalo al referente Ops. Scarica l'**Excel per le Ops** se serve allegarlo. Poi **Salva esecuzione**: da "Apri per segnare gli esiti" segni per ogni riga *chiuso* o *giustificato* quando gli Ops rispondono.

### Passo 3 — Controllo di fine mese ([/presenze/fine-mese](/presenze/fine-mese))

1. Scegli il **mese** (di base quello appena chiuso).
2. Premi **Esegui controllo**: confronta, giorno per giorno, le ore del tracking SIC (lavoro + assenze, esclusi i riposi) con la riga TOTALE di Zucchetti.
3. Leggi riepilogo, **Giorni con ore diverse** (con la lettura: "manca su Zucchetti", "ore diverse"…), **Lavoratori non abbinati** e, per ogni station, la matrice tracking/Zucchetti dei soli lavoratori con differenze. In alto: 7 o più giorni consecutivi (rosso) e casi 6 giorni + domenica.
4. Copia i messaggi Teams, scarica l'Excel (`Controllo_fine_mese_<AAAA-MM>.xlsx`) e salva l'esecuzione.

### Passo 4 — Dopo le risposte

1. Gli Ops correggono il tracking e lo rimandano.
2. Ricarica il nuovo tracking nell'archivio (il più recente sostituisce il vecchio per lo stesso mese).
3. Rilancia il controllo sullo stesso periodo: devono restare solo gli alert non ancora spiegati.
4. Nell'esecuzione salvata segna l'esito di ogni riga; a fine settimana manda ad Alessandro il riepilogo per station (Trasferte, Rotte Amazon, +1, −1, H, A, € +1) e gli alert ancora aperti.

**Simboli del controllo settimanale** (una riga per driver, una colonna per giorno)

| Simbolo | Significato | Cosa fare |
|---|---|---|
| ok | trasferta nel tracking e rotta Amazon coincidono | nulla |
| +1 | trasferta pagata ma Amazon non lo vede in rotta quel giorno (o ha lavorato 4 ore o meno) | chiedere agli Ops cosa ha fatto; se mezzi, altra station o corso devono scriverlo nella riga RIPOSO |
| −1 | Amazon lo vede in rotta ma nel tracking ha 0 ore | giornata mancante nel tracking: gli Ops la inseriscono |
| H | ore nel tracking ma assente su Amazon, senza trasferta e senza giustificativo | chiedere cosa ha fatto (spesso mezzi o errore di compilazione) |
| A | su Amazon con rotta ma assente da tutti i tracking della station | la Nota dice se è "presente in Amazon anche su" un'altra station (prestito: cercarlo in quel tracking) oppure se è un nuovo assunto/dimesso non ancora inserito |
| ORE | più di 10 ore lavorate nel giorno, oppure una cella con un valore oltre 24 (es. 78: errore di digitazione) | chiedere agli Ops di verificare e correggere le ore del giorno; il valore oltre 24 non viene usato per trasferta e rotta |
| ACC | somministrato (STD) con ore nella riga Accordo di domenica | la domenica è già pagata con maggiorazione: la cella Accordo va cancellata (la cancella Alessandro, tu la segnali) |
| ? | manca il CSV Amazon di quel giorno | caricare il CSV e rilanciare |
| vuoto | niente da segnalare | nulla |

**Regole fisse**

- Rotta Amazon = pacchi consegnati **più di 10**. Trasferta dovuta solo se le ore lavorate sono **più di 4** (servizi da 4 ore: nessun alert).
- Trasferta a 0 nel tracking non genera mai alert: se gli Ops l'hanno messa a zero, è voluto.
- Un **giustificativo** nella riga RIPOSO chiude il giorno senza alert: MEZZI, SM (spostamento mezzi), UFF, UFFICIO, CORSO, FORMAZIONE, RESCUE, VM, DVN5, DVN6 e le sigle o i nomi delle altre station (DLO4, ORIGGIO, BUCCINASCO…). Il sito legge anche i **commenti** nelle celle del giorno: se contengono uno di questi codici valgono come giustificativo e lo riporta in nota. L'elenco lo gestisce Alessandro.
- I **dispatcher** sono esclusi da ogni alert: non guidano e non hanno trasferta. L'elenco lo gestisce Alessandro.
- **Malattia e infortunio battono il lavorato**: se nel tracking il giorno ha ore di malattia o infortunio (e 0 ore di lavoro) e Amazon lo vede in rotta, **nessun −1** (nota "malattia batte il lavorato"). Se è davvero andato a lavorare in malattia è un tema HR, non un errore di tracking: non va in questo controllo.
- **ORE e ACC** si segnalano sempre, anche quando trasferta e rotta coincidono, e hanno una sezione propria nel messaggio Teams.
- **Non** sono giustificativi: SB (turno "Same B"), L1 (rotta standard 8 ore), R, C1, D, F, P. Se c'è un codice di assenza ma anche ore lavorate, è un errore di compilazione da segnalare.
- Fine mese: **6 giorni + domenica** = 6 giorni lavorati nella settimana che finisce di domenica, domenica compresa; **7 o più giorni consecutivi** è sempre una violazione da segnalare subito.

**Attenzione: trappole note**

- Driver di una station che lavora in un'altra (DLO2↔DLO4 succede spesso): compare come **A** nella station Amazon e come +1/H nella station del tracking. Il sito cerca il driver anche negli altri tracking caricati: carica sempre tutte le station. Si chiude se gli Ops scrivono la sigla della station nella riga RIPOSO.
- Nomi scritti diversi (D'Andrea / Dandrea, Amin Elkadimi / Amin Skalli Elkadimi) o due account Amazon per lo stesso driver: compaiono un A e un +1 per lo stesso periodo. È la stessa persona: far inserire il Driver ID nel tracking.
- Driver senza Driver ID nel tracking: il sito lo aggancia per nome, ma segnala agli Ops di inserire l'ID.
- Driver con contratto scaduto che compare ancora su Amazon (es. Manfredi DLO4, 3/10): segnalarlo subito ad Alessandro, non agli Ops.
- Tracking che sconfinano nel mese precedente o successivo (DLO4, DLO5, DVN1) o con colonne "totale" in mezzo alle date: il sito legge solo i giorni del periodo scelto; non modificare le date in intestazione.
- Un foglio con un nome che non corrisponde al mese (es. "08.26" che contiene settembre): il sito guarda le date dentro il foglio, non il nome. Se il mese riconosciuto non torna, dillo ad Alessandro.
- Archivio locale vuoto su un altro PC o dopo aver cancellato i dati del browser: ricarica i file del mese.

**Escalation**

- Ops che non rispondono entro 2 giorni lavorativi → Alessandro.
- File che il sito non riconosce e non capisci perché → Alessandro, con il messaggio di errore.
- Driver A senza altra station in nota e non confermati dagli Ops come nuovi assunti → Alessandro (possibile uso improprio dell'account).
- Qualsiasi caso di 7 o più giorni consecutivi → Alessandro subito.

## Controllo MOG (somministrati con monte ore garantito)
Se un MOG chiude il mese sotto il suo monte ore, Adecco fattura comunque la differenza come "Integrazione MOG" (20,86 €/h). Il controllo serve a vederlo **durante** il mese.

| Passo | Dove | Cosa fai |
|---|---|---|
| 1 | Costi → Parametri → MOG | Carichi il file `ADECCO_PS_AAAA_MM.xlsx` del mese (arriva dal payroll). Se ha più di 40 giorni il sito te lo ricorda. Quando arrivano gli aumenti, trascini insieme il PDF `Mog_Cambio_Lavoratore…` e l'Excel `Aumenti MOG PS`: dalla data della lettera il MOG sale. |
| 2 | Presenze → Settimanale | Il blocco MOG mostra chi è **a rischio** (la proiezione a fine mese è sotto il MOG di oltre 4 h) o a **zero ore**. Copi la riga per Teams: Ops assegna rotte a chi è sotto. |
| 3 | Presenze → Fine mese | Vedi la tabella completa, scarichi `Controllo_MOG_<DS>_<mese>.xlsx` e salvi gli esiti. |
| 4 | Costi → Fine mese | La riga "Integrazione MOG" della stima STD usa le ore mancanti × tariffa Standard. |

Come fa Adecco (integrazioni MOG di ottobre 2026): il MOG del mese è ore MOG al giorno (% MOG × 169 / 26) × giorni del contratto da lunedì a sabato nel mese, al massimo 26. Nel computo contano tutte le ore del tracking: lavorate, assenze retribuite (ferie, ROL, ExF, 104, permessi), permessi non retribuiti e assenze ingiustificate. La malattia e l'infortunio valgono le ore MOG di un giorno per ogni giorno da lunedì a sabato del periodo di malattia (dal primo all'ultimo giorno), non le ore scritte nel tracking: chi è in malattia tutto il mese non ha integrazione. Chi ha il contratto anche solo per una parte del mese (anche finito nel mese) e nessuna ora ha l'integrazione del MOG di quei giorni. Il Riposo non conta.

**Consolidamento:** se la media delle ore retribuite degli ultimi 6 mesi supera il MOG di oltre il 20 %, il contratto può consolidarsi a una % più alta. Il sito legge la previsione dal file MOG e la mostra in Parametri e nel blocco MOG. "Non in file MOG" = assunto dopo la chiusura del payroll: chiedi il MOG. "Non nel tracking" = nel file ma senza righe: cessato o dimenticato.
