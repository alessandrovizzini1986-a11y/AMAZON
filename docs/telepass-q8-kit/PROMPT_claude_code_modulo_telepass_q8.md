# Modulo "Telepass e carte carburante" per il sito (Next.js 15 / Vercel / Neon)

Secondo modulo per la stagista, dopo "Presenze Amazon DSP". Stesse scelte architetturali già confermate: parsing e calcolo **nel browser** (ExcelJS + PapaParse), al server solo metadati, mappe e righe di risultato; nessun file originale salvato; Excel generati nel browser con tabelle native stile standard. Kit allegato `modulo_telepass_q8_kit.zip` (scompattalo tu in `docs/telepass-q8-kit/`): script Python di riferimento `mensile_telepass_q8.py` (specifica eseguibile, validata), `PROMPT_telepass_q8_mensile.md` (regole), input reali di ottobre 2026 e output attesi.

## 0. Contesto
Ogni mese Alessandro scarica dai portali le transazioni **Telepass** (pedaggi, Area C, parcheggi dei furgoni) e **Q8** (rifornimenti con carte carburante) e produce due Excel formattati in modo fisso, con la colonna STATION che attribuisce ogni transazione a una delivery station (DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1), a GLS o alla SEDE. L'attribuzione dipende da due anagrafiche che cambiano nel tempo: la **mappa Telepass** (dispositivo → station, foglio `TELEPASS FINALE` di `TBusiness_carica_veicoli.xlsx`) e il **censimento fuel card** (PAN carta → DS e appalto AMZ/GLS). Il sito deve far fare tutto questo alla stagista con drag & drop.

## 1. Pagine (sezione `src/app/(app)/carburante-telepass/`, nome menu "Telepass e carburante")
1. **`/carburante-telepass/anagrafiche`** — due tabelle modificabili da ADMIN e CONTROLLO:
   - `TelepassDispositivo` (codice dispositivo PK, station, targa (AREA C), progetto, check Attivo/Bloccato/Disattivo, note, aggiornatoIl, aggiornatoDa). Import: drag & drop di `TBusiness_carica_veicoli.xlsx` → si legge il foglio `TELEPASS FINALE` (colonne per intestazione: TELEPASS, STATION, AREA C, PROGETTO, CHECK) e si fa **upsert** per codice dispositivo; i dispositivi presenti in tabella ma assenti dal file vengono segnati `nonPiuInFile = true` (non cancellati). Mostrare un riepilogo dell'import (nuovi, aggiornati, invariati, spariti) e lo storico degli import.
   - `FuelCard` (PAN PK, numero carta, identificativo (Nominativo driver), targa, bloccata, dataBlocco, centroCosto, appalto AMZ/GLS, ds, note, aggiornatoIl). Import: drag & drop del censimento (`*Censimento_fuel_card.xlsx`, foglio `Carte Q8 Flotte`, colonne per intestazione: PAN, N. Carta/Emissione, Nominativo driver (dato personale), Targa, Bloccata, Data blocco, Centro di costo, AMZ/GLS, DS) con lo stesso upsert e lo stesso riepilogo. `DS` vuoto o "Da verificare" = carta non attribuita: evidenziata.
   - Entrambe filtrabili, con modifica inline di station/DS e audit.
2. **`/carburante-telepass/telepass`** — drag & drop del CSV Telepass → anteprima (mese riconosciuto, righe, totale per station, dispositivi non mappati) → pulsante **"Genera Excel"** (`MM_Telepass_<Mese>_<AAAA>.xlsx`, identico all'atteso) → "Salva elaborazione" (metadati + totali per station×settimana su `TelepassRun`). Storico elaborazioni con totali.
3. **`/carburante-telepass/q8`** — drag & drop dell'export Q8 → anteprima (mese, righe tenute/scartate per prefisso, totale per station, carte non censite) → "Genera Excel" (`MM_Transazioni_<Mese>_<AA>_Q8.xlsx`) → "Salva elaborazione" (`Q8Run`). Storico.
4. In **`/carburante-telepass`** (indice) una griglia stato: per mese, Telepass fatto/non fatto, Q8 fatto/non fatto, data ultimo import anagrafiche, numero anomalie aperte.

## 2. Riconoscimento dei file (sempre dal contenuto, mai dal nome)
- Telepass: CSV `;`, UTF-8 con BOM, prima riga che inizia con `ID Transazione;ID Codificato;Movimento;` (35 colonne). Decimali con virgola (`-2,40`), date `gg/mm/aaaa`, orari `hh:mm:ss`.
- Q8: xlsx con un solo foglio, intestazione in **riga 2** (riga 1 vuota) contenente `PAN Carta` e `N. ticket`; 35 colonne da `Cod. Main` a `Tipo PV`; `Data` e `Ora` sono datetime completi (stesso valore), importi numerici.
- Mappa Telepass: xlsx con foglio `TELEPASS FINALE`. Censimento: xlsx con foglio `Carte Q8 Flotte` o intestazione con `PAN` e `Nominativo driver`.
- Se il file trascinato nella pagina sbagliata è riconosciuto come altro tipo, dirlo e proporre la pagina giusta.
- Mese/anno = mese prevalente della colonna Data; righe di altri mesi restano nel file ma vanno conteggiate come avviso.

## 3. Regole di trasformazione (vincolanti, già nello script)
**Telepass → tabella `Toll`** (36 colonne = le 35 del CSV con `Stato` sostituita da `STATION`, + `WEEK`):
- `STATION` = valore (non formula) = `station` del dispositivo in `TelepassDispositivo` per `Codice dispositivo`; se la station non è fra DER1/DER2/DLO2/DLO4/DLO5/DLZ2/DVN1/SEDE/GLS - CASTEL MAGGIORE (es. `VALERIO`, `VIZZINI`) → `GLS - CASTEL MAGGIORE` + anomalia; se il dispositivo manca → `NON MAPPATO` e riga in Anomalie.
- `Data` → data (formato breve `mm-dd-yy`), `Orario` → ora `h:mm:ss`, `Importo`, `Prezzo unitario`, `Quantità`, `Prezzo`, `KM`, `Durata` → numero (virgola → punto), `Codice dispositivo`, `CDC veicolo` → numero se numerici.
- `WEEK` = `=WEEKNUM(Toll[[#This Row],[Data]])` (formula, riferimento strutturato).
- Foglio `PVT`: griglia STATION × WEEK di `Somma di Importo` a formule `=SUMIFS(Toll[Importo],Toll[STATION],$A5,Toll[WEEK],B$4)`, colonna `Totale complessivo`, poi colonne `RMPP`, `ZTL` (vuote, manuali) e `TOTALE = -Totale + RMPP + ZTL`; riga `Totale complessivo`; sotto, la riga di raccordo DER1…DVN1 + TOTALE. Le settimane sono quelle del mese secondo WEEKNUM Excel (sistema 1, settimana che inizia di domenica).
- Fogli `ztlrimini` e `RMPP` vuoti con le intestazioni dell'esempio (manuali).
- Foglio `Anomalie`.
**Q8 → tabella `Q8_`** (37 colonne = le 35 dell'export con `Veicolo` → `STATION` e `Codice autista` → `ASSEGNAZION` vuota, + `AMZ`, `WEEK`):
- Tenere solo `Identificativo` che inizia con `AMZ` o `GLS` (case-insensitive); scartare il resto e contarlo per prefisso.
- `STATION` = `ds` della `FuelCard` per `PAN Carta`; se il PAN non è censito (carta riemessa: cambia il PAN, resta l'Identificativo) → `ds` della carta con lo stesso `Identificativo` + anomalia "aggiungere il nuovo PAN"; se nemmeno quello → `NON CENSITA` + Anomalie.
- `AMZ` = `=LEFT(Q8_[[#This Row],[Identificativo]],3)`, `WEEK` = `=WEEKNUM(Q8_[[#This Row],[Data]])`.
- Formati: `Data` `mm-dd-yy`, `Ora` `h:mm:ss`, importi `#,##0.00`, prezzi/sconti `##,##0.000` (copiare dall'atteso colonna per colonna).
- Foglio `Recap` (primo foglio): griglia STATION × WEEK di `Imp. Scontato no IVA` (SUMIFS) + griglia giornaliera di `Imp. Scontato` per la STATION nella cella filtro (default `GLS`) con `=WEEKDAY(data)`.
- Foglio `Anomalie`.

## 4. Test di accettazione (golden, kit `esempi/` → `attesi/`)
| Input | Atteso | Controllo |
|---|---|---|
| `esempi/_lista_transazioni_03-11-2026_15-47.csv` + `esempi/TBusiness_carica_veicoli.xlsx` | `attesi/10_Telepass_Ottobre_2026.xlsx` | 15.618 righe, header identico, tabella `Toll`, STATION per riga identica, totale Importo −39.738,80; PVT: DER1 −5.939,55, DER2 −3.043,30, DLO2 −6.081,30, DLO4 −151,60, DLO5 −7.386,99, DVN1 −1.697,34, GLS - CASTEL MAGGIORE −363,90 (VALERIO e VIZZINI ricondotti), SEDE −15.074,82; settimane 40–44; 0 dispositivi non mappati, 2 ricondotti |
| `esempi/10_Transazioni_Ottobre_26_Q8.xlsx` + `esempi/1026_Censimento_fuel_card.xlsx` | `attesi/10_Transazioni_Ottobre_26_Q8.xlsx` | 4.110 righe tenute / 818 scartate, header identico, tabella `Q8_`, STATION per riga identica, Imp. Scontato no IVA totale 282.166,73; per station DLO2 54.383,71, DVN1 46.444,61, DER2 39.710,10, DER1 36.346,77, DLO5 34.133,42, DLZ2 29.663,38, GLS 24.294,11, DLO4 17.190,62; 3 carte abbinate per Identificativo (AMZ593, AMZ489, AMZ464: PAN riemesso) |
| Esempi di settembre (`esempi/settembre/`): `09_Telepass_Settembre_2026.xlsx`, `09_Transazioni_Settembre_26_Q8.xlsx` | riferimento di **formato** (sono i file fatti a mano da Alessandro) | confronto header, nome tabella, formati colonna, formule; i valori STATION di settembre possono differire perché le anagrafiche sono cambiate |
Il confronto va fatto cella per cella sulle tabelle (valori) e per testo sulle formule; le griglie Recap/PVT si confrontano dopo ricalcolo (nel test, ricalcolare con la stessa logica TS che genera i numeri dell'anteprima).

## 5. Vademecum e varie
- Nuova pagina vademecum `14-telepass-carburante.md`: come si scaricano i due export (portale Telepass Business → Transazioni → Esporta CSV; portale Q8 Flotte → Transazioni → Esporta Excel), dove si trascinano, cosa controllare nell'anteprima (anomalie prima di generare), quando aggiornare le anagrafiche (ogni volta che arriva una mail di nuovo dispositivo/carta o cambio station), e che i fogli `ztlrimini`/`RMPP` li compila Alessandro.
- Permessi: `telepass.view`/`telepass.run`/`telepass.anagrafiche` per ADMIN e CONTROLLO.
- Decisioni già prese: niente pivot generate (griglie a formula), niente file originali sul server, STATION come valore storico. Dove non specificato, scegli la soluzione più semplice coerente con il modulo Presenze e annotala nella PR.
- Procedi senza attendere conferme: 3 PR (anagrafiche; Telepass; Q8 + vademecum). A fine PR riporta in tabella: test golden passati, URL da provare, cosa manca.
