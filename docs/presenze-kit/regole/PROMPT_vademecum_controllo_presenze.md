# PROMPT — Sezione "Controllo presenze tracking vs Amazon Flex" per il vademecum della stagista

*Incolla questo testo nella chat del vademecum insieme ai file elencati in fondo.*

---

## Contesto per chi scrive il vademecum

Professional Solutions (Adecco) opera come Amazon DSP su 7 delivery station: DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1. Due popolazioni: STD (somministrati Adecco) e SIC (diretti). Gli Operations di ogni station compilano ogni mese un file "tracking" Excel (uno STD e uno SIC per station) con ore lavorate per giorno e la riga "Indennità Trasferta". Amazon mette a disposizione sul portale logistics.amazon.it → Performance → "Addetti alla consegna" un export giornaliero per station (CSV) con i pacchi consegnati per driver.

Il **controllo presenze** confronta i due: serve a intercettare, prima della chiusura payroll, trasferte pagate non dovute, giornate lavorate non registrate nel tracking e driver registrati nel tracking che Amazon non ha visto lavorare. Lo fa la stagista con un file Excel a sole formule (`Controllo_Trasferte_v3_TEMPLATE.xlsx`): **solo Excel**, niente macro, niente Python, niente PowerShell. Tutto quello che fa è scaricare CSV, copiare e incollare.

Scrivi la sezione in italiano, con tono semplice, per una persona che non ha mai visto né i tracking né il portale Amazon. Usa elenchi numerati per i passi e una tabella per i simboli. Niente teoria: solo cosa fare, cosa guardare, a chi scrivere.

## Procedura da documentare (4 passi + invio)

**Frequenza**: ogni settimana (lunedì, sui giorni fino alla domenica precedente) e comunque entro il 25 del mese sul periodo 1–25 per i parziali.

1. **Scaricare i CSV Amazon**: portale → Performance → Addetti alla consegna → seleziona station e giorno → Download. Salvare con nome `<STATION>_<giorno>.csv` (es. `DER2_5.csv`) in una cartella del mese (una sottocartella per station aiuta a non perdersi). Se il portale permette di scegliere un intervallo di date, scaricare un solo CSV per station e periodo: è lo stesso formato.
2. **Foglio START del template**: scegliere Station dal menu, anno, mese, giorno DA e giorno A.
3. **Incollare i dati** (celle gialle):
   - Foglio AMAZON: aprire un CSV con Excel, selezionare le righe **senza l'intestazione**, copiare, e incollare nel foglio AMAZON nella prima riga libera **a partire dalla colonna B** (la colonna A resta per la station). Scrivere la sigla della station in colonna A **solo sulla prima riga del blocco appena incollato**: le righe sotto la ereditano da sole. Ripetere per tutti i CSV, uno sotto l'altro, di tutte le station: il foglio AMAZON si riempie una volta al mese e vale per tutte le station. Il semaforo dice se manca il CSV di un giorno.
   - *Alternativa che Alessandro può impostare una volta (facoltativa, solo Excel)*: Dati → Recupera dati → Da file → Da cartella → scegliere la cartella dei CSV → Combina e trasforma; aggiungere una colonna personalizzata `Station = Text.Start([Source.Name],4)` e portarla per prima; Carica in… → Foglio esistente → AMAZON!$A$2. Da quel momento la stagista mette i CSV nella cartella e clicca Dati → Aggiorna tutto: zero incolla.
   - Foglio TRK_STD: aprire il tracking STD della station, foglio del mese (es. "10.26" o "Ottobre"), Ctrl+A, Ctrl+C, cella A1 → tasto destro → Incolla speciale → **Valori** (icona 123). Stessa cosa in TRK_SIC con il tracking SIC.
4. **Semaforo** in START: VERDE → leggere RISULTATO. ROSSO → la riga rossa dice cosa manca (CSV di un giorno, tracking del mese sbagliato, incollato non in A1…). "VERDE con avvisi" = ci sono driver senza Driver ID nel tracking: il file li aggancia per nome, va bene, ma segnalare agli Operations di inserire gli ID.
5. **Invio**: in RISULTATO filtrare la colonna "Da verificare" > 0, copiare le righe e mandarle al responsabile Operations della station (per DLO2/DLO4 Marco Carretta; gli altri referenti li indica Alessandro). Chiedere risposta entro 2 giorni lavorativi. Le risposte arrivano come correzioni sui tracking: dopo la correzione si reincolla il tracking e si ricontrolla. Per un'altra station: salva con nome, cancella TRK_STD e TRK_SIC (Ctrl+A, Canc), cambia Station in START; AMAZON resta com'è.

## Simboli del foglio RISULTATO (una riga per driver, una colonna per giorno)

| Simbolo | Significato | Cosa fare |
|---|---|---|
| ok | trasferta nel tracking e rotta Amazon coincidono | nulla |
| +1 | trasferta pagata ma Amazon non lo vede in rotta quel giorno (o ha lavorato ≤ 4 ore) | chiedere agli Ops: che cosa ha fatto? Se MEZZI/altra station/corso → devono scriverlo nella riga RIPOSO |
| −1 | Amazon lo vede in rotta ma nel tracking ha 0 ore | giornata mancante nel tracking: gli Ops la inseriscono |
| H | ore nel tracking ma assente in Amazon, senza trasferta e senza giustificativo | chiedere cosa ha fatto (spesso mezzi o errore di compilazione) |
| A | driver presente in Amazon con rotta ma assente da entrambi i tracking | la Nota dice se è presente in Amazon anche su un'altra station (→ prestito, cercarlo in quel tracking) oppure se è un nuovo assunto/dimesso non ancora inserito |
| vuoto | niente da segnalare | nulla |

Colonna "Giorni da verificare": elenco già pronto dei giorni con simbolo, da copiare nel messaggio agli Ops.

## Regole fisse (già nel file, da spiegare in due righe)

- Rotta Amazon = pacchi consegnati > 10. Trasferta dovuta solo se ore lavorate > 4 (servizi da 4 ore: nessun alert).
- Trasferta a 0 nel tracking non genera mai alert (se gli Ops l'hanno messa a zero, è voluto).
- Un codice della lista **Giustificativi** nella riga RIPOSO chiude il giorno senza alert: MEZZI, SM (spostamento mezzi), UFF, CORSO, FORMAZIONE, RESCUE, VM, DVN5, DVN6 e le sigle/nomi delle altre station (DLO4, ORIGGIO, BUCCINASCO…). La lista è modificabile in START.
- **I commenti nelle celle NON vengono letti dal file**: il codice va scritto nella riga RIPOSO. È l'errore più frequente (DVN1 e DLO5 scrivono "mezzi" nei commenti → decine di +1 falsi).
- I **Dispatcher** (elenco in START, cognome + nome) sono esclusi: non guidano, non hanno trasferta.
- Codici che NON sono giustificativi: SB (= turno "Same B"), L1 (= rotta standard 8 ore facilitata), R, C1, D, F, P (se c'è un codice di assenza ma anche ore lavorate, è un errore di compilazione da segnalare).

## Trappole note (metterle in un riquadro "Attenzione")

- Driver di una station che lavora in un'altra (DLO2↔DLO4 succede spesso): compare come A nella station Amazon e come +1/H nella station del tracking. Si chiude da solo se gli Ops scrivono la sigla della station nella riga RIPOSO.
- Nomi scritti diversi (D'Andrea / Dandrea, Amin Elkadimi / Amin Skalli Elkadimi): il file li aggancia se primo e ultimo nome coincidono; altrimenti compare un A + un +1 per lo stesso periodo → è la stessa persona, far inserire il Driver ID nel tracking.
- Due account Amazon per lo stesso driver: stesso effetto, stessa soluzione.
- Driver con contratto scaduto che compare ancora in Amazon (es. Manfredi DLO4, 3/10): segnalarlo subito ad Alessandro, non agli Ops.
- Tracking che sconfinano nel mese precedente/successivo (DLO4, DLO5, DVN1): il file legge solo i giorni del periodo scelto, non serve fare nulla, ma non modificare le date in intestazione.
- Il file ricalcola lentamente al primo incolla (20–60 secondi con 20.000 righe Amazon): aspettare che in basso sparisca "Calcolo".
- Incollare i CSV nel foglio AMAZON sempre dalla colonna B, mai da A: se si sbaglia colonna il semaforo va ROSSO su "AMAZON incollato".
- La data nel CSV è nel formato 2026-10-05: Excel la riconosce da solo; se compare come testo il file la converte comunque.
- Non inserire righe o colonne, non rinominare fogli, non scrivere fuori dalle celle gialle: i fogli sono protetti senza password proprio per questo.

## Output atteso dalla stagista ogni settimana

Una mail/Teams per station con la tabella filtrata di RISULTATO (Tipo, Driver, Driver ID, Giorni da verificare, Nota) e in START la riga RIEPILOGO (Trasferte, Rotte Amazon, +1, −1, H, A, € +1) copiata ad Alessandro. Dopo le risposte: tracking reincollato e conteggio alert residui.

## Escalation

- Ops non rispondono in 2 giorni → Alessandro.
- Semaforo ROSSO che non si risolve → Alessandro con screenshot di START.
- Driver sconosciuti (A) senza altra station in Nota e non confermati dagli Ops come nuovi assunti → Alessandro (possibile uso improprio dell'account).

---

## File da allegare nell'altra chat

| File | A cosa serve |
|---|---|
| `Controllo_Trasferte_v3_TEMPLATE.xlsx` | il template vuoto da descrivere (fogli START, AMAZON, TRK_STD, TRK_SIC, RISULTATO) |
| `Controllo_Trasferte_v3_ESEMPIO_DLO4.xlsx` | esempio compilato "pulito" (ottobre 1–25, semaforo verde) per screenshot del vademecum |
| `Controllo_Trasferte_v3_ESEMPIO_DVN1.xlsx` | esempio "sporco" (tracking senza ID, giustificativi nei commenti, manca un CSV) per la sezione Trappole |
| `PROMPT_controllo_trasferte_v2.md` | regole di dettaglio del controllo (già nel progetto Tracking Amazon, facoltativo) |
