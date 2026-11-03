# Kit modulo "Fatture Amazon" (v2, per Next.js/Prisma) – per Claude Code

- `PROMPT_CLAUDE_CODE.md` – messaggio da dare a Claude Code
- `SPEC.md` – specifica completa: modello dati, 3 moduli (fatture, fatturato, forecast), regole, test automatici (§8) e test nel sito (§9)
- `reference/parser.js` – parser di riferimento (fonte di verità) · `reference/parse_fatture.py` – stesso parser in Python
- `tests/run_tests.js` – esempio di test del parser con pdf.js in Node (12 OK) · `tests/parser.test.ts.example` – scheletro Vitest
- `fixtures/pdf/` + `fixtures/expected/` – 12 fatture reali e risultato atteso
- `fixtures/classificazione_descrizioni.csv` – 187 descrizioni → classe attesa (+ macro/micro storiche)
- `fixtures/colonne_fatt_2026.txt` – intestazioni esatte · `fixtures/mapping_macroarea.csv` – mapping MACRO/MICRO
- `fixtures/registro_iniziale_numeri.csv` – 586 numeri presenti al 30/10/2026
- `fixtures/fatturato/` – `fatt_2026_completo_al_24-10.csv` (12.361 righe, storico 2026), fatturato mensile atteso per DS e per classe, `AGGREGATO_mini_test.xlsx` per il test di allineamento
- `fixtures/forecast/` – forecast Amazon reali (PROF_40 next, PROF_44 next, PROF_43 same), mappa forecast→classe, dataset di calibrazione sett. 36–40 con tariffe ed extra attesi, forecast sett. 41 con previsione attesa e actual

CSV: separatore `;`, decimali `,`, UTF-8.
