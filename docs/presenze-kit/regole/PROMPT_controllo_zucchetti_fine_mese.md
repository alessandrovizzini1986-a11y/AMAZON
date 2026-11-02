# PROMPT — Controllo di fine mese SIC: tracking vs Zucchetti + domeniche/giorni consecutivi

*Da eseguire a fine mese, senza attendere richiesta, quando arrivano i 7 tracking SIC completi e i 7 export Zucchetti del mese (`Amazon_<AAAA>_<MM>_<Città>_inizio_43ore.xlsm`). Script: `controllo_zucchetti.py` (cartella con i file → un unico Excel).*

## Perimetro
Solo popolazione **SIC** (diretti Professional Solutions). Per gli STD il foglio check-domenica si produce solo se i tracking STD sono nella cartella (facoltativo).

## Fonti e parsing
| Fonte | Dove | Come si legge |
|---|---|---|
| Tracking SIC | foglio del mese (`MM.AA`, `Settembre`, `Settembre2026`, o anche foglio con nome di altro mese: si sceglie il foglio le cui colonne-giorno coprono il mese richiesto) | header = riga con "Tipo" (col. H per SIC); giorni = intestazioni data o interi 1..31 con rollover; blocco per lavoratore da "Standard"; Matricola in "Codice Matricola" (spesso solo sulla riga Totali) |
| Zucchetti | foglio `ORARI`, righe `VERSO = TOTALE` (una per lavoratore); MATR in col. B (numero, o `S00xxxx` per DER2); giorni = intestazione date riga 2 | celle `time` (07:48 = 7,8 h) oppure stringhe "08:00" oppure "" |
| Città → DS | Valsamoggia=DER1, SantArcangelo=DER2, Origgio=DLO2, Buccinasco=DLO4, Castegnato=DLO5, Pomezia=DLZ2, Vigonza=DVN1 | |

## Regola di confronto (confermata su settembre 2026: 7/7 DS, 394/394 lavoratori abbinati, 6 DS a delta zero)
- **Ore tracking del giorno = lavoro (Standard+Straordinario+Supplementare+Accordo) + TUTTE le assenze** (FERIE, ROL, ExF, 104, MALATTIA, INFORTUNIO, permesso sindacale, altri permessi, **permesso non retribuito, assenza ingiustificata**). Su Zucchetti si inserisce tutto **tranne i RIPOSI**.
- Ore Zucchetti del giorno = riga TOTALE convertita in decimale (7:48 → 7,8).
- Delta = tracking − Zucchetti, per lavoratore × giorno; soglia 0,01 h.
- Abbinamento: matricola; se manca o non coincide, nome con ordine cognome/nome indifferente, apostrofi ignorati, e per inclusione di token (es. "FREDDY HERNAN" ↔ "NAVAS CASTILLO FREDDY HERNAN") solo se il candidato è unico.
- Nota: la riga "Totali" del tracking contiene solo le 4 voci di lavoro; NON usarla per il confronto (mancherebbero le assenze).

## Controlli domeniche / consecutivi (formato identico a `check_domenica_<Mese>.xlsx`)
Matrice lavoratore × giorno con le sole **ore di lavoro** (non le assenze), poi a formula:
- somma ore per settimana lun–dom; `Max ore/sett`; `≥40h` = SI/NO; `N.sett ≥40h`
- `6+dom <gg>` per ogni domenica dal 7 in poi: =1 se nella settimana lun–dom ha lavorato **6 giorni su 7 e la domenica è tra questi**; `N.sett 6+dom`; `6+dom` SI/NO
- `Max gg consec` (formula matrice FREQUENCY, come l'originale) e `7gg consec` SI/NO → **≥7 giorni consecutivi = violazione da segnalare**
- Foglio `Tabella 6+domenica (SIC)`: per DS, una colonna per domenica con i nomi — è l'elenco che Alessandro "si appunta"

## Output (un file `Controllo_Zucchetti_<mese>.xlsx`, tabelle Excel native)
1. `Riepilogo` — per DS: lavoratori tracking/Zucchetti, abbinati, solo-tracking, solo-Zucchetti, giorni con delta, delta ore totale, ore totali
2. `Delta_giorni` — solo i giorni con delta: ore tracking (con split lavoro/assenze), ore Zucchetti, delta, lettura (manca su Zucchetti / manca su tracking / ore diverse), voci del tracking quel giorno
3. `Non_abbinati` — lavoratori presenti da una parte sola
4. `V_<DS>` — matrice TRACKING | ZUCCHETTI | DELTA (stesso layout del vecchio foglio VERIFICA, delta a formula, rosso/arancio)
5. `SIC` (+ `STD` se disponibili) e `Tabella 6+domenica (SIC)`

## Uso
```
python controllo_zucchetti.py <cartella_con_14_file> 2026 10 Controllo_Zucchetti_ott26.xlsx
```

## Trappole viste
- DLZ2: il foglio tracking può chiamarsi `08.26` pur contenendo settembre → lo script sceglie il foglio dalle date, non dal nome.
- DLZ2 Zucchetti ha anche `Foglio1` in decimale: si usa `ORARI`, che è l'originale.
- Matricola DER2 è alfanumerica (`S005113`); nei tracking a volte è 0/vuota → abbinamento per nome.
- Settembre 2026, unico residuo reale: DER1 Mitroi Alexandru, malattia 12-13/9 = 8+7 h nel tracking vs 7+0 su Zucchetti (+8 h): da verificare con Ops/HR.

## Chiusura: stress test STANDARD come da protocollo del progetto.
