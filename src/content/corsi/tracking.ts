/**
 * Corso "Tracking, contratti e Accordo": testi ed esercizi.
 * I numeri degli esercizi sulle ore si calcolano con le funzioni della Verifica tracking, così restano allineati alle regole del sito.
 */
import { NESSUN_ERRORE, type Cella, type Corso, type Esercizio, type Gruppo, type TrackingDemo } from "@/domain/corsi/corsi";
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

/** Da numero con la virgola a ore e minuti: si tengono le ore, la parte dopo la virgola × 60 dà i minuti. */
const inOreMinuti = (dec: number): Esercizio => {
  const h = Math.floor(dec), m = Math.round((dec - h) * 60);
  return { tipo: "numeri", domanda: `Nel tracking leggi ${it(dec)}. Quante ore e quanti minuti sono?`, campi: [{ nome: "Ore", valore: h }, { nome: "Minuti", valore: m }], perche: `Tieni le ${h} ore. Poi 0,${String(Math.round((dec - h) * 100)).padStart(2, "0").replace(/0$/, "")} × 60 = ${m} minuti. Quindi ${h} ore e ${m} minuti.` };
};
/** Da ore e minuti al numero con la virgola: minuti ÷ 60. */
const inDecimale = (h: number, m: number): Esercizio => ({ tipo: "numeri", domanda: `Un driver ha lavorato ${h} ore e ${m} minuti. Che numero scrivi nel tracking?`, campi: [{ nome: "Numero da scrivere", valore: Math.round((h + m / 60) * 100) / 100 }], perche: `Tieni le ${h} ore. Poi ${m} ÷ 60 = ${it(m / 60)}. Quindi ${it(h + m / 60)}.` });

// ── tracking di esempio (nomi inventati) ──
const _ = null;
type Righe = TrackingDemo["righe"];
const trk = (nome: string, contratto: string, righe: Righe, extra: Partial<TrackingDemo> = {}): TrackingDemo => ({ nome, contratto, righe, ...extra });
/** "Clicca la cella sbagliata" su un tracking. */
const cella = (domanda: string, tracking: TrackingDemo, giuste: string[], perche: string): Esercizio => ({ tipo: "cella", domanda, tracking, giuste, perche });
const TROVA = "Guarda la settimana di questo driver. Clicca la cella sbagliata, oppure spunta «Non c'è nessun errore».";
const TROVA_GIORNO = "Guarda il tracking e i pacchi di Amazon. Clicca una cella del giorno da chiedere all'OS, oppure spunta «Non c'è nessun errore».";
const riga = (...v: Cella[]): Cella[] => v;

const FT_GIUSTO = trk("Bianchi Luca", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), Accordo: riga(_, 0.5, _, 0.5, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { titolo: "Giusto: 40 ore = Standard 39 + Accordo 1" });
const FT_48_GIUSTO = trk("Verdi Anna", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), Accordo: riga(_, _, _, _, 1, 2, _), Straordinario: riga(_, _, _, _, _, 6, _), RIPOSO: riga(_, _, _, _, _, _, "R"), Trasferta: riga(1, 1, 1, 1, 1, 1, 0) }, { titolo: "Giusto: 48 ore = Standard 39 + Accordo 3 + Straordinario 6" });
const FT_48_SBAGLIATO = trk("Verdi Anna", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), Accordo: riga(_, _, _, _, 1, _, _), Straordinario: riga(_, _, _, _, _, 8, _), RIPOSO: riga(_, _, _, _, _, _, "R"), Trasferta: riga(1, 1, 1, 1, 1, 1, 0) }, { titolo: "Si lascia così: Accordo 1 e Straordinario 8 (riga Accordo non completa, non si chiede)" });
const PT_GIUSTO = trk("Neri Sara", "CTI PT 24H", { Standard: riga(8, 8, 8, _, _, _, _), Supplementare: riga(_, _, _, 8, 7, _, _), Accordo: riga(_, _, _, _, 1, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { titolo: "Giusto: part time 24 ore che ne lavora 40 = Standard 24 + Supplementare 15 + Accordo 1" });
const TUTTE_LE_RIGHE = trk("Rossi Mario", "CTI FT", { Standard: riga(8, 8, _, 8, 7, _, _), Accordo: riga(_, 0.5, _, _, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), FERIE: riga(_, _, 8, _, _, _, _), Trasferta: riga(1, 1, 0, 1, 1, 0, 0) }, { tutte: true, titolo: "Un driver in una settimana: le 17 righe, come nel file" });

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
      figure: [{ tracking: TUTTE_LE_RIGHE, didascalia: "Mercoledì è in ferie: 8 ore nella riga FERIE, niente nelle righe del lavoro, trasferta 0. Sabato e domenica riposo." }],
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
      slug: "ore-decimali", titolo: "Ore e minuti: perché 7,8 vuol dire 7 ore e 48", minuti: 7,
      obiettivo: "Leggere e scrivere le ore del tracking, che sono numeri con la virgola e non ore e minuti.",
      testo: `Nei tracking le ore **non sono scritte come sull'orologio**. Sono scritte come numeri con la virgola: **7,8** non vuol dire «7 ore e 8 minuti» e nemmeno «7 ore e 80 minuti». Vuol dire **7 ore e 48 minuti**.

**Perché si fa così.** Excel deve poter **sommare** le ore. I numeri con la virgola si sommano senza problemi: 7,8 + 7,8 = 15,6. Con ore e minuti no: 7:48 + 7:48 non fa 14:96. Per questo tutto il tracking, le buste paga e le fatture ragionano in ore decimali.

**Da dove viene 7,8.** Un full time fa 39 ore a settimana su 5 giorni: 39 ÷ 5 = **7,8 ore al giorno**, cioè 7 ore e 48 minuti. È il numero che vedrai più spesso.

**Dal numero alle ore e minuti** (per capire cosa c'è scritto)

1. Tieni la parte prima della virgola: sono le **ore**.
2. Prendi la parte dopo la virgola e **moltiplicala per 60**: sono i **minuti**.

Esempio: 7,8 → 7 ore. Poi 0,8 × 60 = 48 minuti. Quindi **7 ore e 48 minuti**.

**Dalle ore e minuti al numero** (per sapere cosa va scritto)

1. Tieni le **ore**.
2. **Dividi i minuti per 60** e metti il risultato dopo la virgola.

Esempio: 7 ore e 48 minuti → 48 ÷ 60 = 0,8. Quindi **7,8**.

**I valori che incontri di più**

| Sull'orologio | Nel tracking |
|---|---|
| 15 minuti | 0,25 |
| 30 minuti | 0,5 |
| 45 minuti | 0,75 |
| 7 ore e 48 minuti | 7,8 |
| 8 ore e 24 minuti | 8,4 |

**L'errore tipico.** Qualcuno scrive **7,48** pensando «7 ore e 48 minuti». Ma 7,48 vuol dire 7 ore e 29 minuti (0,48 × 60 = 28,8): mancano quasi 20 minuti. Se vedi numeri come 7,48 o 8,24 chiedi all'OS.

**Regola da ricordare:** dopo la virgola non ci sono i minuti. Minuti = parte dopo la virgola × 60.`,
      esercizi: [
        g("a", inOreMinuti(7.8), inOreMinuti(8.4), inOreMinuti(7.5), inOreMinuti(6.25)),
        g("b", inDecimale(7, 48), inDecimale(8, 24), inDecimale(4, 30), inDecimale(6, 45)),
        g("c", inOreMinuti(8.2), inOreMinuti(5.75), inOreMinuti(3.9)),
        g("d", inDecimale(8, 12), inDecimale(7, 15), inDecimale(9, 6)),
        g("e", scelta("Perché nel tracking le ore sono scritte con la virgola e non come sull'orologio?", ["Perché è più corto da scrivere", "Perché Excel deve poterle sommare: con ore e minuti la somma non torna", "Perché lo chiede Amazon"], 1, "I numeri con la virgola si sommano: 7,8 + 7,8 = 15,6. Con ore e minuti la somma sarebbe sbagliata.")),
        g("f", scelta("Nel tracking di un driver leggi 7,48 in tutti i giorni. Cosa pensi?", ["È giusto: sono 7 ore e 48 minuti", "Probabilmente l'OS voleva scrivere 7 ore e 48 minuti, che si scrive 7,8. Glielo chiedo", "Sono 7 ore e 80 minuti"], 1, "7 ore e 48 minuti si scrive 7,8. Scritto 7,48 vuol dire 7 ore e 29 minuti: mancano quasi 20 minuti al giorno."),
          scelta("Nel tracking di un driver leggi 8,24 in un giorno. Cosa pensi?", ["Sono 8 ore e 24 minuti", "Probabilmente l'OS voleva scrivere 8 ore e 24 minuti, che si scrive 8,4. Glielo chiedo", "Sono 8 ore e 240 minuti"], 1, "8 ore e 24 minuti si scrive 8,4. Scritto 8,24 vuol dire 8 ore e 14 minuti.")),
        g("g", { tipo: "numeri", domanda: "Un full time lavora 5 giorni da 7,8 ore. Quante ore fa nella settimana?", campi: [{ nome: "Ore", valore: 39 }], perche: "7,8 × 5 = 39: è proprio l'orario di un full time." },
          { tipo: "numeri", domanda: "Un driver lavora 3 giorni da 7,8 ore. Quante ore fa in tutto?", campi: [{ nome: "Ore", valore: 23.4 }], perche: "7,8 × 3 = 23,4 (cioè 23 ore e 24 minuti)." }),
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

**Perché quelle ore sono assorbite.** Il driver prende la **diaria**: l'indennità di trasferta, 22,50 € per ogni giorno lavorato. L'Accordo (art. 4 sull'orario e art. 5 sulla trasferta; CCNL art. 11 quinquies) dice che, proprio perché c'è la diaria, le ore da 39 a 42 non si pagano come straordinario: sono già compensate da quella. Non è un'ora regalata, è un'ora pagata in un altro modo. Per i part time e i MOG che fanno il same day la diaria è riproporzionata (lo vedi nella lezione sulla trasferta).

**Esempio.** Un full time lavora 6 giorni da 8 ore: 48 ore.

- Standard: le prime 39
- Accordo: da 39 a 42, cioè 3
- Straordinario: quelle oltre 42, cioè 6

Controllo: 39 + 3 + 6 = 48.

**Quando la riga Accordo non è compilata.** Capita spesso: l'OS scrive Standard 39 e poi tutto il resto in Straordinario, oppure Accordo 1 e Straordinario 8. **Non è un errore da chiedere**: una volta arrivati a 39 ore di Standard, le ore dopo possono stare nello Straordinario. L'errore vero è un altro: **Straordinario segnato prima di arrivare a 39 ore**. Esempio: Standard 32 e Straordinario 6 in una settimana da 38 ore. Lì lo Straordinario non ci può essere.

Un limite in più: lo **Straordinario non supera mai 12 ore in una settimana**. Una giornata con più di 8 ore e 24 minuti di Standard, invece, non si chiede: conta il totale della settimana.

**Regola da ricordare:** fino a 39 Standard, da 39 a 42 Accordo, oltre 42 Straordinario.`,
      figure: [
        { tracking: FT_GIUSTO, didascalia: "L'Accordo sono le mezz'ore in più di martedì e giovedì: la settimana arriva a 40 ore." },
        { tracking: FT_48_GIUSTO, didascalia: "Sei giorni: il sabato porta la settimana a 48 ore. Fino a 42 è Accordo, il resto Straordinario." },
        { tracking: FT_48_SBAGLIATO, didascalia: "Stessa settimana con la riga Accordo non completa: il sabato è tutto in Straordinario. Lo Standard è a 39, quindi non si chiede niente." },
      ],
      esercizi: [
        g("a", riparto("CTI FT", "Un full time", 40, false), riparto("CTI FT", "Un full time", 41, false), riparto("CTI FT", "Un full time", 41.5, false)),
        g("b", riparto("CTI FT", "Un full time", 48, false), riparto("CTI FT", "Un full time", 46, false), riparto("CTI FT", "Un full time", 45, false)),
        g("c", riparto("CTI FT", "Un full time", 36, false), riparto("CTI FT", "Un full time", 32, false)),
        g("d", scelta("Un full time ha lavorato 48 ore. Nel tracking trovi: Standard 39, Accordo 1, Straordinario 8. Cosa fai?", ["Niente: lo Standard è a 39, la riga Accordo non completa non si chiede", "Chiedo di spostare 2 ore dallo Straordinario all'Accordo", "Chiedo di portare lo Standard a 40"], 0, "La riga Accordo può non essere compilata: dopo le 39 ore di Standard le ore possono stare nello Straordinario. Non è una richiesta per l'OS."),
          scelta("Un full time ha lavorato 38 ore. Nel tracking trovi: Standard 32, Straordinario 6. Cosa fai?", ["Niente, il totale è 38", "Chiedo all'OS: lo Straordinario parte solo dopo 39 ore di Standard, qui sono tutte Standard", "Chiedo di mettere 6 ore nell'Accordo"], 1, "Con 38 ore in tutto non si arriva a 39: lo Straordinario non ci può essere. Sono 38 ore di Standard.")),
        g("f", scelta("Perché le ore da 39 a 42 non sono pagate come straordinario?", ["Perché sono poche", "Perché il driver prende la diaria (indennità di trasferta): l'Accordo le considera già compensate da quella", "Perché le recupera la settimana dopo"], 1, "L'Accordo prevede l'assorbimento perché al driver spetta la diaria per ogni giorno lavorato: quelle ore sono già compensate dall'indennità di trasferta.")),
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

**Due errori da riconoscere:**

1. **Standard più alto del contratto.** Un part time da 24 ore con 32 ore di Standard: 8 ore dovevano stare nel Supplementare.
2. **Supplementare su un full time.** Il Supplementare esiste solo per i part time.
Due cose che invece **sono giuste**:

- Se un part time lavora un **giorno in più**, quelle ore sono Supplementare anche se nella settimana non arriva alle sue ore di contratto.
- La **mezz'ora o l'ora in più fatta nel giorno** può stare nella riga Accordo anche se la settimana resta sotto le 39 ore: è assorbita anche per i part time e i MOG. In tutto, nella riga Accordo, al massimo 3 ore a settimana.

**Regola da ricordare:** part time = Standard fino al contratto, Supplementare fino a 39, poi come il full time.`,
      figure: [{ tracking: PT_GIUSTO, didascalia: "Lunedì, martedì e mercoledì sono i suoi giorni di contratto (24 ore). Giovedì e venerdì sono in più: Supplementare fino a 39, poi Accordo." }],
      esercizi: [
        g("a", riparto("CTI PT 24H", "Un part time da 24 ore", 40, true), riparto("CTI PT 24H", "Un part time da 24 ore", 32, true), riparto("CTI PT 32H", "Un part time da 32 ore", 41, true)),
        g("b", riparto("CTI PT 32H", "Un part time da 32 ore", 45, true), riparto("CTI PT 24H", "Un part time da 24 ore", 44, true), riparto("CTI PT 20H", "Un part time da 20 ore", 46, true)),
        g("c", scelta("Un full time ha 8 ore nella riga Supplementare. È giusto?", ["Sì, se ha lavorato di sabato", "No: il Supplementare è solo per i part time", "Sì, se ha superato le 39 ore"], 1, "Il Supplementare esiste solo per i part time. Per un full time le ore in più vanno in Accordo e poi in Straordinario.")),
        g("d", scelta("Un part time da 24 ore ha lavorato 25 ore: Standard 24, Accordo 1 (un'ora in più fatta lunedì). Cosa fai?", ["Chiedo di spostare l'ora nel Supplementare", "Niente: l'ora in più del giorno può stare nella riga Accordo anche sotto le 39 ore", "Chiedo di metterla nello Straordinario"], 1, "La mezz'ora o l'ora in più fatta nel giorno è assorbita anche per part time e MOG: nella riga Accordo va bene."),
          scelta("Un MOG ha lavorato 28,5 ore: Standard 28, Accordo 0,5 (mezz'ora in più fatta giovedì). Cosa fai?", ["Niente: la mezz'ora in più del giorno può stare nella riga Accordo anche sotto le 39 ore", "Chiedo di spostarla nello Standard", "Chiedo di metterla nello Straordinario"], 0, "La mezz'ora o l'ora in più fatta nel giorno è assorbita anche per part time e MOG: nella riga Accordo va bene.")),
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

**Part time e MOG che fanno il same day.** Per loro la diaria non è intera: è **riproporzionata**, cioè ridotta in proporzione all'orario (Accordo art. 5). Il same day è un turno corto: chi lo fa con un contratto part time o MOG prende una diaria più bassa di chi fa la giornata piena.

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
        g("g", scelta("Un part time che fa il same day ha diritto alla diaria. Quanto prende?", ["La diaria intera, come un full time", "Una diaria riproporzionata, cioè ridotta in proporzione all'orario", "Niente: il same day non dà diritto alla diaria"], 1, "Per i part time e i MOG che fanno il same day la diaria è riproporzionata: più bassa di quella intera."),
          scelta("Un MOG che fa il same day ha diritto alla diaria. Quanto prende?", ["Niente: i MOG non hanno la diaria", "La diaria intera", "Una diaria riproporzionata, cioè ridotta in proporzione all'orario"], 2, "Per i part time e i MOG che fanno il same day la diaria è riproporzionata: più bassa di quella intera.")),
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
      slug: "trova-errore-ore", titolo: "Trova l'errore: le ore", minuti: 10,
      obiettivo: "Riconoscere a colpo d'occhio un tracking compilato male, e uno compilato bene.",
      testo: `Finora hai fatto i conti partendo dalle ore. Nel lavoro vero succede il contrario: hai davanti un tracking **già compilato** e devi capire se c'è qualcosa che non va.

**Come si guarda una settimana, sempre nello stesso ordine:**

1. **Leggi il contratto.** Full time (39) o part time (quante ore)?
2. **Guarda i Totali** e somma la settimana.
3. **Chiediti dove dovrebbero stare le ore:** Standard fino al contratto, Supplementare fino a 39 (solo part time), Accordo fino a 42, Straordinario oltre.
4. **Confronta** con quello che ha scritto l'OS.

**Gli errori che trovi più spesso**

| Cosa vedi | Perché è sbagliato |
|---|---|
| Straordinario segnato prima di arrivare a 39 ore | Lo Straordinario parte solo dopo le 39 ore ordinarie. La riga Accordo non compilata, invece, non si chiede |
| Standard più alto delle ore di contratto | Le ore in più sono Supplementare (part time) o Accordo |
| Supplementare su un full time | Il Supplementare è solo per i part time |
| Più di 3 ore nella riga Accordo in una settimana | Le ore assorbite sono al massimo 3 (da 39 a 42) |
| Un'assenza e ore di lavoro nello stesso giorno | O era assente, o ha lavorato: una delle due è sbagliata |

**Non è un errore** la mezz'ora o l'ora in più del giorno scritta nella riga Accordo, anche se la settimana resta sotto le 39 ore: vale per tutti, part time e MOG compresi.

**Attenzione al contrario.** Molte settimane sono compilate bene. Segnalare un errore che non c'è fa perdere tempo a te e all'OS: se i conti tornano, non si chiede niente.

Negli esercizi clicchi **la cella sbagliata** direttamente nel tracking. Se è tutto giusto, spunti «Non c'è nessun errore».`,
      esercizi: [
        g("a",
          cella(TROVA, trk("Verdi Anna", "CTI FT", { Standard: riga(8, 8, 8, 8, _, _, _), Straordinario: riga(_, _, _, _, _, 6, _), RIPOSO: riga(_, _, _, _, "R", _, "R"), Trasferta: riga(1, 1, 1, 1, 0, 1, 0) }), ["Straordinario|5"], "38 ore in tutto: Standard 32 e Straordinario 6. Lo Straordinario parte solo dopo 39 ore di Standard: le 6 ore di sabato sono Standard."),
          cella(TROVA, trk("Gallo Piero", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), Straordinario: riga(_, _, _, _, _, 5, _), RIPOSO: riga(_, _, _, _, _, _, "R"), Trasferta: riga(1, 1, 1, 1, 1, 1, 0) }), [NESSUN_ERRORE], "44 ore: lo Standard è a 39 e il resto è in Straordinario. La riga Accordo non è compilata, ma non è un errore da chiedere: dopo le 39 ore di Standard le ore possono stare nello Straordinario."),
          cella(TROVA, trk("Costa Elena", "CTD FT", { Standard: riga(8, 8, 6, 8, 7, _, _), Straordinario: riga(_, _, 2, _, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["Straordinario|2"], "39 ore in tutto: Standard 37 e Straordinario 2. Senza superare le 39 ore lo Straordinario non c'è: le 2 ore di mercoledì sono Standard.")),
        g("b",
          cella(TROVA, trk("Neri Sara", "CTI PT 24H", { Standard: riga(8, 8, 8, 8, _, _, _), RIPOSO: riga(_, _, _, _, "R", "R", "R"), Trasferta: riga(1, 1, 1, 1, 0, 0, 0) }), ["Standard|0", "Standard|1", "Standard|2", "Standard|3"], "Part time da 24 ore con 32 ore di Standard: le 8 ore oltre il contratto vanno nel Supplementare."),
          cella(TROVA, trk("Fabbri Ugo", "CTI PT 32H", { Standard: riga(8, 8, 8, 8, 8, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["Standard|0", "Standard|1", "Standard|2", "Standard|3", "Standard|4"], "Part time da 32 ore con 40 ore di Standard: 7 vanno nel Supplementare (fino a 39) e 1 nell'Accordo.")),
        g("c",
          cella(TROVA, trk("Bianchi Luca", "CTI FT", { Standard: riga(8, 8, 8, 8, _, _, _), Supplementare: riga(_, _, _, _, 7, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["Supplementare|4"], "È un full time: il Supplementare non esiste per lui. Le 7 ore di venerdì sono Standard (in tutto 39)."),
          cella(TROVA, trk("Greco Marta", "CTD FT", { Standard: riga(8, 8, 8, _, 8, _, _), Supplementare: riga(_, _, _, 7, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["Supplementare|3"], "È un full time: il Supplementare non esiste per lei. Le 7 ore di giovedì sono Standard (in tutto 39).")),
        g("d",
          cella(TROVA, trk("Neri Sara", "CTI PT 24H", { Standard: riga(8, 8, 8, _, _, _, _), Accordo: riga(1, _, _, _, _, _, _), RIPOSO: riga(_, _, _, "R", "R", "R", "R"), Trasferta: riga(1, 1, 1, 0, 0, 0, 0) }), [NESSUN_ERRORE], "25 ore in tutto, con un'ora in più lunedì nella riga Accordo: va bene. L'ora in più del giorno è assorbita anche per i part time, anche sotto le 39 ore."),
          cella(TROVA, trk("Riva Dino", "MOG 35%", { Standard: riga(7, 7, 7, 7, _, _, _), Accordo: riga(_, 0.5, _, 0.5, _, _, _), RIPOSO: riga(_, _, _, _, "R", "R", "R"), Trasferta: riga(1, 1, 1, 1, 0, 0, 0) }), [NESSUN_ERRORE], "29 ore in tutto, con due mezz'ore in più nella riga Accordo: va bene. La mezz'ora in più del giorno è assorbita anche per i MOG, anche sotto le 39 ore."),
          cella(TROVA, trk("Fabbri Ugo", "CTI PT 24H", { Standard: riga(8, 8, 8, _, _, _, _), Accordo: riga(2, 2, 1, _, _, _, _), RIPOSO: riga(_, _, _, "R", "R", "R", "R"), Trasferta: riga(1, 1, 1, 0, 0, 0, 0) }), ["Accordo|0", "Accordo|1", "Accordo|2"], "Nella riga Accordo ci sono 5 ore in una settimana: il massimo assorbibile è 3 (da 39 a 42). Va chiesto all'OS.")),
        g("e",
          cella(TROVA, FT_GIUSTO, [NESSUN_ERRORE], "40 ore: Standard 39 e Accordo 1. È compilato bene: non si chiede niente."),
          cella(TROVA, PT_GIUSTO, [NESSUN_ERRORE], "Part time da 24 ore con 40 ore: Standard 24, Supplementare 15, Accordo 1. È compilato bene."),
          cella(TROVA, FT_48_GIUSTO, [NESSUN_ERRORE], "48 ore: Standard 39, Accordo 3, Straordinario 6. È compilato bene.")),
        g("f",
          cella(TROVA, trk("Moretti Ivo", "CTI FT", { Standard: riga(9.5, 8, 8, 8, 5.5, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), [NESSUN_ERRORE], "Lunedì ha 9,5 ore di Standard: una giornata lunga non è un errore da chiedere. Il totale della settimana è 39 e non c'è Straordinario: va bene così."),
          cella(TROVA, trk("Serra Gaia", "CTI FT", { Standard: riga(8, 8, 8, 8, _, _, _), Straordinario: riga(_, _, _, _, 5, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["Straordinario|4"], "37 ore in tutto: Standard 32 e Straordinario 5. Lo Straordinario parte solo dopo 39 ore di Standard: le 5 ore di venerdì sono Standard.")),
        g("g",
          cella(TROVA, trk("Rossi Mario", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), FERIE: riga(_, _, 8, _, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["FERIE|2", "Standard|2", "Trasferta|2"], "Mercoledì ha 8 ore di Standard e anche 8 ore di FERIE: o ha lavorato o era in ferie. Va chiesto all'OS quale delle due è giusta."),
          cella(TROVA, trk("Longo Rita", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), MALATTIA: riga(_, 8, _, _, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["MALATTIA|1", "Standard|1", "Trasferta|1"], "Martedì ha 8 ore di Standard e anche 8 ore di MALATTIA: o ha lavorato o era malata. Va chiesto all'OS quale delle due è giusta.")),
      ],
    },
    {
      slug: "trova-errore-giorni-amazon", titolo: "Trova l'errore: giorni, trasferta e Amazon", minuti: 10,
      obiettivo: "Trovare nel tracking i giorni da chiedere all'OS confrontandolo con i pacchi di Amazon.",
      testo: `Adesso aggiungiamo al tracking la riga gialla in fondo: i **pacchi consegnati secondo Amazon**. Non è una riga del file Excel, arriva dai CSV: il sito la mette accanto al tracking per fare il confronto.

**Come si guarda un giorno:**

1. **Ha lavorato secondo il tracking?** C'è almeno un'ora nelle righe del lavoro?
2. **Ha lavorato secondo Amazon?** Ha consegnato più di 10 pacchi?
3. **Le due cose tornano?** Se no, guarda la riga RIPOSO: c'è una sigla che spiega?
4. **La trasferta è giusta?** Vale 1 solo se ha lavorato più di 4 ore.

**Le casistiche principali**

| Cosa vedi | Che cos'è | Cosa fai |
|---|---|---|
| Ore e trasferta nel tracking, 0 pacchi, RIPOSO vuoto | **+1** | Chiedi cosa ha fatto |
| Ore e trasferta, 0 pacchi, ma in RIPOSO c'è MEZZI, UFF, CORSO o un'altra station | spiegato | Niente |
| Più di 10 pacchi, 0 ore nel tracking | **−1** | Chiedi di inserire la giornata |
| Più di 10 pacchi, ma nel tracking è in MALATTIA | malattia batte lavorato | Niente |
| Trasferta 1 con 4 ore o meno | trasferta non dovuta | Chiedi di toglierla |
| Un numero impossibile (78) o più di 10 ore in un giorno | **ORE** | Chiedi di controllare |
| Sette giorni lavorati di fila | violazione | Avvisi Alessandro e chiedi all'OS |

Ricorda: **SB, L1, R** non spiegano niente. Sono turni e riposi.

Negli esercizi clicchi **una cella del giorno** che chiederesti all'OS. Va bene qualsiasi cella di quel giorno.`,
      esercizi: [
        g("a",
          cella(TROVA_GIORNO, trk("Bianchi Luca", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(142, 0, 138, 151, 129, _, _) }), ["*|1"], "Martedì ha 8 ore e la trasferta, ma Amazon vede 0 pacchi e nella riga RIPOSO non c'è nessuna sigla: è un +1, si chiede cosa ha fatto."),
          cella(TROVA_GIORNO, trk("Costa Elena", "CTD FT", { Standard: riga(8, 8, 8, 8, 7, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(120, 133, 141, 0, 127, _, _) }), ["*|3"], "Giovedì ha 8 ore e la trasferta, ma Amazon vede 0 pacchi e nella riga RIPOSO non c'è nessuna sigla: è un +1, si chiede cosa ha fatto.")),
        g("b",
          cella(TROVA_GIORNO, trk("Verdi Anna", "CTI FT", { Standard: riga(8, 8, _, 8, 8, _, _), RIPOSO: riga(_, _, "R", _, _, "R", "R"), Trasferta: riga(1, 1, 0, 1, 1, 0, 0) }, { amazon: riga(133, 140, 135, 128, 144, _, _) }), ["*|2"], "Mercoledì Amazon vede 135 pacchi, ma nel tracking ha 0 ore: è un −1, manca la giornata e l'OS la deve inserire."),
          cella(TROVA_GIORNO, trk("Gallo Piero", "CTI FT", { Standard: riga(8, 8, 8, 8, _, _, _), RIPOSO: riga(_, _, _, _, "R", "R", "R"), Trasferta: riga(1, 1, 1, 1, 0, 0, 0) }, { amazon: riga(150, 139, 146, 132, 141, _, _) }), ["*|4"], "Venerdì Amazon vede 141 pacchi, ma nel tracking ha 0 ore: è un −1, manca la giornata e l'OS la deve inserire.")),
        g("c",
          cella(TROVA_GIORNO, trk("Moretti Ivo", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), RIPOSO: riga(_, _, "MEZZI", _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(131, 127, 0, 140, 135, _, _) }), [NESSUN_ERRORE], "Mercoledì Amazon vede 0 pacchi, ma nella riga RIPOSO c'è scritto MEZZI: quel giorno ha spostato i mezzi. È spiegato, non si chiede niente."),
          cella(TROVA_GIORNO, trk("Serra Gaia", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), RIPOSO: riga(_, "CORSO", _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(138, 0, 142, 129, 133, _, _) }), [NESSUN_ERRORE], "Martedì Amazon vede 0 pacchi, ma nella riga RIPOSO c'è scritto CORSO: era in formazione. È spiegato, non si chiede niente.")),
        g("d",
          cella(TROVA_GIORNO, trk("Fabbri Ugo", "CTI FT", { Standard: riga(8, 8, 8, 6, 7, _, _), RIPOSO: riga(_, _, _, "SB", _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(125, 141, 137, 0, 130, _, _) }), ["*|3"], "Giovedì ha 6 ore e la trasferta, Amazon vede 0 pacchi e in RIPOSO c'è SB. Ma SB è il nome di un turno, non spiega cosa ha fatto: resta un +1 da chiedere."),
          cella(TROVA_GIORNO, trk("Longo Rita", "CTI FT", { Standard: riga(8, 6, 8, 8, 7, _, _), RIPOSO: riga(_, "L1", _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(133, 0, 139, 142, 128, _, _) }), ["*|1"], "Martedì ha 6 ore e la trasferta, Amazon vede 0 pacchi e in RIPOSO c'è L1. Ma L1 è il nome di una rotta, non spiega cosa ha fatto: resta un +1 da chiedere.")),
        g("e",
          cella(TROVA_GIORNO, trk("Riva Dino", "CTI FT", { Standard: riga(_, 8, 8, 8, 8, _, _), MALATTIA: riga(8, _, _, _, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(0, 1, 1, 1, 1, 0, 0) }, { amazon: riga(118, 134, 140, 129, 137, _, _) }), [NESSUN_ERRORE], "Lunedì Amazon vede 118 pacchi ma nel tracking è in malattia: malattia batte lavorato. Non è un errore di compilazione e in questo controllo non si segnala."),
          cella(TROVA_GIORNO, trk("Greco Marta", "CTI FT", { Standard: riga(8, 8, 8, _, 8, _, _), MALATTIA: riga(_, _, _, 8, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 0, 1, 0, 0) }, { amazon: riga(129, 135, 141, 122, 138, _, _) }), [NESSUN_ERRORE], "Giovedì Amazon vede 122 pacchi ma nel tracking è in malattia: malattia batte lavorato. Non è un errore di compilazione e in questo controllo non si segnala.")),
        g("f",
          cella(TROVA_GIORNO, trk("Neri Sara", "CTI PT 24H", { Standard: riga(8, 8, 4, 4, _, _, _), RIPOSO: riga(_, _, _, _, "R", "R", "R"), Trasferta: riga(1, 1, 0, 1, 0, 0, 0) }, { amazon: riga(120, 131, 64, 58, _, _, _) }), ["Trasferta|3", "*|3"], "Giovedì ha lavorato 4 ore esatte ma ha la trasferta a 1: la trasferta spetta solo sopra le 4 ore. Mercoledì, con le stesse 4 ore, è giustamente a 0."),
          cella(TROVA_GIORNO, trk("Costa Elena", "CTI PT 20H", { Standard: riga(4, 8, 8, _, _, _, _), RIPOSO: riga(_, _, _, "R", "R", "R", "R"), Trasferta: riga(1, 1, 1, 0, 0, 0, 0) }, { amazon: riga(61, 128, 133, _, _, _, _) }), ["Trasferta|0", "*|0"], "Lunedì ha lavorato 4 ore esatte ma ha la trasferta a 1: la trasferta spetta solo sopra le 4 ore.")),
        g("g",
          cella(TROVA_GIORNO, trk("Bianchi Luca", "CTI FT", { Standard: riga(8, 8, 8, 78, 7, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(135, 140, 129, 137, 131, _, _) }), ["*|3"], "Giovedì nella riga Standard c'è 78: in un giorno non è possibile, è un errore di battitura (forse 7,8). Si chiede all'OS di correggere."),
          cella(TROVA_GIORNO, trk("Verdi Anna", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), Straordinario: riga(_, 4, _, _, _, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(132, 160, 128, 141, 136, _, _) }), ["*|1"], "Martedì ha 8 ore di Standard più 4 di Straordinario: 12 ore in un giorno. Oltre le 10 ore al giorno si chiede sempre all'OS di controllare.")),
        g("h",
          { ...scelta("Guarda la settimana: ha lavorato tutti e sette i giorni. Cosa fai?", ["Niente: 42 ore sono dentro il tetto dell'Accordo", "È il 6° giorno di domenica: è al limite ma va bene", "È una violazione: 7 giorni di fila. Avviso Alessandro e chiedo all'OS"], 2, "Le ore tornano (42), ma i giorni no: sette giorni di fila superano il massimo di 6. Si avvisa subito Alessandro e si chiede all'OS."), tracking: trk("Moretti Ivo", "CTI FT", { Standard: riga(6, 6, 6, 6, 6, 6, 3), Accordo: riga(_, _, _, _, _, _, 3), Trasferta: riga(1, 1, 1, 1, 1, 1, 1) }, { amazon: riga(110, 118, 121, 109, 115, 120, 112) }) },
          { ...scelta("Guarda la settimana: 5 giorni più la domenica, riposo il sabato. Cosa fai?", ["È una violazione: avviso Alessandro", "È il 6° giorno di domenica: 6 giorni in tutto, è al limite ma va bene. Non chiedo niente", "Chiedo all'OS di togliere la domenica"], 1, "Ha lavorato 6 giorni su 7 con un riposo in mezzo: è il 6° giorno di domenica, dentro la regola. Lo trovi nell'elenco, non è una richiesta."), tracking: trk("Serra Gaia", "CTI FT", { Standard: riga(7, 7, 7, 7, 7, _, 4), Accordo: riga(_, _, _, _, _, _, 3), RIPOSO: riga(_, _, _, _, _, "R", _), Trasferta: riga(1, 1, 1, 1, 1, 0, 1) }, { amazon: riga(125, 131, 128, 119, 133, _, 121) }) }),
      ],
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
      trackingVero: true,
      approfondisci: [{ href: "/presenze/verifica", label: "Apri la Verifica tracking" }, { href: "/vademecum/13-presenze", label: "Vademecum: Controlli presenze" }],
    },
    {
      slug: "prova-finale", titolo: "Prova finale", minuti: 12,
      obiettivo: "Mettere insieme tutte le regole su casi come quelli che troverai davvero.",
      testo: `Questa è la prova finale: **dieci casi** presi dal lavoro vero. Non c'è niente di nuovo da leggere.

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
        g("i",
          cella(TROVA, trk("Gallo Piero", "CTI FT", { Standard: riga(8, 8, 8, 7, _, _, _), Straordinario: riga(_, _, _, _, 5, _, _), RIPOSO: riga(_, _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }), ["Straordinario|4"], "36 ore in tutto: Standard 31 e Straordinario 5. Lo Straordinario parte solo dopo 39 ore di Standard: le 5 ore di venerdì sono Standard."),
          cella(TROVA, trk("Longo Rita", "CTI PT 24H", { Standard: riga(8, 8, 8, _, _, _, _), Supplementare: riga(_, _, _, 8, _, _, _), RIPOSO: riga(_, _, _, _, "R", "R", "R"), Trasferta: riga(1, 1, 1, 1, 0, 0, 0) }), [NESSUN_ERRORE], "Part time da 24 ore con 32 ore: Standard 24 e Supplementare 8. È compilato bene.")),
        g("l",
          cella(TROVA_GIORNO, trk("Riva Dino", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), RIPOSO: riga(_, _, _, "UFF", _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(130, 0, 141, 0, 136, _, _) }), ["*|1"], "Martedì e giovedì Amazon vede 0 pacchi. Giovedì c'è UFF, che spiega la giornata. Martedì non c'è niente: è quello il +1 da chiedere."),
          cella(TROVA_GIORNO, trk("Fabbri Ugo", "CTI FT", { Standard: riga(8, 8, 8, 8, 7, _, _), RIPOSO: riga("MEZZI", _, _, _, _, "R", "R"), Trasferta: riga(1, 1, 1, 1, 1, 0, 0) }, { amazon: riga(0, 129, 0, 140, 133, _, _) }), ["*|2"], "Lunedì e mercoledì Amazon vede 0 pacchi. Lunedì c'è MEZZI, che spiega la giornata. Mercoledì non c'è niente: è quello il +1 da chiedere.")),
        g("h", scelta("Hai mandato le richieste all'OS di DLO4 lunedì. Giovedì rifai la verifica e ne trovi 3 nuove per DLO4. Cosa mandi?", ["Di nuovo tutte, vecchie e nuove", "Solo le 3 nuove: le altre sono già «Chieste»", "Niente fino a lunedì"], 1, "Il messaggio contiene solo le righe «Da chiedere»: quelle già chieste non si rimandano.")),
      ],
    },
  ],
};
