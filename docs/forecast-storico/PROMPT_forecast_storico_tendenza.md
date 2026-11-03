# Forecast Amazon: storico delle versioni, tendenza, rotte e furgoni necessari

Prompt per Claude Code, da eseguire sul repository FleetDSP (Next.js 15 / Prisma / Neon), modulo **Fatture Amazon → Forecast** (`src/app/(app)/fatture-amazon/forecast/`, `src/domain/forecast/`).

## 0. Obiettivo in una frase
Ogni forecast caricato resta come **versione**. Per il ricavo previsto vale sempre la **versione più recente**. Accanto, un grafico mostra **come si è mosso il forecast** di una settimana man mano che arrivavano le versioni nuove, e **quanto ci ha preso** rispetto al fatturato reale.

## 1. Situazione di oggi (da leggere prima)
- `ForecastFile` (nome, linea ND/SD, sha256, caricatoIl) e `ForecastRoute` (week, data, station, cycle, serviceType, routes, classe): **tutte le righe di tutti i file sono già salvate**. Lo storico esiste già, manca solo come mostrarlo.
- `ultimoForecast()` (`src/domain/forecast/previsione.ts`): per (station, data, classe) vince il file con il **`caricatoIl` più recente**. Difetto noto: se si ricarica un file vecchio, questo diventa il "più recente" e scavalca quelli nuovi.
- `prevedi()`, `perMese()`, `confronta()` fanno il ricavo previsto e il backtest; `Grafico.tsx` è un grafico SVG a colonne (previsto vs fatturato per settimana) con colori validati `#2a78d6` / `#eb6834`.

## 2. Regole (vincolanti)
1. **"Ultimo" = versione del forecast, non data di caricamento.** La versione di un file è la settimana Amazon di emissione (`PROF_<wk>_next/_same`, o la colonna `week` minima del foglio PROF se il nome non la dice), poi `caricatoIl` come spareggio. Aggiungere `ForecastFile.versione` (Int, settimana di emissione) con migrazione e backfill dai nomi già caricati. Aggiornare `ultimoForecast()` e il suo test: ricaricare un file vecchio non deve cambiare il ricavo previsto.
2. Nessun dato si cancella: lo storico è la lista di tutte le versioni per (station, data, classe).
3. **Anticipo** di una versione rispetto a una settimana target = settimane tra versione e target (0 = forecast della settimana stessa, 1 = una settimana prima…).
4. Il fatturato reale di una settimana si usa solo quando la settimana è **chiusa** (`chiusa()` in `settimane.ts`, 14 giorni dopo la domenica finale), come nel backtest attuale.
5. Nessuna chiamata esterna, calcoli nel browser o nel server del sito, niente librerie di grafici pesanti: SVG come `Grafico.tsx` (o una libreria leggera già presente). Excel con tabelle native, stile standard.

## 3. Pagina (nuova scheda "Storico forecast" in `/fatture-amazon/forecast/storico`, permesso `forecast.view`)
Filtri in alto: **DS** (tutte o una), **linea** (ND, SD, entrambe), **misura** (rotte o € previsti), intervallo di settimane target (default: ultime 12 + prossime 4).

1. **Grafico "Tendenza"** (quello principale). Asse X = settimane target. Per ogni settimana:
   - linea piena = **ultima versione**;
   - punti più chiari = **versioni precedenti**, colorati per anticipo (sequenziale di una sola tinta: più chiaro = più lontano), così si vede se il forecast cresce o cala man mano che la settimana si avvicina;
   - linea arancione = **fatturato reale** per le settimane chiuse;
   - banda tenue = min–max delle versioni.
   
   Tooltip: settimana, versione, anticipo, rotte, €, delta rispetto alla versione precedente.
2. **Grafico "Evoluzione di una settimana"**: si apre cliccando una settimana target. X = versioni in ordine (wk di emissione), Y = rotte/€, una serie per classe (ND_STANDARD, SD_A, …) o il totale, e la linea orizzontale del reale se la settimana è chiusa.
3. **Grafico "Precisione per anticipo"**: X = anticipo (0, 1, 2, 3+ settimane), Y = errore % medio (|previsto − reale| / reale) sulle settimane chiuse, per DS. Risponde a "quanto mi posso fidare del forecast fatto 2 settimane prima?".
4. **Tabella** sotto i grafici: settimana × versione (pivot) con rotte ed €; la cella dell'ultima versione è in grassetto; delta % rispetto alla versione prima, colorato (±5 % neutro, oltre ±15 % evidenziato).
5. Pulsante **Excel**: fogli `Tendenza` (settimana, versione, anticipo, DS, linea, rotte, €, reale), `Precisione` (DS, anticipo, errore %), più la pivot. Tabelle native.
6. Nella pagina Forecast attuale: badge "ultimo" sul file con la versione più alta (non sul più recente caricato), e un link "Storico forecast".

## 4. Grafici: regole di design
- Prima di scrivere il codice dei grafici, caricare la skill **dataviz** e seguirla: palette validata (serie 1 `#2a78d6`, serie 2 `#eb6834`, sequenziale per l'anticipo), contrasto in chiaro e scuro, legenda sempre visibile, tooltip su ogni punto, assi con unità (rotte, k€), niente 3D né doppio asse.
- Mobile: i grafici vanno in una colonna, con scroll orizzontale solo dentro il grafico.
- Accessibilità: `role="img"` e `aria-label` con la sintesi; la tabella sotto è l'alternativa testuale.

## 5. Modo di lavorare (agenti)
1. **Mockup prima del codice.** Con lo strumento Artifact (`quickstart`, intent `design`) fare un mockup dei tre grafici e della tabella con i dati reali anonimi delle ultime settimane. Mostrarlo ad Alessandro e iterare. Si codifica solo dopo il suo ok sul mockup.
2. **Agente Plan**: piano di implementazione (migrazione `versione` + backfill, nuova regola `ultimoForecast`, funzioni pure in `src/domain/forecast/storico.ts`, pagina, Excel, test).
3. **Implementazione** in una PR:
   - funzioni pure prima, con test;
   - poi la pagina;
   - poi l'Excel.
4. **Agente di review** (code-review) sul diff prima della PR, con attenzione a: regola "ultimo" (file ricaricato), settimane al cambio d'anno (week 52/53 → 1), versioni con anticipo negativo (file caricato dopo la settimana) da escludere dalla precisione.
5. Migrazione Neon solo con l'ok esplicito di Alessandro.

## 5-bis. Decisioni di Alessandro (03/11/2026, sul mockup)
- Misura di default **€**, con switch **€ ↔ rotte**; finestra **9 settimane passate + 3 future**; precisione per anticipo **per DS**.
- **Rotte di un giorno** (misura "rotte"): next day (tutte le classi ND, cargo bike comprese) + same day = **SD_A + max(SD_B, SD_C)**. I cicli si leggono dalla colonna `cycle` (`CYCLE_SD_A/B/C`), non dalla classe: nella mappa `CYCLE_SD_B` → classe SD_C e "Multi-Use" → SD_B. Le rotte della settimana sono la somma dei giorni.
- **SWA / MFN pickup** (`ND_SWA`, ciclo `SWA_PM`): Amazon le proietta solo per 3 settimane. Per tutto il periodo coperto dal forecast si **simulano** con la media per giorno della settimana delle 3 settimane dell'ultima versione ND, segnate come "simulate".
- **Furgoni necessari** per station e settimana = **rotta massima del next** (picco giornaliero delle rotte ND con furgone: esclusa la cargo bike) + **rotta massima tra same A, B e C** (un furgone fa A, B e C). È la somma dei due picchi settimanali; il tooltip mostra anche il picco nello stesso giorno.
- **Cruscotto furgoni**: per station × prossime settimane, furgoni necessari contro flotta del sito (`Vehicle` con stato ATTIVO o SOSTITUTIVO della station; in officina a parte), **delta** colorato (mancano = rosso). Le settimane oltre l'orizzonte del next (solo SD) sono segnate "parziale".

## 6. Test di accettazione
| Test | Atteso |
|---|---|
| Ricarico un forecast vecchio dopo uno nuovo | il ricavo previsto non cambia; il badge "ultimo" resta sul nuovo |
| Backfill `versione` dai nomi già caricati | ogni file ha la sua settimana; il file senza settimana nel nome la prende da `week` minima |
| Tendenza su fixture `tests/fixtures/fatture-amazon/forecast/` | per ogni settimana target: n. versioni = file che la coprono; ultima versione = quella usata da `prevedi()` |
| Precisione per anticipo | errore % calcolato solo su settimane chiuse; anticipo 0 = stessa settimana |
| Cambio d'anno | settimane 52 → 1 in ordine corretto |
| Excel | fogli Tendenza, Precisione, Settimana×versione, Furgoni; tabelle native; i totali di `Tendenza` (ultima versione) uguali alla pagina Forecast |
| Rotte same day | giorno con A=10, B=7, C=9 → 19 rotte SD; furgoni SD = 10 |
| Furgoni | settimana con picco ND 40 (lun) e picco max(A,B,C) 12 (mar) → 52; cargo bike non contate |
| SWA simulate | settimana oltre l'orizzonte ND: SWA = media per giorno della settimana delle 3 settimane, flag "simulate" |
| Delta flotta | furgoni ATTIVO+SOSTITUTIVO della station − necessari; negativo = mancano |

## 7. A fine lavoro
Riportare in una tabella: test passati, URL da provare, cosa manca. Aggiornare `docs/moduli/fatture-amazon.md` e la pagina del vademecum 06 (paragrafo forecast).
