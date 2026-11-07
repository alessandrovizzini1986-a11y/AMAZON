---
title: "Glossario"
order: 18
category: "Base"
updated: "2026-11-07"
---

Le sigle e le parole che si incontrano nel sito e nei file. Nel sito, le sigle sottolineate a puntini mostrano la spiegazione al passaggio del mouse e portano qui.

### Amazon

| Sigla | Significato | In pratica |
|---|---|---|
| **DSP** | Delivery Service Partner | L'azienda che fa le consegne per Amazon: noi (Professional Solutions) su 7 station. |
| **DS** | Delivery Station | Il magazzino Amazon da cui partono i furgoni, con un codice: DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1. GLS è la sede di Castel Maggiore. |
| **fatt_2026** | Foglio delle righe di fattura Amazon | Nel file AGGREGATO: una riga per ogni riga delle fatture Amazon, con DS, data, descrizione, imponibile (AVERE) e macroarea. |
| **AVERE** | Imponibile | L'importo senza IVA di una riga di fattura. |
| **Week** | Settimana Amazon | Le settimane Amazon vanno da domenica a sabato: la numerazione può differire da quella del calendario. |
| **Block** | Rotta | "Block of 8 Hours 24 Minutes": una rotta di un furgone per un giorno, pagata a tariffa fissa per tipo di rotta. |
| **Forecast** | Previsione delle rotte | Le rotte che Amazon prevede per ogni DS e giorno: servono a stimare il fatturato del mese e i furgoni necessari. |
| **FuelAllowance** | Rimborso carburante | La riga di fattura con cui Amazon rimborsa il carburante: si confronta con la spesa Q8 della stessa settimana. |
| **OTR Services** | Rimborso pedaggi | Da aprile 2025 la riga dei pedaggi in fattura Amazon si chiama così. |

### Persone e costi

| Sigla | Significato | In pratica |
|---|---|---|
| **CDC** | Centro di costo | Il codice contabile a cui va ogni costo e ricavo: 5569 per Amazon, 5565 per GLS. Gli altri CDC sono di altri progetti. |
| **SIC** | Dipendenti interni | Autisti assunti da Professional Solutions (contratti CTI FT, CTI PT, Dispatcher). La busta del mese M si paga il 27 del mese dopo. |
| **CTI** | Contratto dei dipendenti SIC | Il contratto dei SIC: FT a tempo pieno, PT part-time (anche 32 ore a settimana). |
| **STD** | Somministrati | Autisti in somministrazione tramite Adecco: il costo arriva nella fattura ADIT del mese di competenza. |
| **MOG** | Monte ore garantito | STD con un minimo di ore pagate al mese anche se ne lavorano meno (file ADECCO_PS). Per le multe si trattano come STD. |
| **ADIT** | Fattura Adecco degli STD | La fattura mensile della somministrazione: arriva circa 5 settimane dopo il mese ed è il consuntivo del costo STD. |
| **CDL** | Costo del lavoro base | Il costo mensile di base di ogni dipendente SIC, dal file HR DB_CDL_base. Senza CDL il sito usa la media del contratto nella station. |
| **Payroll** | Costi del personale PS | Il file con la busta vera dei SIC per CDC: quando arriva sostituisce la stima. |
| **F.O.** | Foglio mensile dei costi per cliente | I file Costi F.O. (uno Amazon, uno GLS) con tutti i costi del mese per voce: il sito prepara i fogli da spostarci dentro. |
| **Open book** | Fatturazione a costi documentati | Il contratto GLS: ogni mese si fatturano a GLS i costi del mese prima (pedaggi di due mesi prima) più costi accessori, 7 % di struttura e 6,5 % di margine. |
| **Accantonamenti** | Costi maturati non ancora pagati | Straordinari, ferie e permessi del mese che verranno pagati dopo: nel F.O. si tolgono quelli del mese prima e si aggiungono quelli del mese. |
| **Competenza** | Mese di competenza | Il mese in cui il lavoro è stato fatto, diverso dal mese in cui arriva la fattura o si paga la busta (registrazione). |
| **Tracking** | Fogli presenze delle station | I file con ore e giornate di ogni autista, SIC e STD separati: base delle stime dei costi. |
| **Badgebox** | Timbrature GLS | L'app con cui il personale GLS timbra: il sito la confronta con le presenze per trovare chi non timbra. |
| **Teste** | Persone | Numero di persone (per contratto o station), da non confondere con le ore o le giornate. |

### Mezzi e spese

| Sigla | Significato | In pratica |
|---|---|---|
| **Q8** | Carte carburante | Le fuel card Q8 dei furgoni: l'export mensile delle transazioni dà la spesa carburante per station. |
| **Telepass** | Pedaggi | I dispositivi sui furgoni: il file mensile dà i pedaggi per station e settimana. |
| **RMPP** | Mancato pagamento pedaggio | Lettera dell'autostrada per un pedaggio non pagato: non è una multa, si paga e si aggiunge ai pedaggi del mese. |
| **ZTL** | Zona a traffico limitato | Accessi alle ZTL (per esempio Rimini) pagati come pedaggi, aggiunti al Telepass del mese. |
| **Lista Targhe** | Elenco dei mezzi | Il file di riferimento della flotta: foglio Attivi (targa, station, contratto) e Cessati (mezzi riconsegnati). |
| **Sostitutivo** | Mezzo sostitutivo | Il furgone dato dal noleggiatore mentre il nostro è in officina: non si paga. |
| **Canone** | Costo mensile del noleggio | Quanto si paga al mese per un furgone a noleggio; dalla fattura del noleggiatore, altrimenti stimato. |

### Sito

| Sigla | Significato | In pratica |
|---|---|---|
| **Audit** | Registro delle modifiche | Chi ha fatto cosa e quando sul sito: ogni salvataggio importante lascia una riga. |
| **Anteprima** | Prova prima di salvare | Il sito mostra cosa cambierebbe: nulla si scrive finché non premi Applica o Salva. |
