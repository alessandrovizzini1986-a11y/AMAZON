# PROMPT — Stima costo STD (Stima_Costo_personale.xlsx) vs fattura Adecco (ADIT STD-SL, CDC 5569)

*Prompt ragionato, costruito dopo la lettura dei 9 estratti ADIT gen–set 2026 e dei 9 fogli `AMZ_<MESE>_26`. Da rieseguire ogni mese quando arriva l'estrazione ADIT del mese appena chiuso. Script di riferimento: `confronto_stima_adit.py` (input: cartella con `Stima_Costo_personale.xlsx` + `MMAA_Doc._emessi_ADIT_STD-SL_*.xlsx`; output: `Confronto_Stima_vs_ADIT_STD_<anno>.xlsx`).*

## 1. Domanda a cui rispondere
"Quanto costeranno i somministrati (STD) del mese appena chiuso, per station, e perché la stima si scosta dalla fattura?" La stima si fa alla chiusura dei tracking (giorno 1–5 del mese dopo); la fattura ADIT arriva ~5 settimane dopo. Il confronto non serve a "far tornare" il totale ma a imparare **per voce e per station** dove il modello sbaglia, così il mese successivo l'errore non si ripete.

## 2. Sorgenti e perimetro (vincolanti)
| Dato | Dove | Filtro |
|---|---|---|
| Stima | `Stima_Costo_personale.xlsx`, foglio `AMZ_<MESE>_26`, blocco station di 5 colonne (DER1 G–K, DER2 L–P, DLO2 Q–U, DLO4 V–Z, DLO5 AA–AE, DLZ2 AF–AJ, DVN1 AK–AO); righe 22–29 = ore × tariffa STD; riga 5 = TOT. COSTO STD = Σ(22:27) + Σ(28:29) | — |
| Fattura | `MMAA_Doc._emessi_ADIT_STD-SL_<data>.xlsx`, foglio `Estrazione …` (intestazione in riga 2) | `CDC = 5569`; escludere `Asurname = Sacchetti` + `Aname = Sara` (collaboratrice Milano, STATION multipla, non driver); costo = `NoTaxableIncome`; station = `STATION/PLANT/PV`; tenere anche il progetto misto `AMAZON/GLS` (sono driver DER1/DLO2/DLO5/DLZ2 fatturati sul 5569) |
| Residui | righe con `MeseCompetenza` ≠ mese fattura | separarle sempre: sono 0,1–1,4 % del totale e la stima non può prevederle |

Mappa `InvoiceDescription → voce modello`: Stipendio→STANDARD · Maggiorazione (Detassata/Detassate) 50%→MAGG50 · Supplementare 18%→SUPP18 · Straordinario 30%→STR30 · Straordinario 65% e Straordinario Detassato 65%→STR65 · Trasferta esente→TRASFERTA · S-FS/N-FS Festività, EXFS→FESTIVITA · FER/PERM/MPER→FERIE_PERM_GOD · C.MA/C.INF/Carenza/1INF→CARENZA · CTRB Decr. Dignità→CTRB_DIGNITA · INTEGRAZIONE MOG→INTEGR_MOG · Rivalutazione Ratei→RIVAL_RATEI · resto→ALTRO.

## 3. Cosa fare, nell'ordine
1. Caricare tutti gli ADIT disponibili in un'unica tabella piatta (`DWH_ADIT`), filtrare come sopra, aggiungere colonne `voce`, `Mese_fattura`, `Residuo`.
2. Dalla tabella ricavare le **tariffe effettive** per voce e mese (`=Σ costo / Σ quantità`): sono i Parametri del modello, non le tariffe digitate.
3. Leggere la stima per station × voce (ore e €) dal foglio del mese.
4. Confrontare **ore stima vs quantità ADIT** per station × voce (non i soli €): è qui che si vedono gli errori di trascrizione. Soglia alert: rapporto fuori 0,85–1,15 e |Δ€| > 2.000.
5. Scomporre il delta totale in: effetto tariffe · ore anomale (|Δ€| > 3.000) · ore scarti minori · trasferte anomale · trasferte scarti · voci non modellate · residui. La somma deve quadrare con il delta (±100 €).
6. Aggiornare i coefficienti delle voci non modellate (% sul costo ore) con la media mobile degli ultimi 3 mesi.
7. Chiudere con stress test STANDARD.

## 4. Diagnosi gen–set 2026 (riferimento: così si riconosce se il mese nuovo è "normale")
| Causa | € su 9 mesi | Segno | Riconoscibile da |
|---|---|---|---|
| Voci in fattura non presenti nel modello (festività 115 k, carenza malattia 78 k, ferie/permessi goduti 37 k, altro 15 k, CTRB dignità 7 k, MOG 3 k, rival. ratei 4 k) | **−259 k** (2–7 %/mese) | sempre a sfavore | Delta % negativo "di fondo" anche nei mesi puliti (mar, lug, set ≈ −2 %) |
| Ore trascritte male nel foglio (celle digitate riga 34–45) | **+142 k** netti (|somma| 360 k) | ± | Rapporto ore stima/ADIT ≈ 2 (file che sconfina su due mesi: DLO4 gen 8.141 h vs 3.448; DVN1 feb 6.553 vs 2.716) o ≈ 0,75 (settimane/lavoratori mancanti: DER1 gen/mag/giu) |
| Tariffe gen–feb vecchie (20,44/19,71/17,89/28,00 vs fatturate 20,86/20,11/18,25/28,56; trasferta gen fatturata 20,5/27,5 non 22,5/29,5) | −28 k (tariffe) +8 k (trasferta gen) | − | Delta anche a ore uguali |
| Trasferte: cella DLO2 giu con 130 gg digitati al posto della formula (fattura ≈ 650 gg) | −12 k | − | gg trasferta ≪ teste × 20 |
| MAGG50 che non conta le festività infrasettimanali (giu: 3.023 h stima vs 3.580 ADIT) e domeniche finite nella riga Accordo poi cancellate | −16 k giu, −8 k set | − | Ore MAGG50 sotto ADIT nei mesi con festivo |
| STR30/STR65 sotto fattura da giugno (STR30 222–531 h stima vs 518–703 ADIT) — ipotesi: ore Accordo 39-44 h fatturate come straordinario 30 % | −4/−8 k al mese | − | Da verificare con Erika |
| SUPP 65 % a 25,01: voce inesistente in fattura (tutto il 65 % è straordinario a 25,52) | ≈ 0 | — | Concettuale |
| Residui di mesi precedenti in fattura | 29 k | + in fattura | Non stimabili |

Mesi "puliti" (senza anomalie di ore) chiudono a **−2 / −4 %**: è il peso delle voci non modellate. Per questo il delta "sembra sempre sbagliato" anche quando le ore sono giuste.

## 5. Rimedio nel file (ordine di priorità, tutto a formula)
1. **Ore mai digitate**: nuova scheda `DWH_Ore` (station · popolazione · voce · ore tot · ore domenica+festivi) incollata dall'output del controllo tracking/sito; le celle 34–45 della pagina diventano `SUMIFS` su `DWH_Ore`. Accanto, riga di controllo "ore mese / ore mese-1" con alert fuori 0,7–1,4 e "teste tracking vs teste ADIT mese-1".
2. **Tariffe da ADIT**: scheda `Parametri` con `=SUMIFS(costo)/SUMIFS(quantità)` sul `DWH_ADIT` dell'ultimo mese disponibile (celle gialle solo per voci assenti quel mese). Eliminare la riga SUPP 65 % o farla puntare alla tariffa STR65.
3. **Blocco voci non modellate** sotto la riga 29, per station: festività = `n_festivi × coeff` (o Σ teste × ore contrattuali × 20,86), ferie/ROL/ExF godute × 4,63, carenza malattia (ore malattia primi 3 gg × 20,84), CTRB dignità 0,10 €/h, MOG dal controllo MOG, altro 0,2 %. Con i coefficienti storici il delta residuo scende da −3/−4 % a ≈ ±1 %.
4. **Scheda `Controllo_ADIT`** permanente nel file (= fogli `Delta_station`, `Dettaglio_voce`, `Tariffe_ADIT` del workbook di confronto): ogni mese si incolla l'estrazione nel `DWH_ADIT` e la riconciliazione per voce si aggiorna sola.
5. **Poka-yoke**: formattazione condizionale rossa su ogni cella della pagina che non è formula (`=NOT(ISFORMULA(cella))`), su gg trasferta > teste × 27, su ore station fuori ±30 % dal mese prima; etichetta A1 del foglio = nome mese (oggi su `AMZ_SEP_26` c'è "AGOSTO").

## 6. Numeri di controllo (per verificare che il rifacimento sia fedele)
Stima gen–set 6.504.121 € vs ADIT 6.644.085 € → Δ −139.965 € (−2,1 %). Scomposizione: tariffe −28.280 · ore anomale +142.425 · ore scarti −4.197 · trasferte anomale +12.581 · trasferte scarti −3.382 · voci non modellate −259.026 (quadra a −85 €). Teste ADIT con Stipendio set 2026: DER1 29, DER2 89, DLO2 67, DLO4 46, DLO5 62, DLZ2 33, DVN1 65. Tariffe fatturate stabili feb–set: 20,86 / 28,56 / 18,25 / 20,11 / 25,52; ferie godute 4,63 €/h; festività 20,86 €/h (S-FS) e 15,40 €/h (N-FS); CTRB 0,10 €/h.

## 7. Regole confermate il 3/11/2026 (valgono per la stima e per il sito)
- **Rotta annullata (Accordo art. 8): non applicare mai** — con l'assenteismo che abbiamo non si verifica.
- **Ore Accordo 39-44 h**: assorbite, non fatturate (verificato: DLZ2 e DVN1 set 2026, Stipendio ADIT = ore ordinarie tracking all'ora). Tetto di banda CCNL 11 quinquies: 43 h fino al 31/5/2026, **42 h dal 1/6/2026**, 41 h entro luglio 2027. Non chiedere conferme a Erika su questo. I file `*_inizio_43ore` sono solo rinominati male: nessun cambio da settembre.
- **Patroni per station** (festività pagate in fattura: S-FS se non lavorato, N-FS "festività non goduta" se lavorato o se cade di domenica): DER1 11/10 · DER2 29/9 · DLO2 2ª domenica di settembre · DLO4 3ª domenica di settembre · DLO5 2ª domenica di maggio · DLZ2 11/7 · DVN1 20/7. Più nazionali e 24/31 dicembre (art. 10). Foglio `Festivi` del modello.
- **Tariffe trasferta per data** (Accordo art. 5 e 22e): 20,50 dal 1/5/2025 · 22,50 dal 1/1/2026 · 23,50 dal 1/1/2027 · 24,00 dal 1/6/2027; domenica +7,00. Alert cambio tariffa a 60/30/7 giorni ad Alessandro e stagista.
- Progetto misto AMAZON/GLS in fattura: se ricompare va su GLS. Il gruppo di 10 PT 35 % su DER1 apr–giu 2026 (54 k) è un pasticcio DER1/GLS già noto: ignorare.
- Carenza malattia: la fattura non segue le ore di malattia del mese (set: 1.511 h di carenza da tracking vs 8,1 k€ fatturati, stabili 8 k/mese): usare il **coefficiente** carenza/costo ore del mese ADIT precedente (ago: 1,19 %), non le ore.
- DER1 gennaio: 22 driver DER2 fatturati su DER1 (43,6 k) — errore di station in fattura, non della stima.

## 8. Validazione v2 su settembre 2026 (file `Stima_AMZ_SEP_26_v2.xlsx`)
TOT COSTO STD v2 906.308 € vs fattura 902.314 € → **+0,4 %**; per station tra −1,1 % (DLZ2) e +1,2 % (DVN1). Il foglio originale chiudeva a −18.070 € (−2,0 %) con DLO4 +13,3 k e DER1 −7,3 k. Voci non da tracking stimate 32,9 k vs 28,6 k fatturate (festività 12,6 vs 11,1; ferie godute 6,1 vs 5,3; carenza 9,1 vs 8,1; CTRB 3,6 vs 1,0; altro 1,5 vs 2,3; MOG 0 vs 0,7). Residui altri mesi in fattura: 3,2 k (non stimabili).
