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
