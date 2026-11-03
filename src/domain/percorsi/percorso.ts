/**
 * Percorsi a binario dei moduli: lo stato di ogni passo si calcola dai dati veri.
 * Il primo passo obbligatorio non fatto è "ora", i successivi "dopo"; i facoltativi
 * non bloccano. Nessun passo si inventa: se un dato non è noto al sito, il passo non c'è.
 */
export type StatoPasso = "fatto" | "ora" | "dopo" | "facoltativo";
export type PassoDef = { id: string; titolo: string; href?: string; fatto: boolean; facoltativo?: boolean; nota?: string };
export type Passo = Omit<PassoDef, "fatto" | "facoltativo"> & { stato: StatoPasso };
export type Percorso = { id: string; titolo: string; passi: Passo[] };

export function stati(passi: PassoDef[]): Passo[] {
  let trovato = false;
  return passi.map(({ fatto, facoltativo, ...p }) => {
    if (fatto) return { ...p, stato: "fatto" as const };
    if (facoltativo) return { ...p, stato: "facoltativo" as const };
    if (!trovato) { trovato = true; return { ...p, stato: "ora" as const }; }
    return { ...p, stato: "dopo" as const };
  });
}

export const prossimo = (p: Percorso) => p.passi.find((x) => x.stato === "ora") ?? null;
export const completato = (p: Percorso) => p.passi.every((x) => x.stato === "fatto" || x.stato === "facoltativo");

const it = (m: string) => m.split("-").reverse().join("/");

/** Costi, giorno di chiusura del mese M. */
export function percorsoCostiFineMese(x: { mese: string; anagraficaEtaMesi: number | null; aditMesePrec: boolean; stimaStd: boolean; stimaSic: boolean }): Percorso {
  return {
    id: "costi-fine-mese", titolo: `Chiusura costi ${it(x.mese)}`,
    passi: stati([
      { id: "anagrafica", titolo: "Anagrafica CDL aggiornata (al massimo 3 mesi)", href: "/costi/parametri#anagrafica", fatto: x.anagraficaEtaMesi !== null && x.anagraficaEtaMesi <= 3, nota: x.anagraficaEtaMesi === null ? "nessuna anagrafica caricata" : x.anagraficaEtaMesi > 3 ? `ha ${x.anagraficaEtaMesi} mesi: chiedi a HR quella nuova` : undefined },
      { id: "adit", titolo: "ADIT del mese precedente caricato (tariffe STD)", href: "/costi/consuntivo", fatto: x.aditMesePrec },
      { id: "stima-std", titolo: "Calcola e salva la stima STD", href: `/costi/fine-mese?mese=${x.mese}`, fatto: x.stimaStd },
      { id: "stima-sic", titolo: "Salva la stima SIC (busta del 27)", href: `/costi/fine-mese?mese=${x.mese}`, fatto: x.stimaSic },
      { id: "teams", titolo: "Manda il testo in Teams e scarica l'Excel", href: `/costi/fine-mese?mese=${x.mese}`, fatto: false, facoltativo: true },
    ]),
  };
}

/** Costi, consuntivo del mese M (ADIT di M e paga del 27 di M+1). */
export function percorsoConsuntivo(x: { mese: string; aditMese: boolean; payrollMeseSucc: boolean; ricStd: boolean; ricSic: boolean }): Percorso {
  return {
    id: "costi-consuntivo", titolo: `Consuntivo ${it(x.mese)}`,
    passi: stati([
      { id: "adit", titolo: `Carica l'ADIT ${it(x.mese)} (arriva ~5 settimane dopo)`, href: "/costi/consuntivo", fatto: x.aditMese },
      { id: "ric-std", titolo: "Leggi e salva la riconciliazione STD", href: `/costi/consuntivo?mese=${x.mese}`, fatto: x.ricStd },
      { id: "payroll", titolo: "Carica i Costi del personale del mese dopo (dopo il 27)", href: "/costi/consuntivo", fatto: x.payrollMeseSucc },
      { id: "ric-sic", titolo: "Leggi e salva la riconciliazione SIC", href: `/costi/consuntivo?mese=${x.mese}`, fatto: x.ricSic },
      { id: "parametri", titolo: "Aggiorna i parametri (solo con l'ok di Alessandro)", href: `/costi/consuntivo?mese=${x.mese}`, fatto: false, facoltativo: true },
    ]),
  };
}

/** Fatture Amazon, il giro del lunedì. */
export function percorsoFatture(x: { importateSettimana: number; esportateNonInFatt: number; allineateSettimana: number }): Percorso {
  return {
    id: "fatture-lunedi", titolo: "Fatture della settimana",
    passi: stati([
      { id: "importa", titolo: "Scarica i PDF dal prossimo numero e importali", href: "/fatture-amazon/importa", fatto: x.importateSettimana > 0, nota: x.importateSettimana ? `${x.importateSettimana} importate questa settimana` : undefined },
      { id: "incolla", titolo: "Scarica l'Excel o copia le righe e incollale in fatt_2026", href: "/fatture-amazon/importa", fatto: x.importateSettimana > 0 && x.esportateNonInFatt === 0, nota: x.esportateNonInFatt ? `${x.esportateNonInFatt} esportate ma non ancora in fatt_2026` : undefined },
      { id: "allinea", titolo: "Allinea il registro con fatt_2026", href: "/fatture-amazon/allinea", fatto: x.allineateSettimana > 0 && x.esportateNonInFatt === 0 },
    ]),
  };
}

/** Presenze: controllo settimanale (settimana scorsa) e chiusura del mese. */
export function percorsoPresenze(x: { settimana: string; runSettimana: boolean; esitiAperti: number; mese: string; runFineMese: boolean }): Percorso {
  return {
    id: "presenze", titolo: "Controlli presenze",
    passi: stati([
      { id: "archivio", titolo: "Carica CSV Amazon e tracking nell'archivio di questo PC", href: "/presenze/archivio", fatto: x.runSettimana, nota: "il sito non vede l'archivio del PC: questo passo risulta fatto quando salvi il controllo" },
      { id: "settimanale", titolo: `Esegui e salva il controllo della settimana del ${it(x.settimana)}`, href: "/presenze/settimanale", fatto: x.runSettimana },
      { id: "esiti", titolo: "Manda i messaggi agli Ops e segna gli esiti", href: "/presenze", fatto: x.runSettimana && x.esitiAperti === 0, nota: x.esitiAperti ? `${x.esitiAperti} anomalie ancora aperte` : undefined },
      { id: "fine-mese", titolo: `Controllo di fine mese ${it(x.mese)} (tracking vs Zucchetti)`, href: "/presenze/fine-mese", fatto: x.runFineMese },
    ]),
  };
}

/** Telepass e carburante del mese M. */
export function percorsoTelepass(x: { mese: string; anagraficheAggiornate: boolean; telepass: boolean; q8: boolean }): Percorso {
  return {
    id: "telepass", titolo: `Telepass e carburante ${it(x.mese)}`,
    passi: stati([
      { id: "anagrafiche", titolo: "Anagrafiche Telepass e fuel card aggiornate", href: "/carburante-telepass/anagrafiche", fatto: x.anagraficheAggiornate, nota: x.anagraficheAggiornate ? undefined : "nessun aggiornamento negli ultimi 35 giorni: caricale se sono arrivate mail di cambi" },
      { id: "telepass", titolo: "Elabora il CSV Telepass e scarica l'Excel", href: "/carburante-telepass/telepass", fatto: x.telepass },
      { id: "q8", titolo: "Elabora l'export Q8 e scarica l'Excel", href: "/carburante-telepass/q8", fatto: x.q8 },
    ]),
  };
}
