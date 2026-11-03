# PROMPT — Telepass e carte carburante Q8: formattazione mensile e abbinamento a station

*Da eseguire ogni mese (o quando arriva un export) senza attendere richiesta. Script di riferimento: `mensile_telepass_q8.py` (validato su ottobre 2026 contro i file di esempio di settembre). Stesse regole da portare nel sito della stagista.*

## Cosa arriva e come lo si riconosce (mai dal nome del file)
| Sorgente | Come si scarica | Riconoscimento dal contenuto | Mese |
|---|---|---|---|
| **Telepass** | portale Telepass Business → lista transazioni → CSV; il nome è `_lista_transazioni_<data>_<ora>.csv` e cambia ogni volta | CSV separato da `;`, UTF-8 con BOM, prima riga che inizia con `ID Transazione;ID Codificato;Movimento;…` (35 colonne) | colonna `Data` (gg/mm/aaaa): mese prevalente |
| **Q8 carte carburante** | portale Q8 Flotte → transazioni → Excel | foglio unico, riga di intestazione in riga 2 (riga 1 vuota) con `PAN Carta` e `N. ticket` (35 colonne, da `Cod. Main` a `Tipo PV`) | colonna `Data` (datetime): mese prevalente |
| **Mappa Telepass** | file `TBusiness_carica_veicoli.xlsx`, foglio `TELEPASS FINALE` (tabella `Telepass_attivi`) | colonne `TELEPASS` (codice dispositivo), `STATION`, `AREA C` (targa), `PROGETTO`, `CHECK` (Attivo/Bloccato/Disattivo) | va ricaricato ogni volta che cambia; nel sito è una tabella modificabile |
| **Censimento fuel card** | file `AAMM_Censimento_fuel_card.xlsx`, foglio `Carte Q8 Flotte` | colonne `PAN`, `Nominativo driver` (= Identificativo AMZxxx/GLSxxx), `Targa`, `Bloccata`, `AMZ/GLS`, `DS` | ricaricabile ogni volta; nel sito è una tabella (PAN → DS/appalto) |

## Output Telepass: `MM_Telepass_<Mese>_<AAAA>.xlsx` (es. `10_Telepass_Ottobre_2026.xlsx`)
- Foglio `MM_Telepass_<Mese>_<AAAA>` con **tabella `Toll`** (stile TableStyleMedium2), stesse 36 colonne dell'esempio: le 35 del CSV con la colonna `Stato` **sostituita da `STATION`** (valore, non formula: `STATION` di `TELEPASS FINALE` per `Codice dispositivo`) più `WEEK` = `=WEEKNUM(Toll[[#This Row],[Data]])`.
- Conversioni: `Data` → data (formato `mm-dd-yy`, cioè data breve), `Orario` → ora (`h:mm:ss`), `Importo` e numerici da virgola italiana a numero (gli importi sono negativi come nel CSV), `Codice dispositivo` e `CDC veicolo` numerici.
- Foglio `PVT`: recap **STATION × WEEK** di `Somma di Importo` (nell'esempio è una pivot; nello script e nel sito è la stessa griglia a formule `SUMIFS` sulla tabella `Toll`), con le colonne `RMPP`, `ZTL`, `TOTALE = -Totale + RMPP + ZTL` e la riga di raccordo per station DER1…DVN1 come nell'esempio.
- Fogli `ztlrimini` e `RMPP`: dati **manuali** del mese (ZTL Rimini e rapporti RMPP); si creano vuoti con le stesse intestazioni dell'esempio, li compila Alessandro.
- Foglio `Anomalie`: dispositivi non presenti in `TELEPASS FINALE` (→ "NON MAPPATO"), STATION non standard in TELEPASS FINALE (es. `VALERIO`, `VIZZINI`) → **ricondotte a `GLS - CASTEL MAGGIORE`** (regola confermata il 3/11/2026) e segnalate, righe fuori dal mese prevalente.

## Output Q8: `MM_Transazioni_<Mese>_<AA>_Q8.xlsx` (es. `10_Transazioni_Ottobre_26_Q8.xlsx`)
- Foglio `Transazioni Q8 Flotte` con **tabella `Q8_`**, stesse 37 colonne dell'esempio: le 35 dell'export con `Veicolo` → **`STATION`** (valore: `DS` del censimento per `PAN Carta`) e `Codice autista` → **`ASSEGNAZION`** (vuota), più `AMZ` = `=LEFT(Q8_[[#This Row],[Identificativo]],3)` e `WEEK` = `=WEEKNUM(Q8_[[#This Row],[Data]])`.
- **Filtro**: si tengono solo le righe con `Identificativo` che inizia per `AMZ` o `GLS`; tutte le altre (LOR, SMA, GRA, PS0, ART, SCH, …) si scartano perché non sono dei nostri appalti (ottobre: 4.110 tenute su 4.928, 818 scartate).
- Formati numerici identici all'esempio (`#,##0.00`, `##,##0.000`), `Data` `mm-dd-yy`, `Ora` `h:mm:ss`.
- Foglio `Recap` (nell'esempio `Foglio2` con due pivot): griglia **STATION × WEEK** di `Somma di Imp. Scontato no IVA` + griglia giornaliera di `Imp. Scontato` per una STATION scelta (cella filtro, default GLS) con il giorno della settimana; a formule `SUMIFS`/`SUMPRODUCT` sulla tabella `Q8_`.
- Abbinamento: per PAN; se il PAN non è censito (carta riemessa) per `Identificativo` (ottobre: AMZ593→DLO5, AMZ489→DLZ2, AMZ464→DLO2, 16 transazioni, 1.082 €, segnalate per aggiungere il nuovo PAN); altrimenti `NON CENSITA`. Foglio `Anomalie` con questi casi e il conteggio delle righe scartate per prefisso.

## Regole d'oro
1. Il tipo di file si capisce dal contenuto, il mese dalla colonna Data: il nome file non si usa mai.
2. STATION è sempre un **valore** preso dalla mappa del momento (Telepass → `TELEPASS FINALE`, Q8 → censimento), così il file del mese resta storico anche se la mappa cambia dopo. Settembre 2026 rielaborato con la mappa di novembre darebbe il 2,7% di Telepass e l'1,5% di carte diversi: è normale.
3. Le anomalie non si correggono nel file: si aggiorna la mappa/censimento e si rigenera.
4. Nessuna pivot generata dal codice (openpyxl/ExcelJS non le creano): stesse griglie a formula sulla tabella; la pivot, se Alessandro la vuole, la aggiunge lui in due clic.

## Numeri di controllo ottobre 2026
| | Telepass | Q8 |
|---|---|---|
| Righe export | 15.618 | 4.928 |
| Righe in output | 15.618 | 4.110 |
| Totale | −39.738,80 € (Importo) | 282.166,73 € (Imp. Scontato no IVA) |
| Per station | DLO5 7.387, DLO2 6.081, DER1 5.940, DER2 3.043, DVN1 1.697, DLO4 152, GLS - CASTEL MAGGIORE 364 (di cui VALERIO 271 e VIZZINI 86), SEDE 15.075 | DLO2 54.384, DVN1 46.445, DER2 39.710, DER1 36.347, DLO5 34.133, DLZ2 29.663, GLS 24.294, DLO4 17.191 |
| Settimane (WEEKNUM Excel) | 40–44 | 40–44 |
