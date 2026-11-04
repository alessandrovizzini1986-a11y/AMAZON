# Aggiornare targhe attive e tariffe della flotta (Lista Targhe + fatture noleggiatori)

Prompt per Claude Code sul repository FleetDSP. Si lavora per step, con controlli rigorosi. Alla fine si fa un **doppio controllo** indipendente prima e dopo la scrittura sul sito.

## 0. Obiettivo
1. **Targhe attive**: il sito deve avere esattamente le targhe attive, sostitutive e ad uso ufficio della **Lista Targhe** (foglio `Attivi`), con station, società, tipo contratto, N° RA e date giuste. Chi è uscito diventa DISMESSO, ma solo se lo conferma il foglio `Cessati`.
2. **Tariffe**:
   - il canone €/mese di ogni mezzo deve essere quello **fatturato**;
   - se manca la fattura, vale la tariffa della Lista;
   - i **listini** dei noleggiatori (offerte e rinnovi) devono essere consultabili sul sito, con la validità.
3. **Anomalie da recuperare**: targhe fatturate ma non più in flotta (riconsegnate, cessate), canoni diversi tra Lista e fattura, mezzi attivi senza tariffa.
4. **Vademecum stagista**: la gestione mezzi dal passaggio di consegne di Thomas: attività, periodicità, contatti, portali, officine e note chiave. **Senza password.**

## 1. Fonti (04/11/2026)
| File | Cosa contiene | Uso |
|---|---|---|
| `Lista_Targhe_10.02.21.xlsx` | foglio `Attivi` (768 righe, aggiornato al 04/11/2026), `Cessati` (storico, 4.112 righe), `Sostitutivi`, `Tariffe`, pivot | **fonte di verità** su chi è attivo, dove e con che contratto |
| `ALD___YTD_2026.xlsx` | fatture Ayvens/ALD gennaio–ottobre 2026, una riga per targa e voce (CANONE, DANNI, CONG. KM, …), CDC e progetto | canone reale; targhe ancora fatturate |
| `ARVAL___OTTOBRE_2026.xlsx` | fatture Arval di ottobre: canone di novembre, carburante, bollo… anche di altri progetti Adecco | canone reale; filtro per targhe nostre |
| `AVIS_BUDGET__YTD_2026.xlsx` | fatture Avis/Amicoblu 2026, targa nella colonna ANNOTAZIONI | canone reale |
| `EUROPCAR__SETTEMBRE_2026.xlsx` | fatture Europcar di settembre: contratto, giorni fatturati, noleggio base | canone a 30 giorni = base / giorni × 30 |
| `Speciale_tariffa_vans_Adecco_picco_2025.pdf` | listino Europcar SUPERFLEX TOP (validità **31/03/2026**: scaduto) | listino |
| `Rinnovo_2026_PROFESSIONAL_SOLUTIONS_SRL…pdf` | listino Amicoblu (Avis) furgoni del 12/02/2026, gruppi J…CX, tariffa mese 28–30 gg | listino |
| `AVIS_ELETTRICO_nuova_offerta…pdf` | offerta Amicoblu furgoni elettrici (gruppo EAE) del 04/02/2026 | listino |
| `Passaggio_Consegne_Mezzi_Thomas.xlsx` | attività, stazioni, noleggiatori, tariffe €/mese per categoria, officine, portali, multe, note | vademecum + listino di confronto |
| `DOC-20261104-WA0016.xlsx` | elenco DA Amazon (driver), non mezzi | **non usato** per le targhe |

I file restano in `docs/flotta-kit/esempi/`, che non va su git: contengono nomi, contratti e prezzi.

## 2. Regole di riconciliazione (logica pura in `src/domain/flotta/riconcilia.ts`, con test)
1. **Targa** normalizzata: solo lettere e numeri, maiuscolo. Si leggono solo le righe di `Attivi` con station (`Nuova DS`); le righe che hanno solo la targa sono scarti in fondo al foglio.
2. **Station** = codice prima del trattino (`DLO2 - ORIGGIO` → `DLO2`). **Stato**: "sost…" → SOSTITUTIVO, "uff…" → UFFICIO, il resto → ATTIVO.
3. **Nuova in Lista e non attiva sul sito**:
   - se la targa esiste già come DISMESSO, la si **riattiva**: niente doppioni, si prende il record più recente;
   - altrimenti si **crea**.
4. **Attiva sul sito e non in Lista**: DISMESSO **solo se** è nel foglio `Cessati`. Altrimenti resta com'è e va in "da verificare".
5. **Aggiornamento dei campi** (station, stato, società, tipo, N° RA, data inizio e fine, note) quando la Lista dice altro.
   - Un campo vuoto in Lista non cancella il dato del sito.
   - Il cambio di station apre una riga nello storico stazioni.
6. **Società** normalizzata (Herzt → Hertz, NoloExpress, …) per tutti i mezzi non dismessi.
7. **I sostitutivi non si pagano** (confermato il 04/11/2026): canone vuoto per ogni SOSTITUTIVO, anche se la Lista o una fattura riportano un importo. Un sostitutivo fatturato a canone è un'anomalia da contestare.
8. **Canone €/mese** degli altri mezzi, in ordine di priorità:
   1. ultimo **mese pieno** fatturato:
      - ALD e Arval: riga CANONE con periodo dal 1° all'ultimo del mese;
      - Avis: riga CANONE del mese più recente;
      - Europcar: noleggio base × 30 / giorni, solo se i giorni sono almeno 28;
   2. tariffa della Lista (se è un numero);
   3. il canone già sul sito.
   Le frazioni di mese (ingresso o uscita a metà mese), le note di credito e i canoni a 0 non diventano mai canone; un mese "pieno" sotto il 50 % del precedente è un rateo e vale il mese prima.
9. **Anomalie** (non cambiano il sito, vanno nel report):
   - targa fatturata a canone nell'ultimo mese (CDC 5569 Amazon o 5565 GLS, oppure presente sul sito) ma cessata o assente dalla Lista: **da contestare o recuperare**, con la data di cessazione;
   - tariffa Lista ≠ fattura per più di 1 €;
   - attivo senza tariffa né fattura.

## 3. Listini sul sito
- `src/content/listiniNoleggio.ts`: fornitore, gruppo o categoria, modello indicativo, €/mese (30 gg), km inclusi, €/km extra, franchigie, validità, fonte, note (es. "solo rampa natale", "VAN200 = 200 km/giorno").
- Pagina `/vehicles/listini`:
  - un filtro per fornitore;
  - il confronto per classe SMALL / MEDIUM / LARGE (miglior prezzo evidenziato);
  - un avviso sui listini scaduti o in scadenza.
- Una riga per listino: Ayvens (dal passaggio di consegne), Europcar SUPERFLEX TOP, Amicoblu rinnovo 2026, Amicoblu elettrico, Hertz, Noleggiare, Locauto, Autovia, Nolo Experience, Torental.

## 4. Strumento ripetibile
- `src/lib/flotta/leggi.ts` legge i file e restituisce le righe pulite per il dominio. Formati riconosciuti: Lista Targhe `Attivi`/`Cessati`, ALD YTD, Arval mese, Avis YTD, Europcar mese.
- `scripts/riconcilia-flotta-neon.mts`:
  - legge i file e il DB del sito (sola lettura);
  - stampa il riepilogo;
  - scrive il report Excel (`Riconciliazione_flotta_<data>.xlsx`, fogli: Nuove, Riattivate, Uscite, Cambi, Canoni, Anomalie fatture, Da verificare);
  - **solo con `--applica`** scrive sul sito in una transazione, e registra il riepilogo nel log di audit.
- Step successivo, non in questa PR: la stessa riconciliazione dentro il sito (trascini i file in Flotta → anteprima → applica).

## 5. Doppio controllo
**Prima di scrivere**: due calcoli indipendenti devono dare gli stessi numeri.
- Il dominio TypeScript e l'analisi Python (`openpyxl`) fatta a parte devono coincidere su nuove, uscite, cambi e anomalie.

**Dopo aver scritto**, rileggendo il DB del sito:
1. targhe non dismesse sul sito = targhe di `Attivi` (+ quelle "da verificare" lasciate apposta), station per station;
2. nessuna targa doppia tra i non dismessi;
3. ogni uscita ha la sua riga in `Cessati`;
4. canone del sito = canone scelto, targa per targa; totale €/mese per station prima e dopo;
5. la riconciliazione rilanciata dà **0 cambi**.

Il report finale riporta i numeri dei due controlli e le anomalie da contestare ai noleggiatori.

## 6. Vademecum
- Nuova pagina `content/vademecum/17-gestione-mezzi.md`:
  - attività per periodicità;
  - le 8 sedi con codici progetto e CDC;
  - noleggiatori (uso, referente, note);
  - tariffe di confronto, con link a `/vehicles/listini`;
  - officine, lavaggi, AdBlue e metano per station;
  - portali, **senza credenziali**: dove chiedere l'account;
  - note chiave.
- Le multe rimandano alle pagine 03–05, che già ci sono.
- Il test del vademecum conta una pagina in più.

## 7. Regole
- Nessuna password o credenziale nel repository o nel vademecum. Le password del passaggio di consegne vanno cambiate (lo dice lo stesso file).
- Si scrive sul sito solo dopo il dry-run e il doppio controllo. Nessuna migrazione di schema in questa PR.
- `tsc`, test, build e audit mobile verdi. La PR si unisce solo con la CI verde.
