# Deploy FleetDSP — Vercel + Supabase/Neon (≈15 minuti)

Il progetto è pronto per il deploy: nessun servizio proprietario, servono solo
un database PostgreSQL e un hosting Node. Va bene sia **Supabase** che **Neon**
(entrambi collegabili da Vercel in un click) + **Vercel** per l'app.

## ⚠️ Connessioni pooled (PgBouncer) — parametro obbligatorio

Sia Supabase ("Session/Transaction pooler") sia Neon (host con `-pooler` nel
nome) instradano le connessioni attraverso **PgBouncer**. Prisma usa prepared
statement che **non sono compatibili** con PgBouncer in modalità transazione
senza un parametro esplicito: senza di esso, la prima query reale (es. il
login) fallisce in modo deterministico con un errore generico
"Application error: a server-side exception has occurred" (causa tipica:
`prepared statement "s0" already exists` nei log Vercel).

**Fix:** aggiungere `&pgbouncer=true` in fondo a `DATABASE_URL` quando la
stringa punta a un host pooled, es.:
```
postgresql://user:pass@ep-xxxx-pooler.c-3.us-east-2.aws.neon.tech/db?sslmode=require&pgbouncer=true
```
Le migrazioni (`prisma migrate deploy`) vanno invece eseguite preferibilmente
sulla connection string **diretta** (non pooled), se il provider la espone.

## 1. Database — Supabase o Neon

1. Creare un progetto su [supabase.com](https://supabase.com) (regione EU) o
   su [neon.tech](https://neon.tech) (o collegarlo da Vercel → Storage →
   Create Database).
2. Copiare la connection string pooled e aggiungere `&pgbouncer=true` come
   sopra. Su Supabase: **Project Settings → Database → Connection string**,
   modalità *Session pooler* (porta 5432), es.:
   `postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
3. Dal proprio PC, applicare migrazioni e dati demo (usare qui la stringa
   **senza** `pgbouncer=true`, o la variante diretta se disponibile):

```bash
export DATABASE_URL="<connection string>"
npx prisma migrate deploy   # crea lo schema con tutti i vincoli
npm run db:seed             # opzionale: dati demo fittizi per il pilot
```

## 2. App — Vercel

1. Su [vercel.com](https://vercel.com) → **Add New → Project** → importare la
   repo GitHub `alessandrovizzini1986-a11y/AMAZON`, branch di produzione a scelta
   (consigliato: `main` dopo il merge della PR).
2. Framework: Next.js (rilevato automaticamente). Il comando di build standard
   funziona già (`prisma generate` gira nel postinstall).
3. **Environment Variables** (scope **Production**, non solo Preview):
   - `DATABASE_URL` → connection string pooled **con `&pgbouncer=true`** (vedi sopra)
   - `AUTH_SECRET` → generare con `openssl rand -base64 32`
4. Deploy. Al termine l'app è su `https://<progetto>.vercel.app`.

## 3. Primo accesso

- Con il seed: `admin@fleetdsp.demo` / `admin1234` (cambiare subito la password
  via **Utenti → Reset password**, o non usare il seed in produzione).
- Senza seed: creare l'admin una tantum inserendo la riga in tabella `User`
  (hash bcrypt) oppure lanciare il seed e disattivare gli utenti demo.

## Modalità accesso libero (pilot in solitaria)

Per usare l'app da soli senza gestire login (utile mentre si finisce di
configurare tutto), impostare su Vercel:
- `AUTH_BYPASS` = `true`
- (opzionale) `AUTH_BYPASS_EMAIL` = email dell'utente da impersonare (default
  `admin@fleetdsp.demo`)

**⚠️ Con questa attiva l'app è raggiungibile da chiunque abbia l'URL, senza
credenziali.** Va rimossa (cancellare la variabile `AUTH_BYPASS` e Redeploy)
prima di invitare altri utenti reali.

## Limiti noti per la produzione

- **Foto check-in/danni** sono salvate sul filesystem (`uploads/`): su Vercel il
  filesystem è effimero, quindi le foto non persistono tra i deploy. Per il
  pilot va bene; per la produzione prevedere uno storage S3-compatibile
  (es. Supabase Storage) — il punto di aggancio è unico: `src/lib/uploads.ts`.
- Il piano free di Supabase sospende i DB inattivi dopo 7 giorni: per il pilot
  reale usare il piano Pro o un ping periodico.
