# Modulo "Fatture Amazon" – specifica v2 (Next.js 15 / Prisma / Vercel)

Versione tarata sullo stack del sito: TypeScript 5.7, Next.js 15.1 App Router, React 19, server action con
zod, Tailwind 3.4, Vitest 2, PostgreSQL + Prisma 6 (Neon in prod), JWT `jose` in cookie httpOnly, RBAC in
`src/lib/rbac.ts`, nessun file caricato sul server (lettura nel browser, sul DB solo metadati/risultati),
limite server action 10 MB, Vercel. Librerie già presenti: `exceljs`, `papaparse`, `jszip`. Da aggiungere:
`pdfjs-dist@3.11.174` (solo lato browser, con worker).

Il modulo ha tre parti, da consegnare in quest'ordine:
1. **Fatture** – upload PDF → righe da incollare in `fatt_2026` + registro anti-doppioni + allineamento col
   file AGGREGATO (fase 1, prioritaria).
2. **Fatturato** – storico fatturato per mese/settimana/stazione/classe, alimentato dallo storico del file
   AGGREGATO e dalle fatture caricate (fase 2).
3. **Forecast** – upload dei forecast Amazon (PROF next/same) → ricavo previsto per settimana/mese/stazione,
   con tariffa per descrizione ricavata dalle ultime settimane fatturate, e backtest (fase 3).

Il sito **non scrive mai** nel file AGGREGATO e **non si collega** al portale Amazon.

## 0. Prima di scrivere codice
- Leggi `reference/parser.js`: è il parser di riferimento (logica verificata riga per riga su 79 fatture
  reali). Portalo in TypeScript in `src/domain/fatture/parser.ts` senza cambiarne la logica.
- Usa pdf.js **nel browser** (come già fate per Presenze/Telepass): `pdfjs-dist/legacy/build/pdf` con
  `GlobalWorkerOptions.workerSrc` sul worker servito da `public/`. Al server arrivano solo le righe già
  estratte (JSON), mai il PDF. Un caricamento da 80 fatture produce ~1.300 righe ≈ 250 KB: sotto il
  limite di 10 MB; comunque invia a lotti di massimo 500 righe per chiamata.
- Permessi da aggiungere alla matrice `src/lib/rbac.ts` (nomi indicativi, adeguali allo stile esistente):
  `fatture.import` (CONTROLLO, ADMIN) · `fatture.registro` (CONTROLLO, ADMIN) · `fatture.allinea` (ADMIN) ·
  `fatture.storico` (ADMIN) · `fatturato.view` (ADMIN; RESP_MEZZI solo la propria station) ·
  `forecast.import` (ADMIN) · `forecast.view` (ADMIN). Ogni pagina e ogni action li verifica; ogni
  scrittura va in `AuditLog`.
- Struttura come gli altri moduli: `src/app/(app)/fatture-amazon/` con `layout.tsx` (permesso + schede),
  `page.tsx`, sottocartelle `importa/`, `registro/`, `allinea/`, `fatturato/`, `forecast/`, ciascuna con
  `page.tsx` (server component), `*Client.tsx` (browser), `actions.ts`, `dati.ts`. Logica pura in
  `src/domain/fatture/*.ts` e `src/domain/forecast/*.ts`, Excel in `src/lib/fatture/*.ts`, test in
  `tests/fatture/` e `tests/forecast/` (Vitest, contro i file in `fixtures/`).

## 1. Modello dati (Prisma)
```prisma
model AmazonInvoice {
  id               String   @id @default(cuid())
  numero           String   @unique           // INV-IT3JDBF-0002543 (maiuscolo, trim, NV-→INV-)
  ds               String                      // DER1 … DVN6
  tipo             String                      // "Fattura" | "Nota di credito"
  dataFattura      DateTime
  periodoDa        DateTime
  periodoA         DateTime
  importoDovuto    Decimal  @db.Decimal(12,2)
  sommaTotale      Decimal  @db.Decimal(12,2)
  sommaAvere       Decimal  @db.Decimal(12,2)
  nRighe           Int
  rifNotaCredito   String?
  pdfNome          String?
  pdfSha256        String?
  fonte            String                      // "PDF" | "AGGREGATO"
  esportataIl      DateTime?
  esportataDaId    String?
  presenteInFatt2026Il DateTime?
  righe            AmazonInvoiceLine[]
  createdAt        DateTime @default(now())
}
model AmazonInvoiceLine {
  id          String   @id @default(cuid())
  invoiceId   String
  invoice     AmazonInvoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  ds          String
  data        DateTime
  descrizione String
  quantita    Int
  prezzo      Decimal @db.Decimal(12,4)
  tasse       String                           // "VAT 22"
  rateoIva    Decimal @db.Decimal(5,4)
  importoIva  Decimal @db.Decimal(12,2)
  totale      Decimal @db.Decimal(12,2)
  avere       Decimal @db.Decimal(12,2)        // netto = totale − importoIva
  microarea   String?
  macroarea   String?
  week        Int                              // settimana Amazon (dom–sab)
  mese        Int
  anno        Int
  classe      String                           // vedi §5 (ND_STANDARD, SD_A, EXTRA_CARBURANTE, …)
  @@index([ds, data]) @@index([anno, mese]) @@index([anno, week]) @@index([classe])
}
model ForecastFile {
  id        String @id @default(cuid())
  nome      String                             // PROF_44_next.xlsx
  linea     String                             // "ND" | "SD"
  sha256    String @unique
  caricatoIl DateTime @default(now())
  caricatoDaId String?
  righe     ForecastRoute[]
}
model ForecastRoute {
  id        String @id @default(cuid())
  fileId    String
  file      ForecastFile @relation(fields: [fileId], references: [id], onDelete: Cascade)
  week      Int
  data      DateTime
  station   String
  cycle     String
  serviceType String
  routes    Int
  classe    String
  @@index([station, data]) @@index([week])
}
```
Per ogni (station, data, classe) vale **l'ultimo file caricato** (il forecast viene riemesso ogni settimana e
sostituisce il precedente): tienilo come regola nelle query, non cancellare i file vecchi.

## 2. Fatture – importa (ruolo CONTROLLO/ADMIN)
- Drag & drop di PDF (anche 80) o di uno **zip di PDF** (lo zip lo produce il preferito del browser con
  nomi `DS-INV-IT3JDBF-XXXXXXX.pdf`; usare `jszip`).
- Nel browser: pdf.js → `parseInvoice(pages, nomeFile)` per ogni file → anteprima.
- **Ogni file caricato compare nel report** con stato: `nuova` · `già presente` (motivo: esportata il … /
  presente in fatt_2026) · `doppione nel caricamento` · `errore` (motivo). Nessun file sparisce.
- Anteprima: tabella fatture (Numero, DS, Tipo, Data fattura, Periodo, Importo PDF, Somma righe, Delta,
  N righe, Stato) + tabella descrizioni (Descrizione, N righe, Somma AVERE, "nuova" se mai vista nello
  storico). Delta = importoDovuto − sommaTotale: normale tra −3 e +3 € (IVA arrotondata da Amazon sul
  riepilogo); oltre → badge "controllare", non bloccante.
- Pulsanti: **Scarica Excel** (§4), **Copia righe** (§4.3). Al primo dei due: server action `registraEsportazione`
  che salva fattura + righe (fonte PDF, sha256 del PDF, classe per riga) e segna `esportataIl`. Un secondo
  scarico della stessa anteprima non duplica nulla (upsert su `numero`).
- In alto: "Ultima fattura registrata: INV-…-2611 · prossimo numero da scaricare: 2612".

## 3. Fatture – registro e allineamento
### 3.1 Registro (CONTROLLO/ADMIN)
Elenco fatture con filtri (DS, periodo, stato), colonne di §1, stato derivato: `esportata`,
`presente in fatt_2026`, entrambi, e la lista **"esportate ma non ancora viste in fatt_2026"** (promemoria:
scaricate ma non incollate). ADMIN può annullare un'esportazione (audit).
### 3.2 Allinea con il file AGGREGATO (ADMIN)
- L'utente trascina `AGGREGATO DETTAGLI FATTURA_conto_economico.xlsx` (~37 MB, 24 fogli, Power Pivot).
  Lettura **nel browser**, in un Web Worker, con `exceljs` in modalità streaming
  (`new ExcelJS.stream.xlsx.WorkbookReader`) o, se troppo pesante, leggendo solo l'entry
  `xl/worksheets/sheetN.xml` del foglio `fatt_2026` via `jszip` + `xl/sharedStrings.xml`. Deve funzionare
  con il file da 37 MB su un PC d'ufficio in meno di 60 s; se non ci riesci, fallback obbligatorio:
  campo "incolla la colonna Numero" (testo, un numero per riga).
- Legge SOLO il foglio `fatt_2026`: riga 1 intestazioni, colonna `Numero` (case-insensitive, trim).
  Numeri normalizzati (§5.1). Il file non viene inviato al server né conservato.
- Server action `allineaNumeri(numeri[])` a lotti: per ogni numero presente in `AmazonInvoice` imposta
  `presenteInFatt2026Il`; per i numeri non presenti crea un record minimo (fonte AGGREGATO, importi 0,
  nRighe 0) così il registro li conosce. Report: trovati, nuovi, esportate-ma-non-presenti, righe con
  Numero vuoto.
### 3.3 Carica storico (ADMIN, una tantum e poi quando serve)
Stesso upload, ma importa **tutte le righe** di `fatt_2026` (e, con un flag, `fatt_2025`) in
`AmazonInvoiceLine` con fonte AGGREGATO, raggruppate per `Numero` in `AmazonInvoice` (importi = somme
delle righe, date = min/max). Serve per il Fatturato (§6) e la tariffa (§7). Invio a lotti di 500 righe.
Regole: righe con Numero vuoto → raggruppate sotto `SENZA-NUMERO-<DS>-<anno>-<week>`; righe già presenti
(stesso numero fonte PDF) non vengono sovrascritte; la seconda importazione dello stesso file non duplica
(chiave: numero + data + descrizione + quantità + avere).

## 4. Output Excel / TSV
### 4.1 Foglio `righe` – 16 colonne, intestazioni esatte (`fixtures/colonne_fatt_2026.txt`)
| # | Intestazione | Formato |
|---|---|---|
| 1 | DS | testo |
| 2 | Data | data `DD/MM/YYYY` |
| 3 | Descrizione | testo |
| 4 | Quantità | intero |
| 5 | Prezzo (€) | numero |
| 6 | Tasse | `VAT 22` |
| 7 | Rateo IVA | 0,22 formato `0%` |
| 8 | Importo IVA (€) | 2 decimali |
| 9 | Totale (€) | 2 decimali |
| 10 | AVERE | 2 decimali |
| 11 | MICROAREA | vuota |
| 12 | MACROAREA | vuota |
| 13 | WEEK | intero |
| 14 | MESE | intero |
| 15 | ANNO | intero |
| 16 | Numero | testo |
Ordine: numero fattura crescente, poi ordine del PDF. Fogli aggiuntivi: `fatture`, `scartate`, `descrizioni`.
Tabelle Excel native `TableStyleMedium2`, nessuna formattazione custom. Nome `import_AAAA-MM-GG_HHMM.xlsx`.
Con `exceljs`: `worksheet.addTable({ name, ref:'A1', style:{theme:'TableStyleMedium2', showRowStripes:true}, columns, rows })`.
### 4.2 Opzione "MICRO/MACROAREA precompilate"
Spenta di default. Se attiva usa `fixtures/mapping_macroarea.csv` (tabella `AppConfig` o seed), segnalando le
descrizioni non mappate.
### 4.3 Copia righe (TSV)
Stesse 16 colonne, senza intestazione, TAB, date `gg/mm/aaaa`, decimali con **virgola**, niente migliaia,
`22%` per il rateo, MICRO/MACRO vuote. `navigator.clipboard.writeText` con fallback `execCommand('copy')`.

## 5. Regole di dominio
### 5.1 Numero fattura
Chiave univoca `INV-IT3JDBF-XXXXXXX`: maiuscolo, trim, `^N?V-` → `INV-`. Il nome file non conta mai.
### 5.2 Parsing (vedi `reference/parser.js`)
- Template **A** "Fattura" settimanale: sezione `Dettagli fattura`, righe giornaliere, date **gg/mm/aaaa**,
  descrizione su 1–2 righe (continuazione da accodare), multipagina con intestazioni/footer da ignorare.
- Template **B** "Fattura per conto del fornitore" / "Nota di credito per conto del fornitore": sezione
  `Appendice…`, date **mm/gg/aaaa**, IVA = importo × aliquota (half-up), totale = importo + IVA.
  Nota di credito: importi negativi con spazio (`- 8.430,00`), `rifNotaCredito` da `Credit Note for INV-…`.
- DS = ultima parola della riga sotto "Indirizzo di consegna:" (A) o "Fattura a" (B). Sono normali anche
  DVN5, DVN6 (Away Team) oltre a DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1.
- Per riga: `AVERE = Totale − Importo IVA`; `WEEK` = settimana ISO di (data + 1 giorno) (settimana Amazon
  dom–sab); `MESE`, `ANNO` dalla data; numeri italiani `1.234,56`. Non ricalcolare Quantità × Prezzo (il
  prezzo del PDF è arrotondato: FuelAllowance 0,23 vs 0,2274 reale).
- `numero` mancante o 0 righe → `errore` "template non riconosciuto", mai righe inventate.
### 5.3 Classe della riga (`src/domain/fatture/classifica.ts`)
Dalla descrizione, con queste regex in ordine (prima che combacia vince):
| classe | regola (inizio descrizione) | significato |
|---|---|---|
| SD_A | `Sameday Parcel - Block of 6` | Sameday 6h |
| SD_B | `Multi-Use` oppure `Sameday Parcel - Block of 4` | Multi-Use 3h30 / Sameday 4h |
| SD_C | `Sameday Parcel - Block of 3` | Sameday 3h |
| SD_ALTRO | `Sameday` | altre Sameday |
| ND_ORDT | `ORDT` | |
| ND_SWA | `MFN Pickup` | |
| ND_CARGOBIKE | `Cargo Electric` | |
| ND_MICRO | `Micro Oversize` | |
| ND_STANDARD | `Standard Parcel`, `Nursery Route`, `Rescue`, `Box Truck` | tutte le durate e varianti |
| EXTRA_CARBURANTE | `FuelAllowance`, `Fuel Allowance` | |
| EXTRA_BONUS | `DSP Bonus Coverage` | |
| EXTRA_ABORT | `AMZL Late Cancel` | |
| EXTRA_TRAINING | `Training` | |
| EXTRA_INCENTIVI | `OTR`, `Incentiv`, `Pedaggi`, `Parcheggi`, `Modifiche - Pedaggi` | incentivi, pedaggi, parcheggi |
| EXTRA_ALTRO | tutto il resto | correzioni, note di credito, una tantum |
`is_rotta` = classe che inizia con `ND_` o `SD_`. Verifica: `fixtures/classificazione_descrizioni.csv`
(187 descrizioni 2025–2026 con classe attesa).

## 6. Fatturato (ADMIN; RESP_MEZZI solo propria station)
Dati: `AmazonInvoiceLine` (storico AGGREGATO + PDF). Misura principale: **AVERE** (netto). Viste:
- **Mese × DS** (anno selezionabile): tabella + totale riga/colonna; confronto con stesso mese anno
  precedente (fatt_2025 se caricato).
- **Mese × classe** (ND_STANDARD, SD_*, EXTRA_*) e **settimana Amazon × DS**.
- Per DS: rotte (somma Quantità delle classi rotta), € per rotta, extra per rotta.
- Dettaglio drill-down: elenco fatture del mese/DS con link al registro.
- Export Excel delle viste (tabella nativa).
Attribuzione temporale = **data della riga** (giorno di servizio), come fa il file (colonne MESE/ANNO):
non la data fattura. Nota in pagina: "le ultime 2 settimane possono essere incomplete (fatture di
rettifica e incentivi arrivano con 2 settimane di ritardo)".

## 7. Forecast (ADMIN)
### 7.1 Import
- Upload `PROF_<wk>_next.xlsx` / `PROF_<wk>_same.xlsx` (foglio `PROF`, colonne `week, ofd_date, station,
  cycle, dsp, DSP Type, service_type_scheduling, routes_output`; eventuali altri fogli vanno ignorati).
  Lettura nel browser con `exceljs`, invio righe a lotti. Linea = `ND` se nel nome c'è `next`, `SD` se
  `same`; altrimenti chiedi.
- Classe per riga da `fixtures/forecast/mappa_forecast_classe.csv` (tabella modificabile dall'ADMIN):
  `service_type_scheduling` + `cycle` (`*` = qualsiasi) → classe. Default: Standard Parcel (tutte le
  varianti, 6.4H, 7.4H, Away Team) → ND_STANDARD; ORDT → ND_ORDT; MFN Pickup → ND_SWA; Cargo Electric
  Bicycle → ND_CARGOBIKE; Multi-Use → SD_B; Sameday Parcel con cycle `CYCLE_SD_A` → SD_A, altri cycle →
  SD_C. Eccezione per station: DLO5 Sameday → SD_B (fattura "Sameday Parcel - Block of 4 Hours").
  Service non mappato → riga importata con classe `NON_MAPPATO` e avviso.
- DVN5/DVN6 (Away Team) restano stazioni a sé.
### 7.2 Tariffa (`src/domain/forecast/tariffe.ts`)
Finestra di calibrazione = ultime **N settimane Amazon chiuse** (default N = 5; chiusa = settimana con la
fattura settimanale presente per quella DS e terminata da almeno 14 giorni; parametro modificabile).
Per ogni (DS, classe rotta): `tariffa = Σ AVERE / Σ Quantità` delle righe della classe.
Per ogni DS: `extra_per_rotta = Σ AVERE di EXTRA_CARBURANTE+EXTRA_BONUS+EXTRA_ABORT+EXTRA_TRAINING ÷ Σ rotte
(tutte le classi rotta)`; mostrare anche la scomposizione per classe extra.
EXTRA_INCENTIVI ed EXTRA_ALTRO sono esclusi dalla previsione (mostrati a parte come "non previsti").
Se per (DS, classe) non ci sono righe nella finestra → usa la tariffa media della classe sulle altre DS
e segnala "tariffa stimata".
### 7.3 Previsione (`src/domain/forecast/previsione.ts`)
Per settimana e DS: `rotte_previste(classe)` dall'ultimo forecast caricato (§1) →
`ricavo_rotte = Σ rotte × tariffa(DS, classe)`; `extra = extra_per_rotta(DS) × rotte_totali`;
`totale = ricavo_rotte + extra`. Se per una DS manca il forecast SD ma nello storico la DS ha SD, usa la
**media settimanale SD delle N settimane** come stima e marcala "SD da media". Mese = somma delle settimane
pro-quota sui giorni (una settimana a cavallo di due mesi si divide per giorni).
Viste: settimana × DS, mese × DS, con colonne previsto / fatturato (dove c'è) / scostamento; grafico
semplice settimana per settimana (previsto vs reale). Export Excel.
### 7.4 Backtest
Per ogni settimana chiusa con forecast disponibile: previsto (calcolato con la finestra che precedeva quella
settimana) vs fatturato; errore % per DS e totale; errore % anche sulle sole rotte (forecast vs
fatturate), per distinguere errore di volume da errore di tariffa.

## 8. Test automatici (Vitest) – obbligatori
Tutti in `tests/fatture/` e `tests/forecast/`, con i file di `fixtures/` copiati in `tests/fixtures/`.
1. **parser**: per ciascuno dei 12 PDF in `fixtures/pdf`, output identico a `fixtures/expected/<numero>.json`
   (campi testata, numero righe, ogni riga; numeri con tolleranza 0,005). Lo script `tests/run_tests.js`
   mostra come leggere i PDF con pdf.js in Node.
2. **classifica**: ogni riga di `fixtures/classificazione_descrizioni.csv` → classe attesa (187 casi).
3. **numero**: `normalizzaNumero(" nv-it3jdbf-0002032 ")` = `INV-IT3JDBF-0002032`.
4. **tariffe**: con `fixtures/forecast/righe_settimane_36_40.csv` → tariffe uguali a
   `atteso_tariffe_36_40.csv` (tolleranza 0,01) e extra per rotta uguali a
   `atteso_extra_per_rotta_36_40.csv` (tolleranza 0,001).
5. **previsione**: con le tariffe del punto 4, il forecast `PROF_40_settimana_41.csv` e la media SD delle
   settimane 36–40 → per DS, `previsto_totale` uguale a `atteso_previsione_settimana_41.csv` (tolleranza 1 €);
   `actual_totale` ricalcolato da `righe_actual_settimana_41.csv` deve coincidere.
6. **fatturato**: importando `fixtures/fatturato/fatt_2026_completo_al_24-10.csv` (12.361 righe) le somme
   mese × DS devono coincidere con `atteso_fatturato_mensile_2026_per_DS.csv` e mese × classe con
   `atteso_fatturato_mensile_2026_per_classe.csv` (tolleranza 0,01). Totale AVERE 2026 = 28.504.329,96.
7. **excel**: il foglio `righe` ha esattamente le 16 intestazioni di `colonne_fatt_2026.txt` in quest'ordine;
   la tabella nativa esiste; il TSV di una riga nota è `DER1\t04/10/2026\tFuelAllowance\t2915\t0,23\tVAT 22\t22%\t145,82\t808,69\t662,87\t\t\t41\t10\t2026\tINV-IT3JDBF-0002543`.
8. **allinea**: con `fixtures/fatturato/AGGREGATO_mini_test.xlsx` (foglio di disturbo `pivot`, foglio
   `fatt_2026` con 300 righe, un `NV-…`, due Numero vuoti) l'estrazione restituisce 24 numeri distinti
   normalizzati e 2 righe con numero vuoto (`atteso_AGGREGATO_mini.json`).

## 9. Test nel sito (manuali, da eseguire in anteprima Vercel e riportare nel PR)
| # | Passi | Atteso |
|---|---|---|
| S1 | Login come CONTROLLO → Fatture Amazon → trascina i 12 PDF di `fixtures/pdf` | 12 `nuova`, 295 righe, delta max 2,70 (0002547); descrizioni: 3 marcate "nuova" rispetto allo storico se lo storico è caricato |
| S2 | Scarica Excel, poi ricarica gli stessi 12 PDF | 0 nuove, 12 `già presente (esportata il …)`; Excel si apre senza avvisi, intestazioni corrette |
| S3 | Carica lo zip prodotto dal preferito (o uno zip con 2 copie dello stesso PDF rinominate) | 1 `nuova` + 1 `doppione nel caricamento`; somma stati = numero file |
| S4 | Carica un PDF non Amazon | 1 `errore`, nessuna riga, nessun crash |
| S5 | Copia righe → incolla in Excel italiano in una tabella con le 16 colonne | numeri numerici, date date, MICRO/MACRO vuote |
| S6 | ADMIN → Allinea → trascina il vero AGGREGATO (37 MB) | finisce < 60 s, report con numeri trovati, nessun upload al server (Network tab: solo JSON piccoli) |
| S7 | ADMIN → Carica storico (fatt_2026) | ~12.300 righe importate; Fatturato mese × DS = valori del file; seconda importazione → 0 righe nuove |
| S8 | Fatturato come RESP_MEZZI di DLO2 | vede solo DLO2 |
| S9 | Forecast → carica `PROF_44_next.xlsx` e `PROF_43_same.xlsx` | 270 + 435 righe, nessun `NON_MAPPATO`; previsione settimane 45–47 ≈ 726 k€ / 821 k€ / 1.002 k€ (calibrazione sett. 38–42, ±2 %) |
| S10 | Forecast → ricarica `PROF_44_next.xlsx` modificato (una riga cambiata) | la previsione usa il file nuovo; il vecchio resta in elenco |
| S11 | Backtest settimana 41 con `PROF_40_next_forecast.xlsx` | errore totale ≈ −0,9 %, DLO4 ≈ −8 % (volume), DER2 ≈ +7 % |
| S12 | Audit | ogni esportazione, allineamento, import storico e import forecast ha una riga in AuditLog con utente e conteggi |
| S13 | Permessi | DRIVER e RESP_MEZZI non vedono Importa/Registro/Allinea/Forecast; URL diretto → 403/redirect |

## 10. Fuori perimetro
Scrittura su AGGREGATO/OneDrive; download dal portale Amazon (c'è già un preferito del browser che produce
lo zip); calcolo incentivi Peak (modulo separato; gli incentivi compaiono nel fatturato come EXTRA_INCENTIVI
e sono esclusi dalla previsione).

## 11. Definition of done
Test §8 verdi in CI, test §9 eseguiti e riportati nel PR, README del modulo (uso in 3 passi per la
stagista; allineamento e storico per l'admin; come aggiungere un nuovo PDF/forecast alle fixture se Amazon
cambia layout), migrazione Prisma applicabile su Neon con `scripts/migrate-neon.mjs`.
