# Brand assets — DA SOSTITUIRE CON ASSET CANVA

Questa cartella contiene i placeholder degli asset visivi del gestionale.
Gli asset definitivi (logo/wordmark, icone moduli, template PDF report,
palette del Brand Kit) vanno prodotti in **Canva Pro** e importati qui,
senza toccare il codice dei componenti.

## Contratto asset ↔ codice

| File atteso                          | Uso nel codice                                | Stato |
| ------------------------------------ | --------------------------------------------- | ----- |
| `logo.png` (+ copia in `public/brand/`) | Pagina login                               | ✅ generato in Canva (design `DAHOu9CU_-c`, [modifica](https://www.canva.com/d/nbLV8InIJqEc5z6)) |
| `onepager-stakeholder.pdf`           | Presentazione interna MVP                     | 🔶 bozza Canva (design `DAHOu2Grww0`, [modifica](https://www.canva.com/d/mC5oJ5ZP1FUuSca)) — sostituire il pannello immagine stock in basso, es. con lo screenshot reale della dashboard |
| `icon-tagliando.svg`                 | Voce menu Tagliandi                           | 🔶 placeholder emoji |
| `icon-multa.svg`                     | Voce menu Multe                               | 🔶 placeholder emoji |
| `icon-movimentazione.svg`            | Voce menu Movimentazione                      | 🔶 placeholder emoji |
| `icon-sostitutivo.svg`               | Voce menu Sostitutivi                         | 🔶 placeholder emoji |
| `icon-danno.svg`                     | Voce menu Danni                               | 🔶 placeholder emoji |
| `report-template.pdf` (brand template Canva) | Export PDF revisione mensile          | 🔶 da creare in Canva |

## Palette

I colori sono design token in `src/app/globals.css` (CSS variables) e
`tailwind.config.ts`. Per applicare il Brand Kit Canva: sostituire i valori
delle variabili `--color-*`. Nessun colore è hardcoded nei componenti.

Stati semantici obbligatori (non cambiarne la semantica):
- verde `--color-ok` = in regola
- giallo `--color-warn` = scadenza vicina
- rosso `--color-danger` = scaduto / bloccato
