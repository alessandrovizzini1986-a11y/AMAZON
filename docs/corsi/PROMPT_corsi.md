# Prompt — Corsi: lezioni ed esercizi dentro il sito

*Scritto il 22/11/2026. Pagine: Aiuto → Corsi. Contenuti: `src/content/corsi/`. Regole: `src/domain/corsi/corsi.ts`.*

## Scopo
Chi entra (oggi la stagista, domani altri collaboratori) deve poter imparare da solo, senza che Alessandro spieghi a voce.
Alessandro deve poter ripassare in modo ordinato. Il primo corso è "Tracking, contratti e Accordo".

## Regole
- Un corso è una fila di lezioni brevi (5–10 minuti): una regola per lezione, testo semplice, un esempio, poi gli esercizi.
- **Non si salta**: la lezione dopo si apre solo quando tutti gli esercizi della lezione sono giusti nello stesso invio.
- Se sbagli vedi la spiegazione e riprovi: gli esercizi con i numeri cambiano numeri a ogni tentativo.
- La correzione si fa sul server: le soluzioni non arrivano al browser.
- Una lezione superata resta aperta per rileggerla e rifare gli esercizi (non cambia l'avanzamento).
- Chi fa da tutor (permesso `training.admin`) vede l'avanzamento di tutti e può aprire ogni lezione in "ripasso",
  senza che conti come superata.
- I numeri degli esercizi sulle ore si calcolano con le stesse funzioni della Verifica tracking
  (`ripartoAtteso`, `leggiContratto`): se cambia la regola nel sito, cambiano anche le soluzioni.

## Come si aggiunge o cambia una lezione
Si modifica il file del corso in `src/content/corsi/` (testo in Markdown, esercizi a scelta o con numeri) e si aggiunge
il corso a `src/content/corsi/index.ts`. I test (`tests/corsi.test.ts`) controllano che ogni lezione abbia esercizi,
che le risposte giuste esistano e che i testi non siano troppo lunghi.
