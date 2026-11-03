Nella cartella `fatture-amazon-kit/` del repository c'è tutto il materiale per un nuovo modulo "Fatture Amazon" con tre parti: fatture (PDF → righe da incollare in fatt_2026 + registro anti-doppioni + allineamento col file AGGREGATO), fatturato (storico per mese/stazione/classe) e forecast (ricavo previsto dai forecast Amazon con tariffe ricavate dalle ultime settimane).

Leggi per intero `fatture-amazon-kit/SPEC.md`, poi lavora in questo ordine, fermandoti alla fine di ogni fase per farmi vedere i risultati:

Fase 0 – Piano: esplora il repo e proponimi in 20 righe dove e come integri il modulo (cartelle, modelli Prisma, permessi RBAC, migrazione). Niente codice finché non confermo.

Fase 1 – Fatture: porta `reference/parser.js` in TypeScript senza cambiarne la logica; implementa importa / registro / allinea / carica storico (§2, §3, §4); test Vitest §8.1, §8.2, §8.3, §8.7, §8.8 verdi; esegui i test manuali S1–S8 e riportameli.

Fase 2 – Fatturato (§6): test §8.6 verde, S7–S8.

Fase 3 – Forecast (§7): test §8.4, §8.5 verdi, S9–S11.

Regole fisse: i file non arrivano mai al server (parsing nel browser, come Presenze/Telepass); ogni PDF caricato deve avere uno stato nel report; Excel con tabelle native stile standard senza formattazioni custom; ogni scrittura in AuditLog. Le regole della spec sono state verificate su fatture reali: se una ti sembra sbagliata, chiedimi prima di cambiarla.
