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

## Fase 2 — fine mese STD e import ADIT
- `src/domain/costi/adit.ts`: lettura estrazione ADIT (CDC 5569, esclusione per regola), mappa InvoiceDescription → voce, residui di altri mesi, tariffe = costo/quantità (SUPP65 = STR65, carenza in % sul costo ore).
- `src/domain/costi/std.ts`: ore per station dal parser Presenze (MAGG50/STR65/SUPP65 = domenica o festivo della station), trasferte > 4 h alla tariffa della data, voci non da tracking (festività, ferie godute, carenza, CTRB, altro, MOG).
- `src/domain/costi/controlli.ts`: ore lette vs riga Totali, celle trasferta a mano, tetto settimanale, Accordo di domenica (R4), giorni > 10 h, rapporti ore/ADIT (0,85–1,15) e mese/mese precedente (0,7–1,4).
- Pagine `/costi/fine-mese` (semaforo, Calcola costi, Salva stima STD) e `/costi/consuntivo` (import ADIT). I tracking si leggono dall'archivio locale del modulo Presenze.
- Golden settembre 2026: ore, teste, stima per station e totale 906.308,07 €, ADIT 0926 902.314,11 €, rapporti MAGG50 DER1 1,08 / DLZ2 0,92, STR30 DER1 0,71.

## Fase 3 — SIC, Excel, Teams
- `src/domain/costi/sic.ts`: un lavoratore SIC per riga (join CDL per CF, O↔0, CDL mancante = media del bucket nella station); "SIC lordo" come il file Stima v2 (CDL + trasferte + ore × tariffe STD) e "busta 27/M+1" (base CDL + istituti × 1,434 + assenze − ferie godute; dispatcher senza trasferta).
- `src/lib/costi/excelStima.ts`: Excel con pagina a formula (SUMIFS su DWH_Ore_STD, DWH_Ore_SIC, DWH_SIC, DWH_ADIT, Festivi), Parametri e Rettifiche; tabelle native.
- `src/domain/costi/teams.ts`: testo per Teams (tabella per station, i 3 avvisi più gravi).
- Golden settembre 2026: ore e teste SIC, join CDL (387 su 394, 1 corretto O/0, 7 senza CDL), SIC lordo per station = 1.521.066,62, saving 119.452,13, festività non godute 18.565,76; Excel ricalcolato da LibreOffice uguale; trasferta busta da tracking agosto DLO5 14.020,50 / DVN1 17.000,50 = paga reale.
- Differenze note con gli attesi del kit: "17 in anagrafica non tracciati (45.542 €)" conta anche il lavoratore col CF corretto O/0 (sono 16, 42.023 €, coerente con Σ CDL tracciati 1.214.287); i 26.992 € di trasferta sono su un sottoinsieme di 83 lavoratori; la busta DVN1/DLO5 viene da uno script non incluso (qui: DVN1 +0,5 %, DLO5 +7,8 % sulla paga reale).

## Fase 4 — consuntivo, riconciliazione, vademecum
- `src/domain/costi/payroll.ts`: "Costi del personale PS" (foglio det): CDC 5569, conti 6*, componente e istituto per riga (STR divisa FT/PT dal contratto dell'anagrafica), riclassifiche a somma zero (Cod1 = 6, tredicesime/liquidazioni) tenute ma non contate; station per nome dall'anagrafica.
- `src/domain/costi/riconciliazione.ts`: STD stima M vs ADIT M per station × voce con scomposizione del delta (tariffe, ore, trasferte, voci non da tracking, non modellate, residui); SIC stima M vs paga M+1 per station; coefficienti €/h dal payroll / ore del tracking del mese prima, media mobile 3 mesi.
- `/costi/consuntivo`: import ADIT e payroll riconosciuti dal contenuto, riconciliazione con colori ±5/±15 %, "Salva riconciliazione", "Aggiorna parametri" (prima/dopo, validità dal mese successivo).
- Vademecum `15-costi-fine-mese.md`.
- Golden: payroll 0926 = 1.209.420,66 €, 403 dipendenti, componenti e totali per station uguali a Station_SET, 7 non in anagrafica (13.468 €); riconciliazione STD settembre +0,4 %, ogni station entro ±1,2 %.
- Il coefficiente SIC_CARENZA_PCT non si ricalcola in automatico (in paga carenza/integrazione ≈ 63 % della trattenuta malattia, la spec dice 2,5 %: da confermare).
