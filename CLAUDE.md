# Note per le sessioni di lavoro

## Ogni mese: buste paga (LUL)

Quando il titolare carica i PDF delle buste del mese (SIC per station, GLS) e il file HR dell'organico:

1. Aggiorna i dati del sito: Buste paga (mese della busta), Assenze e infortuni (mese di lavoro, cioè il mese prima per i SIC), organico (`OrganicoPersona`, versione = mese del file). Carica anche `BustaLavoroPersona` (ore per voce del mese di lavoro, dal calendario e dalle voci di straordinario della busta): serve al confronto tracking–buste. Le ore del tracking (`TrackingPersonaMese`) le salva il sito da solo quando il titolare esegue Presenze → Fine mese.
2. **Restituisci sempre il PDF di DER1 senza la busta del titolare** (calendario e cedolino, di solito 3 pagine). Chiedi a lui il codice fiscale se non lo hai nella conversazione: non va scritto nel repo.
3. I PDF, i testi estratti e i file con nomi o codici fiscali restano fuori dal repo.
4. **Restituisci anche i cedolini SIC ripuliti**, uno zip con un PDF per station: `python3 scripts/pulisci_cedolini.py USCITA.pdf ENTRATA.pdf` (serve `pip install pymupdf`). Per DER1 aggiungi `--togli-cf <codice fiscale del titolare>`. Nomi dei file: `LUL_<MESE>_<STATION>_redacted.pdf`. Dopo, controlla che nel testo dei PDF non restino codici fiscali, IBAN, "sindacal", "pignoramento", "Addizionale": lo script toglie il testo davvero, non lo copre soltanto. Per STD (cedolini dell'agenzia) lo script non è ancora verificato.

## Ogni mese: report "Costi del personale PS" (payroll)

Il file contiene Amazon (CDC 5569) e GLS (CDC 5565). Amazon va in `PayrollRiga` (Costi → Consuntivo), con la station presa dall'anagrafica dei costi e, per chi manca, dall'organico HR. GLS va in `PayrollGlsRiga` (la pagina Costi GLS lo usa senza ricaricare il file). Dopo ogni report nuovo ricontrolla i coefficienti di `src/domain/personale/buste.ts` (stima del costo in Buste paga) contro il costo vero.
