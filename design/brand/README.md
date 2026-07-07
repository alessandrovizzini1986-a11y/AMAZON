# Brand assets — DA SOSTITUIRE CON ASSET CANVA

Questa cartella contiene i placeholder degli asset visivi del gestionale.
Gli asset definitivi (logo/wordmark, icone moduli, template PDF report,
palette del Brand Kit) vanno prodotti in **Canva Pro** e importati qui,
senza toccare il codice dei componenti.

## Contratto asset ↔ codice

| File atteso                          | Uso nel codice                                | Stato |
| ------------------------------------ | --------------------------------------------- | ----- |
| `logo.svg`                           | Header app, pagina login                      | 🔶 placeholder |
| `icon-tagliando.svg`                 | Voce menu Tagliandi                           | 🔶 placeholder |
| `icon-multa.svg`                     | Voce menu Multe                               | 🔶 placeholder |
| `icon-movimentazione.svg`            | Voce menu Movimentazione                      | 🔶 placeholder |
| `icon-sostitutivo.svg`               | Voce menu Sostitutivi                         | 🔶 placeholder |
| `icon-danno.svg`                     | Voce menu Danni                               | 🔶 placeholder |
| `report-template.pdf` (brand template Canva) | Export PDF revisione mensile          | 🔶 da creare in Canva |

## Palette

I colori sono design token in `src/app/globals.css` (CSS variables) e
`tailwind.config.ts`. Per applicare il Brand Kit Canva: sostituire i valori
delle variabili `--color-*`. Nessun colore è hardcoded nei componenti.

Stati semantici obbligatori (non cambiarne la semantica):
- verde `--color-ok` = in regola
- giallo `--color-warn` = scadenza vicina
- rosso `--color-danger` = scaduto / bloccato
