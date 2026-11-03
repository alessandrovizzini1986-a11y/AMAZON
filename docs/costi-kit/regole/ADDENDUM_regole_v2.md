# Addendum regole — controllo presenze (v2, 3 novembre 2026)

*Per Claude Code: queste regole si aggiungono a `PROMPT_claude_code_costruzione_modulo_presenze.md` e prevalgono dove in conflitto. Sono già implementate in `riferimento/controllo_trasferte_v2.py` (versione del 3/11) e verificate sui file di ottobre; gli output attesi in `attesi/` sono rigenerati con queste regole.*

## Perché queste regole (ragionamento)
Il controllo serve a intercettare, prima della busta paga, (a) soldi pagati senza prestazione, (b) prestazioni non registrate, (c) errori di compilazione che poi diventano costi o contestazioni. Nel primo giro su ottobre sono emersi tre buchi:
1. Un driver con **malattia nel tracking e pacchi su Amazon** veniva segnalato come "giornata mancante" (−1). È sbagliato: il tracking è la fonte retributiva e la malattia/infortunio prevale sul lavorato. Se è davvero andato a lavorare in malattia, è un tema HR/disciplinare, non un errore di tracking: non va in questo controllo.
2. Un driver con **78 ore in un giorno** (errore di digitazione) non era segnalato perché il parser azzerava i valori >24 trattandoli come celle "stantie" collegate a file esterni. Il risultato era peggio dell'errore: lo nascondeva. Ora ogni valore >24 e ogni giornata >10 h lavorate è un alert esplicito.
3. Per i **somministrati (STD) la domenica non può mai finire nella riga "Accordo (39-44 h)"**: la domenica è già pagata con maggiorazione, l'Accordo è un istituto settimanale feriale; se compare, Alessandro cancella la cella. Nel tracking DVN1 di ottobre ce n'erano 25 casi su 4 domeniche. Serve un alert dedicato, perché la stagista non lo vedrebbe mai da sola.

## Regole (vincolanti, da mettere in `regole.ts` e nel vademecum)
| # | Regola | Effetto nel controllo |
|---|---|---|
| R1 | **Malattia/infortunio battono il lavorato.** Se nel giorno il tracking ha ore su MALATTIA o INFORTUNIO (e 0 ore di lavoro) e Amazon mostra una rotta, **nessun alert** (−1 soppresso), nota "malattia batte il lavorato". | categoria −1 non assegnata |
| R2 | **Ore giornaliere > 10 h lavorate → sempre alert** (`ORE`, cat. G "Ore giornaliere oltre 10"), anche se trasferta e rotta coincidono. Vale per SIC e STD. | nuovo esito `ALERT ORE` |
| R3 | **Valore > 24 h in una cella giorno** (lavoro) → alert `ORE` cat. G "Valore anomalo" con il valore letto; ai fini di trasferta/rotta quel valore non si usa (0) ma la riga resta visibile come anomalia, mai nascosta in un foglio secondario. | nuovo esito `ALERT ORE` |
| R4 | **STD + domenica + ore nella riga Accordo > 0 → alert** `ACC` cat. J "Accordo di domenica (STD)", nota "cancellare". Non si applica ai SIC. | nuovo esito `ALERT ACCORDO` |
| R5 | Le regole R2–R4 producono un alert anche quando il giorno è altrimenti OK; nel messaggio Teams hanno una sezione propria ("ORE GIORNALIERE OLTRE 10 O VALORE ANOMALO", "ACCORDO DI DOMENICA (SOMMINISTRATI)") con l'azione richiesta. | messaggi e Excel |
| R6 | Dispatcher aggiunti (DER2): Simone Ales, Viktor Hrynchak, Freddy Hernan (Navas Castillo), Mario Riccardi. Aggiornare `regole/dispatcher.csv`. | esclusioni |

## Simboli aggiornati per la vista RISULTATO
`ok`, `+1`, `-1`, `H`, `A`, **`ORE`**, **`ACC`**, vuoto. Nel blocco Alert in cima alla pagina aggiungere i contatori `ORE` e `ACC`.

## Colonne e layout diversi fra tracking: come li gestisce il sito
Non si lavora per posizione di colonna. Il parser (già così nello script Python) individua:
- la **riga di intestazione** = la riga, fra le prime 8, che contiene la cella `Tipo`; la colonna `Tipo` = G per STD, H per SIC (dove in G c'è "Codice Matricola");
- le **colonne dei giorni** = a destra di `Tipo`, celle con una data Excel oppure un intero 1–31; con gli interi si gestisce il rollover (28,29,30 di settembre poi 1..31 di ottobre, poi 1 di novembre) tenendo solo il mese scelto; le colonne "Totale"/"totale" intercalate (DLO5, DVN1) si saltano; alla prima colonna "Tot…" **dopo** i giorni (DER1/DER2/DLZ2 con subtotali settimanali) ci si ferma;
- le colonne anagrafiche (Lavoratore, Driver ID, Codice fiscale, Codice Matricola, Tipo Contratto, Giorni da contratto) **per nome di intestazione**, con prefisso insensibile a maiuscole (`lavorat`, `driver`, `codice f`, `codice m`, `tipo c`);
- i **blocchi lavoratore** = dalla riga `Standard` alla riga `Standard` successiva; le voci per prefisso normalizzato (`standard`, `straord`, `supplement`, `accordo`, `riposo`, `ferie`, `rol`, `exf`, `104`, `malatt`, `infort`, `ingiust`, `sindac`, `altri perm`, `non retrib`, `trasfert`), così "SupplementAUe" o "ALTRI PERMESSI (104, cong. Par)" non rompono nulla.
Il foglio giusto dentro il file si sceglie contando quante colonne-giorno cadono nel mese richiesto (il nome del foglio non è affidabile: DLZ2 aveva settembre nel foglio "08.26"). Se un file non supera questi riconoscimenti, la pagina lo rifiuta con il motivo preciso e non blocca gli altri. Test: i 14 tracking di ottobre in `esempi/test_sito/` coprono tutte le varianti (date vs interi, subtotali, colonne intercalate, sconfinamento di mese, Tipo in G o H).

## Test di accettazione aggiornati
- `esempi/test_sito/` = pacchetto completo di ottobre 2026 (14 tracking, `FLEX_TUTTI.csv` 1–31, 5 Zucchetti). Periodo settimanale: 1–31/10 per DER1, DER2, DLO5, DLZ2, DVN1; **1–25/10 per DLO2 e DLO4** (tracking non definitivi). Fine mese: DER1, DER2, DLO5, DLZ2, DVN1.
- Attesi in `attesi/`: `Controllo_trasferte_<DS>_ott26.xlsx` (7 file), `Riepilogo_Ops_ott26.xlsx`, `Messaggi_Teams_ott26.txt`, `Controllo_Zucchetti_ott26.xlsx`. Numeri di riferimento: Da_verificare = 115 righe (24 `+1`, 17 `-1`, 5 `A`, 40 `H`, 4 `ORE`, 25 `ACC`); Zucchetti: 5 DS, 250 lavoratori abbinati su 250, unico delta DVN1 Venturini 10/17/31 ottobre −1 h ciascuno; 1 caso >6 consecutivi (DER1 Hmaied Yahya 13–19/10); 82 righe 6+domenica.
