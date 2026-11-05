# FleetDSP — Gestionale flotta veicoli commerciali per DSP

Gestionale multi-stazione per flotte LCV di operatori logistici DSP Amazon:
anagrafica flotta, scadenzario tagliandi/revisioni, multe e ricorsi,
movimentazione con check-in/out da smartphone, mezzi sostitutivi con storno
canone verso le leasing company, riconciliazione fuel/Telepass, dashboard
dive-deep con export Excel.

> ⚠️ Repository privata — accesso riservato al solo proprietario.
> I dati del seed sono interamente fittizi.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **PostgreSQL** + Prisma (compatibile Supabase: basta `DATABASE_URL`)
- **Tailwind CSS** con design token in CSS variables (palette sostituibile con Brand Kit Canva senza toccare i componenti)
- Auth custom JWT (cookie httpOnly) con RBAC a 3 ruoli: **Admin/Fleet Manager**, **Responsabile Mezzi** (scoped per stazione), **Driver**
- ExcelJS + PapaParse per import/export, Recharts per i grafici, Vitest per i test

## Avvio rapido

```bash
cp .env.example .env      # DATABASE_URL, AUTH_SECRET (openssl rand -base64 32)
npm install
npx prisma migrate dev    # crea lo schema (incl. vincoli di integrità)
npm run db:seed           # 7 stazioni, 38 veicoli, utenti demo — dati fittizi
npm run dev
```

Login demo: `admin@fleetdsp.demo` (password = `SEED_ADMIN_PASSWORD`),
`resp.dml1@fleetdsp.demo` / `demo1234`, driver `*.dml1@fleetdsp.demo` / `demo1234`.

```bash
npm test        # 32 test sulla logica di dominio
npm run build   # build di produzione
```

## Principi non negoziabili implementati

- **Zero hardcoded**: soglie alert, termini ricorso, coefficienti consumo → tabella `AppConfig`, editabile da `/config`
- **Tracciabilità totale**: ogni KPI/tabella dichiara fonte, filtro e data; ogni azione utente scrive su `AuditLog`
- **Niente compensazioni tra stazioni** nei report; vista cluster e vista singola stazione
- **Vincoli da controller**: targa unica tra veicoli attivi, una sola pratica storno per (targa, ingresso officina), lock + snapshot canone dopo l'invio alla leasing
- **Mobile-first** per Driver/Responsabile (check-in/out in cortile), desktop dense per Admin

Avanzamento e changelog per modulo: vedi [PROGRESS.md](./PROGRESS.md).
Asset grafici e contratto con Canva: vedi [design/brand/README.md](./design/brand/README.md).

## Vademecum

Sezione documentale in `/vademecum` (menu "Vademecum"), visibile ad **Admin** e **Responsabile Mezzi** (azione RBAC `vademecum.view`), non ai driver. Nessun database: il contenuto vive solo nei file.

- **Dove stanno i file:** `content/vademecum/*.md`. `index.md` è la pagina introduttiva; ogni altro file è una pagina `/vademecum/<nome-file>`.
- **Frontmatter obbligatorio** in testa a ogni file:
  ```yaml
  ---
  title: "Acquisti DPI"
  order: 2              # posizione nel menu dentro la categoria
  category: "Acquisti"  # Base | Acquisti | Multe | Fatture | Personale | Riferimenti
  updated: "2026-10-15" # data mostrata come "Aggiornato il …"
  ---
  ```
- **Aggiungere o modificare una pagina:** crea/modifica il `.md` (nome in minuscolo con trattini, es. `12-nuova-procedura.md`), aggiorna `updated`, esegui `npm test` (il test controlla frontmatter, slug unici, tabelle e ancore), apri una PR verso `main` e fai merge: il deploy pubblica la pagina, il menu si aggiorna da solo.
- **Markdown supportato:** GFM (tabelle anche larghe: scorrono in orizzontale su mobile), grassetto, `code`, liste, citazioni con a capo forzato (riga che finisce con `\`). L'HTML generato è sanificato con una whitelist (`sanitize-html`). I titoli `##`/`###` e i paragrafi composti solo da grassetto (es. `**Colonne di Ordini_bis**`) diventano sezioni con ancora stabile.
- **Ricerca:** il campo in alto (scorciatoia `/`, `Esc` per chiudere) usa MiniSearch nel browser. L'indice — un blocco per sezione, tabelle comprese, in testo semplice — è servito da `GET /api/vademecum/search-index` (dietro login) e si scarica al primo utilizzo. Ricerca fuzzy e per prefisso, senza stemming, accenti ignorati; codici e sigle con `_` o `.` restano interi (`fatt_2026`, `driver.ps`, `Ordini_bis`). Configurazione in `src/domain/vademecumSearch.ts`, lettura e render in `src/lib/vademecum.ts`.
- **Stampa:** dal browser, le pagine del vademecum si stampano in A4 orizzontale senza menu.

## Training

Percorso di 10 giorni per la stagista in `/training` (ruolo **STAGISTA**: vede solo Training e Vademecum; azioni RBAC `training.view`, e `training.admin` solo per l'Admin). Il piano è un file, lo stato è nel database.

- **Dove sta il piano:** `content/training/piano.json` (moduli, giorni, attività con id stabili, lettura serale). Tutto il testo è lì, mai nel codice. Il campo facoltativo `ancore` di un'attività linka una sezione precisa del vademecum: `"04-multe-albero-template#template-c-addebito-driver-std-mog"` (le ancore sono quelle dei titoli `##`/`###` e dei titoletti in grassetto).
- **Aggiungere un giorno:** aggiungi un oggetto in `giorni` con `day` successivo, `date` (AAAA-MM-GG, dentro `inizio`–`fine`), `title`, `modulo` (un `id` di `moduli`), `sezioni`, `obiettivo`, `attivita`, `sera: { leggi, nota }`.
- **Aggiungere un'attività:** un oggetto in `attivita` con `id` nuovo e unico (es. `d3a6`), `tipo` (`tell` = Alessandro spiega, `show` = Alessandro fa, `do` = la stagista fa, `check` = verifica), `chi`, `durata` (minuti), `testo`. Non cambiare gli id esistenti: sono la chiave dello stato salvato.
- **Controllo automatico:** `npm run build` (prebuild `scripts/check-training.mts`) e `npm test` falliscono con un messaggio chiaro se c'è un id doppio, un tipo sbagliato, una data non valida, un modulo inesistente o uno slug/ancora che non esiste in `content/vademecum/`. Merge su `main` e il deploy pubblica il piano.
- **Al volo, senza git:** su `/training/<giorno>` l'Admin ha "+ Aggiungi attività" (tabella `TrainingExtra`): compare in coda con l'etichetta "extra".
- **Creare l'utente stagista:** da `/users` → Nuovo utente → ruolo "Stagista (training)" (password iniziale mostrata una volta), oppure `DATABASE_URL=… npx tsx scripts/crea-stagista.mts email Nome Cognome`.
- **Validare un modulo:** ogni modulo ha un'attività `check` (campo `valida`). Quando la stagista la segna "Fatto", l'Admin preme "Validato" (sulla card del giorno o in `/training/admin`, sezione "Da validare"): il badge del modulo diventa verde. In `/training/admin` ci sono anche lo stato giorno per giorno, le note di giornata e l'export CSV.
