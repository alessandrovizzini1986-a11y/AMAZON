# Prompt per Claude Code – Costi GLS Castel Maggiore (appalto open book)

Da incollare a Claude Code quando si costruisce la parte GLS del modulo Costi. Ogni mese Alessandro compila
due cose per l'appalto GLS di Castel Maggiore (CDC **5565**), come fa per Amazon (CDC 5569):

1. il foglio del mese nel file **GLS_Costi_F.O._2026.xlsx** (`MM_26`) e il foglio di fatturazione (`MMMM_ft`);
2. il foglio **GLS_MMM_AA** del file **Stima_Costo_personale.xlsx**.

Il controllo presenze di Castel Maggiore si fa con **Badgebox**. È una formalità: serve a vedere chi
timbra, perché per GLS non c'è un portale come quello di Amazon e l'unica fonte delle ore è il file presenze
compilato in sede.

```
Leggi prima: docs/costi-kit/PROMPT_FO_mensile.md (F.O. Amazon), docs/moduli/costi-personale.md,
src/domain/costi/{sic,std,fo,payroll,anagrafica}.ts, src/lib/costi/{excelFO,excelStimaPersonale}.ts.
Stesse regole del modulo Costi: niente chiamate esterne, file originali non salvati, dati per lavoratore
solo nel DB, nessun nome o codice fiscale reale nei test o nella documentazione, migrazioni Neon solo con ok.
```

## 1. Come funziona l'appalto GLS (foglio `MMMM_ft`)

È un contratto **open book**: ogni mese si fatturano a GLS i costi più due percentuali. Il foglio `0926_ft`
("Periodo open book: 9 mesi") ha queste voci:

| # | Voce | Formula nel file | Esempio 09/2026 |
|---|---|---|---:|
| a1 | Costo del lavoro | `'08_26 '!P60 + '08_26 '!P61` (SIC + STD del **mese prima**) | 483.000,00 |
| a2 | Mezzi di trasporto | `'08_26 '!P62` (mese prima) | 99.038,00 |
| a3 | Carburante | `'08_26 '!P63` (mese prima) | 18.881,33 |
| a4 | Pedaggi | `'07_26 '!D53` (**due mesi prima**: Telepass arriva in ritardo) | 383,60 |
| b | Costi accessori al personale | teste × 129,25 €/mese (1.551 €/anno: formazione, DPI, visite, payroll, RCT/RCO) | 101 × 129,25 = 13.054,25 |
| c | Attrezzature e consumabili | teste × 37,42 €/mese (449 €/anno, smartphone compresi) | 101 × 37,42 = 3.779,42 |
| d | Costi generali di struttura | 7 % di a1…c | 43.269,56 |
| e | Margine lordo | 6,5 % di a1…d | 42.991,40 |

Decisioni di Alessandro (06/11/2026):
- **teste** (voci b e c) = persone **attive** nel foglio `Anagrafica` del file presenze del mese (colonna
  Attivo/Cessato, maiuscole e minuscole indifferenti; SIC e STD insieme). Ottobre 2026: 96 SIC + 12 STD = 108
  attivi, quindi b = 108 × 129,25 = 13.959,00 e c = 108 × 37,42 = 4.041,36 (a settembre il file usava 101);
- pedaggi: due mesi prima, come nel file;
- il costo del lavoro a1 resta quello del foglio F.O. del mese prima (P60 + P61), ma calcolato (§3) e non fisso.

## 2. Il foglio `MM_26` del file F.O. GLS

Stessa impaginazione del foglio Amazon, ma con una sola colonna di costo: **D = Castelmaggiore (BO)**.
I nomi dei fogli hanno a volte uno spazio in fondo (`'07_26 '`, `'08_26 '`): le formule devono usare il nome esatto.

| Riga | Voce | Fonte nel sito | Note |
|---|---|---|---|
| 3 | Carburante | elaborazione Q8 del mese, station GLS | 09/2026: 31.150,48 |
| 5 | Carburante elettrico | manuale (ricariche) | 1.000–2.500 €/mese |
| 6–17 | Noleggi per società | flotta station GLS, canone pro-rata sui giorni, sostitutivi esclusi (come Amazon) | righe: 8 TORENTAL, 9 Avis, 10 Europcar, 11 Noleggiare, 12 Locauto, 13 Hertz, 14 Autovia, 15 Ald MT, 16 Ald, 17 VEM |
| 18 | DANNI | **forfait mensile** (confermato da Alessandro il 06/11/2026), parametro con data di validità | 4.050 €/mese (confermato) |
| 53 | Autostrade | elaborazione Telepass, station GLS | |
| 58–59 | Wind, Elmec | parametri (Wind 10 × 100 = 1.000; Elmec 119,90) | |
| 60–61 | Accantonamenti SIC (straordinari; ferie e permessi) | come Amazon: istituti del mese a costo SIC, saving ferie/ROL/ExF | oggi quasi sempre 0 |
| P57 | Trasferta | oggi fisso 32.450 | da calcolare dal file presenze (riga "Indennità Trasferta") |
| P60 | TOT. COSTO SIC | oggi fisso 460.000 | da calcolare: busta SIC del mese ± accantonamenti (§3) |
| P61 | TOT. COSTO STD | oggi fisso 23.000 | da calcolare: STD GLS di competenza (§3) |
| P62 | MEZZI | `SUM(D6:J17)` | la riga 18 DANNI resta fuori (va in P67) |
| P63 | CARBURANTE | `SUM(D3:J3)+SUM(D5:J5)` | |
| P65 | AUTOSTRADE | `SUM(D53:J53)+SUM(D55:J55)` | |
| P66 | WIND+ELMEC | `SUM(D58:J59)` | |
| P67 | DANNI+VARIE | `D18+SUM(D62:D66)` | |
| P69 | Totale | `SUM(P60:P68)` | |
| P71 | FATTURATO STIMATO | **vuoto** (oggi #DIV/0! in ML %) | proposta: il totale del foglio `_ft` dello stesso mese |

Pulizie da proporre ad Alessandro, non da fare da soli: la colonna Q ("Annalisa", 1.084.000 / 1.268.000)
sembra copiata dal foglio Amazon; i confronti N77–R82 puntano a dicembre 2024/2025.

Costruzione nel sito (come `excelFO` per Amazon): un pulsante "Foglio `MM_26` (Costi F.O. GLS)" e un
pulsante "Foglio `MMMM_ft`" in Costi a fine mese, con celle gialle per i dati del sito, formule uguali al file
e la tabellina che scompone la busta SIC GLS.

## 3. Costo del personale GLS

**SIC** (dipendenti interni GLS):
- anagrafica CDL: il file `DB_CDL_base_MMAA_AmazonGLS_BO.xlsx` ha due fogli, **`SIC GLS BO`** e `SIC Amazon TR`.
  Oggi il sito legge solo quello Amazon: va letto anche quello GLS, con il CDC 5565;
- payroll: `Costi_del_Personale_PS_MMAA_AMAZONGLS.xlsx` contiene anche il CDC 5565, che oggi il parser
  scarta (righe `_gls` → componente GLS): serve una vista per CDC;
- busta del 27 come per Amazon (CDL + trasferte, straordinari, festività, assenze e ferie del mese prima,
  cessati esclusi), con le stesse regole verificate sul payroll 09/2026 (festività di sabato/domenica a tutti,
  104 e congedi come assenze INPS, malattia −11,46 €/h netta della carenza 63,5 %);
- costo SIC F.O. (P60) = busta pagata nel mese ± accantonamenti, come per Amazon.

**STD** (somministrati Adecco su GLS): stima di competenza dalle ore del file presenze × tariffe ADIT. Gli
STD GLS sono **nello stesso file ADIT, CDC 5565** (confermato da Alessandro): il lettore ADIT va esteso per
tenere il CDC e separare Amazon (5569) da GLS (5565) in tariffe, consuntivo e integrazione MOG.

**Fonte delle ore: il file presenze di Castel Maggiore** (`GLS_Castel_Maggiore_-_Presenze_MESE_AAAA_Delivery.xlsx`):

| Foglio | Contenuto |
|---|---|
| `Presenze` | una riga per persona e giorno: SIC/STD, mansione, PT/FT, ore/giorno, entrate e uscite, ore lavorate, giustificativi (ferie, ExF, ROL, 104, permesso sindacale, malattia, PNR, visita medica, donazione sangue), ore extra, ordinarie, notturne, tipo giorno |
| `OTTOBRE` | griglia persona × giorno con 15 voci: Ordinarie, Notturno, Straordinari notturni, Straordinari, FERIE, ROL, EXF, PNR, PERMESSO SINDACALE, PERMESSO L.104, DONAZIONE SANGUE, PERMESSO VISITA MEDICA, MALATTIA, ALTRI GIUSTIFICATIVI, Indennità Trasferta |
| `Anagrafica` | referente, nome, CF, FT/PT, % contratto, ore settimanali e giornaliere, SIC/STD, attivo/cessato, date, mansione, colonna BADGEBOX (vuota) |
| `Riepilogo DEL.` | ore totali autisti per giorno, presenti, ferie, malattia, % presenza |
| `giorni festivi` | festivi dell'anno |

Numeri di ottobre 2026 da usare nei test (golden, senza nomi): 106 persone nella griglia; ordinarie
12.868,8 h, straordinari 188,5 h, ferie 491,8 h, malattia 1.927,4 h, ROL 307,5 h; anagrafica 96 SIC e 12 STD
attivi; "Ore Totale – Autista" 12.189,2 h.

Il foglio **GLS_MMM_AA** di Stima_Costo_personale ha la stessa struttura dei fogli AMZ (vedi
`foglioStimaPersonale`), con un solo blocco "GLS-CASTELMAGGIORE (BO)" in G–K: teste SIC per contratto con costo
medio, trasferte, straordinari/supplementari/maggiorazioni, teste STD (FT, PT, MOG), ore Standard e
straordinari SIC e STD, trasferte totali (agosto 2026: 86 FT, 1 PT, 14 PT 32 h, 6 dispatcher; STD 9 PT e
10 MOG; ore Standard 6.886,8 SIC e 654,2 STD; 848 trasferte). Va compilato dal file presenze invece che dal
tracking, con la riga "altre voci ADIT" come per Amazon.

## 4. Controllo presenze con Badgebox (formalità: chi timbra)

Export Badgebox del mese (`MM_AA_Badgebox_GLS.xlsx`). Attenzione: **openpyxl lo legge vuoto**, va letto
con il lettore XML del sito (`workbookToGrids` / `leggiFoglio`). Tre fogli:

| Foglio | Contenuto |
|---|---|
| `Quantità verticali` | per persona (nome, cognome, CF, email, **gruppo**) due righe, Ordinarie e Straordinari, con le ore per giorno 01…31 |
| `Timbrature` | per persona e matricola righe E/U (entrata/uscita) con l'orario per giorno |
| `Timbrature verticali` | una riga per timbratura: CF, matricola, data, ora, verso E/U, tag, note, tablet |

Regole:
- tenere solo il gruppo che contiene **"GLS - Castel Maggiore (BO)"**: l'export contiene anche le station
  Amazon e altri clienti (ottobre: 142 persone nel gruppo GLS su 274);
- abbinare per codice fiscale al file presenze (foglio `OTTOBRE` / `Presenze`);
- **esiti per persona**: lavora nel file presenze ma non timbra mai; giorni lavorati nel file senza nessuna
  timbratura; giorni con timbrature e nessuna ora nel file; ore del file e ore Badgebox con più di 8 h di
  scarto nel mese; timbrature dispari (entrata senza uscita);
- ottobre 2026, da usare come golden: 13 persone lavorano nel file presenze senza mai timbrare (10 STD e
  3 SIC); 58 giorni lavorati senza timbratura su 26 persone (una persona SIC da sola ne ha 16); 40 persone con
  più di 8 h di scarto tra file e Badgebox;
- è un controllo, non una correzione: il costo si calcola sempre dal file presenze. L'uscita è una tabella
  da mandare al referente di sede, come la tabella anomalie del controllo presenze Amazon.

Dove metterlo nel sito: Presenze → nuova scheda "GLS Badgebox" (stessa logica di archivio locale nel browser
dei tracking; nessun file salvato sul server).

## 5. Costi extra (driver Amazon su GLS)

Il foglio `01_26_Costi_extra` / `PVT_extra` del file F.O. GLS erano **calcoli personali** di Alessandro:
non è una fonte da leggere. Regola (06/11/2026): gli extra costi (driver delle station Amazon mandati su GLS
nei picchi: ore × costo orario + trasferta, carburante, pedaggi, noleggi) **si fatturano a GLS a parte**, come
extra costi autorizzati (clausola del foglio `_ft`: "rifatturati previa condivisione ed autorizzazione del
Committente"). Non entrano nel F.O. GLS né nell'open book, e il loro costo resta su Amazon. Eventuale funzione
futura: un registro degli extra con export per la richiesta di autorizzazione a GLS.

## 6. Festivi GLS

Patrono di Castel Maggiore: **30 novembre** (Sant'Andrea) ogni anno, station `GLS` (`patrono()` in
`src/domain/costi/festivi.ts` e tabella Festivo del sito). Nazionali come Amazon.

## 6b. Primo mese: ottobre 2026

Si parte dal conteggio di **ottobre 2026** (non si ricostruiscono gennaio–settembre). File che servono:

| Cosa | File | Stato |
|---|---|---|
| Ore, giustificativi e anagrafica di ottobre | presenze Castel Maggiore ottobre | nel kit (`esempi/gls/`) |
| Controllo timbrature | Badgebox ottobre | nel kit |
| Variabili di settembre per la busta pagata a ottobre | presenze Castel Maggiore **settembre** | da chiedere |
| CDL SIC GLS | `DB_CDL_base_0926` foglio `SIC GLS BO` (ultima versione) | nel kit (riconsegnato il 06/11) |
| Busta reale di ottobre | payroll `Costi_del_Personale_PS_1026` (CDC 5565) | da chiedere, se già disponibile |
| STD GLS | ADIT di ottobre, CDC 5565 | quando arriva |
| Mezzi, carburante, pedaggi | flotta, Q8 e Telepass del sito (station GLS) | nel sito |
| Foglio `_ft` di ottobre | F.O. GLS `09_26` (mese prima) e `08_26` (pedaggi) | nel kit |

## 7. Ordine di lavoro proposto

1. Lettori puri e test golden (con dati inventati) per: file presenze GLS, export Badgebox, foglio `SIC GLS BO`,
   payroll per CDC.
2. Controllo Badgebox in Presenze (§4).
3. Stima SIC e STD GLS e foglio GLS_MMM_AA (§3).
4. Foglio `MM_26` e `MMMM_ft` del F.O. GLS (§1–2), con P60/P61 calcolati e P71 = totale `_ft`.
5. Vademecum: nuova pagina "Costi GLS" con il flusso del mese e le scadenze.

Ogni passo con PR piccola, test, e un confronto numerico con i fogli di Alessandro dei mesi già chiusi
(gennaio–settembre 2026) prima di usarlo.
