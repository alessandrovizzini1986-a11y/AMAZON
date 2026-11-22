/**
 * Corso "Tracking, contratti e Accordo": testi ed esercizi.
 * I numeri degli esercizi sulle ore si calcolano con le funzioni della Verifica tracking, così restano allineati alle regole del sito.
 */
import type { Corso, Esercizio, Gruppo } from "@/domain/corsi/corsi";
import { leggiContratto, ripartoAtteso } from "@/domain/presenze/verifica";

const TETTO = 42; // tetto dell'Accordo dal 01/06/2026 (le lezioni lo dicono a parole)
const it = (x: number) => String(Math.round(x * 100) / 100).replace(".", ",");

const scelta = (domanda: string, opzioni: string[], giusta: number, perche: string): Esercizio => ({ tipo: "scelta", domanda, opzioni, giusta, perche });
const g = (id: string, ...alternative: Esercizio[]): Gruppo => ({ id, alternative });

/** "Un <contratto> lavora N ore: come si dividono?" con la soluzione calcolata dalla regola del sito. */
function riparto(contratto: string, descrizione: string, ore: number, conSupplementare: boolean): Esercizio {
  const a = ripartoAtteso(ore, 0, leggiContratto(contratto), TETTO);
  const campi = [{ nome: "Standard", valore: a.std }, ...(conSupplementare ? [{ nome: "Supplementare", valore: a.sup }] : []), { nome: "Accordo", valore: a.acc }, { nome: "Straordinario", valore: a.str }];
  return {
    tipo: "numeri", domanda: `${descrizione} lavora ${it(ore)} ore nella settimana, senza assenze. Quante ore vanno in ogni riga? (scrivi 0 se non ce ne sono)`, campi,
    perche: `Si riempie in ordine: Standard fino alle ore di contratto${conSupplementare ? ", Supplementare fino a 39" : ""}, Accordo da 39 a ${TETTO}, Straordinario oltre ${TETTO}. Qui: ${campi.map((c) => `${c.nome} ${it(c.valore)}`).join(", ")}.`,
  };
}

export const CORSO_TRACKING: Corso = {
  id: "tracking",
  titolo: "Tracking, contratti e Accordo",
  descrizione: "Come si legge un tracking, cosa vogliono dire le righe e i contratti, e le regole del CCNL e dell'Accordo che servono per controllarlo.",
  perChi: "Chi fa i controlli presenze. Da fare prima di usare la Verifica tracking.",
  lezioni: [
    {
      slug: "chi-e-dove", titolo: "Cos'è un tracking e chi lo compila", minuti: 5,
      obiettivo: "Sapere cosa sono i file SIC e STD, chi li scrive e qual è il tuo compito.",
      testo: `Il **tracking** è un file Excel dove ogni station scrive, giorno per giorno, quante ore ha fatto ogni driver. Da lì nascono le buste paga e le fatture: se il tracking è sbagliato, paghiamo sbagliato.

Ogni station ha **due tracking al mese**:

| File | Chi contiene | Chi li paga |
|---|---|---|
| **SIC** | I dipendenti di Professional Solutions | Noi, in busta paga |
| **STD** | I somministrati (lavoratori Adecco) | Adecco, che poi ci manda la fattura |

Le station sono sette: DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1. Quindi i file da controllare sono **14 al mese**.

**Chi li compila.** Gli Operation Supervisor (OS) della station. Sono loro che sanno cosa è successo davvero.

**Cosa fai tu.** Controlli e chiedi. Non correggi mai il tracking da sola: quando trovi qualcosa che non torna lo scrivi all'OS, che corregge il file e te lo rimanda.

**Regola da ricordare:** il tracking lo corregge solo chi lo ha compilato.`,
      esercizi: [
        g("a", scelta("In quale tracking trovi un lavoratore Adecco?", ["SIC", "STD", "In tutti e due"], 1, "STD sono i somministrati Adecco; SIC sono i dipendenti di Professional Solutions.")),
        g("b", scelta("Quanti tracking arrivano ogni mese, in tutto?", ["7", "14", "2"], 1, "Sette station, e per ognuna un file SIC e uno STD: 14 file.")),
        g("c", scelta("Trovi un errore nel tracking di DLO2. Cosa fai?", ["Lo correggo io nel file", "Lo scrivo all'Operation Supervisor di DLO2, che corregge e rimanda il file", "Lo segno e aspetto la fine del mese"], 1, "Il tracking lo corregge solo chi lo ha compilato: tu controlli e chiedi all'OS.")),
      ],
      approfondisci: [{ href: "/vademecum/13-presenze", label: "Vademecum: Controlli presenze" }],
    },
    {
      slug: "le-righe", titolo: "Le righe di un driver", minuti: 8,
      obiettivo: "Riconoscere ogni riga del tracking e sapere se vuol dire «ha lavorato» o «non ha lavorato».",
      testo: `Nel tracking ogni driver è un **blocco di righe**; ogni colonna è un **giorno**. In ogni cella c'è un numero di ore.

**Le quattro righe del lavoro** (ha lavorato):

| Riga | Cosa ci va |
|---|---|
| **Standard** | Le ore normali, quelle previste dal contratto |
| **Supplementare** | Le ore in più di un part time |
| **Accordo (dalla ora 39 a 44)** | Ore oltre le 39 della settimana che l'Accordo «assorbe»: lavorate, ma non pagate come straordinario |
| **Straordinario** | Le ore oltre il tetto dell'Accordo |

Sotto c'è la riga **Totali**: è la somma di queste quattro.

**Le righe delle assenze** (non ha lavorato):

| Riga | Cosa vuol dire |
|---|---|
| **RIPOSO** | Giorno di riposo. Qui gli OS scrivono anche delle sigle (le vedrai più avanti) |
| **FERIE, ROL, ExF** | Ferie e permessi retribuiti |
| **104, altri permessi, permesso sindacale** | Permessi previsti dalla legge |
| **Permesso non retribuito, assenza ingiustificata** | Assenze non pagate |
| **MALATTIA, INFORTUNIO** | Malattia e infortunio |

In fondo al blocco c'è **Indennità Trasferta**: vale 1 nei giorni in cui al driver spetta la trasferta.

**Regola da ricordare:** Standard, Supplementare, Accordo e Straordinario vogliono dire «ha lavorato». Tutto il resto vuol dire «non ha lavorato».`,
      esercizi: [
        g("a", scelta("Quale di queste righe vuol dire che il driver ha lavorato?", ["ROL", "Accordo", "RIPOSO"], 1, "Le righe del lavoro sono quattro: Standard, Supplementare, Accordo, Straordinario. ROL e RIPOSO sono assenze."),
          scelta("Quale di queste righe vuol dire che il driver NON ha lavorato?", ["Supplementare", "Straordinario", "ExF"], 2, "ExF (ex festività) è un permesso retribuito: quel giorno non ha lavorato.")),
        g("b", scelta("Un driver ha Standard 8 e Accordo 0,5 nello stesso giorno. Quanto vale la riga Totali?", ["8", "8,5", "0,5"], 1, "Totali è la somma delle quattro righe del lavoro: 8 + 0,5 = 8,5."),
          scelta("Un driver ha Standard 7 e Straordinario 2 nello stesso giorno. Quanto vale la riga Totali?", ["7", "2", "9"], 2, "Totali è la somma delle quattro righe del lavoro: 7 + 2 = 9.")),
        g("c", scelta("In un giorno il driver ha 8 ore nella riga FERIE e niente nelle altre. Quel giorno:", ["ha lavorato 8 ore", "non ha lavorato, era in ferie", "ha fatto 8 ore di straordinario"], 1, "FERIE è una riga di assenza: le 8 ore dicono quante ore di ferie, non di lavoro.")),
        g("d", scelta("Cosa indica la riga Indennità Trasferta?", ["Le ore passate in viaggio", "I giorni in cui al driver spetta la trasferta (1 = sì)", "I chilometri fatti"], 1, "Vale 1 nei giorni in cui spetta l'indennità di trasferta, 0 negli altri.")),
      ],
    },
    {
      slug: "i-contratti", titolo: "I contratti", minuti: 6,
      obiettivo: "Leggere la colonna «Tipo Contratto» e sapere quante ore a settimana prevede.",
      testo: `Accanto al nome di ogni driver c'è la colonna **Tipo Contratto**. Ti dice quante ore deve fare a settimana: è il numero da cui partono tutti i controlli.

| Cosa leggi | Cosa vuol dire | Ore a settimana |
|---|---|---|
| **CTI FT** | Tempo indeterminato, full time | 39 |
| **CTD FT** | Tempo determinato, full time | 39 |
| **CTI PT 24H**, **CTD PT 32H** | Part time: le ore sono scritte | 24, 32… |
| **PT 60%** | Part time al 60% di 39 ore | 23,4 |
| **MOG 35%** | Somministrato con monte ore garantito: gli è garantita solo una parte delle ore, ma può lavorare fino a 39 | fino a 39 |
| **DISPATCHER** | Lavora in station, non guida | non rientra nei controlli dei driver |

Tre sigle da sapere: **FT** = full time, **PT** = part time, **CTI / CTD** = contratto a tempo indeterminato / determinato.

Per calcolare le ore di un part time in percentuale: 39 × percentuale. Esempio: 60% → 39 × 0,60 = 23,4 ore.

**Regola da ricordare:** full time = 39 ore a settimana. Il part time ha le ore scritte nel contratto.`,
      esercizi: [
        g("a", scelta("Quante ore a settimana prevede un «CTI FT»?", ["39", "42", "40"], 0, "Full time = 39 ore a settimana, sia a tempo indeterminato (CTI) sia determinato (CTD).")),
        g("b", { tipo: "numeri", domanda: "Quante ore a settimana prevede un «CTD PT 32H»?", campi: [{ nome: "Ore", valore: 32 }], perche: "Per i part time le ore sono scritte nel contratto: 32H = 32 ore." },
          { tipo: "numeri", domanda: "Quante ore a settimana prevede un «CTI PT 24H»?", campi: [{ nome: "Ore", valore: 24 }], perche: "Per i part time le ore sono scritte nel contratto: 24H = 24 ore." }),
        g("c", { tipo: "numeri", domanda: "Quante ore a settimana prevede un «PT 60%»?", campi: [{ nome: "Ore", valore: 23.4 }], perche: "39 × 0,60 = 23,4 ore." },
          { tipo: "numeri", domanda: "Quante ore a settimana prevede un «PT 50%»?", campi: [{ nome: "Ore", valore: 19.5 }], perche: "39 × 0,50 = 19,5 ore." }),
        g("d", scelta("Un driver ha contratto «DISPATCHER». Nei controlli sulle ore dei driver:", ["si controlla come un full time", "è escluso: lavora in station e non guida", "si controlla come un part time"], 1, "I dispatcher non guidano e non hanno trasferta: sono esclusi dai controlli dei driver.")),
      ],
    },
    {
      slug: "ore-full-time", titolo: "Le ore della settimana: full time", minuti: 10,
      obiettivo: "Dividere le ore di una settimana tra Standard, Accordo e Straordinario.",
      testo: `Le ore si guardano **per settimana, da lunedì a domenica**. Per un full time si riempiono tre «cassetti», in ordine:

| Ore della settimana | Riga | Come sono pagate |
|---|---|---|
| da 0 a 39 | **Standard** | normali |
| da 39 a 42 | **Accordo** | assorbite: lavorate, ma non pagate come straordinario |
| oltre 42 | **Straordinario** | con maggiorazione |

Il numero 42 è il **tetto dell'Accordo di secondo livello**, l'accordo sindacale di chi lavora per Amazon. Dove l'Accordo dice una cosa diversa dal contratto nazionale (CCNL), vale l'Accordo. Il tetto è cambiato nel tempo: 43 ore fino al 31/05/2026, **42 dal 01/06/2026**, 41 dal 01/07/2027.

**Esempio.** Un full time lavora 6 giorni da 8 ore: 48 ore.

- Standard: le prime 39
- Accordo: da 39 a 42, cioè 3
- Straordinario: quelle oltre 42, cioè 6

Controllo: 39 + 3 + 6 = 48.

**L'errore più comune.** L'OS scrive Standard 39, Accordo 1, Straordinario 8. Il totale è giusto (48), ma 2 ore sono finite nello Straordinario invece che nell'Accordo: le pagheremmo di più senza doverlo.

Due limiti in più: lo **Standard non supera mai 8 ore e 24 minuti in un giorno**, e lo **Straordinario non supera mai 12 ore in una settimana**.

**Regola da ricordare:** fino a 39 Standard, da 39 a 42 Accordo, oltre 42 Straordinario.`,
      esercizi: [
        g("a", riparto("CTI FT", "Un full time", 40, false), riparto("CTI FT", "Un full time", 41, false), riparto("CTI FT", "Un full time", 41.5, false)),
        g("b", riparto("CTI FT", "Un full time", 48, false), riparto("CTI FT", "Un full time", 46, false), riparto("CTI FT", "Un full time", 45, false)),
        g("c", riparto("CTI FT", "Un full time", 36, false), riparto("CTI FT", "Un full time", 32, false)),
        g("d", scelta("Un full time ha lavorato 48 ore. Nel tracking trovi: Standard 39, Accordo 1, Straordinario 8. Cosa non va?", ["Niente, il totale è 48", "2 ore di Straordinario dovevano stare nell'Accordo", "Lo Standard doveva essere 40"], 1, "Da 39 a 42 le ore sono assorbite: Accordo 3, Straordinario 6. Qui 2 ore sono pagate come straordinario senza doverlo."),
          scelta("Un full time ha lavorato 44 ore. Nel tracking trovi: Standard 39, Accordo 0, Straordinario 5. Cosa non va?", ["Niente, il totale è 44", "Lo Standard doveva essere 44", "3 ore di Straordinario dovevano stare nell'Accordo"], 2, "Da 39 a 42 le ore sono assorbite: Accordo 3, Straordinario 2.")),
        g("e", scelta("Qual è il tetto dell'Accordo oggi, cioè il numero di ore fino a cui il lavoro è assorbito?", ["39", "42", "44"], 1, "42 ore dal 01/06/2026 (era 43 prima, sarà 41 dal 01/07/2027).")),
      ],
      approfondisci: [{ href: "/vademecum/12-regole-contrattuali", label: "Vademecum: Regole contrattuali" }],
    },
    {
      slug: "ore-part-time", titolo: "Le ore della settimana: part time", minuti: 8,
      obiettivo: "Dividere le ore di un part time usando anche il Supplementare.",
      testo: `Per un part time c'è un cassetto in più, il **Supplementare**: sono le ore che lavora oltre il suo contratto, finché non arriva a 39.

| Ore della settimana | Riga |
|---|---|
| da 0 alle ore di contratto | **Standard** |
| dal contratto fino a 39 | **Supplementare** |
| da 39 a 42 | **Accordo** |
| oltre 42 | **Straordinario** |

**Esempio.** Un part time da 24 ore lavora 40 ore.

- Standard: 24 (il suo contratto)
- Supplementare: da 24 a 39, cioè 15
- Accordo: da 39 a 40, cioè 1
- Straordinario: 0

Controllo: 24 + 15 + 1 = 40.

**Tre errori da riconoscere:**

1. **Standard più alto del contratto.** Un part time da 24 ore con 32 ore di Standard: 8 ore dovevano stare nel Supplementare.
2. **Supplementare su un full time.** Il Supplementare esiste solo per i part time.
3. **Accordo sotto le 39 ore.** La riga Accordo vale solo da 39 a 42: se la settimana si ferma a 30 ore, lì non ci va niente.

Una cosa che invece **è giusta**: se un part time lavora un giorno in più, quelle ore sono Supplementare anche se nella settimana non arriva alle sue ore di contratto.

**Regola da ricordare:** part time = Standard fino al contratto, Supplementare fino a 39, poi come il full time.`,
      esercizi: [
        g("a", riparto("CTI PT 24H", "Un part time da 24 ore", 40, true), riparto("CTI PT 24H", "Un part time da 24 ore", 32, true), riparto("CTI PT 32H", "Un part time da 32 ore", 41, true)),
        g("b", riparto("CTI PT 32H", "Un part time da 32 ore", 45, true), riparto("CTI PT 24H", "Un part time da 24 ore", 44, true), riparto("CTI PT 20H", "Un part time da 20 ore", 46, true)),
        g("c", scelta("Un full time ha 8 ore nella riga Supplementare. È giusto?", ["Sì, se ha lavorato di sabato", "No: il Supplementare è solo per i part time", "Sì, se ha superato le 39 ore"], 1, "Il Supplementare esiste solo per i part time. Per un full time le ore in più vanno in Accordo e poi in Straordinario.")),
        g("d", scelta("Un part time da 24 ore ha lavorato 25 ore: Standard 24, Accordo 1. Cosa non va?", ["Niente", "L'ora in più doveva stare nel Supplementare: l'Accordo vale solo da 39 a 42", "Lo Standard doveva essere 25"], 1, "Sotto le 39 ore la riga Accordo resta vuota. L'ora oltre il contratto di un part time è Supplementare."),
          scelta("Un part time da 32 ore ha lavorato 34 ore: Standard 32, Accordo 2. Cosa non va?", ["Le 2 ore in più dovevano stare nel Supplementare: l'Accordo vale solo da 39 a 42", "Niente", "Lo Standard doveva essere 34"], 0, "Sotto le 39 ore la riga Accordo resta vuota. Le ore oltre il contratto di un part time sono Supplementare.")),
      ],
    },
    {
      slug: "i-giorni", titolo: "I giorni: mai più di sei di fila", minuti: 6,
      obiettivo: "Riconoscere una violazione dei giorni di lavoro e distinguerla dal caso «6° giorno di domenica».",
      testo: `Oltre alle ore si contano i **giorni**.

**La regola.** Un driver non può lavorare più di **6 giorni di fila**. Il settimo deve essere riposo.

**7 o più giorni di fila** è una violazione: va segnalata **subito ad Alessandro**, oltre che all'OS. Attenzione: i giorni si contano anche **a cavallo di due mesi**. Chi lavora dal 28 ottobre al 3 novembre ha fatto 7 giorni di fila, anche se in ogni mese ne vedi pochi.

**«6° giorno di domenica»** è un'altra cosa: il driver ha lavorato 5 giorni più la domenica, quindi **6 giorni in tutto** nella settimana da lunedì a domenica, con un giorno di riposo in mezzo. Non sono 7. **Non è un errore**: è dentro la regola, ma è il limite. Per questo il sito ti prepara l'elenco: sai già chi sono senza doverli cercare a fine mese.

| Situazione | È un errore? | Cosa fai |
|---|---|---|
| 5 giorni lavorati, 2 di riposo | No | Niente |
| 5 giorni + la domenica = 6 giorni | No, ma è il limite | Li trovi nell'elenco «6° giorno di domenica» |
| 7 o più giorni di fila | **Sì** | Avvisi subito Alessandro e chiedi all'OS |

**Come si conta «ha lavorato».** Un giorno conta come lavorato se c'è almeno un'ora in una delle quattro righe del lavoro. Un giorno di ferie o di malattia **interrompe** la fila.

**Regola da ricordare:** al massimo 6 giorni di fila; 7 è una violazione.`,
      esercizi: [
        g("a", scelta("Un driver lavora da lunedì a domenica, tutti e sette i giorni. È:", ["normale", "il limite, ma è permesso", "una violazione: il massimo è 6 giorni di fila"], 2, "Sette giorni di fila superano il massimo di 6: è una violazione, da segnalare subito.")),
        g("b", scelta("Un driver lavora dal 28 ottobre al 3 novembre compresi, senza riposi. Quanti giorni di fila sono?", ["4, perché a novembre sono solo 3", "7, perché i giorni si contano anche a cavallo del mese", "3"], 1, "28, 29, 30, 31 ottobre + 1, 2, 3 novembre = 7 giorni di fila. Il cambio di mese non interrompe la fila."),
          scelta("Un driver lavora dal 27 settembre al 3 ottobre compresi, senza riposi. Quanti giorni di fila sono?", ["3", "4, perché a settembre sono solo 4", "7, perché i giorni si contano anche a cavallo del mese"], 2, "27, 28, 29, 30 settembre + 1, 2, 3 ottobre = 7 giorni di fila. Il cambio di mese non interrompe la fila.")),
        g("c", scelta("Un driver lavora lunedì, martedì, giovedì, venerdì, sabato e domenica (riposo il mercoledì). Cosa fai?", ["Lo segnalo come violazione", "Niente da chiedere: è «6° giorno di domenica», dentro la regola. Lo trovo nell'elenco", "Chiedo all'OS di togliere la domenica"], 1, "Sei giorni lavorati su sette, con la domenica: è il limite, non un errore.")),
        g("d", scelta("Un driver lavora 4 giorni, poi ha un giorno di ferie, poi lavora altri 4 giorni. Quanti giorni di fila ha fatto al massimo?", ["9", "8", "4"], 2, "Il giorno di ferie non è un giorno lavorato: interrompe la fila. Le due file sono da 4 giorni.")),
        g("e", scelta("Trovi un driver con 8 giorni di lavoro di fila. Chi avvisi?", ["Solo l'OS", "Subito Alessandro, e chiedo all'OS", "Nessuno fino a fine mese"], 1, "Sette o più giorni di fila vanno segnalati subito ad Alessandro, oltre alla richiesta all'OS.")),
      ],
    },
    {
      slug: "trasferta-e-amazon", titolo: "Ha lavorato davvero? Trasferta e Amazon", minuti: 10,
      obiettivo: "Capire quando spetta la trasferta e leggere i simboli del confronto con Amazon.",
      testo: `**La trasferta.** Ogni giorno in cui un driver lavora **più di 4 ore** gli spetta l'indennità di trasferta: **22,50 €** (di domenica 7 € in più, quindi 29,50 €). Dal 01/01/2027 diventa 23,50 €. I dispatcher non la prendono.

**Il confronto con Amazon.** Amazon ci dice, per ogni giorno, quanti pacchi ha consegnato ogni driver: sono i **CSV** che scarichi dal portale. Un driver è «in rotta» se ha consegnato **più di 10 pacchi**.

Il sito confronta le due cose: quello che dice il tracking e quello che ha visto Amazon. Se non tornano compare un simbolo:

| Simbolo | Cosa è successo | Cosa chiedi all'OS |
|---|---|---|
| **+1** | Nel tracking c'è la trasferta, ma Amazon non lo vede in rotta | Cosa ha fatto quel giorno? |
| **−1** | Amazon lo vede in rotta, ma nel tracking ha 0 ore | Di inserire la giornata |
| **H** | Ha ore nel tracking, ma Amazon non lo vede e non c'è trasferta né spiegazione | Cosa ha fatto? |
| **A** | Amazon lo vede in rotta, ma non è in nessun tracking della station | È un prestito, un nuovo assunto o un errore? |
| **ORE** | Più di 10 ore lavorate in un giorno, o un numero impossibile (es. 78) | Di controllare le ore |
| **ACC** | Un somministrato (STD) ha ore nella riga Accordo di domenica | La domenica è già pagata con maggiorazione: la cella va tolta |

**Le spiegazioni che chiudono il caso.** Se quel giorno il driver non ha guidato ma ha fatto altro, l'OS lo scrive nella riga RIPOSO con una sigla: **MEZZI** o **SM** (spostamento mezzi), **UFF** (ufficio), **CORSO** o **FORMAZIONE**, **RESCUE**, **VM** (visita medica), oppure la sigla di un'altra station (prestito). Con una di queste sigle il sito non segnala niente.

Attenzione: **SB, L1, R, C1, D, F, P non sono spiegazioni**. Sono nomi di turni o di riposi.

**Malattia batte lavorato.** Se nel tracking il driver è in malattia e Amazon lo vede in rotta, non si segnala: è un tema per le risorse umane, non un errore di compilazione.

**Regola da ricordare:** trasferta se lavora più di 4 ore; in rotta se consegna più di 10 pacchi.`,
      esercizi: [
        g("a", scelta("Un driver lavora 4 ore esatte. Gli spetta la trasferta?", ["Sì", "No: serve più di 4 ore", "Solo di domenica"], 1, "La trasferta spetta solo sopra le 4 ore lavorate. Con 4 ore esatte no."),
          scelta("Un driver lavora 4 ore e mezza. Gli spetta la trasferta?", ["No", "Solo di domenica", "Sì: ha lavorato più di 4 ore"], 2, "La trasferta spetta quando le ore lavorate sono più di 4.")),
        g("b", { tipo: "numeri", domanda: "Quanto vale la trasferta di un giorno lavorato di domenica, nel 2026? (in euro)", campi: [{ nome: "Euro", valore: 29.5 }], perche: "22,50 € + 7,00 € della domenica = 29,50 €." },
          { tipo: "numeri", domanda: "Un driver lavora 3 giorni feriali da 8 ore nel 2026. Quanto prende di trasferta in tutto? (in euro)", campi: [{ nome: "Euro", valore: 67.5 }], perche: "22,50 € × 3 giorni = 67,50 €." }),
        g("c", scelta("Nel tracking un driver ha 8 ore e la trasferta, ma su Amazon quel giorno non compare. Che simbolo è?", ["−1", "+1", "A"], 1, "+1: trasferta pagata, ma Amazon non lo vede in rotta. Si chiede all'OS cosa ha fatto."),
          scelta("Amazon vede un driver con 140 pacchi consegnati, ma nel tracking quel giorno ha 0 ore. Che simbolo è?", ["−1", "+1", "H"], 0, "−1: Amazon lo vede in rotta ma nel tracking manca la giornata. L'OS la deve inserire.")),
        g("d", scelta("Un driver ha un +1, ma nella riga RIPOSO di quel giorno c'è scritto MEZZI. Cosa succede?", ["Va chiesto comunque all'OS", "Niente: MEZZI spiega cosa ha fatto e il sito non lo segnala", "Va tolta la trasferta"], 1, "MEZZI (spostamento mezzi) è una delle sigle che spiegano la giornata: il caso è chiuso.")),
        g("e", scelta("Quale di queste sigle NON è una spiegazione valida nella riga RIPOSO?", ["UFF", "CORSO", "SB"], 2, "SB è il nome di un turno, non dice cosa ha fatto il driver. UFF e CORSO invece sì."),
          scelta("Quale di queste sigle NON è una spiegazione valida nella riga RIPOSO?", ["L1", "RESCUE", "VM"], 0, "L1 è il nome di una rotta standard, non una spiegazione. RESCUE e VM invece sì.")),
        g("f", scelta("Amazon vede un driver con 8 pacchi consegnati. Per il controllo è «in rotta»?", ["Sì", "No: servono più di 10 pacchi", "Dipende dalla station"], 1, "Un driver è in rotta solo se ha consegnato più di 10 pacchi.")),
      ],
      approfondisci: [{ href: "/vademecum/13-presenze", label: "Vademecum: i simboli e le regole fisse" }],
    },
    {
      slug: "la-verifica", titolo: "Fare la verifica sul sito", minuti: 8,
      obiettivo: "Usare la pagina Verifica tracking: dai file alle richieste per gli Operation Supervisor.",
      testo: `Adesso sai cosa controllare. Il sito fa i conti al posto tuo: la pagina è **Personale → Presenze → Verifica tracking**.

**I quattro passi**

1. **File.** In *Archivio file* trascini i CSV di Amazon e i tracking SIC e STD di tutte le station. I file restano sul tuo computer: usa sempre lo stesso PC e lo stesso browser.
2. **Verifica.** Scegli fino a che giorno (di solito l'ultima domenica) e premi **Fai la verifica**. Il riquadro «Cosa ho letto» ti dice cosa manca, in rosso.
3. **Chiedi.** Per ogni station copi il messaggio già pronto, lo incolli in Teams all'OS e premi **Segna come chieste**.
4. **Chiudi.** Quando l'OS risponde e corregge il tracking, metti lo stato **OK, chiusa**.

**Gli stati di una richiesta**

| Stato | Vuol dire |
|---|---|
| **Da chiedere** | L'hai trovata, non l'hai ancora mandata |
| **Chiesta, aspetto risposta** | L'hai mandata all'OS |
| **OK, chiusa** | L'OS ha risposto: non torna più |
| **Sparita da sola** | L'OS ha corretto il tracking e il controllo non la trova più |

**Perché non rifai mai tutto da capo.** Il sito ricorda lo stato di ogni richiesta. Quando ricarichi i tracking corretti e rifai la verifica, compaiono solo le novità. Il primo del mese ti basta aggiungere i file degli ultimi giorni.

**Le settimane a cavallo.** Le ore si controllano per settimane intere. La settimana che inizia nel mese prima si controlla solo se nell'archivio c'è anche il tracking del mese prima; altrimenti il sito la salta e te lo dice.

**L'Excel.** Con *Scarica Excel* hai tutto in un file leggero. Puoi cambiare lo stato anche lì e ricaricarlo, ma senza toccare la colonna Chiave.

**Regola da ricordare:** chiedi una volta sola. Dopo aver mandato il messaggio, segna sempre le righe come chieste.`,
      esercizi: [
        g("a", scelta("In che ordine si lavora?", ["Verifica, file, chiudi, chiedi", "File, verifica, chiedi, chiudi", "Chiedi, file, verifica, chiudi"], 1, "Prima carichi i file, poi fai la verifica, poi chiedi agli OS e infine chiudi quando rispondono.")),
        g("b", scelta("Hai appena incollato in Teams il messaggio per l'OS di DER2. Cosa fai subito dopo?", ["Niente, aspetto", "Premo «Segna come chieste»: così al prossimo giro non le rimando", "Metto tutto su «OK, chiusa»"], 1, "Dopo aver mandato il messaggio le righe passano a «Chiesta». «OK» si mette solo quando l'OS ha risposto.")),
        g("c", scelta("L'OS ha corretto il tracking. Ricarichi il file e rifai la verifica. Le richieste sistemate:", ["tornano tutte «Da chiedere»", "diventano «Sparita da sola»", "vanno cancellate a mano"], 1, "Se il controllo non trova più il problema, la richiesta diventa «Sparita da sola» senza che tu faccia niente.")),
        g("d", scelta("È il primo del mese e devi chiudere il mese appena finito. Cosa carichi?", ["Di nuovo tutti i file del mese, e ricomincio", "Solo i CSV e i tracking degli ultimi giorni: il sito ricorda il resto", "Niente, è già tutto fatto"], 1, "Il sito ricorda lo stato delle richieste: aggiungi i file che mancano e rifai la verifica.")),
        g("e", scelta("Nel riquadro «Cosa ho letto» la colonna «Mese prima» dice «manca». Cosa vuol dire?", ["Che il controllo è sbagliato", "Che la prima settimana, a cavallo dei due mesi, può non essere controllata", "Che devo rifare tutto"], 1, "Senza il tracking del mese prima la settimana a cavallo non si può controllare per intero: il sito la salta e lo scrive.")),
      ],
      approfondisci: [{ href: "/presenze/verifica", label: "Apri la Verifica tracking" }, { href: "/vademecum/13-presenze", label: "Vademecum: Controlli presenze" }],
    },
    {
      slug: "prova-finale", titolo: "Prova finale", minuti: 12,
      obiettivo: "Mettere insieme tutte le regole su casi come quelli che troverai davvero.",
      testo: `Questa è la prova finale: **otto casi** presi dal lavoro vero. Non c'è niente di nuovo da leggere.

Se un esercizio non torna, rileggi la lezione che ne parla: restano tutte aperte.

Ripasso veloce delle regole:

- **Righe del lavoro:** Standard, Supplementare, Accordo, Straordinario.
- **Full time:** Standard fino a 39, Accordo da 39 a 42, Straordinario oltre 42.
- **Part time:** Standard fino al contratto, Supplementare fino a 39, poi come il full time.
- **Giorni:** al massimo 6 di fila, anche a cavallo del mese.
- **Trasferta:** se lavora più di 4 ore. **In rotta:** se consegna più di 10 pacchi.
- **Tu controlli e chiedi; il tracking lo corregge l'OS.**`,
      esercizi: [
        g("a", riparto("CTI FT", "Un full time", 47, false), riparto("CTI FT", "Un full time", 44, false), riparto("CTI FT", "Un full time", 49, false)),
        g("b", riparto("CTI PT 32H", "Un part time da 32 ore", 43, true), riparto("CTI PT 24H", "Un part time da 24 ore", 45, true), riparto("CTI PT 20H", "Un part time da 20 ore", 42, true)),
        g("c", scelta("Un full time ha lavorato 40 ore: Standard 40, Accordo 0. Cosa chiedi all'OS?", ["Niente, è giusto", "Di spostare 1 ora dallo Standard all'Accordo", "Di spostare 1 ora nello Straordinario"], 1, "Lo Standard di un full time si ferma a 39: l'ora da 39 a 40 va nell'Accordo."),
          scelta("Un full time ha lavorato 41 ore: Standard 41, Accordo 0. Cosa chiedi all'OS?", ["Di spostare 2 ore dallo Standard all'Accordo", "Niente, è giusto", "Di spostare 2 ore nello Straordinario"], 0, "Lo Standard di un full time si ferma a 39: le ore da 39 a 41 vanno nell'Accordo.")),
        g("d", scelta("Un driver lavora dal 30 novembre al 6 dicembre compresi. Cosa fai?", ["Niente: in ogni mese sono pochi giorni", "È una violazione (7 giorni di fila): avviso Alessandro e chiedo all'OS", "Lo metto nell'elenco «6° giorno di domenica»"], 1, "30 novembre + dall'1 al 6 dicembre = 7 giorni di fila. La fila si conta anche a cavallo del mese.")),
        g("e", scelta("Amazon vede un driver con 120 pacchi il 12 del mese. Nel tracking il 12 ha 8 ore di MALATTIA e nessuna ora di lavoro. Cosa succede?", ["È un −1 da chiedere all'OS", "Non si segnala: malattia batte lavorato", "Si toglie la malattia"], 1, "Se il tracking dice malattia e Amazon lo vede in rotta, non è un errore di compilazione: non si segnala in questo controllo.")),
        g("f", scelta("Un somministrato (STD) ha 3 ore nella riga Accordo di domenica. Che simbolo compare e perché?", ["+1, perché manca la rotta", "ACC, perché la domenica è già pagata con maggiorazione e quella cella va tolta", "ORE, perché ha lavorato troppo"], 1, "ACC: per i somministrati la domenica non va nella riga Accordo.")),
        g("g", scelta("Un driver ha 6 ore nel tracking, la trasferta a 1, e su Amazon 0 pacchi. Nella riga RIPOSO c'è scritto «SB». Cosa fai?", ["Niente: SB spiega la giornata", "Chiedo all'OS cosa ha fatto: SB è un turno, non una spiegazione", "Tolgo io la trasferta"], 1, "SB non è una spiegazione valida: resta un +1 da chiedere. E il tracking non lo correggi tu.")),
        g("h", scelta("Hai mandato le richieste all'OS di DLO4 lunedì. Giovedì rifai la verifica e ne trovi 3 nuove per DLO4. Cosa mandi?", ["Di nuovo tutte, vecchie e nuove", "Solo le 3 nuove: le altre sono già «Chieste»", "Niente fino a lunedì"], 1, "Il messaggio contiene solo le righe «Da chiedere»: quelle già chieste non si rimandano.")),
      ],
    },
  ],
};
