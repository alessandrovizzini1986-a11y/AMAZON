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

## Controllo MOG (addendum `docs/costi-kit/ADDENDUM_claude_code_modulo_MOG.md`)
- `src/domain/mog/mog.ts`: contratti dal file `ADECCO_PS_AAAA_MM.xlsx` (foglio PS, intestazione in riga 3, A3 = chiusura payroll), Sito → station, match per CF e poi per nome (token, ordine indifferente). MOG del mese pro-rata sui giorni di contratto; aumenti = % × 169 h dalla data di validità.
- Regole Adecco (lista integrazioni MOG ottobre 2026, CDC 1528, riprodotta al centesimo per i 13 lavoratori presenti nel file MOG): MOG del mese = % × 169 / 26 × giorni lun–sab del contratto nel mese (max 26); computo = ore lavorate + assenze retribuite + non retribuite + malattia/infortunio a ore MOG per ogni giorno lun–sab del periodo di malattia; contratto attivo anche solo parte del mese e nessuna ora = ZERO ORE pro-rata. Stati: OK, SOTTO MOG, A RISCHIO (proiezione < MOG − 4 h), ZERO ORE, NON IN FILE MOG, NON NEL TRACKING (MOG del mese 0), SU GLS.
- Tabelle `MogContratto`, `MogVariazione`, `MogEsito` (migrazione `20261105120000_mog`).
- `/costi/parametri#mog`: import del file con anteprima (teste per sito, chiusura payroll, % cambiate rispetto alla versione prima); aumenti dal PDF `Mog_Cambio_Lavoratore…` + Excel `Aumenti MOG PS` (`src/domain/mog/aumenti.ts`, uniti per n. contratto, con avvisi) o a mano. Chi ha già avuto l'aumento esce dai consolidamenti previsti. Avviso in testa al modulo se il file ha più di 40 giorni.
- `/presenze/settimanale`: blocco MOG con i lavoratori a rischio e la riga per Teams. `/presenze/fine-mese`: tabella completa, Excel `Controllo_MOG_<DS>_<mese>.xlsx`, "Salva esiti MOG".
- `/costi/fine-mese`: la riga "Integrazione MOG" della stima STD = integrazione MOG **fatturata da Adecco nell'ADIT** del mese tariffe, per station (Adecco fattura tutto in ADIT: ad agosto e settembre 2026 58 € e 745 €). Il controllo MOG (SOTTO MOG + ZERO ORE) resta un controllo e non entra nel costo STD: a settembre avrebbe aggiunto 15.198 € non fatturati.
- CTRB Decr. Dignità = € CTRB / ore fatturate dell'ADIT del mese tariffe (settembre 2026: 0,0283 €/h; il parametro STD_CTRB_H 0,10 €/h solo senza ADIT). Verifica settembre: stima del sito senza MOG 903.123 € contro ADIT 902.415 € (+0,08 %).
- Foglio Stima_Costo_personale: riga 32 "ALTRE VOCI ADIT" per station (festività, ferie godute, carenza, CTRB, altro, MOG ADIT); TOT. COSTO STD (B5) = F22 + F28 + F32 = stima STD del sito = P61 del foglio Costi F.O. Ottobre 2026: 1.086.013 € (prima 1.065.643 sul foglio e 1.114.131 sul F.O.).
- Sola malattia tutto il mese: nessuna integrazione (la malattia vale il MOG di ogni giorno; il lavoratore DLO4 a 59 % in malattia non è nella lista Adecco). Sostituisce la regola del 04/11/2026.
- Consolidamenti previsti (colonna "supera il 20 % del MOG" = SI, nuova % e nuovo monte ore del file): tabella per mese e station in Parametri, elenco dei prossimi 3 mesi nel blocco MOG di Presenze. Non cambiano il MOG del mese.
- Golden DLO4 ottobre 2026 con le regole Adecco: 32 OK, 6 SOTTO MOG (66,9 h = 1.395,54 €), 0 ZERO ORE, 21 non in file; con gli aumenti 89,2 h (i due aumenti a 72 h: 12,3 e 10,0 h, come nella lista Adecco).

## Foglio per Stima_Costo_personale (novembre 2026)
- `/costi/fine-mese` → "Foglio per Stima_Costo_personale": scarica `AMZ_<MMM>_<AA>` con la struttura del file di Alessandro (blocco di 5 colonne per station da G), già compilato. Celle gialle = dati dal sito; il resto sono formule; Excel ricalcola all'apertura.
  - SIC: teste e costo medio per contratto (CTI FT, CTI PT, CTI PT 32h, DISPATCHER) dall'anagrafica CDL; ore e trasferte dal tracking SIC.
  - STD: Standard **totale** (ordinarie + domeniche/festivi) in riga 34, MAGG in riga 36 (il foglio fa la differenza: niente doppia sottrazione), straordinari/supplementari totale e 65%, trasferte totali e domenicali, teste FT/PT/MOG dal contratto del tracking.
  - Tariffe in colonna D dall'ADIT del mese prima e trasferta alla data. Rotte e MOG non compilati.
  - Correzioni rispetto al modello di ottobre 2026: riga 2 sul proprio blocco (prima sfasata di una station), DER2 inclusa in F6/F43/F45/CORSO, struttura degli straordinari STD uguale per tutte le station.
  - Verifica (ottobre 2026, LibreOffice): per ogni station il costo SIC del foglio = "SIC lordo" del sito e il costo STD = ore × tariffe + trasferte del sito (al centesimo, salvo arrotondamento del costo medio).
- L'Excel della stima ("Excel") ha la pagina rinominata `STIMA_SITO_<MMM>_<AA>` (struttura diversa) e l'integrazione MOG per station uguale a quella a schermo: prima l'Excel ricalcolato usava il parametro STD_MOG / 7 (= 0), da qui la differenza schermo/Excel.

## Foglio Costi F.O. (novembre 2026)
Prompt: `docs/costi-kit/PROMPT_FO_mensile.md`. In `/costi/fine-mese`, dopo "Calcola costi": pulsante "Foglio AMZ <Mmm> <AAAA> (Costi F.O.)" con la struttura del file AMZ_Costi_F.O.
- Carburante = Q8 imponibile per DS (elaborazione del mese); Autostrade = Telepass per DS; ZTL Rimini/Cesena su DER2 = permessi con data di richiesta nel mese (file TARGHE_ZTL caricato in pagina; set 2026 622,05 = F.O., ott 2026 606,10).
- Noleggi per società e DS = canone €/mese della flotta pro-rata sui giorni (sostitutivi esclusi, dismessi solo con data di fine); riga 17 nuova "Altri noleggi"; P62 = SUM(D6:J17).
- Righe 60–61 = istituti SIC del mese a costo SIC (€/h SIC × oneri, trasferte escluse) e saving ferie/ROL/ExF; P58 = **busta SIC pagata nel mese** (payroll del mese se caricato, altrimenti la stima SIC salvata del mese prima); P60 = P58 − accantonamenti del mese prima + accantonamenti del mese + PDR (niente CDL base né trasferte a parte: sono già nella busta); P61 = stima STD; P71 = stima del mese (fatture + forecast). Sotto (righe 78+) la tabellina "Busta SIC del mese (P58): da cosa nasce" per DS: CDL, trasferte, straordinari, festività, malattia, permessi, ferie godute (dalla stima SIC salvata; dal payroll per componente quando c'è), con il controllo Totale − P58 = 0.
- Stima del CDL con l'anagrafica precedente: settembre 2026 stimato con il CDL di giugno → errore per DS tra −0,9 % e +0,8 %, totale −0,05 % (672 € su 1,23 M).
- Voci senza fonte (fornitori, multe, DPI, PDR, danni) restano vuote da compilare.
