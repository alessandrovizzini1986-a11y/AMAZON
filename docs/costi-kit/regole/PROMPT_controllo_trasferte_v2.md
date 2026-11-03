# PROMPT — Controllo indennità di trasferta (tracking vs export Amazon) — v2, ottobre 2026

## Cosa fare
Per la station e il periodo indicati, confrontare giorno per giorno la riga "Indennità Trasferta" dei tracking (STD + SIC) con le rotte del portale Amazon (CSV giornalieri) e produrre il file Excel `Controllo_trasferte_<STATION>_<mese>.xlsx` + sintesi in chat con stress test STANDARD.

## Input
- 2 tracking della station del mese (nome file con `std`/`STD` e `Sic`/`SIC` + sigla station). Già in sessione per ottobre 2026 (14 file).
- CSV Amazon, uno per giorno, rinominati `<STATION>_<giorno>.csv` (es. `DLO2_14.csv`). Colonne usate: `Data`, `Nome dell'addetto alla consegna`, `ID addetto alle consegne`, `Pacchi consegnati`.
- Script: `controllo_trasferte_v2.py` (cartella input, STATION, da, a, output).

## Regole (invariate rispetto alla v1)
- Ore lavorate = Standard + Straordinario + Supplementare + Accordo, ricalcolate dalle celle giorno (mai dalla riga Totali).
- Trasferta tracking: se la cella "Indennità Trasferta" è una **formula** → si usa il ricalcolo (ore > 4), perché il valore salvato può non essere aggiornato; se è un **valore scritto a mano** → si usa quello e si segnala.
- In rotta Amazon = pacchi consegnati > 10. Aggancio per Driver ID; se manca, per nome normalizzato.
- STD e SIC con lo stesso ID → ore unite.

## Categorie
| Segno | Cat. | Significato | Azione |
|---|---|---|---|
| +1 | A | trasferta su giorno di sola assenza | formula Totali include assenze → correggere file |
| +1 | B | driver con ore e trasferta, nessuna riga Amazon | chiedere agli Operations |
| +1 | C | in Amazon ma ≤10 pacchi | verificare (rescue = dovuta; mansione non di guida = non dovuta) |
| −1 | D | Amazon in rotta, tracking 0 ore | giornata mancante nel tracking |
| — | 4h | Amazon in rotta, tracking 4 h esatte | servizio da 4 h: regolare, nessuna indennità, nessun alert |
| −1 | D3 | Amazon in rotta, tracking <4 h | ore probabilmente incomplete |
| — | — | trasferta scritta a mano = 0 | voluta: mai alert (qualunque siano ore e rotta) |
| — | E | trasferta = 1 scritta a mano con ore ≤4 | alert: da giustificare |
| — | F | giorno senza CSV Amazon | escluso dal conteggio |

## Riga RIPOSO: codici che spiegano gli alert (da Marco, 27/10)
La riga RIPOSO del tracking porta codici testuali che lo script legge e usa per classificare:
- `MEZZI`, `UFF`, `CORSO` (e simili) = giustificativo (mansione non di guida): **nessun alert**, come i servizi da 4 h e i prestiti ad altra station.
- `RESCUE` = rescue → trasferta **dovuta** (art. 8b); il driver compare comunque in Amazon. Se RESCUE con ore > 4 e trasferta 0 → cat. I (sottopagato).
- Codice station (`DLO4`, `ORIGGIO`, …) = prestato ad altra DS → giustificato, si chiude incrociando il CSV di quella station.
- `SM` = spostamento mezzi → giustificativo come MEZZI.
- `VM` = visita medica.
- `SB` = "Same B" (turno/rotta, NON giustificativo), `L1` = rotta standard 8 ore facilitata (si legge come rotta standard: se Amazon lo vede in rotta e il tracking ha 0 ore, le ore mancano davvero). Altri codici (SA/SC, C1, CB, L2-L3, N, R, 0/1, 8, 6.5, 7.8) = turni/riposi, non giustificativi.
- Le note sono nei **commenti di cella** (autore Marco Carretta) sulle righe assenze: congedo parentale, malattia figlio, sospensione/aspettativa non retribuita.

## Output Excel
Riepilogo (numeri + legenda) · **Matrice** (driver × giorno, un simbolo per cella: ok / +1 / −1 / 4h / vuoto; ordinata per numero di alert) · Alert (solo righe ≠ OK con nota per gli Ops) · Dettaglio · Amazon_non_in_tracking · Anomalie_file.

## Trappole gestite nello script v2 (ottobre 2026)
- Foglio `10_26` (DLZ2 STD) oltre a `10.26`, `Ottobre2026`, `Ottobre`.
- Intestazioni 28-29-30 → 1…31 → 1 (novembre): il secondo "1" è mese+1.
- DLO5/DVN1: colonne `totale` intercalate ogni settimana, si saltano.
- Celle giorno > 24 h (XLOOKUP a file esterno, es. giorno 27 di DER1/DER2/DLZ2): azzerate e segnalate.
- DLO2 STD ottobre: 32 driver con Totali e Indennità Trasferta **a valore fisso 0 dall'11/10** (formule sovrascritte) → categoria E; 49 driver STD senza Driver ID (aggancio per nome).
- DLO2 SIC: 5 driver con trasferta scritta a mano (Cagnin-Dispatcher, Belliato, Halilaj, Sarti, Scalcione), già visti a settembre → confermare che siano senza diritto.

## Sintesi in chat
1. Riepilogo per station (numeri, €) 2. Alert per categoria con nomi e giorni (B per gli Ops) 3. Anomalie file da far correggere 4. Stress test STANDARD (A tracciabilità, B robustezza/sensibilità/scenari/controfattuale/materialità, 3 domande, dati mancanti).


## Regole aggiunte il 3/11/2026 (v2.1)
- **Malattia/infortunio battono il lavorato**: pacchi su Amazon ma MALATTIA/INFORTUNIO nel tracking (0 ore di lavoro) = nessun alert −1.
- **Ore lavorate > 10 in un giorno = sempre alert** (categoria G), SIC e STD; valore > 24 in una cella = alert "valore anomalo", mai nascosto.
- **STD + domenica + ore nella riga Accordo = alert** (categoria J): per i somministrati la domenica non va mai in Accordo; si cancella la cella.
- Dispatcher DER2: Simone Ales, Viktor Hrynchak, Freddy Hernan (Navas Castillo), Mario Riccardi.
