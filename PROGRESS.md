# PROGRESS — FleetDSP

Changelog per modulo. Ogni blocco è stato completato, testato e committato in sequenza, come da mandato di esecuzione autonoma.

## Stato: MVP completo ✅

| # | Modulo | Stato | Note |
|---|--------|-------|------|
| — | Scaffolding + auth/RBAC + schema DB | ✅ | Next.js 15, Prisma, PostgreSQL, JWT, 3 ruoli |
| 0 | Import massivo Excel/CSV | ✅ | 9 entità, template, anteprima, mapping colonne |
| 1 | Anagrafica flotta | ✅ | targa unica tra attivi (indice parziale) |
| 2 | Tagliandi e manutenzione | ✅ | doppia soglia km/data, revisione distinta |
| 3 | Multe e ricorsi | ✅ | assegnazione da log, riaddebito, scadenze |
| 4 | Movimentazione | ✅ | check-in/out mobile, trasferimenti con approvazione |
| 5 | Mezzi sostitutivi / storno canone | ✅ | vincolo anti doppio-storno, lock post-invio |
| 6 | Danni + Fuel/Telepass | ✅ | riconciliazione per PAN, anomalie consumo |
| 7 | Dashboard dive-deep + export | ✅ | KPI cliccabili, vista cluster/stazione, export xlsx |
| — | Seed demo + test | ✅ | 7 stazioni, 38 veicoli, 32 test vitest verdi |

---

## Dettaglio per modulo

### Scaffolding, auth, schema (commit `Scaffolding: ...`)
- **Stack**: Next.js 15 (App Router) + TypeScript + Prisma 6 + PostgreSQL + Tailwind. Auth custom JWT (jose) in cookie httpOnly, bcrypt per le password. Nessuna dipendenza da servizi esterni: per il deploy basta `DATABASE_URL` (compatibile Supabase) e `AUTH_SECRET`.
- **RBAC**: matrice permessi unica in `src/lib/rbac.ts` (Admin / Responsabile Mezzi / Driver) + scoping stazione applicato nelle query. Il Resp. Mezzi vede solo la propria stazione; i canoni €/giorno sono visibili solo all'Admin.
- **Vincoli DB**: targa unica tra veicoli non dismessi (indice parziale SQL), pratica storno unica per (veicolo, data ingresso officina), assegnazione unica per (veicolo, giorno).
- **Design tokens**: palette/tipografia/raggi in CSS variables (`src/app/globals.css`) + `tailwind.config.ts`. Nessun colore hardcoded nei componenti. Cartella `design/brand/` con placeholder marcati "DA SOSTITUIRE CON ASSET CANVA" e contratto asset↔codice documentato.
- **Config runtime**: tutte le soglie/termini/coefficienti in tabella `AppConfig`, modificabili da `/config` (Admin), con default di bootstrap in `src/lib/config.ts`. Zero hardcoded.
- **Audit**: helper `audit()` chiamato da ogni server action; viewer in `/audit`.

### Modulo 0 — Import massivo (commit `Modulo 0: ...`)
- Template scaricabili **.xlsx** (con foglio "Istruzioni" e colonne data formattate come date reali) e **.csv** per: veicoli, driver/utenti, storico tagliandi, multe pregresse, contratti leasing/canoni, movimentazioni storiche, pratiche sostitutivo, transazioni Q8 (per PAN), pedaggi Telepass.
- Parsing con **date reali**: oggetti Date, ISO, gg/mm/aaaa, seriali Excel; importi in formato italiano (1.234,56); enum normalizzati (es. "diesel hvo" → `DIESEL_HVO`).
- **Anteprima con validazione** prima del commit: righe valide / errori con motivo esplicito / duplicati rispetto al DB (dry-run reale con controlli FK).
- **Mapping colonne flessibile**: auto-match su label/alias, rimappatura manuale in UI con rianalisi.
- Conferma con scelta: **import parziale** (solo righe valide) o **blocco totale**.
- Log `ImportJob` (chi, quando, file, esiti, errori riga per riga) consultabile in pagina.
- Verificato end-to-end con CSV contenente errori intenzionali: data invalida respinta con motivo, targa duplicata rilevata, stazione inesistente bloccata.

### Modulo 1 — Anagrafica flotta (commit `Modulo 1: ...`)
- Lista con filtri stazione/stato; dettaglio veicolo come **dato atomico** dei drill-down (manutenzione, storico stazioni, interventi, multe, pratiche, movimentazioni, danni).
- Alimentazioni incluse HVO/EN 15940 (`DIESEL_HVO` + flag `hvoCompatibile`).
- Il cambio stazione NON si fa dall'anagrafica: passa dal modulo movimentazione (con approvazione).

### Modulo 2 — Tagliandi (commit `Moduli 2-3: ...`)
- Scadenzario a **doppia soglia** (giorni E km): l'alert scatta sulla prima che matura; soglie `[30,15,7]` giorni / `[1000,500,100]` km configurabili.
- **Revisione legale distinta** dal tagliando (veicolo "non circolabile" se scaduta).
- Vista "solo alert" ordinata per urgenza; registrazione intervento aggiorna km e prossime scadenze.
- Dato mancante ≠ dato ok: scadenza non pianificata → warn, mai verde.

### Modulo 3 — Multe (commit `Moduli 2-3: ...`)
- Conducente individuato dai **log movimentazione**: finestra check-in/out → match certo; assegnazione giornaliera senza check-in → match dichiarato come tale; nessun log coerente → resta **"da assegnare"** (fallback esplicito, mai attribuzione arbitraria). La fonte è salvata sul verbale.
- Assegnazione manuale solo con motivazione obbligatoria, tracciata.
- Notifica → scadenza ricorso calcolata dal termine configurato (60gg Prefetto / 30gg GdP in config).
- Riaddebito driver con stati (da addebitare/addebitato/contestato/saldato) e audit.

### Modulo 4 — Movimentazione (commit `Moduli 4-6: ...`)
- **Schermata Driver mobile-first** (stile consumer): il mezzo di oggi + una sola azione primaria (check-in → check-out), km, foto, danni. Zero curva di apprendimento.
- Danno dichiarato al check-out → pratica danno aperta automaticamente.
- Trasferimenti tra stazioni: richiesta del Resp. Mezzi + approvazione Admin (Admin = esecuzione immediata); storico stazioni aggiornato in transazione atomica.

### Modulo 5 — Sostitutivi / storno canone (commit `Moduli 4-6: ...`)
- **Vincolo di unicità** (targa, data ingresso officina) → impossibile richiedere due volte lo stesso storno (risposta alla domanda del revisore).
- **Invio alla leasing = lock**: canone/giorno fotografato (snapshot), giorni scoperti e importo congelati. Dopo l'invio solo l'Admin può correggere, e la modifica è marcata `replacement.adminOverride` in audit (risposta alla seconda domanda del revisore).
- Calcolo trasparente: giorni scoperti = da ingresso officina a min(ricezione sostitutivo, rientro originale, oggi); storno = giorni × canone. Formula dichiarata in pagina.
- Alert pratiche **senza risposta oltre X giorni** (configurabile) evidenziate in lista e in dashboard.
- Tracciamento per singola targa, mai aggregato.

### Modulo 6 — Danni + Fuel/Telepass (commit `Moduli 4-6: ...`)
- Danni: segnalazione consumer-grade (mezzo di oggi preselezionato per il driver), gestione responsabilità/centro/pratica assicurativa/costo, chiusura con audit.
- Fuel: **riconciliazione per PAN carta** (mai per targa), associazione carta↔veicolo gestita in pagina; litri vs km da check-in/out → consumo l/100km con anomalie oltre tolleranza configurata.
- Telepass: import per stazione, totali per stazione **senza compensazioni** tra sedi.

### Modulo 7 — Dashboard + export (commit finale)
- KPI row: ogni card dichiara la **fonte** e porta al drill-down filtrato (veicoli, alert manutenzione, multe da assegnare, storno attivo, pratiche stagnanti, danni aperti).
- Grafico costi per stazione (manutenzione+carburante+pedaggi+multe, 30gg) con **tabella dettaglio sotto il grafico** e nota fonte con periodo/filtri; palette categorica validata per CVD con lo script dataviz (ΔE 24,2).
- Trend multe 8 settimane. Vista cluster / singola stazione (Admin); Resp. Mezzi bloccato sulla propria.
- **Export Excel** per la revisione mensile: 5 fogli con **righe sorgente** (interventi, multe con fonte assegnazione, storni con formula, carburante per PAN, pedaggi). Ogni export è tracciato in audit.

### Seed e test
- `npm run db:seed`: 7 stazioni (cluster lombardo fittizio), 38 veicoli, admin + 7 resp + ~28 driver, 30 giorni di movimentazioni con km coerenti, 40 multe (alcune "da assegnare" di proposito), 7 pratiche storno in tutti gli stati, danni, fuel card e pedaggi. **Tutti dati fittizi.**
- 32 test vitest sulla logica di dominio: scadenzario doppia soglia, giorni scoperti/storno, scadenze ricorso, assegnazione conducente da log, mapping/coercizione import, riconciliazione consumi.

---

## Come si avvia

```bash
cp .env.example .env   # impostare DATABASE_URL e AUTH_SECRET
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Login demo: `admin@fleetdsp.demo` / valore di `SEED_ADMIN_PASSWORD` (default `admin1234`) · `resp.dml1@fleetdsp.demo` / `demo1234` · driver `*.dml1@fleetdsp.demo` / `demo1234`.

## Grafica / Canva — stato e prossimi passi
- I **design token** (palette, stati semantici verde/giallo/rosso, tipografia, raggi) sono in `src/app/globals.css`: sostituire i valori con il Brand Kit Canva non richiede di toccare i componenti.
- Nel Canva collegato esiste **un Brand Kit** (id `kAGdCGedbbo`, nome non esposto dall'API): come richiesto NON sono stati generati loghi/palette ex novo. `design/brand/README.md` elenca gli asset attesi (logo, 5 icone moduli, template PDF report) con i placeholder attuali.
- Prossimo passo grafico: estrarre la palette dal Brand Kit, esportare le icone moduli da Canva e sostituire i token; poi one-pager di presentazione stakeholder.

## Assunzioni prese in autonomia (da validare a posteriori)
1. **Stazioni configurabili**: 7 nel seed, ma sono righe della tabella `Station` — se ne possono aggiungere N senza toccare codice.
2. **Integrazione Q8/Telepass/leasing**: solo import file (come da MVP); le API dirette sono un'estensione futura — lo schema (`ImportJob`, PAN, deviceCode) è già pronto.
3. **Web-app responsive** (niente app nativa): il check-in da smartphone funziona da browser, foto via `capture="environment"`.
4. **Hosting**: sviluppato su Postgres locale; pronto per Vercel+Supabase o VPS (nessun servizio proprietario in mezzo).
5. Le foto check-in/danni sono salvate su filesystem (`uploads/`, gitignorata) e servite autenticate: per produzione multi-istanza va previsto uno storage S3-compatibile.
