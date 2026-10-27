---
title: "Bonifiche e controlli automatici"
order: 10
category: "Riferimenti"
updated: "2026-10-27"
---

**Da confermare con Alessandro prima di consegnare il vademecum**

- Rinominare i PDF fattura già presenti nelle cartelle station con il naming standard (oggi convivono `37.pdf`, `DER1_APR_INV-...pdf`, `apr2154.pdf`)
- Percorso esatto di tracking e Format controllo trasferte

**Bonifiche da fare il primo giorno (buon esercizio per la stagista)**

| File | Problema trovato | Azione |
|---|---|---|
| fatt_2026 | Colonna `Numero` vuota su circa 1.500 righe su 11.000 | Risalire alla fattura da DS + data e completare |
| fatt_2026 | Riga DER1 02/01/2026 con un nome in `AVERE` | Sostituire con Totale - IVA |
| MACROAREA | Stessa descrizione mappata su due macroaree diverse (`Nursery Route Level - 4` → `ROTTA 8` e `ROTTA 8,24`) | Allineare a `ROTTA 8,24` |
| MACROAREA | Varianti della stessa descrizione (`FuelAllowance` / `Fuel Allowance`, `Level 4 -` / `Level - 4`) | Tenerle tutte nel mapping, mai correggere la descrizione in fatt_2026 |
| Multe 2026 | Station scritte in modo diverso (`DLO4 - Buccinasco` / `DLO4 - BUCCINASCO`) | Uniformare in maiuscolo e mettere elenco a discesa |
| Query_DPI | Foglio `ORDINI_2026` parallelo a `Ordini_bis` | Spostare le righe in `Ordini_bis` ed eliminare il foglio |

**Controlli automatici da inserire nei file** (poka-yoke che toglie l'errore alla fonte)

1. Convalida dati a elenco su DS/Station, PRODOTTO, Tipo Contratto, Metodo di pagamento, Motivo (macroarea).
2. Formattazione condizionale rossa sulle celle obbligatorie vuote (Numero fattura, MACROAREA, Driver dopo 5 giorni dalla notifica).
3. Cella di quadratura in fatt_2026: `=SOMMA.SE(Numero;"INV-...";Totale)` da confrontare con l'importo dovuto del PDF; verde se scarto < 0,02 €.
4. Formule bloccate (protezione foglio) su TEMPISTICA, PREZZO TOTALE, AVERE, WEEK, MESE, ANNO, COSTO/H.
5. Gruppi contatti Outlook per station e per tipo mail (Sanzioni SIC/CTI, driver.ps STD, Annalisa), così destinatari e cc non si scrivono mai a mano.
6. Modelli Outlook (.oft) per i Template A, B, C con l'allegato già richiesto nel corpo come promemoria.
