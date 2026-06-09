# Pubblicare il Forecast online (gratis)

L'app è in **Streamlit** (un server Python), quindi non si può usare GitHub
Pages (che serve solo file statici). Il percorso gratuito è:

- **Streamlit Community Cloud** → ospita l'app (gratis).
- **Neon** → database **Postgres** gratuito, dove gli snapshot restano salvati
  nel tempo (su Streamlit Cloud il disco è effimero: senza un DB esterno i dati
  sparirebbero a ogni riavvio).

Il codice è già pronto: se è configurata `database_url` usa Postgres, altrimenti
in locale usa SQLite. Non devi toccare il codice, solo seguire i passi qui sotto.

---

## 1. Crea il database gratuito su Neon (~3 min)

1. Vai su **https://neon.tech** e registrati (puoi usare il login con GitHub).
2. Crea un progetto (nome a piacere, regione **Europe** consigliata).
3. A fine creazione Neon mostra la **Connection string**. Copiala: ha la forma
   ```
   postgresql://utente:password@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
   Tienila da parte (la incollerai al passo 3). Se la perdi: *Dashboard →
   Connect*.

> Le tabelle vengono create da sole al primo avvio dell'app: non devi fare
> nient'altro su Neon.

## 2. Pubblica l'app su Streamlit Community Cloud (~3 min)

1. Vai su **https://share.streamlit.io** e accedi con il tuo account **GitHub**.
2. **Create app → Deploy a public app from GitHub** (oppure "From existing repo").
3. Imposta:
   - **Repository**: `alessandrovizzini1986-a11y/amazon`
   - **Branch**: `claude/amazon-repo-setup-private-x2rkgp` (o `main` dopo il merge)
   - **Main file path**: `app.py`
4. Non premere ancora "Deploy": prima apri **Advanced settings → Secrets** (passo 3).

## 3. Inserisci i secrets (password + database)

Nel riquadro **Secrets** incolla queste due righe (in formato TOML):

```toml
app_password = "scegli-una-password-forte"
database_url = "postgresql://utente:password@ep-xxxx.../neondb?sslmode=require"
```

- `app_password`: la password con cui entrerai nell'app (scegline una robusta).
- `database_url`: la connection string copiata da Neon al passo 1.

Poi premi **Deploy**. Dopo 1–2 minuti l'app è online su un indirizzo tipo
`https://<nome>.streamlit.app`, raggiungibile da qualsiasi dispositivo.

---

## Verifica

1. Apri l'URL → ti chiede la password → entra.
2. Tab **Carica**: carica un CSV/XLS, scegli colonne chiave + valore, salva.
3. Vai su **Archivio**: lo snapshot c'è.
4. Dal menu in alto a destra fai **Reboot app** e ricontrolla l'Archivio:
   lo snapshot **deve essere ancora lì** → la persistenza su Neon funziona.

## Note

- **Repository pubblica**: Streamlit Community Cloud richiede repo pubblica nel
  piano gratuito. Il codice non contiene dati: i file reali (Excel/PDF/DB) sono
  esclusi da `.gitignore` e i dati stanno su Neon, non nel repo. L'accesso è
  comunque protetto dalla password.
- **Aggiornare l'app**: a ogni push sul branch scelto, Streamlit Cloud
  ri-deploya da solo.
- **Sviluppo in locale**: senza `database_url` l'app usa SQLite
  (`data/gestionale.db`), così provi tutto sul tuo PC senza Neon.
