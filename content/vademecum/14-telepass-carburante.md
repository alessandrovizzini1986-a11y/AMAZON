---
title: "Telepass e carte carburante"
order: 14
category: "Fatture"
updated: "2026-11-03"
---

Ogni mese i pedaggi, l'Area C e i parcheggi dei furgoni (**Telepass**) e i rifornimenti con le carte carburante (**Q8**) vanno attribuiti a una delivery station (DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1), a GLS o alla SEDE. Si fa tutto dal sito, nella sezione **Telepass e carburante**: trascini il file, controlli l'anteprima e scarichi l'Excel del mese, già nel formato che usa Alessandro.

I file restano **sul tuo PC**: il sito li legge nel browser; sul server vanno solo le anagrafiche, il nome del file e i totali per station.

**Quando**: a inizio mese, sul mese appena chiuso (Telepass e Q8 sono due elaborazioni separate). Lo stato di ogni mese lo vedi in [/carburante-telepass](/carburante-telepass).

### Passo 1 — Anagrafiche aggiornate ([/carburante-telepass/anagrafiche](/carburante-telepass/anagrafiche))

La STATION di ogni transazione dipende da due anagrafiche: la **mappa Telepass** (dispositivo → station) e il **censimento fuel card** (PAN della carta → DS e appalto AMZ/GLS).

1. Aggiornale **ogni volta che arriva una mail** di nuovo dispositivo, nuova carta, carta riemessa o cambio station, e comunque prima di elaborare il mese.
2. Trascina `TBusiness_carica_veicoli.xlsx` (il sito legge il foglio `TELEPASS FINALE`) e/o il censimento `AAMM_Censimento_fuel_card.xlsx` (foglio `Carte Q8 Flotte`).
3. Leggi il riepilogo: **nuovi**, **aggiornati** (con l'elenco di cosa cambia), **invariati**, **spariti dal file**. Se torna, premi **Conferma import**. I record spariti non si cancellano: restano in tabella segnati "non più nel file" e non vengono più usati per l'abbinamento.
4. Per un cambio singolo (es. un dispositivo passato da DLO2 a DLO4) puoi usare **Modifica** sulla riga: cambi station o DS e aggiungi una nota. Ogni modifica resta nell'audit.

Le carte con **DS vuoto o "Da verificare"** sono evidenziate in giallo: vanno attribuite prima di elaborare il Q8.

### Passo 2 — Telepass ([/carburante-telepass/telepass](/carburante-telepass/telepass))

1. Scarica il CSV: portale **Telepass Business → Transazioni → Esporta CSV**. Il nome cambia ogni volta (`_lista_transazioni_<data>_<ora>.csv`): non importa, il sito lo riconosce dal contenuto e legge il mese dalla colonna Data.
2. Trascinalo nella pagina. Nell'anteprima controlla: mese, numero di transazioni, totale e la griglia **station × settimana**.
3. Guarda **prima di generare** il riquadro Anomalie:
   - **dispositivi non mappati** (NON MAPPATO): manca il dispositivo nella mappa → aggiungilo in TBusiness_carica_veicoli, reimporta l'anagrafica e rielabora;
   - **ricondotti a GLS - CASTEL MAGGIORE**: nella mappa la STATION non è standard (es. VALERIO, VIZZINI); la regola li porta a GLS - CASTEL MAGGIORE, è normale, ma segnalali ad Alessandro se compaiono nomi nuovi;
   - **righe fuori dal mese**: il CSV contiene giorni di un altro mese; restano nel file ma controlla di aver scaricato il periodo giusto.
4. Premi **Genera Excel** (`MM_Telepass_<Mese>_<AAAA>.xlsx`) e poi **Salva elaborazione**.

### Passo 3 — Q8 ([/carburante-telepass/q8](/carburante-telepass/q8))

1. Scarica l'export: portale **Q8 Flotte → Transazioni → Esporta Excel**.
2. Trascinalo nella pagina. Il sito tiene solo le carte con Identificativo **AMZ** o **GLS** e scarta le altre (LOR, SMA, GRA…: non sono nostri appalti), mostrandone il conteggio.
3. Guarda **prima di generare** il riquadro Anomalie:
   - **carte non censite** (NON CENSITA): la carta non è nel censimento o non ha DS → aggiorna il censimento e rielabora;
   - **abbinate per Identificativo**: il PAN non è censito ma esiste un'altra carta con lo stesso Identificativo (carta riemessa: cambia il PAN, resta AMZxxx) → la DS è presa da quella carta; aggiungi il nuovo PAN al censimento.
4. Scegli per quale station vuoi il giornaliero nel foglio Recap (di base GLS), premi **Genera Excel** (`MM_Transazioni_<Mese>_<AA>_Q8.xlsx`) e poi **Salva elaborazione**.

### Passo 4 — Consegna

1. Manda ad Alessandro i due Excel del mese.
2. I fogli **ztlrimini** e **RMPP** dell'Excel Telepass sono vuoti di proposito: li compila **Alessandro** (ZTL Rimini e rapporti RMPP); le colonne RMPP e ZTL del foglio PVT si riempiono da lì.
3. In [/carburante-telepass](/carburante-telepass) il mese deve risultare "fatto" per Telepass e Q8.

**Cosa c'è negli Excel**

| File | Fogli | Note |
|---|---|---|
| Telepass | tabella **Toll** (una riga per transazione, colonna STATION, WEEK), **PVT** (somma Importo per station e settimana, con RMPP, ZTL e TOTALE), **ztlrimini**, **RMPP**, **Anomalie** | gli importi sono negativi come nel CSV; TOTALE = −Totale + RMPP + ZTL |
| Q8 | **Recap** (Imp. Scontato no IVA per station e settimana + giornaliero della station scelta), tabella **Q8_** (una riga per rifornimento, colonne STATION, AMZ, WEEK), **Anomalie** | le griglie sono a formule: se Alessandro vuole la pivot la aggiunge lui |

**Regole fisse**

- Il tipo di file e il mese si capiscono dal **contenuto**, mai dal nome.
- La STATION è un **valore** preso dalle anagrafiche del momento: l'Excel del mese resta storico anche se dopo la mappa cambia. Rielaborare un mese vecchio con le anagrafiche di oggi può dare station diverse: è normale.
- Le anomalie **non si correggono nell'Excel**: si aggiornano le anagrafiche e si rielabora.
- Le settimane sono quelle di WEEKNUM di Excel (la settimana inizia di domenica).

**Escalation**

- STATION non standard nuova nella mappa, carte senza DS che non sai attribuire, dispositivi non mappati che non trovi in TBusiness → Alessandro.
- Un file che il sito non riconosce → Alessandro, con il messaggio di errore.
