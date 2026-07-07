# Deploy FleetDSP — Vercel + Supabase (≈15 minuti)

Il progetto è pronto per il deploy: nessun servizio proprietario, servono solo
un database PostgreSQL e un hosting Node. La combinazione consigliata (piani
gratuiti sufficienti per il pilot) è **Supabase** (DB) + **Vercel** (app).

## 1. Database — Supabase

1. Creare un progetto su [supabase.com](https://supabase.com) (regione EU).
2. Da **Project Settings → Database → Connection string** copiare la stringa
   **URI** in modalità *Session pooler* (porta 5432), es.:
   `postgresql://postgres.xxxx:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
3. Dal proprio PC, applicare migrazioni e dati demo:

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
3. **Environment Variables** (Production):
   - `DATABASE_URL` → connection string Supabase (vedi sopra)
   - `AUTH_SECRET` → generare con `openssl rand -base64 32`
4. Deploy. Al termine l'app è su `https://<progetto>.vercel.app`.

## 3. Primo accesso

- Con il seed: `admin@fleetdsp.demo` / `admin1234` (cambiare subito la password
  via **Utenti → Reset password**, o non usare il seed in produzione).
- Senza seed: creare l'admin una tantum inserendo la riga in tabella `User`
  (hash bcrypt) oppure lanciare il seed e disattivare gli utenti demo.

## Limiti noti per la produzione

- **Foto check-in/danni** sono salvate sul filesystem (`uploads/`): su Vercel il
  filesystem è effimero, quindi le foto non persistono tra i deploy. Per il
  pilot va bene; per la produzione prevedere uno storage S3-compatibile
  (es. Supabase Storage) — il punto di aggancio è unico: `src/lib/uploads.ts`.
- Il piano free di Supabase sospende i DB inattivi dopo 7 giorni: per il pilot
  reale usare il piano Pro o un ping periodico.
