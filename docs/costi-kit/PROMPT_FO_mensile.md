# Costi F.O. mensili Amazon (CDC 5569): il sito compila la tabella per il responsabile

Prompt per Claude Code sul repository FleetDSP. Lavorare per step, con controlli rigorosi. Una PR per step, unita solo con CI verde.

## 0. Obiettivo
Ogni mese Alessandro compila un foglio `AMZ <Mmm> <AAAA>` del file `AMZ_Costi_F.O._2026.xlsx` e lo manda al responsabile: costi del progetto Amazon per station (DER1 … DVN1), con totale, fatturato stimato e margine.

1. Il sito deve produrre **lo stesso foglio**, con le stesse righe e colonne, già compilato dai dati che ha (o che gli si danno). Va copiato nel file F.O. così com'è.
2. Il sito deve confrontare la stima con il **consuntivo contabile** (`MM_AA_FO_PER_VALERIO.xlsx`, foglio Outsourcing, CDC 5569) quando arriva, per voce e per station.
3. Ogni numero deve dire **da dove viene**: modulo del sito, file, regola.

## 1. Fonti
| File / dato | Dove sta | Cosa dà |
|---|---|---|
| `AMZ_Costi_F.O._2026.xlsx`, fogli `AMZ Ago 2026` e `AMZ Set 2026` | esempio (gitignored) | struttura, formule e valori attesi (golden) |
| Transazioni Q8 del mese | sito: Telepass e carburante → Q8 (già elaborate) | carburante per DS, **imponibile** (colonna "Imp. intero no IVA", come il Recap) |
| Telepass del mese | sito: Telepass e carburante → Telepass | pedaggi, parcheggi, ZTL/Area C e canoni per DS |
| `TARGHE_ZTL_RIMINI_CESENA.xlsx` (foglio Sheet1: ZTL, TARGA, DATA RICHIESTA, DAL, AL, NOTE = €) | da caricare | ZTL Rimini/Cesena su **DER2** |
| Flotta: mezzi non dismessi con canone | sito (riconciliazione flotta del 04/11/2026) | noleggi per società e DS |
| Fatture noleggiatori (ALD YTD, Arval, Avis, Europcar) | `docs/flotta-kit` | controllo dei noleggi |
| Tracking SIC e STD del mese, anagrafica CDL (`DB_CDL_base_MMAA_AmazonGLS_BO.xlsx`, foglio `SIC Amazon TR`) | sito: Costi a fine mese | accantonamenti SIC, trasferte, costo STD |
| Stima del mese (fatturato + forecast) | sito: Fatture → Stima del mese | fatturato stimato |
| `MM_AA_FO_PER_VALERIO.xlsx`, foglio Outsourcing (Mese, Category code, Tipologia Costo, CDC, Zona, Costo Accantonato, Costo Effettivo, Fatturato) | da caricare | consuntivo per il confronto (solo CDC "5569 - …") |

I file con nomi, CF e importi stanno in `docs/costi-kit/esempi/fo/` (non va su git).

## 2. Righe del foglio e regole (colonne D…J = DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1)
| Riga | Voce | Regola | Fonte |
|---|---|---|---|
| 3 | Carburante | Σ imponibile Q8 delle carte della DS nel mese | Q8Run del mese (`totaliJson`). Set 2026: DER1 37.186,78 |
| 4 | Canone tessere Q8 | se presente in fattura Q8, altrimenti vuoto | — |
| 5 | Gabogas (metano) | solo DVN1, da fattura | manuale |
| 6–8 | Arval, Arval scaduti, Arval MT | Σ canone dei mezzi Arval attivi nel mese per DS | flotta + fattura Arval |
| 9–16 | Avis, Europcar, Noleggiare, VEM, Hertz, Autovia, ALD MT, ALD | Σ canone €/mese dei mezzi **ATTIVO/UFFICIO** della società e della DS, **pro-rata sui giorni** di presenza nel mese (ingressi/uscite dalla Lista Targhe). **Sostitutivi esclusi** (non si pagano) | flotta del sito; controllo con le fatture del mese (±5 %) |
| 18–37 | Parcheggi, lavaggi, AdBlue, officine (fornitori per DS) | da fatture fornitori; lista fornitori nel vademecum 17 | manuale (campo per DS) |
| 39–40 | Multe (tesoreria / 2026) | Σ importi del file Multe 2026 a carico azienda nel mese, per DS | manuale finché il modulo multe non è aggiornato |
| 41–52 | DPI, formazione, visite mediche | da fatture | manuale |
| 53 | Autostrade per l'Italia | Σ pedaggi Telepass del mese per DS (valore assoluto) | TelepassRun. Set 2026: DER1 4.954,52 |
| 54 | Parcheggi | Σ soste/parcheggi Telepass per DS | TelepassRun (colonne parcheggio / RMPP) |
| 55 | ZTL (Area C) | Area C Telepass per DS **+ ZTL Rimini/Cesena su DER2** = permessi con **DATA RICHIESTA nel mese** × importo (15,95 €) | file ZTL. Set 2026: 39 × 15,95 = 622,05; ott 2026: 38 → 606,10 |
| 56 | Canone Telepass | canoni dei dispositivi per DS | TelepassRun |
| 58–59 | Wind, Elmec | parametri fissi per DS (1.500; 119,90), con data di validità | Parametri del sito |
| 60 | Accantonamento straordinari + supplementari (SIC) | ore SIC del mese a **costo SIC**: straordinario FT/PT, supplementare, ore dom/festive, festività non godute × €/h SIC × moltiplicatore oneri (= istituti della busta senza trasferte). Fino a settembre 2026 si usavano le tariffe STD dell'agenzia (circa il doppio) | busta SIC del mese |
| 61 | Accantonamento ferie e permessi (SIC) | **saving preciso** per lavoratore: gg ferie × Saving FE + h ROL × costo rateo ROL/h + h ExF × costo rateo EXF/h, con il **CDL base del mese** (colonne "Saving FE", "Costo rateo ROL", "Costo rateo EXF" del DB CDL) | tracking SIC × anagrafica CDL. Set 2026 da riconciliare: sito 10.359,93, F.O. 10.068 (DER1) |
| 67 | PDR una tantum (+43 % costo azienda) | manuale | — |
| P58 | Busta SIC del mese | busta pagata nel mese M: payroll di M se caricato, altrimenti la stima SIC salvata di M−1 (busta del 27 calcolata sui tracking di M−1) | vedi §3 |
| P60 | TOT. COSTO SIC | `P58 − L60(M−1) + L61(M−1) + K60(M) − K61(M) + PDR`. **Niente CDL base né trasferte a parte**: la busta le contiene già | vedi §3 |
| P61 | TOT. COSTO STD | stima STD di competenza del mese (con MOG corretto) | stima STD salvata |
| P62–P68 | Mezzi, carburante, multe, autostrade, Wind+Elmec, danni, Edenred | somme delle righe sopra | formula |
| P71 | Fatturato stimato | stima del mese (fatturato + forecast) | sito |
| P72–P73, N79–R82 | ML, ML %, confronto con lo stesso mese dell'anno prima | formula | — |

## 3. Costo SIC: busta pagata nel mese ± accantonamenti
- La busta pagata nel mese **M** contiene: retribuzione, oneri, ratei 13ª/14ª, TFR **più** trasferte, straordinari, supplementari, festività del **mese M−1**, **meno** le ferie/ROL/ExF godute e le assenze (malattia pagata INPS, non retribuite) di M−1.
- Per questo `CDL base + trasferte` **non** è la busta: il CDL base dell'anagrafica è il costo pieno teorico (ratei ferie maturati compresi, nessuna ferie goduta, nessuna assenza), e sommandoci le trasferte e stornando gli accantonamenti si contano due volte straordinari e ferie. Settembre 2026: formula vecchia 1.465.745 (1.305.745 con la rettifica a mano −160.000) contro un consuntivo Valerio di 1.295.005 = CDL SIC pagato 1.204.260 + accantonamento 90.744,85.
- Formula: **costo SIC F.O. (M) = busta pagata in M − accantonamenti di M−1 + accantonamenti di M** (righe 60–61). È esattamente come Valerio registra il consuntivo (CDL SIC effettivo + ACCANTONAMENTO SIC).

### 3.1 Busta di M quando il payroll non c'è ancora (caso normale)
1. Il sito calcola la "busta del 27" sui tracking SIC di M−1 (CDL dell'ultima anagrafica + trasferte e istituti di M−1 a costo SIC + assenze − ferie godute) e la salva con "Salva stima SIC" del mese M−1. Quella è P58 del F.O. di M.
2. Precisione misurata: tracking di agosto 2026 → busta stimata 1.196.160 € contro payroll di settembre 1.209.421 € (−1,1 %); per DS tra −6,4 % (DLO4) e +5,8 % (DLO5); trasferte esatte all'euro su 5 DS su 7.
3. Quando si carica il payroll di M, il foglio usa il payroll (consuntivo).
4. Tracking DLO2/DLO4 che partono dal 27 del mese prima (agosto 2026: 27/07 → 31/08): il sito prende solo i giorni del mese.

## 4. Consuntivo (FO Valerio): confronto
- Si legge il foglio Outsourcing, solo CDC che inizia per "5569".
- Mappa per voce e per Zona (DS):

  | F.O. | Valerio |
  |---|---|
  | Carburante | CARBURANTE |
  | Noleggi | AUTOMEZZI |
  | Autostrade + parcheggi + ZTL | PEDAGGI |
  | Multe | MULTE FURGONI |
  | Costo SIC | CDL SIC + ACCANTONAMENTO SIC (+ STAFF a parte) |
  | Costo STD | INTERNAL TEMPS |
  | Wind | TELEFONICHE |
  | DPI, formazione, materiale, buoni pasto, danni | voci omonime |
  | Fatturato | RICAVO |

- Tabella stima / consuntivo / delta per voce e DS, con semaforo ±5 % e ±15 %. Lo storico dei delta serve a correggere i coefficienti.
- Golden settembre 2026, Internal Temps per DS, da confrontare con la stima STD del sito:

  | DS | Internal Temps | Stima STD sito |
  |---|---|---|
  | DER1 | 82.016,78 | 82.043,59 |
  | DER2 | 227.201,04 | 230.192,21 |
  | DLO2 | 138.593,90 | 140.528,90 |
  | DLO4 | 103.947,79 | 104.714,36 |
  | DLO5 | 112.562,74 | 113.367,55 |
  | DLZ2 | 71.274,88 | 71.322,26 |
  | DVN1 | 161.340,14 | 164.139,21 |

- Il carburante del consuntivo è più alto del F.O. di 100–400 € per DS (es. DER1 37.286,78 contro 37.186,78): da capire se è il canone delle tessere.

## 5. Cosa costruire (step)
1. **Dominio** `src/domain/costi/fo.ts`, logica pura e testata, con le regole del §2:
   - righe per DS dalle fonti;
   - noleggi pro-rata;
   - ZTL per data di richiesta;
   - saving ferie/permessi preciso;
   - formula P60.
   Test golden su settembre 2026 contro i valori del foglio `AMZ Set 2026`: dove differisce, spiegare la differenza.
2. **Lettori**: file ZTL; FO Valerio (Outsourcing, filtro 5569); estensione del Telepass per separare pedaggi, parcheggi, Area C e canoni, se il run non li tiene già separati.
3. **Pagina `/costi/fo`**, con il percorso guidato:
   - semaforo delle fonti del mese (Q8, Telepass, tracking SIC/STD, stima SIC del mese prima, ZTL, flotta, stima del mese);
   - campi manuali per le voci senza fonte (fornitori, multe, PDR, DPI), salvati sul sito per mese e DS;
   - **"Scarica foglio AMZ <Mmm> <AAAA>"** con la stessa struttura del file F.O. (righe 2–82, colonne B–T, formule del file, celle gialle = dati dal sito);
   - confronto con il consuntivo quando si carica il FO Valerio.
4. **Vademecum**: pagina "Costi F.O. mensili": cosa si compila, da dove viene ogni riga, calendario (quando arrivano Q8, Telepass, fatture, FO Valerio).

## 6. Regole
- Nessun dato personale nel repository (nomi, CF): solo totali per DS nei test e nei documenti.
- Solo CDC 5569 (Amazon). GLS (5565) e gli altri progetti restano fuori.
- Sostitutivi mai a costo. MOG solo dal controllo MOG (con lo stato SU GLS).
- Prima di ogni PR: tsc, test (golden settembre), build, audit mobile, prova nel browser con i file di ottobre.
- A fine step: tabella con controlli, URL da provare e cosa manca.
