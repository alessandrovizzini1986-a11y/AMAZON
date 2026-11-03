# Modulo "Costi del personale a fine mese" per il sito (Next.js 15 / Vercel / Neon)

Terzo modulo, dopo "Presenze Amazon DSP" e "Telepass e carburante". Stesse scelte: parsing e calcolo nel browser (ExcelJS), al server solo anagrafiche, parametri e righe di risultato; nessun file originale salvato; Excel generati nel browser con tabelle native stile standard. Kit allegato `modulo_costi_kit.zip` (scompattalo tu in `docs/costi-kit/`): script Python di riferimento validati (`parse_trk.py`, `build_v2.py`, `confronto_stima_adit.py`), input reali (tracking SIC+STD settembre 2026, ADIT agosto e settembre, anagrafica CDL 06/2026, Costi del personale PS 09/2026), output attesi (`Stima_AMZ_SEP_26_v2.xlsx`, `Confronto_Stima_vs_ADIT_STD_2026.xlsx`, `Analisi_Costi_Personale_SIC_2026.xlsx`) e i prompt di regole del progetto.

## 0. Obiettivo in una frase
Quando a fine mese la stagista ha caricato i 14 tracking (7 SIC + 7 STD) e i Zucchetti del mese M, il sito deve produrre **da solo**, per station e totale: (a) il **costo STD di competenza M** (quello che Adecco fatturerà fra 5 settimane); (b) il **costo SIC della busta del 27 di M+1** (base di M+1 + istituti di M, perché Professional Solutions paga la base del mese in corso e gli istituti con un mese di ritardo); (c) la **riconciliazione** con i consuntivi quando arrivano (fattura ADIT per gli STD, file "Costi del personale PS" per i SIC), per voce e per station, così ogni mese il modello si ritara da solo.

## 1. Il timing (regola fondamentale, verificata sui dati)
| Popolazione | Cosa paga il mese M | Verificato come |
|---|---|---|
| **STD (Adecco)** | fattura ADIT di competenza M: ore e trasferte di M (tracking M) + voci non da tracking | 9 fatture gen–set 2026 vs tracking: ore Stipendio = ore ordinarie tracking all'ora nei mesi puliti |
| **SIC (PS, cedolino 27/M)** | **base di M** (RLM + EDR da anagrafica, meno assenze non retribuite di **M−1**) + **istituti di M−1**: trasferte, straordinari, supplementari, maggiorazione domenicale, festività non godute, carenza/integrazione malattia, trattenuta malattia, ferie/ROL/ExF godute | paga SET vs tracking AGO (DLO5+DVN1, 83 lavoratori): trasferta 26.992 € attesi = 26.992 € pagati (corr 0,998); straordinario corr 0,997; supplementare 0,998; malattia −0,92; stesso mese corr 0,19–0,57 |
Quindi a fine mese M, con il tracking M chiuso, il sito conosce **tutti** gli istituti che entreranno nella busta del 27/M+1: il SIC è prevedibile quasi esattamente, lo STD a ±1 %.

## 2. Input e dove vivono
| Input | Quando | Come si riconosce (mai dal nome) | Dove va |
|---|---|---|---|
| Tracking SIC/STD × 7 DS | fine mese (già caricati nel modulo Presenze) | regole del modulo Presenze (`Tipo` in G/H, giorni, blocchi) — **riusare il parser esistente**, aggiungendo la lettura di FERIE/ROL/ExF/MALATTIA/INFORTUNIO per giorno | `TrackingGiorno` (già esiste: aggiungere le voci assenza) |
| Zucchetti | fine mese | modulo Presenze | solo per il semaforo "mese chiuso" |
| **Anagrafica CDL** `DB_CDL_base_MMAA_AmazonGLS_BO.xlsx`, foglio `SIC Amazon TR` (intestazione riga 2) | quando arriva (oggi 06/2026) | colonne `CODICE FISCALE`, `COGNOME`, `NOME`, `CONTRATTO`, `% PT`, `h Settim.`, `GG LAVORATIVI`, `Tipologia PT`, `PLANT/STATION/PV`, `RLM`, `CDL`, `Saving FE` (€/gg), `Saving ROL` (€/h), `Saving EXF` (€/h), `Costo festività (Non goduta)` (€/gg), `Strao a forfait` | tabella `AnagraficaCDL` **versionata per mese** (ogni upload = nuova versione; la stima usa l'ultima disponibile e scrive quale) |
| **ADIT** `MMAA_Doc._emessi_ADIT_STD-SL_*.xlsx`, foglio che inizia con `Estrazione` (intestazione riga 2) | ~5 settimane dopo M | colonne `MeseCompetenza`, `CDC`, `STATION/PLANT/PV`, `CodFiscale`, `Asurname`, `Aname`, `InvoiceDescription`, `Quantity`, `NoTaxableIncome` | `AditRiga` (filtro **CDC = 5569**, escludere Sacchetti Sara; residui `MeseCompetenza ≠ mese` marcati) |
| **Costi del personale PS** `Costi_del_Personale_PS_MMAA_*.xlsx`, foglio `det` (intestazione riga 2) | dopo il 27 di ogni mese | colonne `Matr`, `Dipe`, `CDC`, `Cod1`, `Cod2`, `Descrizione`, `Conto1`, `IMPORTO` | `PayrollRiga` (filtro **CDC = 5569**, conti `6*`; righe `Cod1 = 6` sono riclassifiche a somma zero: tenerle ma non contarle) |
| Festivi | tabella fissa + patroni | — | `Festivo` (data, descrizione, station o TUTTE) |
| Tariffe per data | tabella fissa | — | `Tariffa` (voce, valida_dal, valore) |

## 3. Regole (vincolanti; dove in conflitto con i moduli precedenti prevalgono queste)
**Comuni**
- Domenica + festivi = domeniche, festività nazionali (1/1, 6/1, Pasquetta, 25/4, 1/5, 2/6, 15/8, 1/11, 8/12, 25/12, 26/12), 24/12 e 31/12 (semifestivi, art. 10 Accordo) e il **patrono della station**: DER1 11/10 · DER2 29/9 · DLO2 2ª domenica di settembre · DLO4 3ª domenica di settembre · DLO5 2ª domenica di maggio · DLZ2 11/7 · DVN1 20/7. Mai il sabato.
- Trasferta: giorno con ore lavorate (Standard+Straord+Suppl+Accordo) **> 4**; tariffa per data: 20,50 dal 1/5/2025, **22,50 dal 1/1/2026**, 23,50 dal 1/1/2027, 24,00 dal 1/6/2027; domenica = feriale + 7,00. **Alert cambio tariffa a 60/30/7 giorni** (email/notifica ad Alessandro e stagista) e aggiornamento automatico del calcolo alla data.
- **Dispatcher: nessuna trasferta** (in busta è 0 anche dove il tracking la segna: DER1/DER2/DLZ2 la mettono, DLO5/DVN1 no). Esporre i gg come informazione.
- Ore **Accordo 39-44 h**: esposte, **mai valorizzate** (assorbite; Adecco non le fattura: DLZ2/DVN1 set 2026 verificati). Tetto settimanale CCNL 11 quinquies: 43 h fino al 31/5/2026, **42 h dal 1/6/2026**, 41 h entro luglio 2027 → alert se le ore ordinarie+Accordo di una settimana superano il tetto.
- R4 (domenica in riga Accordo → alert) **solo STD**. Regola "rotta annullata" (art. 8): **non applicare mai**.
- Malattia/infortunio battono il lavorato (R1); > 10 h/giorno alert (R2); > 24 h cella anomala (R3).

**STD (competenza M)**
- Ore per voce per station dal tracking: Standard tot e quota dom+festivi (= MAGG50), Straordinario tot e quota dom (= STR65), Supplementare tot e quota dom (= SUPP65, tariffa STR65), trasferta gg feriali/domenica, Ferie+ROL+ExF ore, teste.
- Tariffe = **costo/quantità dell'ultimo ADIT disponibile** per voce (Stipendio→Standard, Maggiorazione*→MAGG50, Supplementare 18%→SUPP18, Straordinario 30%→STR30, Straordinario (Detassato) 65%→STR65, Festività (S-FS/N-FS/EXFS)→FESTIVITA €/h, FER/PERM/MPER→FERIE_PERM_GOD €/h, Carenza→% su costo ore, CTRB Decr. Dignità→0,10 €/h, ALTRO→0,2 %). Set 2026: 20,86 / 28,56 / 18,25 / 20,11 / 25,52; festività 19,11; ferie godute 4,63; carenza 1,19 %.
- Costo STD station = Σ ore × tariffa + trasferte + **voci non da tracking**: festività = (ore Standard / 26) × n. festivi del mese della station × tariffa festività; ferie/ROL/ExF godute × 4,63; carenza % × costo ore; CTRB; altro; integrazione MOG (dal controllo MOG, default 0).
- Controlli da mostrare: ore stima / ore ADIT ultimo mese per voce (fuori 0,85–1,15 = rosso), teste tracking / teste ADIT, ore mese / ore mese−1 (fuori 0,7–1,4 = rosso), celle trasferta scritte a mano.

**SIC (cassa 27/M+1)**
Per ogni lavoratore SIC del tracking M, join con `AnagraficaCDL` per CF (normalizzare: maiuscolo, trim; se non trova, provare O↔0 nell'ultimo carattere; se ancora niente, media del bucket contrattuale nella station e flag "CDL stimato"):
- `base` = `CDL` dell'anagrafica (costo pieno mensile a presenza piena: retribuzione, oneri, ratei 13ª/14ª/ferie maturati, TFR).
- `istituti M` = trasferta gg × tariffa (esente, moltiplicatore 1,00) + ore straordinario × 17,90 (FT) / 16,10 (PT) + ore supplementare × 14,10 + ore lavorate dom/festivo × 4,60 + festività non godute (gg × `Costo festività (Non goduta)` se festivo lavorato o cadente di domenica) ; i lordi × **1,434** (oneri 36,0 % + TFR 7,4 %).
- `assenze M` = ore malattia × (−9,50) × 1,434 + carenza/integrazione (+2,5 % del totale malattia) ; infortunio idem; permessi non retribuiti/assenze ingiustificate × costo orario base × 1,434 (negativo).
- `ferie godute M` = gg ferie × `Saving FE` + h ROL × `Saving ROL` + h ExF × `Saving EXF` (negativo: il CDL contiene il maturato).
- **Costo SIC previsto busta 27/M+1** = Σ (base + istituti + assenze + ferie godute). Validazione settembre (base 06/2026 + istituti agosto): DVN1 −2,8 %, DLO5 −8,1 % rispetto alla paga reale; il residuo è nelle assenze diverse dalla malattia (104, maternità, sospensioni) che si ritarano dal consuntivo.
- Tutti i coefficienti (1,434; 17,90; 16,10; 14,10; 4,60; −9,50; 2,5 %) stanno in `Parametro` con data di validità e vengono **ricalcolati** ad ogni import di `Costi del personale PS`: €/h = importo voce / ore tracking del mese precedente, per bucket contrattuale, media mobile 3 mesi.

**Riconciliazione (quando arriva il consuntivo)**
- STD: per station × voce, ore stima vs quantità ADIT, € stima vs NoTaxableIncome; delta scomposto in tariffe / ore anomale / ore scarti / trasferte / voci non modellate / residui altri mesi (come in `Confronto_Stima_vs_ADIT_STD_2026.xlsx`, foglio Sintesi).
- SIC: per lavoratore, voce payroll vs istituto tracking M−1 (trasferta, straordinario 130/150/165, lav. suppl. 118/165, maggiorazione 50 %, festività non goduta, assenza malattia, valore goduto ferie); per station, componenti (BASE, ASSENZE, TRASFERTA, STR_SUPP_MAGG, FESTIVITA, CARENZA_INTEGR, ONERI, RATEI 13/14, RATEI FERIE, TFR) come nel foglio `Station_SET` dell'analisi.
- Mappa `Descrizione payroll → istituto`: `Indennità di trasferta_art 11q` e `Ind. di trasferta art.11quinqu` → TRASFERTA (la seconda è la quota domenicale/aggiuntiva; `_GLS` → GLS, escludere); `Straordinario 130%/150%/165%` → STR; `Lav. suppl. 118%` / `Lavoro supplem. 165%` → SUPP; `Maggiorazione 50%` → MAGG; `Festivita' non goduta*` → FESTIVITA; `Carenza malattia*`, `Integr.malattia`, `Carenza/Integrazione infortunio` → CARENZA_INTEGR; `Assenza per malattia/infortunio/permesso L.104/maternità`, `Permessi non retr.`, `Sospensione*`, `Sciopero` → ASSENZE; `Retribuzione`, `E.d.r. ccnl` → BASE; `Cod2 ∈ {CONTRIBUTI, INAIL, RECUPERI, DETTCTB}` → ONERI; `R_MENSILITA` → RATEI_13_14; `R_FERIE` → RATEI_FERIE; `Cod2 = TFR` e voci `TFR a …`/`*Vers.F.Tesor.` → TFR; `Una tantum`, `premio variabile`, `Bonus` → UNA_TANTUM (fuori modello).
- Station del dipendente payroll = `PLANT/STATION/PV` dell'anagrafica per nome normalizzato (cognome+nome, ordine indifferente); chi manca → "non in anagrafica" (set 2026: 7 persone, 13,5 k€).

## 4. Pagine (sezione `src/app/(app)/costi/`, menu "Costi del personale")
1. **`/costi/parametri`** — tabelle `Tariffa` (trasferta per data, con prossimo cambio e alert), `Parametro` (coefficienti SIC e STD con storico), `Festivo`, import `AnagraficaCDL` (drag & drop, anteprima: teste per station, CDL totale = 1.256.309,94 per 06/2026, differenze con la versione precedente).
2. **`/costi/fine-mese`** — scelta mese M; semaforo prerequisiti (14 tracking presenti e quadrati con la riga Totali, Zucchetti controllato, anagrafica CDL ≤ 3 mesi, ADIT di M−1 presente); pulsante **"Calcola costi"** → due tabelle per station + totale: *STD competenza M* (ore per voce, €, voci non da tracking, teste) e *SIC busta 27/M+1* (teste, base CDL, trasferte, istituti, assenze, ferie godute, totale, di cui CDL stimati); blocco controlli (rapporti ore vs ADIT, teste, ore vs mese−1, Accordo, dispatcher trasferta); pulsanti **"Excel"** (struttura di `Stima_AMZ_SEP_26_v2.xlsx`: pagina + Rettifiche + Parametri + DWH_Ore_STD + DWH_Ore_SIC + DWH_SIC + DWH_ADIT + Festivi, tutto a formula SUMIFS sui DWH, tabelle native) e **"Testo per Teams"** (una tabella per station con i totali e i 3 alert principali). "Salva stima" → `StimaCosti` (mese, versione anagrafica/parametri usata, righe per station × voce).
3. **`/costi/consuntivo`** — drag & drop ADIT e Costi del personale PS → riconoscimento dal contenuto, mese dal `MeseCompetenza`/dal nome colonna `Somma di IMPORTO` del foglio `mac`; riconciliazione con la stima salvata del mese corrispondente (ADIT M ↔ stima STD M; payroll M+1 ↔ stima SIC M); tabella delta per station × voce con colori (±5 % verde, ±15 % giallo, oltre rosso); pulsante "Aggiorna parametri" che ricalcola tariffe e coefficienti e li salva con validità dal mese successivo (mostrando prima/dopo).
4. Indice **`/costi`**: griglia mesi × (stima STD, stima SIC, ADIT ricevuto, payroll ricevuto, delta %).

## 5. Modello dati (Prisma, aggiunte)
`AnagraficaCDL(id, meseVersione, cf, cognome, nome, station, contratto, pctPt, hSettim, ggLavorativi, tipologiaPt, rlm, cdl, savingFeGg, savingRolH, savingExfH, costoFestNonGodutaGg, straoForfait, caricatoIl, caricatoDa)` · `Tariffa(voce, validaDal, valore, fonte)` · `Parametro(chiave, validaDal, valore, fonte, note)` · `Festivo(data, descrizione, station)` · `AditRiga(meseFattura, meseCompetenza, station, cf, cognome, nome, voceAdit, voce, quantita, costo, residuo)` · `PayrollRiga(mesePaga, matr, dipe, station, cod1, cod2, descrizione, conto, importo, componente, istituto)` · `StimaCosti(id, mese, popolazione, station, voce, quantita, tariffa, importo, versioneAnagrafica, versioneParametri, creataIl)` · `Riconciliazione(id, mese, popolazione, station, voce, stima, consuntivo, delta, nota)`.

## 6. Test di accettazione (golden, kit `esempi/` → `attesi/`)
| Test | Input | Atteso |
|---|---|---|
| Parser STD set | 7 tracking STD settembre | ore lavoro per DS = riga Totali del file: DER1 3.409,2 · DER2 8.884,6 · DLO2 5.473,3 · DLO4 4.060,9 (solo colonne 1–30/9) · DLO5 4.558,0 · DLZ2 2.971,9 · DVN1 6.612,5; teste 33/90/68/49/62/36/66 |
| Parser SIC set | 7 tracking SIC settembre (DLZ2 nel foglio "08.26"!) | ore 6.278,0 / 4.424,0 / 10.092,4 / 6.570,3 / 5.937,5 / 7.529,0 / 6.157,0; teste 51/43/89/52/49/59/51 |
| Join CDL | tracking SIC set × anagrafica 06/2026 | 386 CF trovati su 394, 1 corretto O/0 (Fiasconaro), 7 senza CDL, 17 in anagrafica non tracciati (45.542 €); Σ CDL tracciati 1.214.287 |
| STD competenza set | sopra + ADIT 0826 per tariffe | per station 82.044 / 230.192 / 140.529 / 104.714 / 113.368 / 71.322 / 164.139 = **906.308**; vs ADIT 0926 **902.314** (+0,4 %), ogni station entro ±1,2 % |
| STD ore vs ADIT set | — | rapporti Standard 1,00 su tutte; MAGG50 DER1 1,08 / DLZ2 0,92; STR30 DER1 0,71 |
| SIC lordo set | DWH_SIC | per station 194.398 / 157.105 / 345.777 / 202.045 / 189.225 / 234.450 / 198.067 = 1.521.067; saving ratei goduti 119.452; festività non godute potenziali 18.566 |
| SIC busta set (base + istituti agosto) | anagrafica 06/26 + tracking AGO DLO5/DVN1 (fogli multi-mese nel kit) | DVN1 170.319 vs payroll 175.207 (−2,8 %); DLO5 135.839 vs 147.759 (−8,1 %); trasferta AGO→SET 26.992 = 26.992 |
| Import payroll 0926 | `Costi_del_Personale_PS_0926_AMAZONGLS.xlsx` | CDC 5569: 1.209.421 € (conti 6*), 403 dipendenti, componenti: BASE 659.320 · ASSENZE −67.272 · TRASFERTA 109.405 · STR_SUPP_MAGG 82.267 · FESTIVITA 33.728 · CARENZA_INTEGR 23.625 · ONERI 265.004 · RATEI_13_14 145.106 · RATEI_FERIE −112.508 · TFR 65.099 · INDENNITA_FISSE 4.400 |
| Import ADIT 0926 | file nel kit | CDC 5569 ex Sacchetti: 902.314 €; teste Stipendio 29/89/67/46/62/33/65; residui altri mesi 3.196 |

## 7. Vademecum e varie
- Nuova pagina `15-costi-fine-mese.md`: cosa fare il giorno di chiusura (verificare semaforo, calcolare, leggere i controlli rossi, mandare il testo in Teams, scaricare l'Excel), cosa fare quando arrivano ADIT e Costi del personale (trascinarli in Consuntivo, leggere i delta, premere "Aggiorna parametri" solo se Alessandro conferma), quando aggiornare l'anagrafica CDL (ogni volta che HR la manda; il sito segnala se ha più di 3 mesi).
- Permessi `costi.view`/`costi.run`/`costi.parametri` per ADMIN e CONTROLLO.
- Nessuna chiamata esterna; i file originali non si salvano; i dati per lavoratore restano nel DB del sito.
- Procedi senza attendere conferme: 4 PR (parametri+anagrafica; fine mese STD; fine mese SIC + Excel/Teams; consuntivo+riconciliazione+vademecum). A fine PR riporta in tabella: test golden passati, URL da provare, cosa manca.
