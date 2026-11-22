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
| **Home** | [Da fare](/home): le scadenze della settimana e del mese · [Conto economico](/conto-economico): ricavi, costi e margine per cliente |
| **Flotta** | Situazione per stazione · Mezzi · Aggiorna da Lista Targhe · Furgoni in arrivo · Listini noleggiatori · Officine |
| **Personale** | Presenze · Costi del personale · Costi GLS |
| **Amazon** | Fatture · Fatturato · Rimborsi · Forecast · Storico forecast |
| **Spese mezzi** | Stato del mese · Telepass · Carburante Q8 · File già elaborati |
| **Strumenti** | Telefoni e SIM · Fuel card e Telepass · Spedizioni GLS · Portali fornitori · [Archivio file](/archivio): i file trascinati su questo PC |
| **Aiuto** | [Corsi](/corsi): lezioni ed esercizi · Vademecum · [Glossario](/vademecum/18-glossario) · Tour del sito · Training |
| **Gestione** (solo admin) | Utenti · Registro attività · Configurazione · Import iniziale |

Ognuno vede solo le pagine che può usare. Il **mese** si sceglie sempre allo stesso modo (‹ Ottobre 2026 ›) e resta quello scelto anche cambiando sezione, finché non chiudi il browser. Le pagine lunghe (Parametri, Listini, Rimborsi, Training) sono divise in **schede** sotto il titolo; i link con #sezione aprono la scheda giusta. Entrando nel sito si apre la **Home**: ogni scheda "Da fare" mostra quanti passi sono fatti e il prossimo, con **Vai** che porta dritto alla pagina giusta. Le scadenze si aggiornano da sole con quello che carichi.

### Dove finisce un dato: le quattro etichette

Accanto a ogni zona di caricamento e a ogni pulsante importante c'è un **?**: toccalo per leggere cosa fa, cosa fare prima e **dove finisce il dato**. Le etichette sono sempre queste quattro.

| Etichetta | Cosa vuol dire | La volta dopo lo ritrovi? |
|---|---|---|
| **Salvato sul sito** | Il dato è nel database del sito. | Sì, anche da un altro PC; lo vede chi ha il permesso. |
| **Solo su questo PC** | Il file resta nell'archivio di questo browser (succede con i file del modulo Presenze). | Sì, ma solo da questo PC e da questo browser. Non lo trovi da un altro PC; sparisce se cancelli i dati del browser. |
| **Temporaneo: salva o scarica** | Il risultato esiste solo mentre la pagina è aperta. | No, se non premi **Salva** o non scarichi l'Excel. Se provi a uscire, il sito ti avvisa. |
| **Scarichi un file** | Il file va nella cartella Download di questo PC. | Il sito non ne tiene copia: per riaverlo rifai il passo. |

I file originali (PDF, Excel, CSV) **non vengono mai salvati sul sito**: si leggono nel browser e al sito arrivano solo i dati che servono.

**Archivio di questo PC.** Ogni file che trascini resta anche nell'archivio del browser per 120 giorni dall'ultimo uso: dopo un aggiornamento della pagina, o in un'altra sezione, premi **Dall'archivio di questo PC** sotto la zona di trascinamento e scegli il file invece di ritrascinarlo. In [Archivio file](/archivio) li vedi tutti, li riscarichi o li togli. Il file di Portali (credenziali) non entra mai nell'archivio.

**Sigle.** Le sigle sottolineate a puntini (SIC, STD, CDC, F.O.…) mostrano il significato al passaggio del mouse e portano al [Glossario](/vademecum/18-glossario).

**Conto economico.** In [Conto economico](/conto-economico) vedi per mese, per DS e per cliente ricavi, costi e margine con quello che il sito ha già: fatture Amazon, stima o consuntivo del personale, canoni, Q8, Telepass, parcheggi. Per GLS i costi del mese si salvano da Costi GLS (**Salva nel conto economico**) e il ricavo è la fattura open book stimata. Passa il mouse su un numero per vedere da dove viene; "—" vuol dire che il dato manca.

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

### Spedizioni GLS

In **Strumenti → Spedizioni GLS** (solo Admin) trovi due cose:

1. **Il portale GLS**: il pulsante apre la pagina di accesso; nome utente e password si copiano da qui con **Copia** (la password resta nascosta e ogni copia finisce nel registro attività), la sede si sceglie nella tendina del portale. Il portale non accetta dati già compilati da un altro sito, per questo si copiano.
2. **Il bollettino di spedizione**: scrivi mittente, destinatario, colli e servizio; l'anteprima a fianco mostra il modulo GLS originale compilato. **Scarica il PDF** lo salva, **Apri per stampare** lo apre in una scheda, **Invia…** lo passa alla condivisione del dispositivo o, dove non c'è, lo scarica e apre una mail a cui allegarlo. Firma e timbro si mettono a mano sulla stampa.

Il mittente e i destinatari usati restano **solo su questo PC**, pronti per la volta dopo. Se cambia la password del portale: **Modifica accesso**.

### Il tour di benvenuto

Al **primo accesso** (e ogni volta che un Admin ti cambia ruolo) il sito ti dà il benvenuto e ti propone un tour di circa 3 minuti: la Home con le cose da fare, il menu, una tappa per ogni sezione che puoi aprire, il **?** e il tuo account.

- **Inizia il tour**: le tappe illuminano il pezzo di pagina di cui parlano. Ti muovi con **Avanti** e **Indietro** (o con le frecce della tastiera).
- **Più tardi** (o la ✕, o Esc): lo chiude e te lo ripropone al prossimo accesso.
- **Non mostrarlo più**: non torna da solo.
- Per rifarlo quando vuoi: menu **Aiuto → Tour del sito**.

### Prima volta in un modulo

La prima volta che apri un modulo compare un riquadro **"Prima volta qui?"** con i tre passi principali. Chiudilo con **Ho capito** e non torna più. Questa pagina resta sempre nel Vademecum.
