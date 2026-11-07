---
title: "Come funziona il sito"
order: 16
category: "Base"
updated: "2026-11-07"
---

Questa pagina spiega in breve come si usa FleetDSP: dove finiscono i dati che carichi, come ti guida il sito e come usarlo da telefono.

### Il menu e la Home

Il menu in alto è diviso per tema; ogni voce apre una tendina con le pagine e una riga che dice a cosa servono:

| Gruppo | Pagine |
|---|---|
| **Home** | [Da fare](/home): le scadenze della settimana e del mese, gli avvisi e tutte le sezioni |
| **Flotta** | Situazione per stazione · Mezzi · Furgoni in arrivo · Officine · Listini noleggiatori |
| **Personale** | Presenze · Costi del personale · Costi GLS |
| **Amazon** | Fatture · Fatturato · Rimborsi · Forecast |
| **Spese mezzi** | Telepass e carburante · Telepass · Carburante Q8 · Carte e dispositivi |
| **Aiuto** | Vademecum · Training · Portali |
| **Gestione** (solo admin) | Import · Utenti · Configurazione · Audit |

Ognuno vede solo le pagine che può usare. Entrando nel sito si apre la **Home**: ogni scheda "Da fare" mostra quanti passi sono fatti e il prossimo, con **Vai** che porta dritto alla pagina giusta. Le scadenze si aggiornano da sole con quello che carichi.

### Dove finisce un dato: le quattro etichette

Accanto a ogni zona di caricamento e a ogni pulsante importante c'è un **?**: toccalo per leggere cosa fa, cosa fare prima e **dove finisce il dato**. Le etichette sono sempre queste quattro.

| Etichetta | Cosa vuol dire | La volta dopo lo ritrovi? |
|---|---|---|
| **Salvato sul sito** | Il dato è nel database del sito. | Sì, anche da un altro PC; lo vede chi ha il permesso. |
| **Solo su questo PC** | Il file resta nell'archivio di questo browser (succede con i file del modulo Presenze). | Sì, ma solo da questo PC e da questo browser. Non lo trovi da un altro PC; sparisce se cancelli i dati del browser. |
| **Temporaneo: salva o scarica** | Il risultato esiste solo mentre la pagina è aperta. | No, se non premi **Salva** o non scarichi l'Excel. Se provi a uscire, il sito ti avvisa. |
| **Scarichi un file** | Il file va nella cartella Download di questo PC. | Il sito non ne tiene copia: per riaverlo rifai il passo. |

I file originali (PDF, Excel, CSV) **non vengono mai salvati sul sito**: si leggono nel browser e al sito arrivano solo i dati che servono.

### Il binario: il sito ti dice il prossimo passo

In testa a Presenze, Telepass e carburante, Fatture Amazon e Costi del personale c'è una **fascia sottile** con il giro del modulo. Il sito calcola i passi dai dati veri:

- **✓**: fatto;
- **→**: da fare ora, con il pulsante **Vai**;
- **·**: da fare dopo;
- **○**: facoltativo.

**Mostra i passi** apre l'elenco completo, **Nascondi i passi** lo richiude. Il sito si ricorda la tua scelta su questo PC.

Il sito ti ferma solo quando c'è un errore vero:

- un **pulsante spento** scrive sotto il motivo, ad esempio "carica prima l'ADIT del mese precedente";
- un **file sbagliato** viene riconosciuto dal contenuto e ti viene detto quale file serve;
- se esci con un **risultato non salvato**, il browser ti chiede conferma;
- un **file già caricato** viene riconosciuto e non crea doppioni.

### I giri dei moduli

| Modulo | Quando | Passi |
|---|---|---|
| [Presenze](/presenze) | ogni settimana e a fine mese | 1. Carica i CSV Amazon e i tracking nell'archivio → 2. Esegui e salva il controllo → 3. Manda i messaggi agli Ops e segna gli esiti → 4. A fine mese: tracking contro Zucchetti |
| [Telepass e carburante](/carburante-telepass) | a inizio mese | 1. Anagrafiche aggiornate → 2. Elabora il CSV Telepass e scarica l'Excel → 3. Elabora l'export Q8 e scarica l'Excel |
| [Fatture Amazon](/fatture-amazon) | ogni lunedì | 1. Importa i PDF dal prossimo numero → 2. Incolla le righe in fatt_2026 → 3. Allinea il registro |
| [Costi del personale](/costi) | a chiusura del mese | 1. Anagrafica CDL al massimo di 3 mesi → 2. ADIT del mese prima → 3. Calcola e salva le stime STD e SIC → 4. Teams ed Excel |
| [Consuntivo costi](/costi/consuntivo) | quando arrivano ADIT e paga | 1. ADIT del mese → 2. Riconciliazione STD → 3. Costi del personale del mese dopo → 4. Riconciliazione SIC → 5. Aggiorna parametri, solo con l'ok di Alessandro |

### Da telefono

- La **barra in basso** ha Home e i primi gruppi (Flotta, Personale, Amazon) e **Menu**, che apre tutte le pagine divise per gruppo, insieme ad Account ed Esci.
- Le **tabelle larghe** si scorrono di lato: la prima colonna resta ferma e il bordo destro sfumato indica che la tabella continua.
- Per **caricare un file** da telefono tocca "Oppure scegli il file". Ricorda che "Solo su questo PC" vuol dire solo su quel telefono.

### Prima volta in un modulo

La prima volta che apri un modulo compare un riquadro **"Prima volta qui?"** con i tre passi principali. Chiudilo con **Ho capito** e non torna più. Questa pagina resta sempre nel Vademecum.
