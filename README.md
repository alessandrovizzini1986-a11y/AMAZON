# Gestionale AMAZON

Workspace privato per la gestione di fatture, forecast e buste paga.

> ⚠️ Repository privata — accesso riservato al solo proprietario.
> I documenti reali (PDF, Excel, database) **non vengono mai committati**: vedi `.gitignore`.

## Cosa fa (roadmap)

| Modulo | Stato | Descrizione |
|---|---|---|
| 📈 **Forecast** | ✅ disponibile | Carica CSV/XLS/XLSX, salva snapshot, confronta due periodi con scostamento assoluto e %. |
| 🧾 **Fatture** | 🔜 in arrivo | Upload PDF, raggruppamento voci per macroarea, verifica tariffe. |
| 👥 **Buste paga** | 🔜 in arrivo | % malattia, n° risorse per contratto/station. |

## Stack

Python · [Streamlit](https://streamlit.io) (interfaccia) · SQLite (archivio) · pandas (analisi).

## Avvio in locale

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

L'app si apre nel browser su http://localhost:8501.

## Accesso (password)

L'app supporta un login a password per l'uso online. Imposta la password in uno dei due modi:

- variabile d'ambiente: `APP_PASSWORD=...`
- oppure file `.streamlit/secrets.toml` (copia da `.streamlit/secrets.toml.example`).

Senza password configurata l'app resta **aperta** e mostra un avviso: imposta sempre la password prima di pubblicarla online.

## Archivio dati

In locale i dati sono salvati in `data/gestionale.db` (SQLite). Percorso personalizzabile con la variabile d'ambiente `DB_PATH`.
La cartella `data/` è esclusa da Git.

Online il filesystem è effimero: se è configurata `database_url` (variabile d'ambiente `DATABASE_URL` o `st.secrets`) l'app usa **Postgres** (es. Neon) così gli snapshot restano salvati. Il backend è scelto in automatico.

## Deploy online

Guida passo-passo (Neon + Streamlit Community Cloud, gratis): vedi **[DEPLOY.md](DEPLOY.md)**.
