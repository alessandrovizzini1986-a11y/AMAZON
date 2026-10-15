---
title: "Multe: albero decisionale e template mail"
order: 4
category: "Multe"
updated: "2026-10-15"
---

Il tipo di contratto decide a chi scrivi e se alleghi il verbale. Prima di inviare, controlla la riga della tabella: destinatari e allegato devono coincidere.

| Caso | Come lo riconosci | Azione | TO | CC | Allegato | Esempio |
|---|---|---|---|---|---|---|
| Driver sconosciuto | Hai solo targa e verbale | Inoltra chiedendo nominativo e contratto | Capi station | Thomas Lazzarini, Valerio Solito, resp. station | No (resta quello dell'inoltro) | 40689, 40687 |
| Veicolo non nostro | Targa assente da Lista Targhe | Rispondi alla mail di Sanzioni | Sanzioni CDS, Operations AMZ PS | Chi era in cc | No | 40683 |
| Driver CTI o SIC | Contratto CTI/SIC | Rispondi direttamente alla mail di Sanzioni (stessa catena) con nominativo, contratto e richiesta trattenuta | Sanzioni CDS, Operations AMZ PS (rispondi a tutti) | Chi era in cc (Simona Negri, Valerio Solito) | No | 40689 (Template B2) |
| Driver STD o MOG | Contratto STD/MOG (MOG = STD) | Nuova mail di richiesta addebito | driver.ps@adecco.it | Sanzioni CDS, Thomas Lazzarini, Alessandro | **Sì: PDF verbale (VBPEC)** | 40639 |
| Driver GLS, infrazione coperta dall'accordo Franchigie | Doppia fila, intersezione, divieto di sosta/fermata | Nessun addebito: Metodo = "NO - Costo Aziendale" | Nessuna mail | | | |
| Non imputabile | Driver non identificabile, dati non forniti | Metodo = "NO - Costo Aziendale", motivo DATI PERSONALI | Nessuna mail | | | |
| Verbale arrivato a casa del driver (mezzo a breve termine) | Te lo gira il responsabile station, non Sanzioni | Procedura della sezione 4b | Tesoreria + ps.payroll o Driver PS | | Sì | GP626KV |
| Mancato pagamento pedaggio (RMPP) | Lettera Autostrade/concessionaria, non è un verbale | Procedura della sezione 4c | Tesoreria | | | |
| Ricorso richiesto | Il driver lo chiede | Passa ad Alessandro | | | | |

**Template A: richiesta nominativo alla station** (inoltro della mail Sanzioni)

Oggetto: `I: (40689) TARGA GS587JN - VERBALE N. V4681055 /2026 - AMAZON` (lascia l'oggetto originale)

> Ciao, \
> mi potete fornire il nominativo e il contratto del driver? \
> grazie

**Template B2: richiesta trattenuta driver CTI/SIC** (rispondi a tutti alla mail di Sanzioni, dopo la risposta della station)

Oggetto: `R: (40689) TARGA GS587JN - VERBALE N. V4681055 /2026 - AMAZON` · TO: ADE IT SANZIONI CDS DL; ADE IT OPERATIONS AMZ PS DL · CC: Simona Negri; Valerio Solito

> Buongiorno, \
> richiedo trattenuta in busta per Russo Giovanni CTI DER1 \
> in attesa di riscontro \
> grazie

Formato fisso della riga: `Cognome Nome CONTRATTO STATION`. Nessun allegato: Sanzioni ha già il verbale.

**Template B: veicolo non nostro** (rispondi a tutti)

> Buongiorno, \
> il veicolo non è nostro \
> grazie

**Template C: addebito driver STD/MOG** (inoltro della mail Sanzioni a driver.ps)

Oggetto: `I: (40639) TARGA HD390BE - VERBALE N. A530218 - AMAZON`

> Buongiorno, \
> Segnalo un addebito pari alla cifra riportata da verbale per la risorsa Nome Cognome \
> Grazie

Prima di inviare il Template C: verbale PDF allegato? driver.ps in TO? Sanzioni CDS, Thomas e Alessandro in CC? Nome e cognome esatti come in busta paga? Se una risposta è no, non inviare.

### 4b. Verbali arrivati a casa del driver (mezzi a breve termine)

Con i noleggi a breve termine il verbale può essere intestato o recapitato direttamente al lavoratore. Il driver lo consegna al responsabile station, il responsabile lo gira a te (esempio: mail "Verbale del GP626KV da pagare" del responsabile mezzi, 09/10/2026). Da lì gestisci tre cose, in quest'ordine: tracciamento, pagamento, addebito (+ punti se previsti).

| Scheda | |
|---|---|
| Trigger | Mail del responsabile station con il verbale in allegato e il nominativo del driver |
| Input | PDF verbale, data di notifica, CDC della station, tipo contratto del driver |
| Passi | 1. Inserisci la riga nel foglio `2026` di Multe (Station, verbale, targa, driver, contratto, importo scontato, motivo). 2. Verifica se sei entro i 5 giorni dalla notifica: se sì l'importo è quello scontato, se no quello pieno. 3. Chiedi l'autorizzazione al pagamento (Template D) a Nicola Bellopede + Ufficio Tesoreria, cc Thomas e Alessandro. 4. A pagamento confermato, invia la richiesta di addebito: Template E (ps.payroll) se il driver è SIC/CTI, Template F (Driver PS) se STD/MOG; allega sempre il verbale e scrivi che è stato pagato dalla tesoreria. 5. Se il verbale prevede decurtazione punti: il modulo dichiarazione conducente arriva già insieme al verbale; fallo compilare e firmare al driver tramite il responsabile station, chiedi copia patente e documento, poi invia la richiesta PEC a Servizi Generali (Template G). 6. Aggiorna `PEC PUNTI` e `Metodo di pagamento` nel foglio. |
| Output | Riga completa nel foglio `2026`; verbale pagato; addebito richiesto; PEC inviata se punti |
| Check finale | Nella riga: Metodo = SI - TRATTENUTA, importo = importo scontato, PEC PUNTI coerente con il verbale; le tre mail (pagamento, addebito, PEC) archiviate nella stessa cartella Outlook della pratica |

**Template D: richiesta pagamento a Tesoreria** (inoltro della mail del responsabile, verbale allegato)

Oggetto: `I: Verbale del GP626KV RICHIESTA PAGAMENTO` · TO: Nicola Bellopede; Ufficio Tesoreria · CC: Thomas Lazzarini; Alessandro Vizzini

> Buongiorno Nicola, \
> gentilmente chiedo l'autorizzazione a procedere con il pagamento della seguente sanzione \
> N.ro Z11195686 → 102 euro \
> CdC 5565 \
> Grazie

**Template E: addebito driver SIC/CTI** (nuova mail, verbali allegati)

Oggetto: `Richiesta addebito verbale <n. verbale 1> - <n. verbale 2>` · TO: ps.payroll · CC: Valerio Solito; Alessandro Vizzini

> Buongiorno, \
> la presente per richiedere i seguenti addebiti in busta paga alle seguenti risorse DLO2: \
> Steven Perez: \
> • €79,90 per verbale n° V/3835Z/2025 (vedi allegato, il verbale è stato pagato da nostra tesoreria) \
> • €66,10 per verbale n° 2025/R2147 (vedi allegato, il verbale è stato pagato da nostra tesoreria) \
> Carlo Prestori: \
> • €136,90 per verbale n° V/12230R/2025 (vedi allegato, il verbale è stato pagato da nostra tesoreria) \
> Resto in attesa di riscontro \
> Buon lavoro

**Template F: addebito driver STD/MOG** (nuova mail, verbale allegato)

Oggetto: `Richiesta addebito verbale <n. verbale>` · TO: Driver PS · CC: Valerio Solito; Alessandro Vizzini

> Buongiorno, \
> la presente per richiedere i seguenti addebiti in busta paga alle seguenti risorse: \
> NOME COGNOME: \
> • € [importo] per verbale n° [numero] (vedi allegato, il verbale è stato pagato da nostra tesoreria in data odierna) \
> Resto in attesa di riscontro \
> Buon lavoro

Più verbali dello stesso driver vanno nella stessa mail, un punto elenco per verbale, un allegato per verbale.

**Template G: richiesta invio PEC per comunicazione dati conducente (punti)** (nuova mail; allegati: modulo dichiarazione compilato e firmato, copia patente, copia documento, copia verbale)

Oggetto: `Richiesta invio PEC – Comunicazione dati conducente verbale n. <numero> – Targa <targa>` · TO: Servizi Generali · CC: Valerio Solito; Alessandro Vizzini; Thomas Lazzarini; responsabile station; DSP_[STATION]

> Buongiorno, \
> vi chiedo gentilmente di inviare tramite PEC la comunicazione sottostante, con gli allegati indicati, al seguente indirizzo: \
> • [PEC dell'organo accertatore, riportata sul verbale]
>
> Oggetto PEC: \
> Verbale n. [numero] del [data] – Targa [targa] – Comunicazione dati del conducente ai sensi dell'art. 126-bis C.d.S.
>
> Spett.le [Comando / Ente accertatore], \
> con la presente Professional Solutions S.r.l., in qualità di utilizzatrice del veicolo targato [targa], in riferimento al verbale n. [numero] notificato in data [data notifica], comunica che alla data dell'infrazione il veicolo era condotto dal sig. [NOME COGNOME], nato a [luogo] il [data], titolare della patente n. [numero patente] rilasciata da [ente] il [data], come da modulo di dichiarazione allegato, compilato e sottoscritto dal conducente. \
> Si allegano copia della patente e del documento di identità del conducente e copia del verbale. \
> Cordiali saluti \
> Professional Solutions S.r.l.
>
> Allegati da includere nella PEC: \
> • Modulo dichiarazione dati conducente, compilato e firmato \
> • Copia patente del conducente \
> • Copia documento di identità del conducente \
> • Copia verbale n. [numero]
>
> Grazie per il supporto.

La comunicazione dei dati del conducente va fatta entro 60 giorni dalla notifica: se il modulo non arriva dal driver entro 10 giorni dalla tua richiesta, sollecita il responsabile station e avvisa Alessandro.

### 4c. Mancati pagamenti pedaggio (RMPP)

Insieme ai verbali possono arrivare a casa del driver lettere di mancato pagamento pedaggio (RMPP) da Autostrade o altre concessionarie. Non sono verbali e **non si addebitano a nessuno**.

| Scheda | |
|---|---|
| Trigger | Lettera RMPP girata dal responsabile station (o arrivata in azienda) |
| Passi | 1. Chiedi il pagamento all'Ufficio Tesoreria (stessa forma del Template D, oggetto `RMPP <n. rapporto> targa <targa> RICHIESTA PAGAMENTO`). 2. Inserisci la riga nel file `RMPP_<MESE>_26.xlsx` del mese (cartella `015_Telepass Business`), foglio del mese. 3. Nessuna riga nel file Multe, nessuna mail di addebito. |
| Output | Riga in RMPP del mese; pagamento richiesto |
| Check finale | `IMPORTO DOVUTO` = IMPORTO + SPESE FISSE + SPESE VISURA − IMPORTO VERSATO; targa presente in Lista Targhe; DS compilata |

**Colonne del file RMPP**

| Colonna | Da dove |
|---|---|
| CODICE SOCIETA' | Dalla lettera (es. 06) |
| DATA | Data del transito |
| N. RAPPORTO | Numero rapporto sulla lettera |
| TARGA / DS | Lettera / Lista Targhe (es. `DER1`) |
| CL. | Classe veicolo (A, B) |
| ENTRATA / ORA ENTRATA / USCITA / ORA USCITA | Caselli e orari dalla lettera; `NON RILEVATA` se l'entrata manca |
| IMPORTO / IMPORTO VERSATO / SPESE FISSE / SPESE VISURA | Dalla lettera |
| IMPORTO DOVUTO | Formula |
| EVENTUALE NUMERO PROGR | Numero pratica della concessionaria, se presente |
