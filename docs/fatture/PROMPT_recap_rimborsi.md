# Prompt – Recap rimborsi Amazon (parcheggi, pedaggi, carburante, training)

Richiesta di Alessandro (06/11/2026): nelle fatture Amazon controlla sempre che gli vengano rimborsati
parcheggi, pedaggi, carburante e il training di ogni lavoratore nuovo (80 € a persona). Vuole tabelline di
recap sempre a portata di mano per le contestazioni.

```
Leggi prima: src/domain/fatture/{classifica,fatturato}.ts, prisma/schema.prisma (AmazonInvoiceLine, TelepassRun,
Q8Run, MogContratto, Parametro), src/domain/costi/parametri.ts.
Regole del sito: nessuna chiamata esterna, nessun nome reale nei test, DVN5/DVN6 dentro DVN1, importi IVA esclusa.
```

## Fonti

| Voce | Rimborsato (fattura Amazon, `avere`) | Nostro costo |
|---|---|---|
| Parcheggi | righe con "Parchegg" (`Incentivi - Parcheggio`), una al mese datata il 1° | costo mensile per DS dai Parametri `PARCHEGGIO_<DS>` (con data di validità, pro-rata ai giorni) |
| Pedaggi | righe con "Pedagg" (`Pedaggi`, `Modifiche - Pedaggi`, `Incentivi - Pedaggi`, `Rimborso - pedaggi`) e `OTR Services` (da fine aprile 2026) | elaborazione Telepass del mese (pedaggi + RMPP + ZTL), per station |
| Carburante | `FuelAllowance` / `Fuel Allowance` / `Modifiche - Carburante` | elaborazione Q8 del mese (ultima per mese), per station |
| Training | `Training Day…` (quantità = giornate, 80 €) | nuovi STD del mese (data inizio contratto nel file MOG) × `TRAINING_EURO` (80 €) |

Note credito "Credit Note for INV-…": vanno nella voce della fattura a cui si riferiscono (es. i parcheggi di
maggio 2026 fatturati due volte e stornati a luglio). Il mese è quello della data della riga.

## Costi parcheggio (IVA esclusa, 06/11/2026)

| DS | €/mese | Validità |
|---|---:|---|
| DER1 | 3.020 | |
| DER2 | 3.500 | parcheggio temporaneo dal 01/10/2026 al 15/01/2027 (gennaio metà) |
| DLO2 | 4.115 | fino al 14/11/2026; dal 15/11/2026 parcheggio Amazon, 0 € |
| DLO4 | — | nessun parcheggio indicato |
| DLO5 | 800 | |
| DLZ2 | 2.417 | |
| DVN1 | 7.710 | |

## Cosa costruire

1. `src/domain/fatture/rimborsi.ts`: voce di una riga (con note credito), costo parcheggio del mese pro-rata,
   recap mese × DS per voce (rimborsato, costo, differenza, fatture).
2. Pagina **Fatture → Rimborsi** (`/fatture-amazon/rimborsi`): scelta del mese, una tabellina per voce con le 7 DS
   (costo, rimborsato, differenza, numeri fattura), l'andamento dell'anno per voce e "Scarica Excel" con tutto
   il dettaglio per le contestazioni.
3. Parametri su Neon: `PARCHEGGIO_<DS>` e `TRAINING_EURO`, modificabili da Costi → Parametri.

Limiti dichiarati in pagina: i nuovi SIC non hanno data di assunzione nel sito (il training atteso conta solo gli
STD del file MOG); pedaggi e carburante si confrontano solo nei mesi con Telepass/Q8 elaborati.

## Aggiunte del 06/11/2026

- Storico 2026: Q8 e Telepass gennaio–settembre caricati dai file elaborati di Alessandro (TelepassRun/Q8Run con
  `eseguitoDa = "storico file elaborato"`); ottobre era già elaborato nel sito ed è identico.
- 2025: tabella `CostoConsuntivo` (anno, mese, DS, voce) dal file consuntivo_costi_fatturato_2025 (Costo Effettivo,
  CDC 5569; parcheggi = "AFFITTI AMAZON"); se c'è per mese e voce vale lui.
- Carburante per settimana Amazon (FuelAllowance contro Q8): il problema segnalato parte dalla settimana 6 del 2026.
