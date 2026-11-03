# Modulo "Fatture Amazon"

Tre parti: **fatture** (PDF → righe di `fatt_2026` con registro anti-doppioni),
**fatturato** (storico per mese/settimana/DS/classe) e **forecast** (ricavo
previsto dai forecast Amazon). Specifica completa: `docs/fatture-amazon-kit/SPEC.md`.

I file (PDF, file AGGREGATO, forecast) si leggono **nel browser**: al server
arrivano solo righe già estratte (JSON, a lotti di massimo 500). Il sito non
scrive mai nel file AGGREGATO e non si collega al portale Amazon.

## Per la stagista: uso in 3 passi
1. **Fatture Amazon → Importa PDF**: trascina i PDF della settimana o lo zip del preferito.
2. Controlla il report: ogni file ha uno stato (nuova / già presente / doppione nel caricamento / errore), il delta importo PDF − somma righe (normale tra −3 e +3 €) e le descrizioni nuove.
3. **Scarica Excel** o **Copia righe** e incolla in fondo a `fatt_2026`. Le fatture diventano "esportate": ricaricandole non saranno più "nuove".

## Per l'admin
- **Allinea e storico → Allinea numeri**: trascina `AGGREGATO DETTAGLI FATTURA_conto_economico.xlsx`.
  Il foglio `fatt_2026` si legge in streaming in un Web Worker (solo la colonna Numero, più DS e Data);
  le fatture trovate diventano "presente in fatt_2026", quelle sconosciute entrano nel registro
  come record minimo. Se il PC non ce la fa: ripiego "incolla la colonna Numero".
- **Allinea e storico → Carica storico righe**: importa tutte le righe di `fatt_2026` (e `fatt_2025` con il flag)
  per Fatturato e Forecast. Le fatture registrate da PDF non vengono toccate; reimportare lo
  stesso file non crea doppioni (chiave numero|data|descrizione|quantità|AVERE|occorrenza).
- **Registro**: filtri, "esportate ma non in fatt_2026", annulla esportazione.
- **Forecast**: trascina `PROF_<wk>_next.xlsx` (ND) e `PROF_<wk>_same.xlsx` (SD). Per (station, data, classe)
  vale l'ultimo file caricato. La mappa servizio → classe si modifica in fondo alla pagina.
  Tariffe dalle ultime N settimane chiuse (default 5, terminate da almeno 14 giorni).

## Codice
| Dove | Cosa |
|---|---|
| `src/domain/fatture/parser.ts` | porting 1:1 di `docs/fatture-amazon-kit/reference/parser.js` (fonte di verità) |
| `src/domain/fatture/classifica.ts`, `numero.ts`, `righe.ts`, `importa.ts`, `storico.ts`, `allinea.ts`, `fatturato.ts` | regole di dominio (SPEC §2–§6) |
| `src/domain/forecast/*` | mappa, finestra e tariffe, previsione, backtest (SPEC §7) |
| `src/lib/fatture/pdf.ts` | pdf.js nel browser (worker `/pdf.worker.min.js`, copiato in `public/` da `scripts/copia-pdf-worker.mjs`) |
| `src/lib/fatture/xlsxStream.ts`, `aggregato.worker.ts` | lettura in streaming di un foglio di un .xlsx grande |
| `src/app/(app)/fatture-amazon/*` | pagine e server action (permessi `fatture.*`, `fatturato.view`, `forecast.*`) |
| `tests/fatture`, `tests/forecast`, `tests/fixtures/fatture-amazon` | test §8 contro le fixture reali |

## Se Amazon cambia il layout di una fattura
1. Copia il PDF nuovo in `tests/fixtures/fatture-amazon/pdf/` (nome `DS-INV-….pdf`).
2. Crea `tests/fixtures/fatture-amazon/expected/<numero>.json` con i valori verificati a mano sul PDF
   (stesso formato degli altri: testata + ogni riga).
3. `npm test -- tests/fatture/parser.test.ts`: se fallisce, correggi **prima** `docs/fatture-amazon-kit/reference/parser.js`
   (fonte di verità, eseguibile con `node docs/fatture-amazon-kit/tests/run_tests.js`) e poi porta la stessa modifica in
   `src/domain/fatture/parser.ts`. Tutti i 12+ casi devono restare verdi.

## Se cambia il forecast
- Nuovo `service_type_scheduling`: compare come `NON_MAPPATO` nell'elenco file → aggiungi la regola nella mappa (pagina Forecast).
- Nuovo formato colonne: aggiorna `COLONNE` in `src/app/(app)/fatture-amazon/forecast/ForecastClient.tsx` e aggiungi il file
  in `tests/fixtures/fatture-amazon/forecast/` con un test in `tests/forecast/`.
