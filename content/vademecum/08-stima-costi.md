---
title: "Stima costi: parziale e totale"
order: 8
category: "Personale"
updated: "2026-10-15"
---

Due momenti, due file, stessa logica: ore per categoria × costo orario = costo del mese. La parziale serve ad Annalisa per la stima; la totale chiude il mese.

| | Stima parziale | Stima totale |
|---|---|---|
| File | `Stima_Costi.xlsx`, un foglio per mese (`Sett_26`) | `Stima_Costo_personale.xlsx`, un foglio per mese e perimetro (`AMZ_SEP_26`, `GLS_AGO_26`) |
| Quando | Terza settimana del mese (es. "al 20-09-26") | Fine mese, a tracking chiuso |
| Input | Tracking SIC e STD di tutte le station, parziali | Tracking finali, teste per contratto, costo orario (foglio `Costo orario`) |
| Granularità | Ore per categoria e station, SIC e STD separati | Teste per contratto (CTI FT, CTI PT, CTI PT 32h, Dispatcher, STD FT, STD PT, MOG) + ore per categoria + costo per station |
| Destinatario | Annalisa Pinazzi | Annalisa Pinazzi, Valerio |

**Categorie di ore (uguali nei due file)**

| Categoria | Da dove nel tracking |
|---|---|
| STANDARD | Riga `Standard` |
| MAGGIORAZIONE 50 | Sabato, oppure domenica lavorata come quinto giorno (maggiorazione 50%) |
| SUPPLEMENTARI 18 | Riga `Supplementare`: ore fatte da un part time in un giorno che non ha da contratto (es. PT24 lun-mar-mer che lavora giovedì e venerdì), entro il quinto giorno |
| SUPPLEMENTARI 65 | Riga `Supplementare` di domenica come sesto giorno (maggiorazione 65%) |
| STRAORDINARI SET | Riga `Straordinario`: sesto giorno lavorato in settimana o di sabato, oltre le 39 ore (maggiorazione 50%) |
| STRAORDINARI DOM | Riga `Straordinario` di domenica come sesto giorno (maggiorazione 65%) |

Regola in una frase: le ore nei giorni **non previsti dal contratto** sono supplementari; il **sesto giorno** della settimana (oltre le 39 ore) è straordinario; sabato = 50%, domenica = 65% se sesto giorno, 50% se quinto giorno. Prima stima da fare con Alessandro accanto per verificare l'attribuzione.
| TRASFERTE ORD / TRASFERTE DOM | Giorni con trasferta, feriali / domenica (dal controllo trasferte, sezione 7) |
| FERIE, ROL, ExFe / Malattie / Infortuni / Eventi mat. | Righe FERIE, ROL, EXF e assenze (ore o teste, come indicato nella riga) |

| Scheda: stima parziale | |
|---|---|
| Trigger | Terza settimana del mese |
| Passi | 1. Duplica il foglio del mese precedente, rinominalo `<Mese>_26`. 2. In A1 scrivi "al GG-MM-AA" con la data dell'ultima domenica per cui hai i tracking completi (la terza settimana del mese, di norma), in B1 il giorno di taglio, in C1 i giorni del mese (servono alla proiezione). 3. Per ogni station e categoria inserisci le ore cumulate al giorno di taglio, prima il blocco SIC poi il blocco STD. 4. Non toccare `COSTO/H` e `Costo tot`: sono formule. 5. Verifica che la cella di controllo mostri `OK`. 6. Invia ad Annalisa il totale proiettato. |
| Check finale | Cella controllo = OK; somma HH per station = totale ore tracking della station alla stessa data; nessuna categoria a zero dove il mese prima era > 0 senza un motivo |

| Scheda: stima totale | |
|---|---|
| Trigger | Fine mese, dopo l'invio presenze finali a payroll |
| Passi | 1. Duplica il foglio del mese precedente (`AMZ_<MESE>_26` e, se serve, `GLS_<MESE>_26`). 2. Aggiorna le teste per contratto in `#teste` per station. 3. Inserisci le ore finali per categoria, blocco SIC e blocco STD, per ogni station. 4. Costo orario: solo dal foglio `Costo orario`, mai modificato a mano in riga. 5. Confronta `TOT. COSTO SIC` e `TOT. COSTO STD` con la stima parziale: scostamento oltre il 10% va spiegato in una riga. |
| Check finale | Totale ore = totale tracking finale; totali station che sommano al totale generale; scostamento vs parziale spiegato |
