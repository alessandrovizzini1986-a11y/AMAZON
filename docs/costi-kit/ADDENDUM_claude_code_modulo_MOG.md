# Addendum — Controllo MOG e rischio integrazione (somministrati STD)

*Si aggiunge a `PROMPT_claude_code_costruzione_modulo_presenze.md` e a `PROMPT_claude_code_modulo_costi_fine_mese.md`. Il controllo MOG è obbligatorio ogni volta che si trattano gli STD: oggi nei due prompt compare solo come "integrazione MOG = 0 salvo dato esterno". Qui diventa un modulo con dati, calcolo, alert e costo. Riferimento Python: la logica è in `riferimento/` del kit costi (confronto tracking × file ADECCO_PS); golden test su DLO4 ottobre 2026.*

## 1. Cos'è e perché serve prima della chiusura
I somministrati MOG (Monte Ore Garantito) hanno un contratto part-time con una % (es. 35 % = 59,2 h/mese, 59,1 % = 99,9 h) che Adecco **fattura comunque** se le ore retribuite del mese restano sotto: la differenza arriva in fattura come "INTEGRAZIONE MOG" a 20,86 €/h. Il controllo serve a vederlo **durante** il mese, quando Ops può ancora assegnare rotte a chi è sotto, non a consuntivo. Cerchiamo sempre di evitarla; cuba poco (set 2026: 746 € su 7 DS) proprio perché la controlliamo.

## 2. Input
| File | Quando | Come si riconosce | Colonne usate |
|---|---|---|---|
| `ADECCO_PS_AAAA_MM.xlsx`, foglio `PS`, intestazione in **riga 3** (riga 1 = data chiusura payroll in A3) | ogni mese dall'ufficio payroll | intestazioni `Codice fiscale`, `Nome`, `Cognome`, `Sito`, `% MOG da contratto`, `OreMog sul mese` | CF, nome, `Sito` (Valsamoggia→DER1, Santarcangelo→DER2, Origgio→DLO2, Buccinasco→DLO4, Castegnato→DLO5, Pomezia→DLZ2, Vigonza→DVN1), `Data Inizio/Fine Contratto`, `% MOG da contratto`, `OreMog sul mese`, `OreMog settimanali`, `Rischio consolidamento?`, `Media delle ore settimanali retribuite ultimo semestre`, `Quanto è il 20% del mog?` |
| `Mog_Cambio_PS_AAAA_MM_<Sito>.pdf` / `Mog_Cambio_Lavoratore_AAAA_MM_PS.pdf` | quando arrivano gli aumenti | PDF con elenco lavoratore → nuova % | aggiornano la % vigente dalla data indicata (tabella `MogVariazione`) |
| `Aumenti MOG PS.xlsx` | idem | — | stessa cosa in Excel |
| Tracking STD del mese (già nel modulo Presenze) | settimanale / fine mese | — | ore per giorno per voce |

Tabelle: `MogContratto(cf, nome, station, pctMog, oreMogMese, oreMogSett, dataInizio, dataFine, versioneFile, dataChiusuraPayroll)` · `MogVariazione(cf, pctNuova, validaDal, fonte)` · `MogEsito(mese, station, cf, oreLav, oreAssRetrib, computo, oreMog, gap, stato, proiezioneFineMese, costoIntegrazione)`.

## 3. Calcolo
- **Computo mensile** = ore lavorate (Standard + Straordinario + Supplementare + Accordo) + **assenze retribuite** (Ferie, ROL, ExF, 104, Malattia, Infortunio, Permesso sindacale, Altri permessi). **Non** contano: Permesso non retribuito, Assenza ingiustificata, Riposo.
- **MOG del mese** = `OreMog sul mese` del file; se esiste una `MogVariazione` valida nel mese, ricalcolare `oreMogMese = pct × 169 h` (169 = divisore mensile FT 39 h) pro-rata dalla data di validità. Per contratti iniziati o finiti nel mese: pro-rata sui giorni di calendario.
- **Gap** = computo − MOG. `stato`: `OK` (gap ≥ 0) · `SOTTO MOG` (gap < 0 a fine mese) · `A RISCHIO` (durante il mese: proiezione sotto) · `ZERO ORE` (MOG > 0 e nessuna ora pianificata/lavorata: rischio integrazione piena) · `NON IN FILE MOG` (nel tracking ma non nel file: assunto dopo la chiusura payroll, MOG sconosciuto → da chiedere) · `NON NEL TRACKING` (nel file ma senza righe: cessato o dimenticato).
- **Proiezione** (controllo settimanale): computo a oggi + (ore medie/giorno lavorato × giorni lavorativi residui secondo il pattern `GIORNI DA CONTRATTO` se presente, altrimenti 5/7); `A RISCHIO` se proiezione < MOG − 4 h.
- **Costo integrazione** = max(0, −gap) × tariffa Standard ADIT (20,86). Entra automaticamente nella riga "Integrazione MOG" della stima STD del modulo Costi (oggi cella gialla = 0).
- **Rischio consolidamento**: riportare le colonne del file (`Rischio consolidamento?`, media ore ultimo semestre vs 20 % del MOG, `Mese prossimo possibile consolidamento`) con un flag se la media delle ore retribuite supera il MOG del 20 % per i 6 mesi: è l'altro costo nascosto (il PT si consolida a % più alta).

## 4. Dove si vede
- Pagina **`/presenze/settimanale`**: nuovo blocco "MOG" per station: tabella lavoratori `A RISCHIO` / `ZERO ORE` con ore fatte, MOG, ore mancanti, giorni residui; una riga nel messaggio Teams: "MOG: X lavoratori sotto proiezione (nomi, ore mancanti) — assegnare rotte entro fine mese".
- Pagina **`/presenze/fine-mese`**: tabella finale per station (OK / SOTTO MOG con ore e €, NON IN FILE, NON NEL TRACKING, ZERO ORE); Excel `Controllo_MOG_<DS>_<mese>.xlsx` (tabella nativa, colonne: Lavoratore, Ore MOG mese, % MOG, Fine contratto, Ore lavorate, Assenze retribuite, Non retribuite, Computo, Gap, Stato).
- Pagina **`/costi/fine-mese`**: riga "Integrazione MOG" = Σ costo integrazione della station (non più 0).
- Pagina **`/costi/parametri`**: import file ADECCO_PS (anteprima: teste per sito, data chiusura payroll, differenze di % rispetto alla versione precedente = aumenti MOG applicati), import PDF/Excel aumenti.
- Alert: file MOG più vecchio di 40 giorni → "chiedere all'ufficio payroll il file aggiornato".

## 5. Test golden — DLO4 ottobre 2026 (tracking STD corretto + `ADECCO_PS_2026_10.xlsx`, chiusura payroll 30/9)
| Stato | Teste | Dettaglio |
|---|---|---|
| OK | 30 | — |
| SOTTO MOG | 5 | lavoratori A −27,2 h · B −19,2 · C −11,2 · D −3,2 · E −3,2 (tutti 35 % = 59,2 h) → 64,0 h = **1.335 €** |
| NON IN FILE MOG | 19 | assunti di ottobre (es. 171,6 h, 163,8 h, 144 h): MOG da chiedere |
| NON NEL TRACKING | 3 | lavoratore F (59,1 %, fine 24/12: **ZERO ORE → rischio integrazione piena 99,9 h = 2.084 €**), lavoratore G (fine 9/10), lavoratore H (fine 1/10) |
File MOG Buccinasco: 38 righe. Match per CF, poi per cognome+nome (ordine indifferente, token subset).
Settembre 2026 (riferimento di costo a consuntivo): ADIT "INTEGRAZIONE MOG" 746 € su 7 DS (DER1 152 € gen; DVN1 e DER2 i più frequenti).

## 6. Stato dell'implementazione (04/11/2026)
- Golden DLO4 ottobre ricalcolato dal sito, uguale al kit: **30 OK**, **5 SOTTO MOG = 64,0 h = 1.335 €**, 19 NON IN FILE MOG, 2 NON NEL TRACKING (cessati 1/10 e 9/10), **1 ZERO ORE** (lavoratore F, 99,9 h = 2.084 €).
- Regola confermata il 04/11/2026: chi nel mese ha solo assenze (es. malattia tutto il mese) e nessuna ora lavorata è ZERO ORE e Adecco integra tutto il MOG. Con ore lavorate, le assenze retribuite contano nel computo come da §3.
- Consolidamento: il sito legge anche Proroghe, anzianità, ore retribuite ed eccedenti degli ultimi 6 mesi, "supera il 20 %", % da consolidare, nuovo monte ore, nuova % MOG, orario consolidato e i mesi di consolidamento. I consolidamenti previsti (supera = SI) si vedono in Parametri e nel blocco MOG di Presenze; non cambiano il MOG del mese finché non arriva il file nuovo o un aumento.
- Gli aumenti MOG (PDF/Excel) si inseriscono a mano in Parametri: non c'erano file di esempio per leggerli in automatico.
