/**
 * Corso "La stima di metà mese": la giornata del terzo lunedì dalla A alla Z, dopo la verifica dei tracking.
 * I numeri degli esercizi sulla proiezione si calcolano qui con la stessa formula del foglio (totale ÷ giorno × giorni del mese).
 */
import type { Corso, Esercizio, Gruppo } from "@/domain/corsi/corsi";
import { COSTO_ORA_BASE, NOME_FILE_STIMA, PERCORSO_FILE_STIMA, PERCORSO_PRESENZE_GLS } from "@/domain/costi/metaMese";

const it = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT", { useGrouping: "always" });
const scelta = (domanda: string, opzioni: string[], giusta: number, perche: string): Esercizio => ({ tipo: "scelta", domanda, opzioni, giusta, perche });
const g = (id: string, ...alternative: Esercizio[]): Gruppo => ({ id, alternative });
const PERCORSO = PERCORSO_FILE_STIMA.join(" › ");
const PERCORSO_GLS = PERCORSO_PRESENZE_GLS.join(" › ");

/** "Fino al giorno G il costo è T: quanto sarà il mese intero?" */
const proiezione = (totale: number, giorno: number, giorniMese: number, mese: string): Esercizio => {
  const alGiorno = totale / giorno, intero = alGiorno * giorniMese;
  return {
    tipo: "numeri", domanda: `${mese} ha ${giorniMese} giorni. Fino al giorno ${giorno} il costo è ${it(totale)} €. Quanto costa un giorno e quanto sarà il mese intero?`,
    campi: [{ nome: "Costo di un giorno (€)", valore: Math.round(alGiorno * 100) / 100 }, { nome: "Mese intero (€)", valore: Math.round(intero * 100) / 100 }],
    perche: `Un giorno: ${it(totale)} ÷ ${giorno} = ${it(alGiorno)} €. Mese intero: ${it(alGiorno)} × ${giorniMese} = ${it(intero)} €.`,
  };
};
/** "N ore di una voce: quanto costano?" */
const costoVoce = (ore: number, voce: string, costo: number): Esercizio => ({
  tipo: "numeri", domanda: `Nella riga ${voce} ci sono ${it(ore)} ore in tutto. Il costo orario è ${it(costo)} €. Quanto vale la colonna «Costo tot»?`,
  campi: [{ nome: "Costo tot (€)", valore: Math.round(ore * costo * 100) / 100 }], perche: `Costo tot = ore × costo orario: ${it(ore)} × ${it(costo)} = ${it(ore * costo)} €.`,
});

export const CORSO_STIMA: Corso = {
  id: "stima-meta-mese",
  titolo: "La stima di metà mese",
  descrizione: "La giornata del terzo lunedì dalla A alla Z: dopo la verifica dei tracking, come si stima il costo del personale del mese con il file Stima Costi.",
  perChi: "Chi fa la stima dei costi a metà mese. Da fare dopo il corso sui tracking.",
  lezioni: [
    {
      slug: "la-giornata", titolo: "La giornata dalla A alla Z", minuti: 6,
      obiettivo: "Sapere cosa si fa il terzo lunedì del mese, in che ordine e perché.",
      testo: `Il **terzo lunedì del mese** si fa la **stima dei costi del personale**: quanto costeranno i driver a fine mese. Serve all'azienda per sapere in anticipo se il mese sta andando bene o male, senza aspettare le buste paga.

Il mese non è finito, quindi i dati ci sono solo per una parte: si prendono le ore lavorate **fino a ieri** e si allungano fino a fine mese. Per questo si chiama stima.

**L'ordine della giornata**

| Passo | Cosa fai | Dove |
|---|---|---|
| 1 | Scarichi i CSV di Amazon e raccogli i tracking SIC e STD di tutte le station | Portale Amazon, cartelle degli OS |
| 2 | Fai la **verifica dei tracking** e mandi le richieste agli OS | Personale → Presenze → Verifica tracking |
| 3 | Aspetti le correzioni importanti e ricarichi i tracking corretti | Archivio file |
| 4 | Prendi il file **presenze GLS Delivery** del mese | Cartella GLS (sotto) |
| 5 | Fai la **stima di metà mese** e scarichi il foglio | Personale → Costi del personale → Stima di metà mese |
| 6 | Copi il foglio nel file **${NOME_FILE_STIMA}** | Cartella condivisa (sotto) |
| 7 | Avvisi che la stima è pronta: il file si allega alla mail mensile | Mail |

**Perché la verifica viene prima.** La stima somma le ore scritte nei tracking. Se un tracking ha un errore (ore doppie, straordinari sbagliati, un giorno non lavorato) l'errore finisce pari pari nel costo. Prima si puliscono i dati, poi si contano.

**Dove sta il file.** ${PERCORSO} › **${NOME_FILE_STIMA}**. Dentro c'è **un foglio per ogni mese** (Lug_26, Ott_26…): ogni mese se ne aggiunge uno, i vecchi non si toccano.

**Dove sta il file presenze GLS.** ${PERCORSO_GLS}. Ci sono due file per ogni mese: prendi quello che finisce con **_Delivery** (es. «GLS Castel Maggiore - Presenze NOVEMBRE_2026_Delivery»). Quello **_Magazzino** per ora non serve.

**Regola da ricordare:** prima verifichi, poi stimi. Mai il contrario.`,
      esercizi: [
        g("a", scelta("Quando si fa la stima dei costi del personale?", ["Il primo del mese", "Il terzo lunedì del mese", "L'ultimo giorno del mese"], 1, "La stima si fa a metà mese, il terzo lunedì: serve a sapere in anticipo come andrà il mese.")),
        g("b", scelta("Perché la verifica dei tracking si fa prima della stima?", ["Perché è più veloce", "Perché la stima somma le ore dei tracking: un errore nel tracking diventa un errore nel costo", "Perché lo chiede Amazon"], 1, "La stima conta le ore scritte nei tracking: se sono sbagliate, è sbagliato anche il costo."),
          scelta("Hai i tracking ma non hai ancora fatto la verifica. Cosa fai?", ["Faccio subito la stima, la verifica dopo", "Prima la verifica e le richieste agli OS, poi la stima", "Salto la verifica: a metà mese non serve"], 1, "Prima si puliscono i dati con la verifica, poi si contano le ore per la stima.")),
        g("c", scelta("Perché si chiama «stima»?", ["Perché i numeri sono inventati", "Perché il mese non è finito: si contano le ore fino a ieri e si allungano a fine mese", "Perché si usano i dati del mese scorso"], 1, "A metà mese esistono solo le ore dei primi giorni: il resto del mese si calcola in proporzione.")),
        g("d", scelta("Nel file Stima Costi è arrivato un mese nuovo. Cosa fai?", ["Scrivo sopra il foglio del mese scorso", "Aggiungo un foglio nuovo per il mese, i vecchi restano come sono", "Creo un file nuovo"], 1, "Il file ha un foglio per ogni mese: si aggiunge quello nuovo e i precedenti restano come storico.")),
        g("e", scelta("Nella cartella 04-PRESENZE di GLS ci sono due file del mese: _Delivery e _Magazzino. Quale usi per la stima?", ["Tutti e due", "Solo quello _Delivery", "Solo quello _Magazzino"], 1, "Per la stima serve solo il file presenze Delivery. Il Magazzino per ora non si usa."),
          scelta("Quale file serve per la colonna GLS della stima?", ["Il CSV di Amazon", "Il file presenze GLS Delivery del mese", "Il file presenze GLS Magazzino del mese"], 1, "GLS non ha i tracking Amazon: le sue ore arrivano dal file presenze GLS Delivery del mese.")),
      ],
      approfondisci: [{ href: "/corsi", label: "Corso «Tracking, contratti e Accordo»" }, { href: "/presenze/verifica", label: "Apri la Verifica tracking" }],
    },
    {
      slug: "il-file", titolo: "Com'è fatto il foglio del mese", minuti: 8,
      obiettivo: "Leggere il foglio: i due blocchi SIC e STD, le righe delle ore, le colonne delle station e GLS.",
      testo: `Ogni foglio del file ha la stessa forma. Imparata una volta, vale per tutti i mesi.

**In alto a sinistra** ci sono tre celle: la data della stima (es. «al 25-10-26»), il **giorno** della stima (25) e i **giorni del mese** (31). Servono per allungare il conto a fine mese.

**Due blocchi, uno sopra l'altro**

| Blocco | Chi sono | Chi li paga |
|---|---|---|
| **Costi SIC** (in alto) | I dipendenti di Professional Solutions | Noi, con la busta paga |
| **Costi STD** (sotto) | I somministrati di Adecco | Adecco, che poi ci manda la fattura |

Sono gli stessi due gruppi dei tracking: un tracking SIC e uno STD per ogni station.

**Le colonne.** Una colonna colorata per ogni station (DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1) e, a destra in giallo, **GLS**. Prima delle station ci sono: **HH** (le ore di tutte le station sommate), **Costo tot** e **COSTO/H** (quanto costa un'ora di quella riga).

**Le righe delle ore**

| Riga del foglio | Da dove viene nel tracking |
|---|---|
| STANDARD | Riga Standard nei giorni feriali |
| MAGGIORAZIONE 50% | Riga Standard di **domenica o festivo** (anche il patrono della station) |
| SUPPLEMENTARI 18% | Riga Supplementare nei giorni feriali |
| SUPPLEMENTARI 65% | Riga Supplementare di domenica o festivo |
| STRAORDINARI SETT 30% | Riga Straordinario nei giorni feriali |
| STRAORDINARI DOMENICALI 65% | Riga Straordinario di domenica o festivo |
| TRASFERTE ORD / DOM | Numero di **giorni** con la trasferta, feriali e di domenica |
| Ferie, ROL, ExFest e Malattie | Ore ÷ 8 = giornate. Si guardano, non hanno un costo nel foglio |

**Un caso particolare.** Se un festivo in mezzo alla settimana è lavorato come **6° giorno**, quelle ore non vanno al 50% ma al **65%**.

**In fondo** c'è un riepilogo per station: ore lavorate, ferie, malattie e trasferte.

**Regola da ricordare:** stessa riga del tracking, ma di domenica o festivo cambia riga nel foglio perché costa di più.`,
      esercizi: [
        g("a", scelta("Chi c'è nel blocco «Costi STD»?", ["I dipendenti di Professional Solutions", "I somministrati di Adecco", "I driver di GLS"], 1, "STD sono i somministrati di Adecco; SIC sono i dipendenti di Professional Solutions."),
          scelta("Chi c'è nel blocco «Costi SIC»?", ["I dipendenti di Professional Solutions", "I somministrati di Adecco", "Gli Operation Supervisor"], 0, "SIC sono i dipendenti di Professional Solutions; STD sono i somministrati di Adecco.")),
        g("b", scelta("Un driver ha 6 ore nella riga Standard di domenica. In quale riga del foglio finiscono?", ["STANDARD", "MAGGIORAZIONE 50%", "STRAORDINARI DOMENICALI 65%"], 1, "Lo Standard di domenica o festivo va in Maggiorazione 50%: è la stessa ora, ma costa di più."),
          scelta("Un driver ha 7,8 ore nella riga Standard il giorno del patrono della sua station (un mercoledì, 3° giorno lavorato). In quale riga finiscono?", ["STANDARD", "MAGGIORAZIONE 50%", "SUPPLEMENTARI 18%"], 1, "Il patrono è un festivo: lo Standard di quel giorno va in Maggiorazione 50%.")),
        g("c", scelta("Un driver ha 4 ore nella riga Straordinario di sabato. In quale riga del foglio finiscono?", ["STRAORDINARI SETT 30%", "STRAORDINARI DOMENICALI 65%", "MAGGIORAZIONE 50%"], 0, "Il sabato non è domenica né festivo: lo straordinario resta al 30%."),
          scelta("Un driver ha 5 ore nella riga Straordinario di domenica. In quale riga del foglio finiscono?", ["STRAORDINARI SETT 30%", "STRAORDINARI DOMENICALI 65%", "MAGGIORAZIONE 50%"], 1, "Lo straordinario di domenica o festivo va nella riga al 65%.")),
        g("d", scelta("Nelle righe TRASFERTE cosa c'è scritto?", ["Le ore di viaggio", "Il numero di giorni con la trasferta", "I chilometri"], 1, "Le trasferte si contano a giorni: un giorno lavorato con trasferta vale 1.")),
        g("e", scelta("Un festivo di giovedì è il 6° giorno lavorato della settimana di un driver. Le sue ore Standard di quel giorno vanno:", ["al 50%", "al 65%", "in Standard normale"], 1, "Il festivo lavorato come 6° giorno non va al 50% ma al 65%.")),
        g("f", { tipo: "numeri", domanda: "Nella riga Malattie una station ha 62,4 ore. Il foglio le scrive in giornate (ore ÷ 8). Che numero trovi?", campi: [{ nome: "Giornate", valore: 7.8 }], perche: "62,4 ÷ 8 = 7,8 giornate di malattia." },
          { tipo: "numeri", domanda: "Nella riga Ferie, ROL, ExFest una station ha 520 ore. Il foglio le scrive in giornate (ore ÷ 8). Che numero trovi?", campi: [{ nome: "Giornate", valore: 65 }], perche: "520 ÷ 8 = 65 giornate di assenza." }),
      ],
    },
    {
      slug: "dalle-ore-al-mese", titolo: "Dalle ore al costo del mese", minuti: 10,
      obiettivo: "Capire i tre conti del foglio: ore × costo orario, costo di un giorno, mese intero.",
      testo: `Il foglio fa tre conti, sempre gli stessi.

**1. Ore × costo orario.** Per ogni riga: **Costo tot = HH × COSTO/H**. Esempio: 2.000 ore di Maggiorazione 50% a ${it(COSTO_ORA_BASE.magg50)} € fanno ${it(2000 * COSTO_ORA_BASE.magg50)} €. Le trasferte si moltiplicano per il costo di un giorno di trasferta.

**2. Il costo di un giorno.** Si sommano i costi delle righe e si divide per il **giorno della stima**. Se fino al 25 il totale è 250.000 €, un giorno costa 250.000 ÷ 25 = 10.000 €.

**3. Il mese intero.** Il costo di un giorno per i **giorni del mese**: 10.000 × 31 = 310.000 €. È il numero in grassetto grande.

In una riga sola: **mese intero = totale ÷ giorno della stima × giorni del mese**.

**Attenzione ai giorni del mese.** Novembre ne ha 30, ottobre 31, febbraio 28. Se la cella è sbagliata, tutta la stima è sbagliata. Il foglio scaricato dal sito la mette giusta da solo.

**Cosa entra nel totale**

| Blocco | Righe sommate | Perché |
|---|---|---|
| **SIC** | Dalla Maggiorazione 50% alle trasferte, **senza** la riga STANDARD | Lo stipendio base dei dipendenti è fisso e si conta a parte: qui interessa solo la parte che cambia |
| **STD** | Tutte, **con** la riga STANDARD | Adecco fattura ogni ora lavorata |
| **GLS** | Dipendenti e somministrati insieme | È un appalto solo |

**La cella accanto.** Vicino a ogni mese intero c'è una cella con «÷ 3 × 4»: è un secondo conto che usa Alessandro. Non toccarla.

**Quanto è affidabile.** La stima immagina che il resto del mese vada come la prima parte. Se nei primi giorni c'è stato un festivo o un picco di lavoro, il mese intero esce un po' alto; se nel finale ci sarà un picco, esce basso. Se sai una cosa così, scrivila quando avvisi che la stima è pronta.

**Regola da ricordare:** totale ÷ giorno della stima × giorni del mese.`,
      esercizi: [
        g("a", proiezione(250000, 25, 31, "Ottobre"), proiezione(180000, 18, 30, "Novembre"), proiezione(210000, 21, 31, "Dicembre"), proiezione(128000, 16, 28, "Febbraio")),
        g("b", costoVoce(2000, "MAGGIORAZIONE 50%", COSTO_ORA_BASE.magg50), costoVoce(1500, "SUPPLEMENTARI 18%", COSTO_ORA_BASE.supp18), costoVoce(300, "STRAORDINARI SETT 30%", COSTO_ORA_BASE.str30)),
        g("c", scelta("Nel totale del blocco SIC la riga STANDARD:", ["entra come le altre", "non entra: lo stipendio base dei dipendenti è fisso e si conta a parte", "entra solo di domenica"], 1, "Nel blocco SIC si somma solo la parte variabile, dalla Maggiorazione 50% alle trasferte."),
          scelta("Nel totale del blocco STD la riga STANDARD:", ["entra: Adecco fattura ogni ora lavorata", "non entra, come per i dipendenti", "entra solo se supera le 39 ore"], 0, "Per i somministrati si sommano tutte le righe, Standard compresa.")),
        g("d", scelta("Fai la stima di novembre il giorno 16. Nella cella dei giorni del mese c'è scritto 31. Cosa succede?", ["Niente, è uguale", "Il mese intero esce più alto del dovuto: novembre ha 30 giorni", "Il mese intero esce più basso"], 1, "Con 31 al posto di 30 si conta un giorno in più: la stima esce più alta."),
          scelta("Fai la stima di ottobre il giorno 19. Nella cella dei giorni del mese c'è scritto 30. Cosa succede?", ["Niente, è uguale", "Il mese intero esce più alto", "Il mese intero esce più basso del dovuto: ottobre ha 31 giorni"], 2, "Con 30 al posto di 31 manca un giorno: la stima esce più bassa.")),
        g("e", proiezione(96000, 12, 30, "Aprile"), proiezione(170000, 20, 31, "Maggio"), proiezione(119000, 14, 30, "Giugno")),
        g("f", scelta("Nei primi 15 giorni del mese ci sono stati due festivi lavorati. La stima del mese intero probabilmente esce:", ["un po' alta: allunga a tutto il mese giorni più cari del normale", "un po' bassa", "esatta"], 0, "La stima immagina che il resto del mese sia come la prima parte: se la prima parte è più cara, esce alta.")),
      ],
    },
    {
      slug: "farla-sul-sito", titolo: "Fare la stima sul sito e metterla nel file", minuti: 8,
      obiettivo: "Fare tutta la stima da sola: dal sito al foglio dentro il file Stima Costi.",
      testo: `Le ore non si contano a mano: le conta il sito dai tracking che hai già verificato. La pagina è **Personale → Costi del personale → Stima di metà mese**.

**Sul sito**

1. Controlla il **mese** in alto.
2. Guarda il riquadro **Cosa serve**: i tracking SIC e STD devono essere **7 su 7**. Quelli caricati per la verifica ci sono già. Se ne manca uno, trascinalo nel riquadro.
3. Trascina il file **presenze GLS Delivery** del mese (cartella GLS › 04-PRESENZE, solo il file _Delivery).
4. In **Stima fino al giorno** scrivi l'ultimo giorno che i tracking coprono **per intero**: di solito la domenica appena passata.
5. Premi **Calcola la stima**. Compaiono i tre totali (Amazon SIC, Amazon STD, GLS) e le ore per station.
6. Se compare **Stima incompleta**, manca un file: i totali non lo contano. Aggiungilo e ricalcola.
7. Premi **Scarica il foglio**: arriva un Excel con un solo foglio, già con i colori e le formule degli altri mesi.

**Nel file ${NOME_FILE_STIMA}**

Il file è qui: ${PERCORSO}.

1. Apri **${NOME_FILE_STIMA}** e il foglio scaricato, tutti e due in Excel sul computer (non nel browser).
2. Nel foglio scaricato: tasto destro sulla linguetta in basso → **Sposta o copia**.
3. In «Nella cartella» scegli **${NOME_FILE_STIMA}**. In «Prima del foglio» scegli **(sposta alla fine)**. Spunta **Crea una copia**. OK.
4. Se c'era già un foglio dello stesso mese, cancella quello vecchio.
5. Salva e chiudi.

**Il controllo prima di avvisare**

| Guarda | Deve essere |
|---|---|
| Le tre celle in alto | Data, giorno della stima e giorni del mese giusti |
| Le colonne delle station | Nessuna colonna tutta a zero |
| La colonna gialla GLS | Piena, se hai caricato le presenze GLS |
| Il mese intero | Vicino a quello del foglio del mese prima. Se è molto diverso, cerca il perché prima di avvisare |

**Poi** avvisi che la stima è pronta. Il file si allega alla mail mensile, insieme al costo dei furgoni per compagnia di noleggio (pagina **Situazione per stazione**, in fondo).

**Regola da ricordare:** il giorno della stima è l'ultimo giorno pieno dei tracking, non la data di oggi.`,
      esercizi: [
        g("a", scelta("Oggi è lunedì 16. I tracking sono compilati fino a domenica 15. Che giorno scrivi in «Stima fino al giorno»?", ["16", "15", "30"], 1, "Si mette l'ultimo giorno coperto per intero dai tracking: domenica 15."),
          scelta("Oggi è lunedì 19. I tracking sono compilati fino a domenica 18. Che giorno scrivi in «Stima fino al giorno»?", ["18", "19", "31"], 0, "Si mette l'ultimo giorno coperto per intero dai tracking: domenica 18.")),
        g("b", scelta("Il riquadro «Cosa serve» dice «Tracking STD: 6 su 7 — mancano DLO5». Cosa fai?", ["Calcolo lo stesso e mando", "Recupero il tracking STD di DLO5, lo trascino e poi calcolo", "Scrivo le ore di DLO5 a mano"], 1, "Senza quel tracking il totale STD non conta una station intera: prima si aggiunge il file.")),
        g("c", scelta("Come porti il foglio scaricato dentro il file Stima Costi?", ["Copio e incollo le celle una per una", "Tasto destro sulla linguetta → Sposta o copia → scelgo il file, in fondo, con «Crea una copia»", "Rinomino il file scaricato"], 1, "Con Sposta o copia il foglio entra nel file con formule e colori, senza incollare niente a mano.")),
        g("d", scelta("Nel foglio la colonna di DLZ2 è tutta a zero. Cosa vuol dire?", ["Che a DLZ2 non ha lavorato nessuno", "Quasi certamente manca il tracking di DLZ2: lo aggiungo e ricalcolo", "Che va bene così"], 1, "Una station tutta a zero vuol dire quasi sempre che manca il file: si aggiunge e si ricalcola."),
          scelta("Dopo il calcolo compare la scritta «Stima incompleta». Cosa fai?", ["La ignoro", "Leggo cosa manca, aggiungo il file e ricalcolo", "Aumento i totali a occhio"], 1, "La scritta dice quali file mancano: i totali non li comprendono finché non li aggiungi.")),
        g("e", scelta("Il mese intero STD esce il doppio del mese prima. Cosa fai?", ["Avviso subito che la stima è pronta", "Cerco il perché prima di avvisare: giorno della stima, file doppi, station mancanti", "Divido per due"], 1, "Un numero molto diverso dal mese prima va capito prima di mandarlo: spesso è un giorno sbagliato o un file in più.")),
        g("f", scelta("Dove si trova il file in cui va copiato il foglio?", [`${PERCORSO_FILE_STIMA.slice(2).join(" › ")}`, "Nella cartella Download", "Nell'archivio del sito"], 0, `Il file ${NOME_FILE_STIMA} sta nella cartella condivisa: ${PERCORSO}.`)),
        g("g", proiezione(300000, 15, 30, "Novembre"), proiezione(231000, 22, 31, "Luglio"), proiezione(162000, 18, 31, "Marzo")),
      ],
      approfondisci: [{ href: "/costi/meta-mese", label: "Apri la Stima di metà mese" }, { href: "/dashboard", label: "Costo dei furgoni per compagnia di noleggio" }],
    },
  ],
};
