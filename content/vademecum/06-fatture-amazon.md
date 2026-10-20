---
title: "Fatture Amazon: compilazione di fatt_2026"
order: 6
category: "Fatture"
updated: "2026-10-20"
---

Ogni riga della sezione **"Dettagli fattura"** del PDF diventa una riga del foglio `fatt_2026`. Non si usa mai il "Riepilogo" in testa alla fattura: è aggregato per descrizione, non per giorno.

**I due formati di fattura**

| Formato | Come lo riconosci | Periodo | Cosa si inserisce | Attenzione |
|---|---|---|---|---|
| Settimanale servizi | Intestazione "Fattura", sezioni Riepilogo + Dettagli fattura | Domenica-sabato (es. 06/09/2026 a 12/09/2026) | Una riga per ogni riga di "Dettagli fattura": stessa data + stessa descrizione + stesso prezzo = una riga | Date in formato GG/MM/AAAA. Le descrizioni vanno a capo nel PDF: ricomponile su una riga sola |
| Mensile incentivi | Intestazione "Fattura per conto del fornitore", "Appendice incentivo" | Mese intero o settimana (es. 04/01/2026 a 04/30/2026) | Una riga per ogni riga dell'appendice (Incentivi - Parcheggio, Incentivi - Pedaggi, Incentivi settimanali - DEI) | **Date in formato MM/GG/AAAA** (americano): 04/05/2026 è il 5 aprile, non il 4 maggio |

| Scheda | |
|---|---|
| Trigger | Nuovo PDF nella cartella `2026/<STATION>/` (settimanali: ogni lunedì per la settimana precedente; incentivi: entro il 5 del mese) |
| Input | PDF fattura, foglio `MACROAREA` (descrizione → MACROAREA e MICROAREA) |
| Passi | 1. Apri il PDF, leggi numero fattura (`INV-IT3JDBF-00xxxxx`), station (indirizzo di consegna) e importo totale. 2. Vai in fondo a `fatt_2026`, inserisci le righe dei "Dettagli fattura" in ordine di data. 3. Compila le colonne di mapping con le formule (sotto). 4. Verifica la quadratura. 5. Rinomina il PDF: settimanale `DS_WK<settimana>_<numero fattura>.pdf` (es. `DER1_WK37_INV-IT3JDBF-0002484.pdf`), mensile `DS_<MESE>_<numero fattura>.pdf` (es. `DER1_APR_INV-IT3JDBF-0002151.pdf`). |
| Output | Righe in `fatt_2026` con Numero fattura compilato su ogni riga |
| Check finale | Somma `Totale (€)` delle righe inserite = "Importo dovuto" del PDF (tolleranza 0,02 €). Somma `AVERE` = Sub-totale. Nessuna cella vuota in Numero e MACROAREA. |

**Colonne di `fatt_2026`**

| Colonna | Formato | Da dove / regola |
|---|---|---|
| DS | testo | Station dall'"Indirizzo di consegna" del PDF (DER1, DLO2...) |
| Data | data | Colonna Data della riga di dettaglio (per le fatture incentivi: data dell'appendice, convertita da MM/GG) |
| Descrizione | testo | Copia esatta, su una riga sola, senza punto finale (es. `Standard Parcel - Block of 7 Hours 48 Minutes`) |
| Quantità | numero | Dal PDF |
| Prezzo (€) | numero | Prezzo unitario, dal PDF |
| Tasse | testo | Sempre `VAT 22` |
| Rateo IVA | numero | Sempre `0,22` |
| Importo IVA (€) | numero | Dal PDF |
| Totale (€) | numero | Dal PDF, IVA inclusa |
| AVERE | numero | Imponibile: `=Totale-Importo IVA`. **Solo numeri**, mai nomi o testo |
| MICROAREA | formula | `=SE.ERRORE(CERCA.VERT(Descrizione;MACROAREA!A:C;3;FALSO);"")` |
| MACROAREA | formula | `=CERCA.VERT(Descrizione;MACROAREA!A:C;2;FALSO)`. Se dà #N/D, la descrizione è nuova: aggiungila al foglio `MACROAREA` con Alessandro, non scriverla a mano |
| WEEK | formula | `=NUM.SETTIMANA(Data;21)` (settimana ISO) |
| MESE / ANNO | formula | `=MESE(Data)` / `=ANNO(Data)` |
| Numero | testo | Numero fattura, uguale su tutte le righe della stessa fattura (es. `INV-IT3JDBF-0002484`) |

**Esempio: fattura DER1 INV-IT3JDBF-0002484** (06-12/09/2026, importo dovuto 105.493,57 €). Le prime righe dei Dettagli fattura diventano:

| DS | Data | Descrizione | Q.tà | Prezzo | IVA | Totale | AVERE | MICROAREA | MACROAREA | WEEK | Numero |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DER1 | 06/09/2026 | Nursery Route Level 1 - Block of 7 Hours 48 Minutes | 1 | 279,28 | 61,44 | 340,72 | 279,28 | STANDARD 8H | ROTTA 8,24 | 36 | INV-IT3JDBF-0002484 |
| DER1 | 06/09/2026 | DSP Bonus Coverage - weekend | 23 | 91,03 | 460,62 | 2.554,31 | 2.093,69 | | DSP Bonus Coverage weekend | 36 | INV-IT3JDBF-0002484 |
| DER1 | 06/09/2026 | FuelAllowance | 3364 | 0,21 | 151,99 | 842,94 | 690,95 | | Carburante | 36 | INV-IT3JDBF-0002484 |
| DER1 | 06/09/2026 | AMZL Late Cancel - weekend | 2 | 325,00 | 143,00 | 793,00 | 650,00 | ABORT | ROTTE ABORT WEEKEND | 36 | INV-IT3JDBF-0002484 |

Le colonne Tasse (`VAT 22`), Rateo IVA (`0,22`), MESE (9) e ANNO (2026) sono uguali su tutte le righe e sono omesse dalla tabella per leggibilità.

**Esempio: fattura incentivi DER1 INV-IT3JDBF-0002151** (importo dovuto 13.323,37 €):

| DS | Data | Descrizione | Q.tà | Prezzo | IVA | Totale | AVERE | MACROAREA | Numero |
|---|---|---|---|---|---|---|---|---|---|
| DER1 | 05/04/2026 | Incentivi - Parcheggio | 1 | 5.026,05 | 1.105,73 | 6.131,78 | 5.026,05 | PARCHEGGI | INV-IT3JDBF-0002151 |
| DER1 | 05/04/2026 | Incentivi - Pedaggi | 1 | 5.894,75 | 1.296,85 | 7.191,60 | 5.894,75 | Pedaggi | INV-IT3JDBF-0002151 |

La stessa fattura ha più righe con la stessa descrizione nello stesso giorno ma prezzo diverso (es. due "AMZL Late Cancel - weekday" a 145,00 e a 243,35): sono due righe distinte, non sommarle.
