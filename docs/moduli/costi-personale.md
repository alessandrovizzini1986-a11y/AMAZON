# Modulo "Costi del personale a fine mese"

Spec: `docs/costi-kit/PROMPT_claude_code_modulo_costi_fine_mese.md` (regole in `docs/costi-kit/regole/`).
I file di esempio e gli attesi del kit (`esempi/`, `attesi/`) contengono dati personali e restano solo in locale (gitignored); i test golden si saltano se mancano.

## Fase 1 — parametri e anagrafica
- `src/domain/costi/festivi.ts`: festivi nazionali (con 1/11, Pasquetta, 24/12 e 31/12 semifestivi) e patroni per station; `domenicaOFestivo` (mai il sabato).
- `src/domain/costi/tariffe.ts`: tariffe per data (trasferta 20,50 → 22,50 → 23,50 → 24,00; domenica +7,00), prossimo cambio con allerta 60/30/7.
- `src/domain/costi/parametri.ts`: coefficienti SIC/STD/CCNL con validità.
- `src/domain/costi/anagrafica.ts`: lettura foglio `SIC Amazon TR`, riepilogo per station, differenze tra versioni, join CF con correzione O↔0 sull'ultimo carattere.
- Tabelle: `AnagraficaCDL` (versionata per mese), `Tariffa`, `Parametro`, `Festivo`, `AditRiga`, `PayrollRiga`, `StimaCosti`, `Riconciliazione` (migrazione `20261105090000_costi_personale`, con i valori iniziali e i festivi 2026–2028).
- Pagine: `/costi` (indice mesi), `/costi/parametri`. Permessi `costi.view` / `costi.run` / `costi.parametri` (ADMIN e CONTROLLO).
- L'allerta cambio tariffa è un avviso in testa al modulo (nessuna email: il sito non fa chiamate esterne).
