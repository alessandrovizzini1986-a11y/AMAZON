# Prompt — Verifica tracking secondo CCNL e Accordo di secondo livello

*Scritto il 22/11/2026. Pagina del sito: Presenze → Verifica tracking. Codice: `src/domain/presenze/verifica.ts`.*

## Scopo
Una persona (la stagista) deve poter verificare i tracking di tutte le station in un solo passaggio guidato, ogni lunedì e il
primo del mese, e uscirne con l'elenco delle cose da chiedere agli Operation Supervisor. Quello che ha già chiesto o chiuso
non deve tornare. Il file Excel che ne esce deve aprirsi in pochi secondi.

## Ingressi (già nell'archivio del browser)
- CSV Amazon per station e giorno (anche il CSV unico con la colonna Station).
- Tracking SIC e STD del mese per ogni station; se c'è, anche quelli del mese prima (settimane a cavallo).

## Controlli (nessuno escluso)
1. **Ha lavorato davvero** — tracking contro Amazon, giorno per giorno: +1, −1, H, A, ORE, ACC. Sono le regole del
   controllo settimanale (`controlloSettimanale.ts`), con giustificativi, dispatcher e prestiti tra station.
2. **Mai più di 6 giorni** — 7 o più giorni di lavoro di fila, anche a cavallo del mese.
3. **Ore nella riga giusta**, per settimana lunedì–domenica completa:
   - Standard fino alle ore di contratto (FT 39; PT le sue ore, lette da "Tipo Contratto": `32H`, `60%`…);
   - PT: oltre il contratto e fino a 39 è Supplementare (un giorno in più è Supplementare anche sotto contratto);
   - da 39 al tetto dell'Accordo le ore sono assorbite: riga Accordo;
   - oltre il tetto: Straordinario; mai oltre 12 h a settimana; Standard mai oltre 8h24 nel giorno.
   - Tetto: 43 h fino al 31/05/2026, **42 h dal 01/06/2026**, 41 h dal 01/07/2027 (deciso da Alessandro il 22/11/2026).
   - Le assenze retribuite possono contare o no verso le 39 ore: si segnala solo se il riparto non torna in nessuno dei due modi.
   - Dispatcher esclusi. MOG e contratti non riconosciuti: Standard fino a 39.
4. **6° giorno di domenica** — elenco (non richiesta) di chi ha lavorato 5 giorni più la domenica: 6 in tutto nella settimana.

## Richieste
- Una riga per persona, tipo e riferimento (giorno o lunedì della settimana), con chiave stabile
  `mese|station|pop|persona|tipo|riferimento`.
- Stati: da chiedere → chiesta → ok. Rifacendo la verifica: le nuove nascono "da chiedere"; quelle note tengono lo stato;
  quelle non più trovate diventano "sparita da sola"; un OK si riapre solo se i numeri sono cambiati.
- Lo stato si cambia nel sito o nell'Excel ricaricato; l'Excel può solo far avanzare una riga.

## Excel
Solo valori, nessuna formula: Leggimi · Richieste (Stato a tendina) · Chiuse · Sesto_giorno_domenica · Ore_settimana · Avvisi.

## Poka-yoke
- "Cosa ho letto": per station, in rosso i tracking e i giorni di CSV che mancano.
- Una settimana a cavallo senza il tracking del mese prima non viene controllata e lo dice.
- Il messaggio Teams contiene solo le righe "da chiedere"; un pulsante le segna come chieste.
