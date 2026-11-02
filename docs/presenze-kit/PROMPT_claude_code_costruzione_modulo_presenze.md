# Costruzione del modulo "Presenze Amazon DSP" nel sito (Next.js 15 / Vercel / Neon)

## Passo 0 (fallo tu, senza chiedere nulla all'utente)
Il kit `modulo_presenze_kit.zip` è allegato a questo messaggio oppure è nella cartella Download dell'utente (`~/Downloads` / `%USERPROFILE%\Downloads`): trovalo, scompattalo in `docs/presenze-kit/` dentro il repo (crea la cartella; aggiungi `docs/presenze-kit/esempi/` e `docs/presenze-kit/attesi/` a `.gitignore` se superano i limiti del repo, ma tienili in locale per i test), verifica che ci siano 32 file e leggi `PROMPT_claude_code_costruzione_modulo_presenze.md` che è dentro lo zip: è identico a questo testo. Se lo zip non si trova, chiedi solo il percorso, nient'altro.

Nel kit trovi: gli script Python di riferimento già validati sui dati reali, i prompt con le regole di business, file di esempio reali e gli output attesi. **La logica va portata in TypeScript nel browser** (come hai proposto nella ricognizione): gli script Python sono la specifica eseguibile, i file di esempio + output attesi sono i test di accettazione. Lavora a PR separate per fase; ogni fase si chiude solo quando i test "golden" passano.

## 0. Contesto operativo (perché esiste il modulo)
Professional Solutions è Amazon DSP su 7 delivery station: DER1 (Valsamoggia), DER2 (Santarcangelo), DLO2 (Origgio), DLO4 (Buccinasco), DLO5 (Castegnato), DLZ2 (Pomezia), DVN1 (Vigonza). Due popolazioni: **SIC** (diretti) e **STD** (somministrati Adecco). Gli Operations di ogni station compilano ogni mese un file Excel "tracking" (uno SIC e uno STD) con ore per giorno e riga "Indennità Trasferta". Dal portale Amazon si scaricano CSV giornalieri per station ("Addetti alla consegna": driver, ID, pacchi). A fine mese HR esporta da Zucchetti le ore inserite (solo SIC). Una stagista deve, con il minimo di passaggi:
1. **ogni settimana**: caricare CSV Amazon + tracking e ottenere la lista di anomalie da mandare alle Ops (trasferte pagate senza rotta, giornate lavorate non nel tracking, driver sconosciuti, ore nel tracking ma assenti su Amazon);
2. **a fine mese**: caricare i 7 export Zucchetti e verificare che le ore SIC del tracking coincidano con Zucchetti, più i controlli domeniche / giorni consecutivi.

## 1. Architettura richiesta
- Tutto il parsing e il calcolo **nel browser** (ExcelJS + PapaParse già presenti). Al server arrivano solo: metadati dei file caricati, righe di risultato (piccole), riepiloghi. Nessun file originale sul server (niente Blob per ora: i file restano sul PC della stagista; se in futuro serve archivio, lo aggiungiamo).
- Nuova sezione `src/app/(app)/presenze/` con 3 pagine: `archivio`, `settimanale`, `fine-mese`. Permessi: nuove azioni `presenze.view` e `presenze.run` in `rbac.ts`; ADMIN e un nuovo ruolo `CONTROLLO` (per la stagista) le hanno; audit su ogni esecuzione.
- Logica pura in `src/domain/presenze/*.ts` (senza React, senza DB), testata con vitest contro i golden file del kit. Struttura suggerita: `tracking.ts` (parser), `flex.ts` (parser CSV Amazon), `zucchetti.ts` (parser), `controlloSettimanale.ts`, `controlloFineMese.ts`, `regole.ts` (costanti: station, giustificativi, dispatcher, soglie), `excel.ts` (export).
- Tabelle Prisma (migrazione + script Neon come per Ordini):
  - `PresenzeFile` (id, tipo: TRACKING_SIC|TRACKING_STD|FLEX_CSV|ZUCCHETTI, station, anno, mese, giorno? (solo FLEX), nomeFile, hashSha256, righe, caricatoDa, caricatoIl) — serve per la griglia "cosa c'è / cosa manca"; i CSV Flex si registrano uno per giorno anche se caricati insieme.
  - `PresenzeRun` (id, tipo: SETTIMANALE|FINE_MESE, station?, periodoDa, periodoA, eseguitoDa, eseguitoIl, riepilogoJson, nAlert)
  - `PresenzeRisultato` (runId, station, tipo (SIC/STD/AMAZON), driver, driverId, categoria, giorni (json), oreTracking, trasferte, rotte, nota, esitoOps (aperto|chiuso|giustificato), notaOps) — la stagista può segnare l'esito dopo la risposta delle Ops.
  - `PresenzeDispatcher` (nome, cognome, station?, attivo) e `PresenzeGiustificativo` (codice, descrizione) — modificabili da pagina ADMIN, pre-popolati con i valori del kit.

## 2. Pagina ARCHIVIO (`/presenze/archivio`)
- Zona drag & drop unica: accetta `.xlsx/.xlsm/.csv` in qualsiasi numero. Riconoscimento automatico:
  - CSV Amazon: intestazione che inizia con `Data,Nome dell’addetto alla consegna,ID addetto alle consegne,Pacchi consegnati,...`; station dal nome file `<STATION>_<gg>_<mm>_<aa>.csv` o `<STATION>_<gg>.csv`; se il file ha la colonna `Station` (CSV unito) usarla. La data dal contenuto (colonna Data, formato `AAAA-MM-GG`).
  - Tracking: Excel con una riga di intestazione che contiene la cella `Tipo` (colonna G = STD, colonna H = SIC con "Codice Matricola" in G); station dal nome file (contiene DER1/DER2/...); popolazione dal nome (`Sic`/`SIC` → SIC, `std`/`STD` → STD) con conferma visiva.
  - Zucchetti: nome `Amazon_<AAAA>_<MM>_<Città>_*.xlsm`, foglio `ORARI`, riga 2 con `MATR`, righe `VERSO = TOTALE`.
- Per ogni file: parse nel browser → scrittura di `PresenzeFile` (solo metadati) → **i dati parsati restano nello stato della pagina/IndexedDB del browser** per essere usati dalle pagine di controllo nella stessa sessione (usa IndexedDB con chiave hash file così sopravvivono al refresh; non inviarli al server).
- Griglia stato del mese: righe = station, colonne = giorni; cella verde se c'è il CSV Flex di quel giorno; a lato badge "Tracking SIC ✔/✘", "Tracking STD ✔/✘", "Zucchetti ✔/✘" con data di caricamento. Deve rispondere alla domanda "cosa manca".

## 3. Pagina CONTROLLO SETTIMANALE (`/presenze/settimanale`)
Porta in TS `controllo_trasferte_v2.py` + le regole di `PROMPT_controllo_trasferte_v2.md` e `PROMPT_vademecum_controllo_presenze.md`. Riassunto delle regole vincolanti:
- Parametri: periodo (da/a), station (una o tutte), soglia pacchi **10**, soglia ore trasferta **4**.
- Dal tracking, per driver × giorno: ore lavorate = somma righe `Standard + Straordinario + Supplementare + Accordo` (mai la riga `Totali`); trasferta = riga `Indennità Trasferta` ≥ 1; codice riposo = riga `RIPOSO` (testo). Valori > 24 → 0 (celle XLOOKUP stantie). Intestazioni giorno: date Excel oppure interi 1..31 con rollover di mese (DLO4/DLO5/DVN1 sconfinano nel mese precedente/successivo: tenere solo il mese target); DER1/DER2/DLZ2 hanno colonne subtotale dopo "Totale": fermarsi lì; DLO5/DVN1 hanno colonne "totale" intercalate fra le date: saltarle.
- Da Amazon: rotta = pacchi consegnati > soglia; aggancio driver per Driver ID (ignorare ID `0`, `-`, `NA`, `X`, vuoto), altrimenti per nome **insensibile a ordine cognome/nome, maiuscole, apostrofi e accenti**; se il tracking non ha l'ID, prenderlo da Amazon e mostrarlo nella nota ("ID mancante nel tracking: preso da Amazon").
- **Ricerca cross-station**: un driver visto su Amazon per la station X va cercato in TUTTI i tracking caricati (prestiti DLO2↔DLO4 frequenti); se è nel tracking di Y con ore quel giorno → chiuso automaticamente come "prestito da Y".
- Giustificativi (riga RIPOSO): MEZZI, SM, UFF, UFFICIO, CORSO, FORMAZIONE, RESCUE, VM, DVN5, DVN6, sigle/nomi delle altre station → nessun alert. **NON** sono giustificativi: SB (turno "Same B"), L1 (rotta standard 8 h), R, C1, D, F, P. I commenti nelle celle Excel vanno letti se ExcelJS li espone (`cell.note`): se contengono MEZZI/sigla station valgono come giustificativo e vanno riportati in nota.
- Dispatcher (tabella `PresenzeDispatcher`, pre-popolata dal kit): esclusi da ogni alert; nessuna trasferta dovuta.
- Trasferta a 0 nel tracking: mai alert. Servizio ≤ 4 h con rotta: mai alert.
- Categorie di esito (una per driver × giorno):
  - `+1` trasferta pagata ma nessuna rotta Amazon (o rotta con ≤ 4 h lavorate) e nessun giustificativo
  - `-1` rotta Amazon ma 0 ore nel tracking
  - `H` ore nel tracking, assente su Amazon, trasferta 0, nessun giustificativo
  - `A` driver in Amazon con rotta ma assente da tutti i tracking (con nota: "presente in Amazon anche su: <altre station>" → probabile prestito; altrimenti "nuovo assunto/dimesso/nome diverso?")
  - `ok` trasferta e rotta coincidono; vuoto = nulla da segnalare
- Output a video: tabella un driver per riga (Station, Tipo, Driver, ID, Contratto, gg lavorati, trasferte, rotte, +1, −1, H, A, "Giorni da verificare" come `3(+1), 7(H)`, Nota), filtrabile per station e per esito, con la griglia giorni a simboli; riepilogo per station (trasferte, rotte, +1, −1, H, A, € +1 × 22,50). Pulsanti: "Excel per le Ops" (una tabella Excel nativa, stile standard, niente grafica), "Salva esecuzione" (scrive `PresenzeRun` + `PresenzeRisultato`). Sulle righe salvate la stagista può impostare esito Ops e nota.
- **Test golden**: con `esempi/trk/DLO4` + `esempi/flex/FLEX_TUTTI.csv`, periodo 1–25/10/2026, station DLO4, l'output deve coincidere con `attesi/Controllo_trasferte_DLO4_ott26.xlsx` (foglio Dettaglio: stesse righe driver×giorno con Esito; foglio Alert: stessi +1/−1) e con `attesi/Riepilogo_Ops_presenze_vs_Amazon_ott26_v2.xlsx` per le righe DLO4 (casi A/B dopo esclusioni). Tolleranza: zero differenze sugli esiti; le note testuali possono differire. Aggiungi anche un test su DVN1 (file in `esempi/trk/DVN1`): deve riconoscere i nomi invertiti (es. "TONTOROIU NICUSOR" ↔ "Nicusor Laurentiu Tontoroiu") senza produrre A.

## 3-bis. Output "pronti da incollare" e Excel (vale per entrambi i controlli)
Il sito deve produrre, oltre alla vista a video, due cose che la stagista usa direttamente:

**A) Messaggi Teams per station** (pagina settimanale e fine mese): per ogni station con anomalie, un riquadro di testo già composto con pulsante "Copia" (clipboard, testo semplice che Teams renda leggibile: righe `- ` e tabulazioni, niente markdown complesso) e un pulsante "Copia tabella" che mette negli appunti una tabella HTML (Teams la incolla come tabella). Struttura del messaggio:
```
Ciao, controllo presenze <STATION> periodo <da>–<a>. Ci servono queste verifiche entro <data+2gg lavorativi>:

TRASFERTA PAGATA SENZA ROTTA AMAZON (+1)
Driver | Giorni | Ore | Cosa chiediamo
ROSSI MARIO | 03/10, 07/10 | 8, 8 | cosa ha fatto? se mezzi/altra station/corso scrivetelo nella riga RIPOSO

ROTTA AMAZON MA ZERO ORE NEL TRACKING (-1)
...
ORE NEL TRACKING MA ASSENTE SU AMAZON (H)
...
DRIVER SU AMAZON NON PRESENTE NEI TRACKING (A)
Driver | ID | Giorni | Pacchi | Nota (es. presente anche su DLO2 → prestito?)

Grazie, rispondete correggendo direttamente il tracking e avvisateci.
```
Per il fine mese lo stesso schema con sezioni: ORE DIVERSE TRA TRACKING E ZUCCHETTI (lavoratore, giorno, ore tracking, ore Zucchetti, delta), LAVORATORI NON ABBINATI, **6 GIORNI + DOMENICA** (lavoratore, domenica), **PIÙ DI 6 GIORNI CONSECUTIVI** (lavoratore, dal–al, n. giorni). Il testo dei template deve stare in `src/domain/presenze/messaggi.ts` così è modificabile in un punto solo; i referenti per station (nome da salutare) in una tabella `PresenzeReferente` modificabile da ADMIN, con fallback "Ciao".

**B) Excel scaricabile** per ogni esecuzione (generato nel browser con ExcelJS; tabelle Excel native con stile standard, nessuna grafica personalizzata, formule dove il file atteso le ha):
- Settimanale: fogli `Riepilogo` (per station), `Risultato` (un driver per riga con simboli per giorno, come la tabella a video), `Alert` (solo righe con +1/−1/H/A, una riga per driver×giorno, pronte per filtro), `Dettaglio` (tutte le righe driver×giorno con ore, trasferta, pacchi, riposo, esito), `Non_in_tracking`, **`Domeniche_consecutivi`** (per ogni driver SIC e STD del periodo: ore per giorno, giorni lavorati, `6+dom` per ogni domenica del periodo, max giorni consecutivi, `>6 consecutivi` SI/NO calcolato sul mese intero caricato, non solo sul periodo) e `Parametri` (soglie, periodo, data/ora, chi).
- Fine mese: fogli identici a `attesi/Controllo_Zucchetti_set26.xlsx` (`Riepilogo`, `Delta_giorni`, `Non_abbinati`, `V_<DS>`, `SIC`, `STD` se presenti i tracking STD, `Tabella 6+domenica (SIC)`) più un foglio **`Alert_consecutivi`** con i lavoratori oltre 6 giorni consecutivi (station, lavoratore, dal, al, n. giorni) — se vuoto, una riga "nessuno".
- Nome file: `Controllo_settimanale_<da>_<a>.xlsx` / `Controllo_fine_mese_<AAAA-MM>.xlsx`.

**C) A video**, in cima a entrambe le pagine, un blocco "Alert" sempre visibile: numero di driver con >6 giorni consecutivi (rosso se >0) e numero di 6+domenica, con link che filtra la tabella.

## 4. Pagina FINE MESE (`/presenze/fine-mese`)
Porta in TS `controllo_zucchetti.py` + `PROMPT_controllo_zucchetti_fine_mese.md`. Regole vincolanti:
- Solo SIC. Ore tracking del giorno = **lavoro (4 voci) + tutte le assenze** (FERIE, ROL, ExF, 104, MALATTIA, INFORTUNIO, permesso sindacale, altri permessi, permesso NON retribuito, assenza ingiustificata). Su Zucchetti c'è tutto tranne i RIPOSI. Mai usare la riga `Totali`.
- Zucchetti: riga `TOTALE`, celle time (07:48 = 7,8), stringhe "08:00" o vuote; matricola in col. B (numero o `S00xxxx`); abbinamento per matricola, poi nome (ordine indifferente, apostrofi ignorati, inclusione di token se candidato unico). Città→station come in §0.
- Delta = tracking − Zucchetti per lavoratore × giorno, soglia 0,01 h.
- Controlli domenica/consecutivi sulla matrice delle sole ore di **lavoro**: somma per settimana lun–dom, max ore/sett, ≥40 h, `6+dom` per ogni domenica dal 7 in poi (= nella settimana lun–dom ha lavorato 6 giorni su 7 e la domenica è tra questi), max giorni consecutivi, **≥7 consecutivi = violazione**.
- Output a video: Riepilogo per station (lavoratori tracking/Zucchetti, abbinati, solo-tracking, solo-Zucchetti, giorni con delta, delta ore), tabella Delta_giorni (station, matricola, lavoratore, data, ore tracking con split lavoro/assenze, ore Zucchetti, delta, lettura "manca su Zucchetti / manca su tracking / ore diverse", voci del tracking), Non_abbinati, matrice per station TRACKING|ZUCCHETTI|DELTA, tabella "6+domenica" (per station, una colonna per domenica con i nomi), elenco "≥7 giorni consecutivi". Pulsante Excel con gli stessi fogli (tabelle native, formule per i delta e per le colonne di controllo come nel file atteso).
- **Test golden**: `esempi/set26/` (7 tracking SIC settembre + 7 Zucchetti) → deve coincidere con `attesi/Controllo_Zucchetti_set26.xlsx`: 394 lavoratori abbinati su 394, 6 station a delta zero, DER1 2 giorni con delta (Mitroi Alexandru 12–13/9: +1 e +7), Tabella 6+domenica con esattamente i 49 nomi del file atteso (foglio "Tabella 6+domenica (SIC)"), nessun ≥7 consecutivi.

## 5. Vademecum
Aggiungi `content/vademecum/13-presenze.md` (title "Controlli presenze Amazon", category come le altre pagine operative) con i 4 passi per pagina, i simboli, le regole e le trappole prese da `PROMPT_vademecum_controllo_presenze.md`, e i link `/presenze/archivio`, `/presenze/settimanale`, `/presenze/fine-mese`. Niente riferimenti a Excel template, Python o bookmarklet: nel sito la stagista trascina i file e legge i risultati.

## 6. Vincoli e qualità
- Nessuna nuova libreria se non indispensabile (tabelle con i componenti esistenti). Tutto in italiano nell'interfaccia.
- Prestazioni: 14 tracking (fino a 6 MB l'uno) + ~10.000 righe CSV devono essere elaborati nel browser in meno di 30 s su un portatile aziendale; parse in Web Worker se necessario.
- Robustezza del parser: se un file non viene riconosciuto, dirlo subito con motivo (foglio del mese non trovato, riga "Tipo" assente, station non nel nome) senza bloccare gli altri.
- Fasi/PR: (1) domain + test golden settimanale; (2) pagina archivio + settimanale con messaggi Teams ed Excel; (3) domain + test golden fine mese + pagina con messaggi Teams ed Excel; (4) vademecum + rbac + migrazioni Neon + tabelle referenti/dispatcher/giustificativi gestibili da ADMIN. Alla fine di ogni fase riporta: test passati, differenze residue rispetto ai golden e perché.
- Non inviare mai i file originali o i dati per-driver a servizi esterni; i dati salvati su Neon sono solo risultati e metadati.

## 7. Contenuto del kit
```
kit/
  riferimento/controllo_trasferte_v2.py        logica controllo settimanale (specifica eseguibile)
  riferimento/controllo_zucchetti.py           logica fine mese
  riferimento/unisci_csv_flex.py               come si unisce il CSV (formato colonna Station)
  riferimento/bookmarklet_flex_src.js          come la stagista scarica oggi i CSV dal portale (per capire il formato)
  regole/PROMPT_controllo_trasferte_v2.md
  regole/PROMPT_vademecum_controllo_presenze.md
  regole/PROMPT_controllo_zucchetti_fine_mese.md
  regole/dispatcher.csv                        elenco dispatcher (cognome, nome)
  regole/giustificativi.csv                    codici riga RIPOSO che chiudono il giorno
  esempi/flex/FLEX_TUTTI.csv                   CSV Amazon uniti, 7 station, 1–25/10/2026 (colonna Station)
  esempi/flex/DER1_26_10_26.csv                CSV singolo come scaricato dal portale
  esempi/trk/DLO4/  esempi/trk/DVN1/           tracking SIC+STD ottobre 2026
  esempi/set26/                                7 tracking SIC settembre + 7 Zucchetti settembre
  attesi/Controllo_trasferte_DLO4_ott26.xlsx   output atteso settimanale DLO4
  attesi/Controllo_trasferte_DVN1_ott26.xlsx   output atteso settimanale DVN1
  attesi/Riepilogo_Ops_presenze_vs_Amazon_ott26_v2.xlsx   riepilogo Ops atteso (tutte le station)
  attesi/Controllo_Zucchetti_set26.xlsx        output atteso fine mese settembre
```
## 8. Modalità di lavoro
L'utente non interviene nel codice né nei file: fai tutto tu, comprese migrazioni Neon (con lo stesso script usato per Ordini/Officine), PR e merge quando CI è verde. Decisioni già prese, non riaprirle: niente Vercel Blob (i file originali restano sul PC della stagista); esito Ops e nota modificabili dalla stagista sul sito; calcolo nel browser. Dove un dettaglio non è specificato scegli tu la soluzione più semplice coerente con il codice esistente e annotala nel riepilogo finale della PR.
Prima di scrivere codice, leggi i tre PROMPT in `regole/` e i due script in `riferimento/`, poi scrivi in 15 righe il piano delle 4 PR e le interfacce TypeScript dei tipi `Tracking`, `FlexRow`, `Zucchetti`, `RisultatoGiorno`, e **procedi subito** senza attendere conferma. Alla fine di ogni PR riporta all'utente, in italiano e in forma tabellare: test golden passati/falliti con numeri, cosa può provare sul sito (URL delle pagine) e cosa manca.
