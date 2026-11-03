---
title: "Costi del personale a fine mese"
order: 15
category: "Personale"
updated: "2026-11-03"
---

A fine mese il sito stima quanto costa il personale delle sette station (DER1, DER2, DLO2, DLO4, DLO5, DLZ2, DVN1), prima che arrivino le fatture. Si fa tutto nella sezione **Costi del personale**.

Le popolazioni sono due:

- **STD** (somministrati Adecco): costo di **competenza del mese M**. Si confronta con la fattura **ADIT di M**, che arriva circa 5 settimane dopo.
- **SIC** (dipendenti interni): **busta che si paga il 27 del mese dopo** (M+1). Si confronta con i **Costi del personale PS** di M+1.

I file restano **sul tuo PC**: il sito li legge nel browser. Sul server vanno solo le righe che servono (CDC 5569) e i risultati. Il sito non fa nessuna chiamata a servizi esterni.

### Il giorno di chiusura ([/costi/fine-mese](/costi/fine-mese))

1. Scegli il **mese di competenza** e guarda il **semaforo**:
   - i 14 tracking del mese (7 STD e 7 SIC) nell'archivio di questo PC, gli stessi del modulo Presenze: se mancano, trascinali lì;
   - il controllo Zucchetti di fine mese fatto;
   - l'anagrafica CDL con al massimo 3 mesi;
   - l'ADIT del mese prima caricato, da cui si prendono le tariffe STD.
2. Premi **Calcola costi**. Escono due tabelle per station più il totale:
   - **STD competenza M**: ore per voce (MAGG50, STR65 e SUPP65 sono le ore di domenica o festivo della station), trasferte, voci non da tracking (festività, ferie godute, carenza, CTRB, altro, MOG) e teste;
   - **SIC busta 27/M+1**: base CDL, istituti, assenze, ferie godute e totale, con quanti CDL sono stimati (persona senza CDL in anagrafica = media del suo contratto nella station).
3. Leggi i **controlli rossi**:
   - ore lette diverse dalla riga Totali del file;
   - ore stima/ADIT fuori 0,85–1,15;
   - ore del mese fuori 0,7–1,4 rispetto al mese prima;
   - trasferte scritte a mano;
   - settimane oltre il tetto CCNL (42 h dal 1/6/2026);
   - Accordo di domenica.
   
   Le ore Accordo 39-44 h si vedono ma **non si valorizzano**. Ai dispatcher la trasferta non si paga mai, anche se il tracking la segna.
4. **Salva stima STD** e **Salva stima SIC**: il mese entra nell'indice [/costi](/costi).
5. **Testo per Teams**: la tabella per station con i totali e i 3 avvisi principali è già negli appunti, incollala nella chat.
6. **Excel**: scarica `Stima_AMZ_MM_AA.xlsx`. Contiene la pagina con le formule, Rettifiche, Parametri, i fogli DWH e i Festivi; si può ricontrollare cella per cella.

### Quando arrivano ADIT e Costi del personale ([/costi/consuntivo](/costi/consuntivo))

1. Trascina la fattura ADIT (`MMAA_Doc._emessi_ADIT_STD-SL_*.xlsx`) o i Costi del personale PS (`Costi_del_Personale_PS_MMAA_*.xlsx`): il sito li riconosce dal contenuto. Controlla l'anteprima (CDC 5569, teste, componenti) e salva. Per il payroll verifica il **mese di paga**.
2. Scegli il mese e leggi i **delta** per station:
   - **STD**: stima M contro ADIT M, con il delta scomposto in tariffe, ore, trasferte, voci non da tracking, voci non modellate e residui di altri mesi;
   - **SIC**: stima M contro la paga del 27 di M+1.
   
   Colori: entro ±5 % verde, entro ±15 % giallo, oltre rosso. **Salva riconciliazione** la conserva.
3. **Aggiorna parametri** ricalcola i coefficienti SIC: €/h di straordinario, supplementare, domenica e malattia, carenza e moltiplicatore oneri. È la media degli ultimi 3 mesi di paga e vale dal mese successivo. Mostra prima/dopo: premilo **solo se Alessandro conferma**.

### Anagrafica CDL ([/costi/parametri](/costi/parametri))

- Aggiornala **ogni volta che HR la manda** (`DB_CDL_base_MMAA_AmazonGLS_BO.xlsx`, foglio `SIC Amazon TR`). Ogni caricamento è una nuova versione e l'anteprima mostra entrati, usciti e CDL cambiati. Se ha più di 3 mesi, il sito lo segnala in testa al modulo.
- Nella stessa pagina ci sono:
  - le **tariffe trasferta per data**: 22,50 € dal 1/1/2026, 23,50 € dal 1/1/2027, 24,00 € dal 1/6/2027; la domenica +7,00 €. Un avviso compare 60, 30 e 7 giorni prima di ogni cambio;
  - i **coefficienti con storico**;
  - i **festivi**: nazionali, 24/12 e 31/12, e il patrono di ogni station.
