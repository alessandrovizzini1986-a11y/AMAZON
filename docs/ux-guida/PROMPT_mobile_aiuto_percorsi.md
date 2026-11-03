# FleetDSP: sito usabile da telefono, aiuto su ogni pulsante, percorsi guidati e tutorial

Prompt per Claude Code sul repository FleetDSP (Next.js 15 / Tailwind / Prisma / Neon). Si lavora in autonomia, per step, con controlli rigorosi. Una PR per step, unita solo con CI verde.

## 0. Obiettivo
1. Il sito si usa **da telefono** quanto da PC: si raggiungono tutte le sezioni e i pulsanti si toccano bene col dito.
2. Ogni pulsante importante spiega in **italiano semplice**:
   - **cosa fa**;
   - **cosa devi fare prima**;
   - **dove finisce il dato**: lo ritrovi la volta dopo o sparisce?
3. Ogni modulo ha un **percorso a binario** (poka-yoke): il sito indica il passo successivo, blocca gli errori tipici (ordine sbagliato, file sbagliato, risultato non salvato) e spiega perché un pulsante è spento. **Senza essere invadente**: niente popup a sorpresa, niente blocchi che non siano errori veri, tutto si può chiudere.
4. Un **tutorial** del sito: come funziona, cosa si salva dove, il giro di ogni modulo.

## 1. Audit di partenza (03/11/2026, iPhone 13, 31 pagine)
- Nessuna pagina esce in larghezza: le tabelle sono già in riquadri scorrevoli.
- **Bloccante:** la barra in basso mostra solo le prime 4 voci (Dashboard, Flotta, Vademecum, Officine). Da telefono non si arriva a Presenze, Telepass, Fatture, Costi né alla gestione.
- Bersagli piccoli (altezza < 32 px) in: anagrafiche Telepass (623: le celle-link della tabella), configurazione presenze (112), fatturato (73), flotta (42), utenti (39), parametri costi (24), dashboard (16), vademecum (15). Pulsanti `px-2 py-1 text-xs` sparsi.
- Su tablet (768–1280 px) la barra in alto dell'ADMIN ha 13 voci: va controllata.
- I `title` HTML sono l'unico "aiuto" e da telefono non si vedono.

## 2. Dove finisce il dato (verificato sul codice: è la base dei messaggi)
| Modulo / azione | Dove resta | La volta dopo |
|---|---|---|
| Presenze: file trascinati (tracking, CSV Amazon, Zucchetti) | **questo PC** (archivio del browser, IndexedDB) | sì, su questo PC e questo browser; non su altri PC; sparisce se si puliscono i dati del browser |
| Presenze: controllo eseguito e salvato, esiti Ops | **sito** (database) | sì, per tutti quelli col permesso |
| Telepass / Q8: anagrafiche | **sito** | sì |
| Telepass / Q8: elaborazione del mese | file **non salvati**; totali per station salvati sul **sito**; l'Excel va **scaricato** | il riepilogo sì, l'Excel no (riscaricabile solo rielaborando) |
| Fatture: PDF importati | **sito** (registro e righe); i PDF non si salvano | sì |
| Fatture: allinea e storico | **sito** | sì |
| Forecast | **sito** (righe del forecast) | sì |
| Costi: anagrafica CDL, ADIT, payroll, parametri | **sito** | sì |
| Costi: "Calcola costi" | **temporaneo** finché non premi "Salva stima"; l'Excel va scaricato | senza salvataggio, no |
| Flotta, import ordini e veicoli, utenti, configurazione | **sito** | sì |

Tre etichette fisse, sempre uguali: **"Salvato sul sito"** (verde), **"Solo su questo PC"** (blu), **"Temporaneo: salva o scarica"** (giallo).

## 3. Step 1: telefono e tablet
1. **Barra in basso:** 4 voci del ruolo più **"Menu"**, che apre un pannello dal basso con tutte le voci del ruolo (operative e gestione), l'account e l'uscita.
   - Il pannello è accessibile: `dialog`, si chiude con Esc o con il tocco fuori, il focus torna al pulsante.
   - La voce attiva è evidenziata. Se la pagina attiva non è tra le prime 4, si evidenzia "Menu".
2. **Tablet:** sotto i 1280 px la barra in alto mostra le voci operative e un "Altro" a tendina per la gestione.
3. **Bersagli ≥ 44 px su touch:** regola globale `@media (pointer: coarse)` per `a`, `button`, `select`, `input`, `summary` nelle aree interattive (min-height 44 px, padding), senza cambiare il desktop. Correggere a mano i pulsanti piccoli (`px-2 py-1 text-xs`).
4. **Tabelle larghe:**
   - prima colonna fissa (`sticky left-0`) nelle tabelle per station o per targa;
   - un'ombra al bordo che fa capire che si scorre;
   - "scorri →" sotto i 640 px.
5. **Moduli e filtri:** in colonna sotto i 640 px, campi a tutta larghezza, `inputmode` corretto (decimali, numeri).
6. **Controlli:**
   - lo script `scripts/audit-mobile.cjs` (Playwright, iPhone 13 e iPad) deve dare su tutte le pagine: overflow 0, bersagli < 44 px solo dentro le tabelle dati;
   - schermate prima/dopo;
   - test unitario sulla scelta delle voci della barra.

## 4. Step 2: aiuto su ogni pulsante e "dove finisce il dato"
1. **Componente `Aiuto`:** pulsante "?" piccolo ma ≥ 44 px di area su touch, accanto al pulsante o titolo.
   - Al tocco o al clic apre un riquadro con tre righe: **Cosa fa** · **Prima di premere** · **Dove finisce**.
   - Si chiude con Esc o toccando fuori. Funziona da tastiera (`aria-expanded`, `aria-controls`). Niente hover-only.
2. **Testi in un solo file** `src/content/aiuto.ts`, chiave per azione (`costi.calcola`, `fatture.importa.pdf`, …), con frasi brevi e in italiano semplice. Vietati gergo e sigle senza spiegazione.
3. **Componente `DoveFinisce`:** l'etichetta fissa del §2, accanto a ogni dropzone, pulsante di salvataggio o calcolo.
4. **Pulsanti spenti:** spiegano sempre perché (es. "Carica prima l'ADIT del mese precedente"), con link al passo che manca.
5. **Copertura:** tutte le dropzone, tutti i pulsanti Salva/Conferma/Calcola/Importa/Elimina/Excel/Copia di ogni modulo (inventario: circa 100 pulsanti).
6. **Controlli:**
   - un test verifica che ogni chiave usata nelle pagine esista in `aiuto.ts` e viceversa, e che ogni testo abbia le tre righe;
   - l'audit di copertura (Playwright) conta dropzone e pulsanti primari senza `Aiuto` vicino: deve dare 0.

## 5. Step 3: percorsi a binario (poka-yoke, mai invadenti)
1. **Componente `Percorso`:** fascia sottile in testa al modulo con i passi del giro.
   - Ogni passo ha uno stato **calcolato dai dati veri**: fatto ✓, da fare ora (evidenziato), da fare dopo, non serve.
   - C'è un link al passo, e il prossimo passo ha un pulsante "Vai".
   - Si può comprimere in una riga ("Passo 2 di 5: carica l'ADIT"); lo stato compresso resta per utente (`localStorage`).
2. **Percorsi:**
   - **Presenze settimanale:** carica i CSV Amazon e i tracking → esegui il controllo → manda i messaggi → segna gli esiti.
   - **Presenze fine mese:** tracking e Zucchetti → controllo → esiti.
   - **Telepass / Q8:** anagrafiche aggiornate → trascina il file → controlla → scarica l'Excel.
   - **Fatture del lunedì:** prossimo numero → importa i PDF → scarica o copia → incolla in fatt_2026 → allinea.
   - **Costi fine mese:** prerequisiti → calcola → leggi i controlli → salva le stime → Teams ed Excel.
   - **Consuntivo:** carica ADIT o payroll → leggi i delta → salva la riconciliazione → aggiorna i parametri (con ok).
3. **Poka-yoke concreti:**
   - **file sbagliato:** viene riconosciuto dal contenuto, con un messaggio che dice quale file serve;
   - **ordine sbagliato:** il pulsante resta spento e il motivo è scritto;
   - **risultato temporaneo non salvato:** avviso prima di lasciare la pagina (`beforeunload` solo se c'è un calcolo non salvato) e un promemoria sul pulsante Salva;
   - **sovrascrittura:** si conferma solo quando sostituisce davvero dati salvati;
   - **doppio caricamento:** viene rilevato (hash) e spiegato.
4. **Logica pura e testata:** `src/domain/percorsi/*.ts` (stato dei passi dai dati), con test per ogni percorso.

## 6. Step 4: tutorial
1. Pagina del vademecum **"Come funziona il sito"**:
   - i tre posti dove finisce un dato (sito, questo PC, temporaneo) con esempi;
   - il giro di ogni modulo, in 3–5 passi, con link;
   - cosa fare da telefono;
   - cosa vuol dire un pulsante spento.
2. **Prima visita di un modulo:** riquadro discreto "Prima volta qui?" con i 3 passi e il link alla guida. Si chiude e non torna; è riapribile dal "?" del titolo.
3. Il test del vademecum conta una pagina in più.

## 7. Regole per tutti gli step
- Italiano semplice, frasi brevi, il "tu", nessun gergo tecnico (IndexedDB → "archivio di questo browser").
- Niente librerie nuove pesanti; componenti accessibili (tastiera, lettori di schermo, contrasto 4,5:1).
- **Controlli prima di ogni PR:**
  - `tsc`, lint, tutti i test;
  - build;
  - audit mobile e audit di copertura;
  - schermate telefono e desktop delle pagine toccate;
  - nessun cambio di comportamento dei calcoli (i test golden restano verdi).
- A fine step: tabella con i controlli passati, gli URL da provare e cosa manca.

## 8. Stato (03/11/2026)
| Step | PR | Esito |
|---|---|---|
| 1. Telefono e tablet | #33 | menu completo, Altro/Gestione, 44 px al tocco, tabelle con prima colonna fissa; audit 62/62 |
| 2. Aiuto e "dove finisce" | #34 | 48 testi in `src/content/aiuto.ts`, componente `Aiuto`/`DoveFinisce`/`Motivo`, test di copertura |
| 3–4. Percorsi, avviso di uscita, tutorial | questa | `src/domain/percorsi`, `Percorso` in Presenze/Telepass/Fatture/Costi, `useAvvisoUscita` su 6 schermate con risultati temporanei, vademecum 16, riquadro "Prima volta qui?" |
